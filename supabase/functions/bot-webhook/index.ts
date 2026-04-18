import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { BedrockRuntimeClient, InvokeModelCommand } from 'npm:@aws-sdk/client-bedrock-runtime@3.709.0'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const ok = (body: unknown = { ok: true }) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } })

function unaccent(s: string): string { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

type EvolutionMessage = { event: string; instance?: string; data?: { key?: { remoteJid?: string; fromMe?: boolean; id?: string }; pushName?: string; message?: { conversation?: string; extendedTextMessage?: { text?: string }; audioMessage?: any; imageMessage?: { url?: string; mimetype?: string; caption?: string }; videoMessage?: { caption?: string } }; messageType?: string } }
type Lead = { id: string; organization_id: string; name: string | null; phone: string; email: string | null; name_confirmed: boolean; bot_paused: boolean; bot_paused_reason: string | null; status: string; property_type: string | null; location_interest: string | null; budget_min: number | null; budget_max: number | null; bedrooms_needed: number | null; profile_notes: string | null }
type Organization = { legal_name: string | null; trade_name: string | null; website: string | null; email: string | null; phone: string | null; address_city: string | null; address_state: string | null }
type BotConfig = { is_active: boolean; persona: string | null; welcome_message: string; triagem_localizacao: string; triagem_tipo: string; triagem_orcamento: string; triagem_quartos: string; mensagem_agendamento: string; farewell_message: string; no_properties_message: string; business_hours_enabled: boolean; business_hours_start: string; business_hours_end: string; outside_hours_message: string; max_properties_shown: number; can_schedule: boolean; can_escalate: boolean; can_negotiate_price: boolean; show_listing_links: boolean; communication_style: 'casual' | 'balanced' | 'formal'; company_differentials: string | null; service_areas: string | null }

function parseBrtDate(input: string): Date | null {
  const s = input.trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) { const d = new Date(s); return isNaN(d.getTime()) ? null : d }
  const [, date, time] = m
  return new Date(`${date}T${time}-03:00`)
}

function toBrtIso(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc }, {})
  const h = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}-03:00`
}

function fmtBrtShort(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function isSuspiciousName(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim()
  if (n.length < 2) return true
  if (/\d/.test(n)) return true
  if (/^[a-z]+$/.test(n)) return true
  if (/[_@]/.test(n)) return true
  return false
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// ========= Group notifications =========
async function getGroupJid(admin: SupabaseClient, orgId: string, instanceName: string): Promise<string | null> {
  const { data } = await admin.from('whatsapp_instances').select('group_jid').eq('organization_id', orgId).maybeSingle()
  return data?.group_jid ?? null
}

async function sendGroupMessage(instanceName: string, groupJid: string, text: string): Promise<void> {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')!
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')!
  try {
    const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: groupJid, text }),
    })
    if (!res.ok) console.warn('[bot-webhook] group send failed:', await res.text())
  } catch (e) { console.warn('[bot-webhook] group send threw:', e) }
}

async function notifyGroup(admin: SupabaseClient, orgId: string, instanceName: string, text: string): Promise<void> {
  const jid = await getGroupJid(admin, orgId, instanceName)
  if (!jid) return
  await sendGroupMessage(instanceName, jid, text)
}

// ========= Google Calendar helpers =========
type CalIntegration = { user_id: string; google_email: string | null; calendar_id: string; access_token: string | null; refresh_token: string; expires_at: string | null }

async function getOrgCalIntegration(admin: SupabaseClient, orgId: string): Promise<CalIntegration | null> {
  const { data } = await admin.rpc('get_org_calendar_integration', { p_org_id: orgId })
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return row as CalIntegration
}

async function refreshGoogleToken(admin: SupabaseClient, integ: CalIntegration): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null
  if (integ.access_token && integ.expires_at && new Date(integ.expires_at).getTime() - Date.now() > 120_000) return integ.access_token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: integ.refresh_token, grant_type: 'refresh_token' }),
  })
  if (!res.ok) { await admin.from('calendar_integrations').update({ last_error: `refresh_failed` }).eq('user_id', integ.user_id).eq('provider', 'google'); return null }
  const j = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString()
  await admin.from('calendar_integrations').update({ access_token: j.access_token, expires_at: expiresAt, last_error: null }).eq('user_id', integ.user_id).eq('provider', 'google')
  return j.access_token
}

async function isBusyOnGoogle(accessToken: string, calendarId: string, at: Date, windowMin = 30): Promise<boolean> {
  const timeMin = new Date(at.getTime() - windowMin * 60_000).toISOString()
  const timeMax = new Date(at.getTime() + windowMin * 60_000).toISOString()
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, timeZone: 'America/Sao_Paulo', items: [{ id: calendarId }] }),
  })
  if (!res.ok) return false
  const j = await res.json() as { calendars: Record<string, { busy?: Array<{ start: string; end: string }> }> }
  return !!(j.calendars?.[calendarId]?.busy && j.calendars[calendarId].busy!.length > 0)
}

async function createGoogleEvent(accessToken: string, calendarId: string, input: { summary: string; description?: string; startAt: Date; endAt?: Date; location?: string; attendeeEmail?: string | null }): Promise<{ id: string; htmlLink?: string } | null> {
  const end = input.endAt ?? new Date(input.startAt.getTime() + 60 * 60_000)
  const body: Record<string, unknown> = { summary: input.summary, description: input.description ?? null, location: input.location ?? null, start: { dateTime: input.startAt.toISOString(), timeZone: 'America/Sao_Paulo' }, end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' }, reminders: { useDefault: true } }
  if (input.attendeeEmail) body.attendees = [{ email: input.attendeeEmail }]
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${input.attendeeEmail ? '?sendUpdates=all' : ''}`
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) return null
  return await res.json() as { id: string; htmlLink?: string }
}

async function addAttendeeToGoogleEvent(accessToken: string, calendarId: string, eventId: string, email: string): Promise<boolean> {
  const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!getRes.ok) return false
  const event = await getRes.json() as { attendees?: Array<{ email: string }> }
  const attendees = event.attendees ?? []
  if (attendees.some((a) => (a.email || '').toLowerCase() === email.toLowerCase())) return true
  attendees.push({ email })
  const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ attendees }) })
  return patchRes.ok
}

async function patchGoogleEvent(accessToken: string, calendarId: string, eventId: string, patch: { startAt?: Date; endAt?: Date }): Promise<boolean> {
  const body: any = {}
  if (patch.startAt) body.start = { dateTime: patch.startAt.toISOString(), timeZone: 'America/Sao_Paulo' }
  const end = patch.endAt ?? (patch.startAt ? new Date(patch.startAt.getTime() + 60 * 60_000) : null)
  if (end) body.end = { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' }
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.ok
}

async function deleteGoogleEvent(accessToken: string, calendarId: string, eventId: string): Promise<boolean> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
  return res.ok || res.status === 410
}

// ========= Conflict + suggestion =========
async function hasConflictingAppointment(admin: SupabaseClient, orgId: string, propertyId: string, at: Date, windowMin = 30, excludeApptId?: string): Promise<boolean> {
  const from = new Date(at.getTime() - windowMin * 60_000).toISOString()
  const to = new Date(at.getTime() + windowMin * 60_000).toISOString()
  let q = admin.from('appointments').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('property_id', propertyId).in('status', ['agendado', 'confirmado']).gte('scheduled_at', from).lte('scheduled_at', to)
  if (excludeApptId) q = q.neq('id', excludeApptId)
  const { count, error } = await q
  if (error) return false
  return (count ?? 0) > 0
}

async function suggestAvailableSlots(admin: SupabaseClient, orgId: string, propertyId: string, wanted: Date, gcalToken: string | null, gcalCalId: string | null, maxSuggestions = 3, windowMin = 30): Promise<string[]> {
  const suggestions: string[] = []
  const now = Date.now()
  const candidates: Date[] = []
  function brtDate(baseDate: Date, hour: number, minute: number): Date {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(baseDate).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc }, {})
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-03:00`)
  }
  const wantedParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(wanted).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc }, {})
  let wantedH = parseInt(wantedParts.hour, 10); if (wantedH === 24) wantedH = 0
  const wantedM = parseInt(wantedParts.minute, 10)
  for (const delta of [30, 60, 90, 120, -60, -30, -90, -120, 180, 240]) {
    const total = wantedH * 60 + wantedM + delta
    if (total < 9*60 || total > 18*60) continue
    const h = Math.floor(total/60), m = total%60
    if (m !== 0 && m !== 30) continue
    const c = brtDate(wanted, h, m)
    if (c.getTime() > now) candidates.push(c)
  }
  for (let d = 1; d <= 3; d++) {
    const dt = new Date(wanted.getTime() + d * 86_400_000)
    for (const [h, m] of [[10,0],[11,0],[14,0],[15,0],[16,0],[17,0]]) {
      const c = brtDate(dt, h, m); if (c.getTime() > now) candidates.push(c)
    }
  }
  for (const c of candidates) {
    if (suggestions.length >= maxSuggestions) break
    if (await hasConflictingAppointment(admin, orgId, propertyId, c, windowMin)) continue
    if (gcalToken && gcalCalId && await isBusyOnGoogle(gcalToken, gcalCalId, c, windowMin)) continue
    suggestions.push(toBrtIso(c))
  }
  return suggestions
}

// ========= Main =========
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return ok()
  let payload: EvolutionMessage
  try { payload = await req.json() } catch { return ok() }
  if (payload.event !== 'messages.upsert') return ok()
  const data = payload.data
  if (!data?.key) return ok()
  if (data.key.fromMe) return ok()
  if (!data.key.remoteJid) return ok()
  if (data.key.remoteJid.endsWith('@g.us')) return ok()

  const phone = data.key.remoteJid.split('@')[0]
  const pushName = data.pushName || null
  const instanceName = payload.instance
  const wamId = data.key.id || null
  if (!instanceName) return ok()

  let text: string | null = data.message?.conversation || data.message?.extendedTextMessage?.text || null
  let isAudio = false, imageBase64: string | null = null, imageMimetype: string | null = null, isImage = false

  if (!text && data.message?.audioMessage) {
    const media = await fetchMediaBase64(instanceName, { key: data.key, message: data.message }, 'audio/ogg')
    if (media) { const t = await transcribeAudio(media.base64, media.mimetype); if (t) { text = t; isAudio = true } }
    if (!text) { await sendWhatsApp(instanceName, phone, 'Oi! Recebi seu audio mas nao consegui entender. Pode mandar por texto?').catch(()=>{}); return ok() }
  }
  if (data.message?.imageMessage) {
    const media = await fetchMediaBase64(instanceName, { key: data.key, message: data.message }, 'image/jpeg')
    if (media) { const mt = media.mimetype.split(';')[0].trim().toLowerCase(); if (['image/jpeg','image/png','image/gif','image/webp'].includes(mt)) { imageBase64 = media.base64; imageMimetype = mt; isImage = true; text = data.message.imageMessage.caption || 'Enviei uma imagem.' } }
    if (!isImage) { await sendWhatsApp(instanceName, phone, 'Oi! Recebi sua imagem mas tive dificuldade em processar. Me descreve em texto?').catch(()=>{}); return ok() }
  }
  if (data.message?.videoMessage) {
    text = data.message.videoMessage.caption || '[video sem legenda]'
    if (!data.message.videoMessage.caption) { await sendWhatsApp(instanceName, phone, 'Oi! Recebi seu video. Nao processamos videos, me descreve em texto ou manda foto?').catch(()=>{}); return ok() }
  }
  if (!text || !text.trim()) return ok()

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (wamId) { const { data: existing } = await admin.from('conversations').select('id').eq('whatsapp_message_id', wamId).maybeSingle(); if (existing) return ok() }

  // Valida secret do webhook: o URL configurado na Evolution API inclui ?s=<secret>.
  // Se a instancia tem webhook_secret gravado, o valor precisa bater. Instancias antigas
  // sem secret (pre-rollout) ainda passam para nao quebrar conexoes existentes.
  const url = new URL(req.url)
  const providedSecret = url.searchParams.get('s')
  const { data: instance } = await admin.from('whatsapp_instances').select('organization_id, webhook_secret').eq('instance_name', instanceName).maybeSingle()
  if (!instance) return ok()
  if (instance.webhook_secret && instance.webhook_secret !== providedSecret) {
    console.warn('[bot-webhook] secret mismatch for instance', instanceName)
    return ok()
  }
  const orgId = instance.organization_id as string

  const { data: config } = await admin.from('bot_config').select('*').eq('organization_id', orgId).maybeSingle()
  if (!config || !config.is_active) return ok()

  // Detecta se eh novo lead (antes do upsert)
  const { data: priorLead } = await admin.from('leads').select('id').eq('organization_id', orgId).eq('phone', phone).maybeSingle()
  const isNewLead = !priorLead

  // IMPORTANTE: so seta `name` quando eh lead novo. Em leads existentes, `pushName` do WhatsApp
  // NUNCA sobrescreve o nome confirmado pela IA (via update_lead).
  const upsertPayload: Record<string, unknown> = { organization_id: orgId, phone, whatsapp_id: data.key.remoteJid, source: 'whatsapp', last_message_at: new Date().toISOString() }
  if (isNewLead) upsertPayload.name = pushName
  const { data: lead, error: leadErr } = await admin.from('leads').upsert(upsertPayload as any, { onConflict: 'organization_id,phone' }).select().single()
  if (leadErr || !lead) return ok()

  const storedText = isImage ? `📷 ${text}` : isAudio ? `🎙️ ${text}` : text
  await admin.from('conversations').insert({ lead_id: lead.id, organization_id: orgId, message: storedText, direction: 'in', whatsapp_message_id: wamId })

  // ======== NOTIFICA GRUPO: novo lead ========
  if (isNewLead) {
    const msg = `🆕 *Novo lead*\n\nNome: ${pushName || 'Sem nome'}\nTelefone: +${phone}\n\nPrimeira mensagem:\n_${text.slice(0, 150)}${text.length > 150 ? '...' : ''}_`
    notifyGroup(admin, orgId, instanceName, msg).catch(() => {})
  }

  // ======== BOT PAUSADO: lead em atendimento humano, notifica grupo e nao chama IA ========
  if ((lead as any).bot_paused) {
    const reason = (lead as any).bot_paused_reason || 'atendimento humano'
    const preview = text.slice(0, 200) + (text.length > 200 ? '...' : '')
    const msg = `💬 *Lead em atendimento humano enviou mensagem*\n_Motivo da pausa: ${reason}_\n\n${lead.name || 'Lead'} (+${phone}):\n_${preview}_\n\n🤖 Bot NAO respondeu. Responda voce pelo WhatsApp.`
    notifyGroup(admin, orgId, instanceName, msg).catch(() => {})
    return ok()
  }

  // Burst por lead (= por phone, ja que UNIQUE(org_id, phone)): flood protection.
  const tenSecAgo = new Date(Date.now() - 10_000).toISOString()
  const { count: recentCount } = await admin.from('conversations').select('id', { count: 'exact', head: true }).eq('lead_id', lead.id).eq('direction', 'in').gte('sent_at', tenSecAgo)
  if ((recentCount ?? 0) > 5) return ok()

  // Cap diario por organizacao: conta TODAS as chamadas AI (tool-use ou nao).
  // Antes contava so as que usaram tool => respostas de texto puro bypassavam o limite e geravam custo.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { count: dailyCount } = await admin.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('direction', 'out').gt('ai_tokens_used', 0).gte('sent_at', dayAgo)
  if ((dailyCount ?? 0) >= 300) { const msg = 'Alta demanda no momento. Um corretor vai te responder em breve.'; await sendWhatsApp(instanceName, phone, msg).catch(()=>{}); await admin.from('conversations').insert({ lead_id: lead.id, organization_id: orgId, message: msg, direction: 'out' }); return ok() }

  if (config.business_hours_enabled) {
    const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes()
    const [sH,sM] = (config.business_hours_start||'08:00').split(':').map(Number)
    const [eH,eM] = (config.business_hours_end||'18:00').split(':').map(Number)
    if (nowMin < sH*60+sM || nowMin > eH*60+eM) {
      const outMsg = (config.outside_hours_message || '').replace('{inicio}', config.business_hours_start).replace('{fim}', config.business_hours_end)
      await sendWhatsApp(instanceName, phone, outMsg)
      await admin.from('conversations').insert({ lead_id: lead.id, organization_id: orgId, message: outMsg, direction: 'out' })
      return ok()
    }
  }

  const { data: org } = await admin.from('organizations').select('legal_name, trade_name, website, email, phone, address_city, address_state').eq('id', orgId).single()
  const { data: history } = await admin.from('conversations').select('message, direction').eq('lead_id', lead.id).order('sent_at', { ascending: false }).limit(20)
  const orderedHistory = (history ?? []).reverse()
  const isFirstContact = orderedHistory.filter((h) => h.direction === 'out').length === 0

  const { data: lastToolRows } = await admin.from('conversations').select('ai_tool_used, ai_tool_output').eq('lead_id', lead.id).eq('ai_tool_used', 'search_properties').not('ai_tool_output', 'is', null).order('sent_at', { ascending: false }).limit(1)
  const lastSearchOutput = lastToolRows?.[0]?.ai_tool_output ?? null

  const { data: activeAppts } = await admin.from('appointments').select('id, scheduled_at, status, notes, properties(title)').eq('lead_id', lead.id).in('status', ['agendado','confirmado']).gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true })

  try {
    const response = await generateAiResponse({ admin, orgId, instanceName, lead: lead as Lead, org: (org ?? {}) as Organization, config: config as BotConfig, history: orderedHistory, lastSearchOutput, currentImage: imageBase64 && imageMimetype ? { base64: imageBase64, mimetype: imageMimetype } : null, activeAppointments: activeAppts ?? [], isFirstContact })
    if (response) {
      await sendWhatsApp(instanceName, phone, response.text)
      await admin.from('conversations').insert({ lead_id: lead.id, organization_id: orgId, message: response.text, direction: 'out', ai_tool_used: response.toolUsed, ai_tokens_used: response.tokensUsed, ai_tool_output: response.toolOutput ?? null })
      if (lead.status === 'novo') await admin.from('leads').update({ status: 'em_contato' }).eq('id', lead.id)
    }
  } catch (err) {
    console.error('[bot-webhook] AI error:', err)
    const fallback = 'Oi! Tive uma dificuldade tecnica. Em instantes um corretor vai te responder.'
    await sendWhatsApp(instanceName, phone, fallback).catch(()=>{})
    await admin.from('conversations').insert({ lead_id: lead.id, organization_id: orgId, message: fallback, direction: 'out' })
  }
  return ok()
})

async function sendWhatsApp(instanceName: string, phone: string, text: string) {
  const res = await fetch(`${Deno.env.get('EVOLUTION_API_URL')!}/message/sendText/${instanceName}`, { method: 'POST', headers: { apikey: Deno.env.get('EVOLUTION_API_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) })
  if (!res.ok) console.warn('[bot-webhook] sendText failed:', await res.text())
}

async function fetchMediaBase64(instanceName: string, messagePayload: { key: unknown; message: unknown }, fallbackMime = 'application/octet-stream') {
  const res = await fetch(`${Deno.env.get('EVOLUTION_API_URL')!}/chat/getBase64FromMediaMessage/${instanceName}`, { method: 'POST', headers: { apikey: Deno.env.get('EVOLUTION_API_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: messagePayload, convertToMp4: false }) })
  if (!res.ok) return null
  const data = await res.json()
  const base64 = data.base64 || data.mediaBase64 || null
  const mimetype = data.mimetype || data.mediaType || fallbackMime
  if (!base64) return null
  return { base64, mimetype }
}

async function transcribeAudio(base64: string, mimetype: string) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY'); if (!openaiKey) return null
  const binary = atob(base64); const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const ext = mimetype.includes('mp4') ? 'mp4' : mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('wav') ? 'wav' : 'ogg'
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimetype }), `audio.${ext}`)
  form.append('model', 'whisper-1'); form.append('language', 'pt')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: form })
  if (!res.ok) return null
  const data = await res.json()
  return (data.text as string)?.trim() || null
}

type AiResponse = { text: string; toolUsed?: string; tokensUsed?: number; toolOutput?: unknown }

function formatActiveAppointments(appts?: Array<{ id: string; scheduled_at: string; status: string; properties?: { title?: string } | null }>) {
  if (!appts || appts.length === 0) return '(nenhum agendamento ativo)'
  return appts.map((a) => `[appointment_id: ${a.id}] ${fmtBrtShort(new Date(a.scheduled_at))} BRT / ${a.properties?.title ?? 'imovel'} / status: ${a.status}`).join('\n')
}

function buildSystemPrompt(org: Organization, config: BotConfig, lead: Lead, lastSearchOutput?: unknown, activeAppointments?: any[], isFirstContact = false, hasGcal = false): string {
  const orgName = org.trade_name || org.legal_name || 'nossa imobiliaria'
  const location = org.address_city && org.address_state ? `${org.address_city}/${org.address_state}` : org.address_city || ''
  const style = config.communication_style || 'balanced'
  const styleInstructions = { casual: 'Tom descontraido, girias leves, emojis naturais, respostas curtas.', balanced: 'Tom amigavel profissional, linguagem natural, emojis ocasionais, respostas curtas.', formal: 'Tom profissional cortes, sem girias, emojis raros, objetivo.' }[style]
  const capabilities: string[] = []
  if (config.can_schedule) capabilities.push(`- Pode agendar visitas com schedule_visit. NUNCA diga agendei sem chamar.${hasGcal ? ' (Agendamentos sao adicionados a agenda do corretor.)' : ''}`)
  else capabilities.push('- NAO agende. Use update_lead pra registrar preferencia.')
  if (config.can_escalate) capabilities.push('- Pode escalar com escalate_to_human.')
  else capabilities.push('- Nao escale, tente resolver.')
  if (config.can_negotiate_price) capabilities.push('- Pode negociar dentro do cadastro.')
  else capabilities.push('- NAO negocie valores.')
  if (config.show_listing_links) capabilities.push('- Inclua SEMPRE listing_url como URL pura no final de cada imovel.')
  else capabilities.push('- Nao envie links.')
  const now = new Date()
  const currentDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(now)
  const currentIso = now.toISOString()
  const brtToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc }, {})
  const baseDay = new Date(`${brtToday.year}-${brtToday.month}-${brtToday.day}T12:00:00-03:00`)
  const dayNames = ['domingo','segunda-feira','terca-feira','quarta-feira','quinta-feira','sexta-feira','sabado']
  const calendarRows: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(baseDay.getTime() + i * 86400000)
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d).reduce<Record<string, string>>((acc, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc }, {})
    const dow = dayNames[d.getUTCDay()]
    const label = i === 0 ? 'HOJE' : i === 1 ? 'AMANHA' : i === 2 ? 'DEPOIS DE AMANHA' : ''
    calendarRows.push(`${parts.year}-${parts.month}-${parts.day} (${dow})${label ? ` ← ${label}` : ''}`)
  }
  const calendarBlock = calendarRows.join('\n')
  const customPersona = config.persona?.trim() || [config.welcome_message, config.triagem_localizacao, config.triagem_tipo, config.triagem_orcamento, config.triagem_quartos].filter(Boolean).join('\n')
  return `Voce e um atendente virtual da ${orgName}${location ? ` em ${location}` : ''}.

# Data/hora
Agora: ${currentDate} BRT (ISO UTC: ${currentIso}). Timezone OFICIAL: BRT (-03:00).

# Calendario de referencia (BRT) - USE ESTA TABELA, NAO CALCULE
${calendarBlock}

Quando o lead disser "segunda", "amanha", "dia 20", "semana que vem" etc, LOCALIZE a data EXATA nesta tabela antes de chamar schedule_visit. NUNCA chute o dia da semana.

# Regra de horarios (CRITICO)
TODO horario com o lead e em BRT. Em schedule_visit e reschedule_visit, scheduled_at DEVE incluir -03:00 explicito.
Formato: YYYY-MM-DDTHH:MM:SS-03:00. PROIBIDO Z ou +00:00.

# Missao
Ajudar o lead a encontrar imoveis. Qualifique tipo, localizacao, orcamento, quartos.

# Tom (${style})
${styleInstructions} NUNCA revele ser IA.

# Formatacao WhatsApp
- Negrito *unico*, italico _underscore_, tachado ~til~. Nunca ** ou ##.
- Sem listas "- item" nem "1. item", use frases.
- NUNCA travessao (—–), use virgula.
- Emojis com moderacao.

# Contexto
${org.legal_name ? `- Razao: ${org.legal_name}` : ''}
${org.trade_name ? `- Fantasia: ${org.trade_name}` : ''}
${location ? `- Cidade: ${location}` : ''}
${config.service_areas ? `- Regioes: ${config.service_areas}` : ''}
${config.company_differentials ? `- Diferenciais: ${config.company_differentials}` : ''}
${hasGcal ? '- Agenda do corretor conectada: sim (agendamentos entram automaticamente)' : ''}

${isFirstContact ? `# Primeira mensagem (PRIORIDADE)
1. Comece com: "Ola! Bem-vindo(a) a *${orgName}*!"
2. Apresente-se como atendente${config.can_escalate ? ' mencionando corretor humano disponivel' : ''}
3. Diga que pode receber *texto, audio ou fotos*
4. Convide o lead a contar o que procura
4-6 linhas, acolhedor.
` : ''}# Capacidades
${capabilities.join('\n')}

${customPersona ? `# Instrucoes do time\n${customPersona}\n` : ''}

# Imoveis mostrados recentemente (IDs para schedule_visit)
${formatLastSearch(lastSearchOutput)}

# Agendamentos ativos (use appointment_id)
${formatActiveAppointments(activeAppointments)}

# Lead
- Nome: ${lead.name || 'ainda nao informado'} ${lead.name_confirmed ? '(confirmado pelo lead)' : isSuspiciousName(lead.name) ? '(NAO confirmado, parece nome automatico/username, CONFIRMAR)' : '(nao confirmado)'}
- Email: ${lead.email || 'ainda nao informado'}
- Status: ${lead.status}
${lead.property_type ? `- Tipo: ${lead.property_type}` : ''}
${lead.location_interest ? `- Local: ${lead.location_interest}` : ''}
${lead.bedrooms_needed ? `- Quartos: ${lead.bedrooms_needed}` : ''}
${lead.budget_max ? `- Orcamento: R$ ${lead.budget_max.toLocaleString('pt-BR')}` : ''}
${lead.profile_notes ? `- Notas: ${lead.profile_notes}` : ''}

# Regras operacionais
1. search_properties SEMPRE pra mostrar imoveis. REGRA ABSOLUTA: se search_properties retornar count=0 ou vazio, VOCE NAO PODE inventar imoveis (titulos, precos, enderecos, IDs). Diga ao lead honestamente que nao achou correspondencia e sugira ampliar criterios.
2. update_lead silenciosamente.
3. Max ${config.max_properties_shown || 3} imoveis por resposta.
4. Sem imoveis adequados, seja honesto.
5. NUNCA exponha CNPJ, IE, CRECI.
6. NUNCA narre tool. Proibido "um momento", "deixa eu buscar". Chame silenciosamente e na MESMA resposta apresente os imoveis.
7. HORARIOS em BRT com -03:00 explicito.
8. CONFLITO: se tool retornar error=conflict + suggested_slots, NUNCA revele detalhes do outro evento. Ofereca alternativas em BRT legivel. Pergunte qual prefere.
9. PROIBIDO mencionar "Google Calendar", "Gcal" ou qualquer provedor externo ao lead. Se precisar confirmar sincronizacao, diga apenas "adicionei na agenda do corretor".
10. NOME do lead: se marcado "(NAO confirmado, parece nome automatico/username, CONFIRMAR)", pergunte educadamente o nome real antes de seguir com triagem. Ex: "Antes de continuar, como prefere que eu te chame?". Quando o lead responder, chame update_lead({name: "Nome Real"}). NUNCA use um nome suspeito como se fosse o real.
11. EMAIL (ANTES de agendar, NUNCA depois): ${hasGcal ? 'quando o lead confirmar um imovel + data/hora e ANTES de voce chamar schedule_visit, pergunte educadamente: "Quer receber a confirmacao por email? Se sim, me passa seu email pra eu ja incluir na agenda." Se informar email, chame update_lead({email}) PRIMEIRO, e SO ENTAO chame schedule_visit (o convite vai junto automaticamente). Se recusar ou nao responder de boa, chame schedule_visit direto.' : '(agenda do corretor nao conectada nesta org; nao oferte convite por email)'}
12. FIM DE ATENDIMENTO: apos schedule_visit com ok=true OU escalate_to_human, esta e a ULTIMA mensagem automatizada. Finalize com despedida breve e calorosa. NAO faca perguntas do tipo "mais alguma coisa?" "posso ajudar em algo mais?" - o corretor humano assume a partir daqui. Bot sera pausado apos esta resposta.
13. APRESENTACAO DE IMOVEIS: quando search_properties retornar count>0, VOCE DEVE apresentar TODOS os imoveis da lista imediatamente com titulo, preco, endereco. PROIBIDO responder "nao encontrei" quando count>0. PROIBIDO inventar titulos/precos/IDs; use apenas os dados que vieram no tool result.
14. NAO NARRE TOOL: PROIBIDO frases como "vou buscar", "um momento", "deixa eu verificar", "procurando", "aguarde". Chame tool silenciosamente e apresente o resultado direto.
`
}

function sanitizeForWhatsApp(text: string): string {
  // 1) Strip narration sentences entirely (ex: "Vou buscar...", "Um momento...", "Deixa eu verificar...")
  const narrationSentenceRe = /[^.!?\n]*\b(um momento|um instante|so um momento|só um momento|aguarde|aguardando|procurando|buscando|checando|pesquisando|deixa eu (buscar|verificar|procurar|checar|pesquisar)|vou (buscar|verificar|procurar|checar|pesquisar))\b[^.!?\n]*[.!?…]?\s*/gi
  text = text.replace(narrationSentenceRe, '')
  // 2) Collapse double blank lines left behind
  text = text.replace(/\n{3,}/g, '\n\n')
  // 3) Existing WhatsApp-specific cleanup
  return text.replace(/\*\*([^*]+?)\*\*/g, '*$1*').replace(/__([^_]+?)__/g, '_$1_').replace(/^\s*#{1,6}\s+/gm, '').replace(/^\s*-{3,}\s*$/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, ', ').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2').replace(/  +/g, ' ').replace(/ +,/g, ',').trim()
}

function formatLastSearch(output: unknown): string {
  if (!output || typeof output !== 'object') return '(nenhum imovel consultado)'
  const obj = output as { properties?: Array<any> }
  const props = obj.properties
  if (!Array.isArray(props) || props.length === 0) return '(busca anterior vazia)'
  return props.slice(0, 5).map((p) => { const parts = []; if (p.price) parts.push(`R$ ${p.price.toLocaleString('pt-BR')} venda`); if (p.rent_price) parts.push(`R$ ${p.rent_price.toLocaleString('pt-BR')}/mes`); return `[ID: ${p.id}] ${p.title} / ${p.address ?? ''} / ${parts.join(' / ')}` }).join('\n')
}

function toolDefinitions(config: BotConfig) {
  const tools: unknown[] = [
    { name: 'search_properties', description: 'Busca imoveis disponiveis.', input_schema: { type: 'object', properties: { type: { type: 'string' }, city: { type: 'string' }, neighborhood: { type: 'string' }, min_price: { type: 'number' }, max_price: { type: 'number' }, bedrooms: { type: 'number' }, listing_purpose: { type: 'string', enum: ['sale','rent'] }, amenities: { type: 'array', items: { type: 'string' } } } } },
    { name: 'update_lead', description: 'Atualiza dados do lead silenciosamente. Use name quando o lead confirmar o nome real; use email se ele espontaneamente informar o email antes do agendamento.', input_schema: { type: 'object', properties: { name: { type: 'string' }, property_type: { type: 'string' }, location_interest: { type: 'string' }, bedrooms_needed: { type: 'number' }, budget_min: { type: 'number' }, budget_max: { type: 'number' }, profile_notes: { type: 'string' }, email: { type: 'string' } } } },
  ]
  if (config.can_schedule) {
    tools.push({ name: 'schedule_visit', description: 'Cria agendamento. Pode retornar conflict com suggested_slots.', input_schema: { type: 'object', properties: { property_id: { type: 'string' }, scheduled_at: { type: 'string', description: 'BRT YYYY-MM-DDTHH:MM:SS-03:00' }, notes: { type: 'string' } }, required: ['property_id','scheduled_at'] } })
    tools.push({ name: 'reschedule_visit', description: 'Remarca visita.', input_schema: { type: 'object', properties: { appointment_id: { type: 'string' }, new_scheduled_at: { type: 'string', description: 'BRT YYYY-MM-DDTHH:MM:SS-03:00' }, reason: { type: 'string' } }, required: ['appointment_id','new_scheduled_at'] } })
    tools.push({ name: 'cancel_visit', description: 'Cancela visita.', input_schema: { type: 'object', properties: { appointment_id: { type: 'string' }, reason: { type: 'string' } }, required: ['appointment_id'] } })
    tools.push({ name: 'send_invite_by_email', description: 'Envia convite de calendario por email para um agendamento ja criado. Use apos o lead confirmar que quer receber o convite e fornecer o email.', input_schema: { type: 'object', properties: { appointment_id: { type: 'string' }, email: { type: 'string' } }, required: ['appointment_id','email'] } })
  }
  if (config.can_escalate) tools.push({ name: 'escalate_to_human', description: 'Escala pra corretor humano.', input_schema: { type: 'object', properties: { reason: { type: 'string' }, urgency: { type: 'string', enum: ['low','normal','high'] } }, required: ['reason'] } })
  return tools
}

async function executeTool(toolName: string, input: Record<string, unknown>, ctx: { admin: SupabaseClient; orgId: string; instanceName: string; leadId: string; maxProps: number }): Promise<string> {
  if (toolName === 'search_properties') {
    let q = ctx.admin.from('properties').select('*').eq('organization_id', ctx.orgId).eq('listing_status', 'available')
    if (input.type) q = q.eq('type', String(input.type).toLowerCase())
    if (input.city) { const v = unaccent(String(input.city)); q = q.or(`city.ilike.%${v}%,neighborhood.ilike.%${v}%`) }
    if (input.neighborhood) { const v = unaccent(String(input.neighborhood)); q = q.or(`neighborhood.ilike.%${v}%,city.ilike.%${v}%`) }
    if (input.min_price) q = q.gte('price', Number(input.min_price))
    if (input.max_price) q = q.lte('price', Number(input.max_price))
    if (input.bedrooms) q = q.gte('bedrooms', Number(input.bedrooms))
    if (input.listing_purpose) { const lp = String(input.listing_purpose); if (lp==='sale'||lp==='rent') q = q.or(`listing_purpose.eq.${lp},listing_purpose.eq.both`) }
    if (input.amenities && Array.isArray(input.amenities) && input.amenities.length > 0) q = q.contains('amenities', input.amenities as string[])
    q = q.order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(ctx.maxProps)
    const { data, error } = await q
    if (error) return JSON.stringify({ error: error.message })
    const slim = (data ?? []).map((p: any) => ({ id: p.id, title: p.title, type: p.type, featured: p.featured, listing_purpose: p.listing_purpose, address: [p.location, p.neighborhood, p.address_city || p.city].filter(Boolean).join(', '), price: p.price, rent_price: p.rent_price, condo_fee: p.condo_fee, iptu: p.iptu, bedrooms: p.bedrooms, suites: p.suites, bathrooms: p.bathrooms, parking_spots: p.parking_spots, area_m2: p.area_m2, floor: p.floor, year_built: p.year_built, furnished: p.furnished, description: p.description, amenities: p.amenities, listing_url: p.listing_url }))
    if (slim.length === 0) { const { count } = await ctx.admin.from('properties').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('listing_status', 'available'); return JSON.stringify({ count: 0, properties: [], hint: `ATENCAO CRITICO: 0 imoveis encontrados com esses filtros. Total disponivel na base: ${count ?? 0}. PROIBIDO inventar ou citar imoveis (titulos, precos, IDs, enderecos). VOCE DEVE informar ao lead que nao achou correspondencia exata e sugerir: ampliar faixa de preco, trocar bairro, remover algum filtro. Se ja tinha mostrado imoveis antes nesta conversa, use os IDs daqueles. NUNCA invente.` }) }
    return JSON.stringify({ count: slim.length, properties: slim, ai_instruction: `ENCONTRADOS ${slim.length} imoveis REAIS nesta busca. Apresente TODOS eles agora na resposta com titulo, preco, endereco e (se permitido) link. PROIBIDO dizer "nao encontrei" / "infelizmente nao achei" - count=${slim.length} > 0. Use EXATAMENTE os IDs, titulos e enderecos da lista properties acima; NUNCA invente.` })
  }
  if (toolName === 'update_lead') {
    const patch: Record<string, unknown> = {}
    for (const k of ['name','property_type','location_interest','bedrooms_needed','budget_min','budget_max','profile_notes','email']) if (input[k] != null) patch[k] = input[k]
    if (Object.keys(patch).length === 0) return JSON.stringify({ ok: true })
    if (typeof patch.email === 'string') {
      const e = String(patch.email).trim().toLowerCase()
      if (!isValidEmail(e)) return JSON.stringify({ error: 'Email invalido. Peca novamente ou pule.' })
      patch.email = e
    }
    if (typeof patch.name === 'string' && patch.name.trim().length >= 2) patch.name_confirmed = true
    const { error } = await ctx.admin.from('leads').update(patch).eq('id', ctx.leadId)
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ ok: true, updated: Object.keys(patch) })
  }
  if (toolName === 'escalate_to_human') {
    const reason = String(input.reason ?? '').trim()
    const urgency = String(input.urgency ?? 'normal')
    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const noteLine = `[${stamp}] Bot escalou: ${reason} (${urgency})`
    const { data: leadRow } = await ctx.admin.from('leads').select('profile_notes, name, phone').eq('id', ctx.leadId).single()
    const newNotes = leadRow?.profile_notes ? `${leadRow.profile_notes}\n${noteLine}` : noteLine
    // PAUSE bot: corretor humano assume daqui.
    await ctx.admin.from('leads').update({ status: 'em_contato', profile_notes: newNotes, bot_paused: true, bot_paused_at: new Date().toISOString(), bot_paused_reason: 'escalado_humano' }).eq('id', ctx.leadId)

    // NOTIFICA GRUPO: escalation + bot pausado
    const urgencyEmoji = urgency === 'high' ? '🚨' : '⚠️'
    const msg = `${urgencyEmoji} *Lead pediu atendente humano*\n\nLead: ${leadRow?.name || 'Sem nome'} (+${leadRow?.phone})\nUrgencia: ${urgency}\nMotivo: ${reason}\n\n🤖 Bot pausado. Voce assume as proximas mensagens.`
    notifyGroup(ctx.admin, ctx.orgId, ctx.instanceName, msg).catch(() => {})

    return JSON.stringify({ ok: true, escalated: true, reason, urgency, bot_paused_after_this: true, ai_instruction: 'Confirme ao lead que um corretor humano vai entrar em contato em breve. Seja breve e caloroso. Esta e a ULTIMA mensagem automatizada.' })
  }
  if (toolName === 'schedule_visit') {
    const propertyId = String(input.property_id ?? '').trim()
    const scheduledAt = String(input.scheduled_at ?? '').trim()
    const notes = input.notes ? String(input.notes) : null
    if (!propertyId || !scheduledAt) return JSON.stringify({ error: 'property_id e scheduled_at obrigatorios' })
    const date = parseBrtDate(scheduledAt)
    if (!date || isNaN(date.getTime())) return JSON.stringify({ error: 'Data invalida' })
    if (date.getTime() < Date.now()) return JSON.stringify({ error: 'Data precisa ser futura' })
    const { data: prop } = await ctx.admin.from('properties').select('id, title, location, neighborhood, city').eq('id', propertyId).eq('organization_id', ctx.orgId).maybeSingle()
    if (!prop) return JSON.stringify({ error: 'Imovel nao encontrado.' })

    const integ = await getOrgCalIntegration(ctx.admin, ctx.orgId)
    let gcalToken: string | null = null
    if (integ) gcalToken = await refreshGoogleToken(ctx.admin, integ)

    const conflictInternal = await hasConflictingAppointment(ctx.admin, ctx.orgId, propertyId, date, 30)
    const conflictGoogle = gcalToken && integ ? await isBusyOnGoogle(gcalToken, integ.calendar_id, date, 30) : false
    if (conflictInternal || conflictGoogle) {
      const suggested = await suggestAvailableSlots(ctx.admin, ctx.orgId, propertyId, date, gcalToken, integ?.calendar_id ?? null, 3, 30)
      return JSON.stringify({ error: 'conflict', reason: conflictGoogle ? 'Horario ocupado na agenda do corretor.' : 'Imovel ja tem visita proxima.', privacy_note: 'NAO revele detalhes.', suggested_slots: suggested, instructions_for_ai: 'Oferece alternativas, pergunta qual prefere.' })
    }

    const { data: leadRow } = await ctx.admin.from('leads').select('name, phone, email').eq('id', ctx.leadId).maybeSingle()
    const { data: appt, error } = await ctx.admin.from('appointments').insert({ organization_id: ctx.orgId, lead_id: ctx.leadId, property_id: propertyId, scheduled_at: date.toISOString(), notes, status: 'agendado' }).select('id, scheduled_at').single()
    if (error) return JSON.stringify({ error: error.message })
    // PAUSE bot: agendamento marca fim do atendimento automatizado; corretor assume.
    await ctx.admin.from('leads').update({ status: 'agendado', bot_paused: true, bot_paused_at: new Date().toISOString(), bot_paused_reason: 'visita_agendada' }).eq('id', ctx.leadId)

    let googleEventId: string | null = null
    let inviteSentToEmail: string | null = null
    if (gcalToken && integ) {
      const addr = [prop.location, prop.neighborhood, prop.city].filter(Boolean).join(', ')
      const summary = `Visita: ${prop.title} (${leadRow?.name ?? leadRow?.phone ?? 'Lead WhatsApp'})`
      const description = [`Imovel: ${prop.title}`, `Lead: ${leadRow?.name ?? 'Sem nome'} - ${leadRow?.phone ?? ''}`, notes ? `Obs: ${notes}` : null, '', 'Agendado automaticamente pelo bot WhatsApp.'].filter(Boolean).join('\n')
      const attendeeEmail = leadRow?.email && isValidEmail(leadRow.email) ? leadRow.email : null
      const ev = await createGoogleEvent(gcalToken, integ.calendar_id, { summary, description, startAt: date, location: addr, attendeeEmail })
      if (ev) { googleEventId = ev.id; inviteSentToEmail = attendeeEmail; await ctx.admin.from('appointments').update({ google_event_id: ev.id, google_calendar_user_id: integ.user_id }).eq('id', appt.id) }
    }

    // NOTIFICA GRUPO: schedule + bot pausado
    const gcalTag = googleEventId ? ' — adicionado na agenda do corretor ✅' : ''
    const inviteTag = inviteSentToEmail ? `\nConvite enviado para: ${inviteSentToEmail}` : ''
    const msg = `📅 *Visita agendada*\n\nLead: ${leadRow?.name || 'Sem nome'} (+${leadRow?.phone})\nImovel: ${prop.title}\nData: ${fmtBrtShort(date)} BRT${gcalTag}${inviteTag}\n\n🤖 Bot pausado. Lead agora e seu. Voce assume as proximas mensagens.`
    notifyGroup(ctx.admin, ctx.orgId, ctx.instanceName, msg).catch(() => {})

    const aiInstruction = inviteSentToEmail
      ? `Finalize a conversa: confirme o agendamento em BRT legivel, informe que o convite foi enviado para ${inviteSentToEmail}, agradeca e diga que o corretor entra em contato caso precise. Seja breve, caloroso, mas CONCLUSIVO. Esta e a ULTIMA mensagem automatizada. NUNCA mencione Google Calendar.`
      : 'Finalize a conversa: confirme o agendamento em BRT legivel, agradeca, e diga que o corretor entra em contato caso precise. Seja breve, caloroso, mas CONCLUSIVO. Esta e a ULTIMA mensagem automatizada. NUNCA pergunte email agora (deveria ter sido antes). NUNCA mencione Google Calendar.'

    return JSON.stringify({ ok: true, appointment_id: appt.id, property_title: prop.title, scheduled_at: appt.scheduled_at, synced_to_agent_calendar: !!googleEventId, invite_sent_to_email: inviteSentToEmail, bot_paused_after_this: true, ai_instruction: aiInstruction })
  }
  if (toolName === 'reschedule_visit') {
    const apptId = String(input.appointment_id ?? '').trim()
    const newAt = String(input.new_scheduled_at ?? '').trim()
    if (!apptId || !newAt) return JSON.stringify({ error: 'campos obrigatorios' })
    const date = parseBrtDate(newAt)
    if (!date || isNaN(date.getTime())) return JSON.stringify({ error: 'Data invalida' })
    if (date.getTime() < Date.now()) return JSON.stringify({ error: 'Data precisa ser futura' })
    const { data: existing } = await ctx.admin.from('appointments').select('id, status, notes, property_id, google_event_id, scheduled_at, properties(title)').eq('id', apptId).eq('organization_id', ctx.orgId).eq('lead_id', ctx.leadId).maybeSingle()
    if (!existing) return JSON.stringify({ error: 'Nao encontrado' })
    if (existing.status === 'cancelado' || existing.status === 'realizado') return JSON.stringify({ error: `Ja ${existing.status}` })

    const integ = await getOrgCalIntegration(ctx.admin, ctx.orgId)
    let gcalToken: string | null = null
    if (integ) gcalToken = await refreshGoogleToken(ctx.admin, integ)

    if (existing.property_id) {
      const conflictInternal = await hasConflictingAppointment(ctx.admin, ctx.orgId, existing.property_id as string, date, 30, apptId)
      const conflictGoogle = gcalToken && integ ? await isBusyOnGoogle(gcalToken, integ.calendar_id, date, 30) : false
      if (conflictInternal || conflictGoogle) {
        const suggested = await suggestAvailableSlots(ctx.admin, ctx.orgId, existing.property_id as string, date, gcalToken, integ?.calendar_id ?? null, 3, 30)
        return JSON.stringify({ error: 'conflict', reason: 'Novo horario ocupado.', privacy_note: 'NAO revele detalhes.', suggested_slots: suggested, instructions_for_ai: 'Oferece alternativas.' })
      }
    }

    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const newNote = input.reason ? `[${stamp}] Remarcado: ${input.reason}` : `[${stamp}] Remarcado via WhatsApp`
    const combined = existing.notes ? `${existing.notes}\n${newNote}` : newNote
    const oldDate = new Date(existing.scheduled_at as string)
    const { error } = await ctx.admin.from('appointments').update({ scheduled_at: date.toISOString(), notes: combined, status: 'agendado' }).eq('id', apptId)
    if (error) return JSON.stringify({ error: error.message })

    if (existing.google_event_id && gcalToken && integ) await patchGoogleEvent(gcalToken, integ.calendar_id, existing.google_event_id as string, { startAt: date })

    // NOTIFICA GRUPO: reschedule
    const { data: leadRow } = await ctx.admin.from('leads').select('name, phone').eq('id', ctx.leadId).maybeSingle()
    const title = (existing.properties as any)?.title ?? 'imovel'
    const msg = `↻ *Visita remarcada*\n\nLead: ${leadRow?.name || 'Sem nome'} (+${leadRow?.phone})\nImovel: ${title}\nDe: ${fmtBrtShort(oldDate)}\nPara: ${fmtBrtShort(date)} BRT`
    notifyGroup(ctx.admin, ctx.orgId, ctx.instanceName, msg).catch(() => {})

    return JSON.stringify({ ok: true, appointment_id: apptId, new_scheduled_at: date.toISOString() })
  }
  if (toolName === 'cancel_visit') {
    const apptId = String(input.appointment_id ?? '').trim()
    if (!apptId) return JSON.stringify({ error: 'appointment_id obrigatorio' })
    const { data: existing } = await ctx.admin.from('appointments').select('id, status, notes, google_event_id, scheduled_at, properties(title)').eq('id', apptId).eq('organization_id', ctx.orgId).eq('lead_id', ctx.leadId).maybeSingle()
    if (!existing) return JSON.stringify({ error: 'Nao encontrado' })
    if (existing.status === 'cancelado') return JSON.stringify({ ok: true, already: true })
    if (existing.status === 'realizado') return JSON.stringify({ error: 'Ja realizada' })
    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const reason = input.reason ? `: ${input.reason}` : ''
    const note = `[${stamp}] Cancelado${reason}`
    const combined = existing.notes ? `${existing.notes}\n${note}` : note
    const { error } = await ctx.admin.from('appointments').update({ status: 'cancelado', notes: combined }).eq('id', apptId)
    if (error) return JSON.stringify({ error: error.message })

    if (existing.google_event_id) {
      const integ = await getOrgCalIntegration(ctx.admin, ctx.orgId)
      if (integ) { const t = await refreshGoogleToken(ctx.admin, integ); if (t) await deleteGoogleEvent(t, integ.calendar_id, existing.google_event_id as string) }
    }

    // NOTIFICA GRUPO: cancel
    const { data: leadRow } = await ctx.admin.from('leads').select('name, phone').eq('id', ctx.leadId).maybeSingle()
    const title = (existing.properties as any)?.title ?? 'imovel'
    const msg = `✖ *Visita cancelada*\n\nLead: ${leadRow?.name || 'Sem nome'} (+${leadRow?.phone})\nImovel: ${title}\nEra: ${fmtBrtShort(new Date(existing.scheduled_at as string))} BRT${input.reason ? `\nMotivo: ${input.reason}` : ''}`
    notifyGroup(ctx.admin, ctx.orgId, ctx.instanceName, msg).catch(() => {})

    return JSON.stringify({ ok: true, appointment_id: apptId, status: 'cancelado' })
  }
  if (toolName === 'send_invite_by_email') {
    const apptId = String(input.appointment_id ?? '').trim()
    const email = String(input.email ?? '').trim().toLowerCase()
    if (!apptId || !email) return JSON.stringify({ error: 'appointment_id e email obrigatorios' })
    if (!isValidEmail(email)) return JSON.stringify({ error: 'Email invalido. Peca novamente ao lead.' })
    const { data: appt } = await ctx.admin.from('appointments').select('id, google_event_id, status').eq('id', apptId).eq('organization_id', ctx.orgId).eq('lead_id', ctx.leadId).maybeSingle()
    if (!appt) return JSON.stringify({ error: 'Agendamento nao encontrado' })
    if (appt.status === 'cancelado') return JSON.stringify({ error: 'Agendamento cancelado; nao ha como enviar convite.' })
    if (!appt.google_event_id) return JSON.stringify({ error: 'Agendamento nao esta sincronizado com a agenda do corretor. Nao e possivel enviar convite por email.' })
    const integ = await getOrgCalIntegration(ctx.admin, ctx.orgId)
    if (!integ) return JSON.stringify({ error: 'Agenda do corretor nao conectada.' })
    const token = await refreshGoogleToken(ctx.admin, integ)
    if (!token) return JSON.stringify({ error: 'Falha ao autenticar na agenda do corretor.' })
    const sent = await addAttendeeToGoogleEvent(token, integ.calendar_id, appt.google_event_id as string, email)
    if (!sent) return JSON.stringify({ error: 'Falha ao enviar o convite. Tente novamente mais tarde.' })
    await ctx.admin.from('leads').update({ email }).eq('id', ctx.leadId)
    return JSON.stringify({ ok: true, email, ai_instruction: `Confirme ao lead que o convite foi enviado para ${email} e peca pra verificar a caixa de entrada e o spam.` })
  }
  return JSON.stringify({ error: `Unknown tool: ${toolName}` })
}

async function callBedrock(body: Record<string, unknown>) {
  const client = new BedrockRuntimeClient({ region: Deno.env.get('AWS_REGION') || 'us-east-1', credentials: { accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')! } })
  const modelId = Deno.env.get('BEDROCK_MODEL_ID') || 'anthropic.claude-3-5-haiku-20241022-v1:0'
  const cmd = new InvokeModelCommand({ modelId, contentType: 'application/json', accept: 'application/json', body: new TextEncoder().encode(JSON.stringify(body)) })
  const res = await client.send(cmd)
  return JSON.parse(new TextDecoder().decode(res.body))
}

async function generateAiResponse(args: any): Promise<AiResponse | null> {
  const integ = await getOrgCalIntegration(args.admin, args.orgId)
  const hasGcal = !!integ
  const system = buildSystemPrompt(args.org, args.config, args.lead, args.lastSearchOutput, args.activeAppointments, args.isFirstContact, hasGcal)
  const tools = toolDefinitions(args.config)
  const messages = historyToMessages(args.history)
  if (messages.length === 0) return null
  if (args.currentImage) {
    const last = messages[messages.length - 1]
    if (last && last.role === 'user' && typeof last.content === 'string') {
      last.content = [{ type: 'image', source: { type: 'base64', media_type: args.currentImage.mimetype, data: args.currentImage.base64 } }, { type: 'text', text: last.content.replace(/^📷\s*/, '') }] as any
    }
  }

  let accumulatedMessages: any[] = [...messages]
  let totalTokens = 0
  let toolUsed: string | undefined
  let lastToolOutput: unknown
  let validationErrorFallback = false
  let lastTextBlock: string | null = null
  let toolExecutedInLoop = false
  const narrationLike = /^\s*(otimo|ótimo|perfeito|claro|beleza|certo|ok)?[!.,\s]*(deixa eu|vou buscar|vou verificar|aguarde?|um\s+momento|um\s+instante|so um|só um|procurando|buscando|checando|pesquisando)/i
  const looksLikeNarration = (txt: string) => { if (!txt) return false; const t = txt.trim(); if (t.length < 40) return true; return narrationLike.test(t) && t.length < 200 }

  for (let round = 0; round < 4; round++) {
    const body: Record<string, unknown> = { anthropic_version: 'bedrock-2023-05-31', max_tokens: 1500, system, messages: accumulatedMessages }
    if (!validationErrorFallback) body.tools = tools
    let resp: any
    try { resp = await callBedrock(body) } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!validationErrorFallback && msg.includes('tool_use') && msg.includes('tool_result')) { validationErrorFallback = true; accumulatedMessages = messages.filter((m: any) => typeof m.content === 'string'); continue }
      throw err
    }
    totalTokens += (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0)
    const textBlock = (resp.content as any[])?.find((b) => b.type === 'text')
    const toolUseBlock = (resp.content as any[])?.find((b) => b.type === 'tool_use')
    if (textBlock?.text) lastTextBlock = textBlock.text
    if (resp.stop_reason === 'tool_use' && toolUseBlock) {
      toolUsed = toolUseBlock.name
      toolExecutedInLoop = true
      const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input, { admin: args.admin, orgId: args.orgId, instanceName: args.instanceName, leadId: args.lead.id, maxProps: args.config.max_properties_shown ?? 3 })
      try { lastToolOutput = JSON.parse(toolResult) } catch { lastToolOutput = toolResult }
      accumulatedMessages = [...accumulatedMessages, { role: 'assistant', content: resp.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }] }]
      continue
    }
    if (textBlock?.text) {
      if (toolExecutedInLoop && looksLikeNarration(textBlock.text) && round < 3) {
        accumulatedMessages = [...accumulatedMessages, { role: 'assistant', content: resp.content }, { role: 'user', content: 'Otimo, apresenta os imoveis direto com preco, endereco e link. Sem narracao.' }]
        continue
      }
      return { text: sanitizeForWhatsApp(textBlock.text), toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
    }
    break
  }

  if (lastTextBlock && !looksLikeNarration(lastTextBlock)) return { text: sanitizeForWhatsApp(lastTextBlock), toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
  if (toolUsed === 'search_properties' && lastToolOutput && typeof lastToolOutput === 'object') {
    const manual = buildManualPropertyResponse(lastToolOutput, args.config)
    if (manual) return { text: manual, toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
  }
  return null
}

function buildManualPropertyResponse(output: unknown, config: BotConfig): string | null {
  const obj = output as { properties?: any[] }
  const props = obj.properties ?? []
  if (props.length === 0) return 'Nao achei imoveis com esses criterios. Posso ampliar a busca?'
  const showLinks = config.show_listing_links
  const lines = props.slice(0, config.max_properties_shown || 3).map((p: any) => {
    const pieces: string[] = [`*${p.title}*`]
    const loc = [p.address, p.neighborhood].filter(Boolean).join(', '); if (loc) pieces.push(loc)
    const priceParts: string[] = []
    if (p.price) priceParts.push(`R$ ${Number(p.price).toLocaleString('pt-BR')} venda`)
    if (p.rent_price) priceParts.push(`R$ ${Number(p.rent_price).toLocaleString('pt-BR')}/mes`)
    if (priceParts.length) pieces.push(priceParts.join(' / '))
    const specs: string[] = []
    if (p.bedrooms) specs.push(`${p.bedrooms} dorm`)
    if (p.bathrooms) specs.push(`${p.bathrooms} banh`)
    if (p.parking_spots) specs.push(`${p.parking_spots} vaga${p.parking_spots > 1 ? 's' : ''}`)
    if (p.area_m2) specs.push(`${p.area_m2}m2`)
    if (specs.length) pieces.push(specs.join(', '))
    if (showLinks && p.listing_url) pieces.push(p.listing_url)
    return pieces.join('\n')
  })
  const intro = props.length === 1 ? 'Encontrei um imovel:' : `Encontrei ${props.length} opcoes:`
  return sanitizeForWhatsApp(`${intro}\n\n${lines.join('\n\n')}\n\nQuer agendar visita?`)
}

function historyToMessages(history: { message: string; direction: string }[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const h of history) {
    const role = h.direction === 'in' ? 'user' : 'assistant'
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += '\n' + h.message
    else out.push({ role, content: h.message })
  }
  while (out.length > 0 && out[0].role !== 'user') out.shift()
  return out
}
