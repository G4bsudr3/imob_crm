// sync-appointment-gcal: creates/patches/deletes a Google Calendar event for an appointment.
// Called by the frontend after insert (create), status=cancelado (delete), or reschedule (patch).
// verify_jwt: false — auth handled manually via getUser() (same pattern as outbound-reengagement).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

type CalIntegration = {
  user_id: string
  google_email: string | null
  calendar_id: string
  access_token: string | null
  refresh_token: string
  expires_at: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrgCalIntegration(admin: any, orgId: string): Promise<CalIntegration | null> {
  const { data } = await admin.rpc('get_org_calendar_integration', { p_org_id: orgId })
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function refreshGoogleToken(admin: any, integ: CalIntegration): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null
  if (
    integ.access_token &&
    integ.expires_at &&
    new Date(integ.expires_at).getTime() - Date.now() > 120_000
  ) return integ.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integ.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    await admin
      .from('calendar_integrations')
      .update({ last_error: 'refresh_failed' })
      .eq('user_id', integ.user_id)
      .eq('provider', 'google')
    return null
  }
  const j = await res.json() as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString()
  await admin
    .from('calendar_integrations')
    .update({ access_token: j.access_token, expires_at: expiresAt, last_error: null })
    .eq('user_id', integ.user_id)
    .eq('provider', 'google')
  return j.access_token
}

async function gcalCreate(
  accessToken: string,
  calendarId: string,
  input: { summary: string; description?: string; startAt: Date; location?: string | null; attendeeEmail?: string | null },
): Promise<{ id: string } | null> {
  const end = new Date(input.startAt.getTime() + 60 * 60_000)
  const hasAttendee = isValidEmail(input.attendeeEmail)
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? null,
    location: input.location ?? null,
    start: { dateTime: input.startAt.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
    reminders: { useDefault: true },
  }
  if (hasAttendee) {
    body.attendees = [{ email: input.attendeeEmail!.trim() }]
  }
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  )
  if (hasAttendee) url.searchParams.set('sendUpdates', 'all')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return await res.json() as { id: string }
}

async function gcalDelete(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return res.ok || res.status === 410 // 410 = already deleted
}

async function gcalPatch(
  accessToken: string,
  calendarId: string,
  eventId: string,
  startAt: Date,
): Promise<boolean> {
  const end = new Date(startAt.getTime() + 60 * 60_000)
  const body = {
    start: { dateTime: startAt.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: end.toISOString(), timeZone: 'America/Sao_Paulo' },
  }
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // Auth: require valid user JWT
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: { appointment_id?: string; action?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { appointment_id, action = 'create' } = body

  if (!appointment_id) return json({ error: 'appointment_id required' }, 400)

  const admin = createClient(supabaseUrl, serviceKey)

  // Get user's org
  const { data: prof } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!prof?.organization_id) return json({ error: 'No organization' }, 400)
  const orgId = prof.organization_id

  // Fetch the appointment with all fields needed for any action
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, scheduled_at, notes, lead_id, property_id, google_event_id, google_calendar_user_id, leads(name, phone, email), properties(title, location)')
    .eq('id', appointment_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (apptErr || !appt) return json({ error: 'Appointment not found' }, 404)

  // ── CONFIRM WHATSAPP ─────────────────────────────────────────────────────────
  // Handled before GCal checks — doesn't require calendar integration
  if (action === 'confirm_whatsapp') {
    const lead = appt.leads as { name: string | null; phone: string; email: string | null } | null
    const prop = appt.properties as { title: string; location: string } | null
    if (!lead?.phone) return json({ skipped: 'no_phone' })

    const { data: instance } = await admin
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (!instance?.instance_name) return json({ skipped: 'no_whatsapp_instance' })

    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!evoUrl || !evoKey) return json({ skipped: 'no_evolution_config' })

    const dateStr = new Date(appt.scheduled_at).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short',
    })
    const firstName = lead.name ? ` ${lead.name.split(' ')[0]}` : ''
    let message = `📅 Olá${firstName}! Sua visita está confirmada para *${dateStr}*.`
    if (prop) message += `\n🏠 Imóvel: ${prop.title} — ${prop.location}`
    message += `\n\nQualquer dúvida, é só chamar! 😊`

    await fetch(`${evoUrl}/message/sendText/${instance.instance_name}`, {
      method: 'POST',
      headers: { apikey: evoKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: lead.phone, text: message, delay: 1200 }),
    }).catch(() => {})

    return json({ ok: true })
  }

  // Get org's Google Calendar integration (required for all remaining actions)
  const integ = await getOrgCalIntegration(admin, orgId)
  if (!integ) return json({ skipped: 'no_calendar_integration' })

  const accessToken = await refreshGoogleToken(admin, integ)
  if (!accessToken) return json({ error: 'Failed to refresh Google token' }, 500)

  // ── DELETE ───────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!appt.google_event_id) return json({ skipped: 'no_event_id' })
    const ok = await gcalDelete(accessToken, integ.calendar_id, appt.google_event_id)
    if (ok) {
      await admin.from('appointments').update({ google_event_id: null, google_calendar_user_id: null }).eq('id', appointment_id)
    }
    return json({ ok })
  }

  // ── PATCH (reschedule) ───────────────────────────────────────────────────────
  if (action === 'patch') {
    if (!appt.google_event_id) return json({ skipped: 'no_event_id' })
    const ok = await gcalPatch(accessToken, integ.calendar_id, appt.google_event_id, new Date(appt.scheduled_at))
    return json({ ok })
  }

  // ── CREATE ───────────────────────────────────────────────────────────────────
  // Already synced — idempotent guard
  if (appt.google_event_id) return json({ skipped: 'already_synced', google_event_id: appt.google_event_id })

  const leadName = (appt.leads as { name: string | null; phone: string; email: string | null } | null)?.name ?? 'Lead'
  const leadEmail = (appt.leads as { name: string | null; phone: string; email: string | null } | null)?.email ?? null
  const propertyTitle = (appt.properties as { title: string; location: string } | null)?.title
  const propertyLocation = (appt.properties as { title: string; location: string } | null)?.location

  const summary = propertyTitle
    ? `Visita: ${leadName} — ${propertyTitle}`
    : `Visita: ${leadName}`

  const descParts: string[] = []
  if (propertyLocation) descParts.push(`Local: ${propertyLocation}`)
  if (appt.notes) descParts.push(`Obs: ${appt.notes}`)

  const ev = await gcalCreate(accessToken, integ.calendar_id, {
    summary,
    description: descParts.join('\n') || undefined,
    startAt: new Date(appt.scheduled_at),
    location: propertyLocation ?? null,
    attendeeEmail: leadEmail,
  })

  if (!ev) return json({ error: 'Failed to create Google Calendar event' }, 500)

  await admin
    .from('appointments')
    .update({ google_event_id: ev.id, google_calendar_user_id: integ.user_id })
    .eq('id', appointment_id)

  return json({ ok: true, google_event_id: ev.id, invite_sent_to: isValidEmail(leadEmail) ? leadEmail : null })
})
