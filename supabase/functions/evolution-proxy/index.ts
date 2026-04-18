import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } }) }
function instanceNameFor(orgId: string): string { return `org_${orgId.replace(/-/g, '')}` }
function mapStatus(state: string): 'connected' | 'connecting' | 'disconnected' { if (state === 'open') return 'connected'; if (state === 'connecting') return 'connecting'; return 'disconnected' }
function normalizePhone(raw: string): string | null { const digits = (raw || '').replace(/\D/g, ''); if (!digits) return null; if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits; if (digits.length === 10 || digits.length === 11) return '55' + digits; return null }

// Gera secret aleatorio (48 hex chars = 24 bytes) pra validar webhook do Evolution
function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Define a foto do grupo usando a URL publica da logo (serve via APP_URL, ex: https://imob-crm-flax.vercel.app/logo-icon-256.png)
async function setGroupPicture(evoUrl: string, evoKey: string, instanceName: string, groupJid: string): Promise<void> {
  const appUrl = Deno.env.get('APP_URL') || 'https://imob-crm-flax.vercel.app'
  const logoUrl = `${appUrl}/logo-icon-256.png`
  const endpoint = `${evoUrl}/group/updateGroupPicture/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`
  const headers = { apikey: evoKey, 'Content-Type': 'application/json' }
  for (const body of [{ image: logoUrl }, { picture: logoUrl }]) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
      if (res.ok) return
      console.warn('[evolution-proxy] setGroupPicture failed:', res.status, (await res.text().catch(()=>'')).slice(0, 200))
    } catch (e) { console.warn('[evolution-proxy] setGroupPicture threw:', e) }
  }
}

// Checa status REAL na Evolution API (source of truth). Atualiza DB se divergente.
async function ensureConnectedStatus(adminClient: any, evoUrl: string, evoHeaders: any, instanceName: string, orgId: string): Promise<{ connected: boolean; number: string | null }> {
  const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders })
  if (!stateRes.ok) return { connected: false, number: null }
  const data = await stateRes.json()
  const rawState = data.instance?.state ?? 'disconnected'
  const mapped = mapStatus(rawState)
  let connectedNumber: string | null = null
  if (mapped === 'connected') {
    const infoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, { headers: evoHeaders })
    if (infoRes.ok) { const info = await infoRes.json(); const first = Array.isArray(info) ? info[0] : null; connectedNumber = first?.ownerJid?.split('@')[0] ?? null }
    await adminClient.from('whatsapp_instances').update({ status: 'connected', connected_number: connectedNumber, last_connection_at: new Date().toISOString() }).eq('organization_id', orgId)
  }
  return { connected: mapped === 'connected', number: connectedNumber }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evoUrl || !evoKey) return jsonResponse({ error: 'Evolution nao configurada' }, 500)

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: supabaseAnonKey } })
    if (!userRes.ok) return jsonResponse({ error: 'Unauthorized', detail: `auth ${userRes.status}` }, 401)
    const userJson = await userRes.json() as { id?: string }
    const userId = userJson.id
    if (!userId) return jsonResponse({ error: 'no user id' }, 401)

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: profile } = await adminClient.from('profiles').select('organization_id, role, phone, name, email').eq('id', userId).maybeSingle()
    if (!profile?.organization_id) return jsonResponse({ error: 'Sem organizacao' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    const orgId = profile.organization_id as string
    const instanceName = instanceNameFor(orgId)
    const isAdminOrManager = ['admin', 'manager'].includes(profile.role)
    const evoHeaders = { apikey: evoKey, 'Content-Type': 'application/json' }

    if (['connect','status','disconnect','delete','restart'].includes(action) && !isAdminOrManager) return jsonResponse({ error: 'Apenas admin/manager' }, 403)

    if (action === 'connect') {
      // Reutiliza secret existente ou gera novo. Evolution API chama webhookUrl?s=<secret>
      // e bot-webhook valida antes de processar.
      const { data: existingInst } = await adminClient.from('whatsapp_instances').select('webhook_secret').eq('organization_id', orgId).maybeSingle()
      const secret = existingInst?.webhook_secret ?? generateWebhookSecret()
      const webhookUrl = `${supabaseUrl}/functions/v1/bot-webhook?s=${secret}`

      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders })
      let qrcodeBase64: string | null = null
      if (stateRes.status === 404) {
        const createRes = await fetch(`${evoUrl}/instance/create`, { method: 'POST', headers: evoHeaders,
          body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS', webhook: { url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] } }) })
        if (!createRes.ok) return jsonResponse({ error: `Evolution create falhou: ${await createRes.text()}` }, 502)
        qrcodeBase64 = (await createRes.json()).qrcode?.base64 ?? null
      } else {
        // Re-seta o webhook (caso URL tenha mudado, ex: secret novo ou rotacionado)
        try {
          await fetch(`${evoUrl}/webhook/set/${instanceName}`, { method: 'POST', headers: evoHeaders,
            body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] } }) })
        } catch (e) { console.warn('[evolution-proxy] webhook/set threw:', e) }
        const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, { headers: evoHeaders })
        if (connectRes.ok) { const cd = await connectRes.json(); qrcodeBase64 = cd.base64 ?? cd.qrcode?.base64 ?? null }
      }
      await adminClient.from('whatsapp_instances').upsert({ organization_id: orgId, instance_name: instanceName, status: 'qrcode', last_qr_at: new Date().toISOString(), last_error: null, webhook_secret: secret }, { onConflict: 'organization_id' })
      return jsonResponse({ status: 'qrcode', qrcode: qrcodeBase64, instance_name: instanceName })
    }

    if (action === 'status') {
      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders })
      if (stateRes.status === 404) { await adminClient.from('whatsapp_instances').update({ status: 'disconnected', connected_number: null }).eq('organization_id', orgId); return jsonResponse({ status: 'disconnected', connected_number: null }) }
      const stateData = await stateRes.json(); const rawState = stateData.instance?.state ?? 'disconnected'; const mapped = mapStatus(rawState)
      let connectedNumber: string | null = null
      if (mapped === 'connected') { const infoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, { headers: evoHeaders }); if (infoRes.ok) { const info = await infoRes.json(); const first = Array.isArray(info) ? info[0] : null; connectedNumber = first?.ownerJid?.split('@')[0] ?? null } }
      const update: Record<string, unknown> = { status: mapped, connected_number: connectedNumber }
      if (mapped === 'connected') update.last_connection_at = new Date().toISOString()
      await adminClient.from('whatsapp_instances').update(update).eq('organization_id', orgId)
      if (mapped === 'connected' && connectedNumber) {
        const { data: instRow } = await adminClient.from('whatsapp_instances').select('welcome_sent_at').eq('organization_id', orgId).single()
        if (instRow && !instRow.welcome_sent_at) {
          const { data: org } = await adminClient.from('organizations').select('trade_name, legal_name').eq('id', orgId).single()
          const orgName = org?.trade_name || org?.legal_name || 'sua imobiliaria'
          const welcomeText = `✅ *Imob CRM conectado com sucesso!*\n\nSeu WhatsApp de *${orgName}* esta pronto pra receber leads.\n\n_Esta e uma mensagem de teste, voce pode apaga-la._`
          try {
            const sendRes = await fetch(`${evoUrl}/message/sendText/${instanceName}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ number: connectedNumber, text: welcomeText }) })
            if (sendRes.ok) await adminClient.from('whatsapp_instances').update({ welcome_sent_at: new Date().toISOString() }).eq('organization_id', orgId)
          } catch (e) { console.warn('Welcome send threw:', e) }
        }
      }
      return jsonResponse({ status: mapped, connected_number: connectedNumber })
    }

    if (action === 'disconnect') { await fetch(`${evoUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: evoHeaders }); await adminClient.from('whatsapp_instances').update({ status: 'disconnected', connected_number: null }).eq('organization_id', orgId); return jsonResponse({ status: 'disconnected' }) }
    if (action === 'delete') { await fetch(`${evoUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {}); await fetch(`${evoUrl}/instance/delete/${instanceName}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {}); await adminClient.from('whatsapp_instances').delete().eq('organization_id', orgId); return jsonResponse({ status: 'disconnected' }) }
    if (action === 'restart') { await fetch(`${evoUrl}/instance/restart/${instanceName}`, { method: 'PUT', headers: evoHeaders }); return jsonResponse({ status: 'connecting' }) }

    // ======== GRUPO DE ALERTAS ========

    if (action === 'create_alerts_group') {
      if (!isAdminOrManager) return jsonResponse({ error: 'Apenas admin/manager' }, 403)
      const { data: inst } = await adminClient.from('whatsapp_instances').select('status, group_jid').eq('organization_id', orgId).maybeSingle()
      if (inst?.group_jid) return jsonResponse({ error: 'Grupo ja existe', group_jid: inst.group_jid }, 400)
      if (!profile.phone) return jsonResponse({ error: 'Configure seu telefone em Configuracoes > Perfil antes' }, 400)
      const adminPhone = normalizePhone(profile.phone)
      if (!adminPhone) return jsonResponse({ error: 'Telefone invalido (use DDD + numero)' }, 400)

      // Elimina race: sempre checa status real na Evolution API ANTES de criar grupo.
      if (!inst || inst.status !== 'connected') {
        const check = await ensureConnectedStatus(adminClient, evoUrl, evoHeaders, instanceName, orgId)
        if (!check.connected) return jsonResponse({ error: 'WhatsApp nao conectado. Aguarde alguns segundos apos escanear o QR e tente novamente.' }, 400)
      }

      const { data: org } = await adminClient.from('organizations').select('trade_name, legal_name').eq('id', orgId).single()
      const orgName = org?.trade_name || org?.legal_name || 'Imobiliaria'
      const groupName = `Imob CRM — Alertas · ${orgName}`.slice(0, 100)

      const createRes = await fetch(`${evoUrl}/group/create/${instanceName}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ subject: groupName, participants: [adminPhone] }) })
      if (!createRes.ok) return jsonResponse({ error: 'Falha ao criar grupo', detail: await createRes.text() }, 502)
      const createData = await createRes.json() as { id?: string; groupJid?: string }
      const groupJid = createData.groupJid || createData.id
      if (!groupJid) return jsonResponse({ error: 'Grupo criado mas sem JID', detail: createData }, 500)

      try { await fetch(`${evoUrl}/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ action: 'promote', participants: [adminPhone] }) }) } catch (e) { console.warn('promote admin failed:', e) }
      await setGroupPicture(evoUrl, evoKey, instanceName, groupJid)

      const welcome = `📢 *Grupo de alertas Imob CRM*\n\nEste grupo recebe notificacoes automaticas sobre:\n\n🆕 Novos leads\n📅 Visitas agendadas / remarcadas / canceladas\n⚠️ Pedidos de corretor humano\n🔴 Desconexoes do bot\n\nAdicione membros da equipe para receberem alertas em tempo real.`
      await fetch(`${evoUrl}/message/sendText/${instanceName}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ number: groupJid, text: welcome }) }).catch(() => {})

      await adminClient.from('whatsapp_instances').update({ group_jid: groupJid, group_name: groupName, group_created_at: new Date().toISOString() }).eq('organization_id', orgId)
      return jsonResponse({ ok: true, group_jid: groupJid, group_name: groupName })
    }

    if (action === 'update_group_picture') {
      if (!isAdminOrManager) return jsonResponse({ error: 'Apenas admin/manager' }, 403)
      const { data: inst } = await adminClient.from('whatsapp_instances').select('group_jid').eq('organization_id', orgId).maybeSingle()
      if (!inst?.group_jid) return jsonResponse({ error: 'Grupo nao criado' }, 400)
      await setGroupPicture(evoUrl, evoKey, instanceName, inst.group_jid)
      return jsonResponse({ ok: true })
    }

    if (action === 'join_alerts_group') {
      const { data: inst } = await adminClient.from('whatsapp_instances').select('group_jid').eq('organization_id', orgId).maybeSingle()
      if (!inst?.group_jid) return jsonResponse({ error: 'Grupo ainda nao criado pelo admin' }, 400)
      if (!profile.phone) return jsonResponse({ error: 'Configure seu telefone em Configuracoes > Perfil antes' }, 400)
      const myPhone = normalizePhone(profile.phone)
      if (!myPhone) return jsonResponse({ error: 'Telefone invalido' }, 400)
      const res = await fetch(`${evoUrl}/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(inst.group_jid)}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ action: 'add', participants: [myPhone] }) })
      if (!res.ok) return jsonResponse({ error: 'Falha ao entrar no grupo', detail: await res.text() }, 502)
      return jsonResponse({ ok: true, added: myPhone })
    }

    if (action === 'list_group_members') {
      const { data: inst } = await adminClient.from('whatsapp_instances').select('group_jid').eq('organization_id', orgId).maybeSingle()
      if (!inst?.group_jid) return jsonResponse({ error: 'Grupo nao criado' }, 400)
      const res = await fetch(`${evoUrl}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(inst.group_jid)}`, { headers: evoHeaders })
      if (!res.ok) return jsonResponse({ error: 'Falha ao buscar info' }, 502)
      return jsonResponse({ ok: true, info: await res.json() })
    }

    if (action === 'remove_group_member') {
      if (!isAdminOrManager) return jsonResponse({ error: 'Apenas admin/manager' }, 403)
      const phoneRaw = body.phone as string
      if (!phoneRaw) return jsonResponse({ error: 'phone obrigatorio' }, 400)
      const phone = normalizePhone(phoneRaw)
      if (!phone) return jsonResponse({ error: 'Telefone invalido' }, 400)
      const { data: inst } = await adminClient.from('whatsapp_instances').select('group_jid').eq('organization_id', orgId).maybeSingle()
      if (!inst?.group_jid) return jsonResponse({ error: 'Grupo nao criado' }, 400)
      const res = await fetch(`${evoUrl}/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(inst.group_jid)}`, { method: 'POST', headers: evoHeaders, body: JSON.stringify({ action: 'remove', participants: [phone] }) })
      if (!res.ok) return jsonResponse({ error: 'Falha ao remover', detail: await res.text() }, 502)
      return jsonResponse({ ok: true, removed: phone })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[evolution-proxy] unhandled:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
