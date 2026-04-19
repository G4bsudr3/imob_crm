// weekly-report: sends a weekly WhatsApp summary to each org's group.
// Triggered by pg_cron every Monday morning.
// Uses Evolution API to post to the group_jid of each org's whatsapp_instances row.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function fmtN(n: number): string { return n.toLocaleString('pt-BR') }
function fmtCur(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const evoUrl      = Deno.env.get('EVOLUTION_API_URL')
  const evoKey      = Deno.env.get('EVOLUTION_API_KEY')

  if (!evoUrl || !evoKey) return jsonResponse({ error: 'Evolution API nao configurada' }, 500)

  const admin = createClient(supabaseUrl, serviceKey)
  const now   = new Date()
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Get all orgs that have a connected WhatsApp instance with a group
  const { data: instances } = await admin
    .from('whatsapp_instances')
    .select('organization_id, instance_name, group_jid')
    .eq('status', 'connected')
    .not('group_jid', 'is', null)

  if (!instances || instances.length === 0) return jsonResponse({ sent: 0 })

  let sent = 0

  for (const inst of instances) {
    const orgId = inst.organization_id

    // Leads this week
    const { count: newLeads } = await admin.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('created_at', since)

    // Conversations this week
    const { count: conversations } = await admin.from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('sent_at', since)

    // Appointments scheduled this week
    const { count: appointmentsScheduled } = await admin.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).gte('created_at', since)

    // Appointments realized (visits done)
    const { count: appointmentsRealized } = await admin.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'realizado').gte('updated_at', since)

    // Conversions this week
    const { data: conversions } = await admin.from('leads')
      .select('deal_value')
      .eq('organization_id', orgId).eq('status', 'convertido').gte('deal_closed_at', since)

    const convertedCount = conversions?.length ?? 0
    const convertedValue = (conversions ?? []).reduce((acc, l) => acc + (l.deal_value ?? 0), 0)

    // Leads by status (pipeline snapshot)
    const { data: pipeline } = await admin.from('leads')
      .select('status')
      .eq('organization_id', orgId)
      .not('status', 'in', '("descartado","convertido")')

    const pipelineByStatus: Record<string, number> = {}
    for (const l of pipeline ?? []) {
      pipelineByStatus[l.status] = (pipelineByStatus[l.status] ?? 0) + 1
    }

    const statusLabels: Record<string, string> = {
      novo: 'Novos', em_contato: 'Em contato', agendado: 'Agendados',
    }

    const weekStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

    let msg = `📊 *Relatório Semanal* — ${weekStr}\n\n`
    msg += `*🔥 Essa semana:*\n`
    msg += `• ${fmtN(newLeads ?? 0)} novo${(newLeads ?? 0) !== 1 ? 's' : ''} lead${(newLeads ?? 0) !== 1 ? 's' : ''}\n`
    msg += `• ${fmtN(conversations ?? 0)} mensagens trocadas\n`
    msg += `• ${fmtN(appointmentsScheduled ?? 0)} visita${(appointmentsScheduled ?? 0) !== 1 ? 's' : ''} agendada${(appointmentsScheduled ?? 0) !== 1 ? 's' : ''}\n`
    msg += `• ${fmtN(appointmentsRealized ?? 0)} visita${(appointmentsRealized ?? 0) !== 1 ? 's' : ''} realizada${(appointmentsRealized ?? 0) !== 1 ? 's' : ''}\n`
    if (convertedCount > 0) {
      msg += `• 🏆 ${fmtN(convertedCount)} negócio${convertedCount !== 1 ? 's' : ''} fechado${convertedCount !== 1 ? 's' : ''}`
      if (convertedValue > 0) msg += ` (${fmtCur(convertedValue)})`
      msg += '\n'
    }

    msg += `\n*📋 Pipeline atual:*\n`
    for (const [status, count] of Object.entries(pipelineByStatus)) {
      msg += `• ${statusLabels[status] ?? status}: ${fmtN(count)}\n`
    }

    msg += `\nBoa semana! 🚀`

    try {
      const res = await fetch(`${evoUrl}/message/sendText/${inst.instance_name}`, {
        method: 'POST',
        headers: { apikey: evoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: inst.group_jid, text: msg, delay: 500 }),
      })
      if (res.ok) sent++
      else console.warn(`[weekly-report] org ${orgId} failed: ${res.status}`)
    } catch (e) {
      console.warn(`[weekly-report] org ${orgId} threw:`, e)
    }
  }

  return jsonResponse({ sent, orgs: instances.length })
})
