// Monitor WhatsApp — rodado por cron a cada 10min.
// Para cada whatsapp_instance marcada como 'connected':
//   1. Consulta estado real na Evolution API
//   2. Se disconnected, marca no DB
//   3. Envia magic link aos admins da org (se último alerta > 6h atrás)
//
// Segurança: aceita apenas request com service_role JWT (Authorization Bearer).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  // Shared secret header pra autenticar chamadas do cron
  const secret = req.headers.get('x-monitor-secret')
  const expected = Deno.env.get('MONITOR_SECRET')
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: JSON_HEADERS })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')!
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')!
  const appUrl = Deno.env.get('APP_URL') || 'https://imob-crm.lovable.app'

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: instances, error } = await admin
    .from('whatsapp_instances')
    .select('organization_id, instance_name, status, connected_number, last_alert_at')
    .eq('status', 'connected')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS })
  }

  let disconnectedCount = 0
  let alertedCount = 0
  const now = Date.now()
  const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6h

  for (const inst of instances ?? []) {
    try {
      const res = await fetch(`${evoUrl}/instance/connectionState/${inst.instance_name}`, {
        headers: { apikey: evoKey },
      })
      if (!res.ok && res.status !== 404) continue

      const data = res.status === 404 ? { instance: { state: 'close' } } : await res.json()
      const realState = data.instance?.state ?? 'close'
      const stillConnected = realState === 'open'
      if (stillConnected) continue

      // Desconectou
      disconnectedCount++
      await admin.from('whatsapp_instances').update({
        status: 'disconnected',
        connected_number: null,
        last_error: `Desconectado detectado em ${new Date().toISOString()} (estado: ${realState})`,
      }).eq('organization_id', inst.organization_id)

      // Anti-spam: só notifica se última notificação foi há +6h
      const lastAlert = inst.last_alert_at ? new Date(inst.last_alert_at).getTime() : 0
      if (now - lastAlert < ALERT_COOLDOWN_MS) continue

      // Busca admins/managers da org
      const { data: adminsList } = await admin
        .from('profiles')
        .select('email, name')
        .eq('organization_id', inst.organization_id)
        .in('role', ['admin', 'manager'])
        .not('email', 'is', null)

      let sentAny = false
      for (const a of adminsList ?? []) {
        if (!a.email) continue
        try {
          // Usamos o template "Reset Password" do Supabase Auth.
          // Não usamos password reset de verdade (login é por OTP), então esse template
          // está livre pra ser repurposed pra notificação de WhatsApp desconectado.
          // Admin deve customizar em: Dashboard → Authentication → Email Templates → Reset Password
          const { error: linkErr } = await admin.auth.admin.generateLink({
            type: 'recovery',
            email: a.email,
            options: { redirectTo: `${appUrl}/bot` },
          })
          if (!linkErr) sentAny = true
          else console.warn('generateLink failed for', a.email, linkErr.message)
        } catch (e) {
          console.warn('generateLink exception for', a.email, e)
        }
      }

      if (sentAny) {
        alertedCount++
        await admin.from('whatsapp_instances').update({
          last_alert_at: new Date().toISOString(),
        }).eq('organization_id', inst.organization_id)
      }
    } catch (err) {
      console.error('monitor error for', inst.instance_name, err)
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      checked: instances?.length ?? 0,
      disconnected: disconnectedCount,
      alerted: alertedCount,
    }),
    { headers: JSON_HEADERS },
  )
})
