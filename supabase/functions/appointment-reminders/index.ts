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

function formatScheduledAt(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  })
}

function buildReminderMessage(params: {
  leadName: string | null
  scheduledAt: string
  propertyTitle: string | null
  propertyLocation: string | null
}): string {
  const name = params.leadName ?? 'cliente'
  const formattedDate = formatScheduledAt(params.scheduledAt)

  let message =
    `Olá ${name}! 👋 Lembrando que sua visita está agendada para amanhã:\n` +
    `📅 Data: ${formattedDate}\n`

  if (params.propertyTitle || params.propertyLocation) {
    const propertyLine = [params.propertyTitle, params.propertyLocation]
      .filter(Boolean)
      .join(' - ')
    message += `🏠 Imóvel: ${propertyLine}\n`
  }

  message +=
    `Confirme sua presença respondendo SIM, ou avise se precisar reagendar.`

  return message
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')

  if (!evoUrl || !evoKey) return jsonResponse({ error: 'Evolution API nao configurada' }, 500)

  const admin = createClient(supabaseUrl, supabaseServiceKey)

  const errors: string[] = []
  let processed = 0
  let sent = 0

  try {
    // Query appointments in the 22–26 hour window that haven't had a reminder sent yet
    const { data: appointments, error: apptError } = await admin
      .from('appointments')
      .select(
        `
        id,
        scheduled_at,
        organization_id,
        lead_id,
        property_id,
        leads!inner ( id, name, phone, bot_paused ),
        properties ( id, title, location )
        `
      )
      .eq('status', 'agendado')
      .is('reminder_24h_sent_at', null)
      .gte('scheduled_at', new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString())

    if (apptError) {
      console.error('[appointment-reminders] Failed to query appointments:', apptError)
      return jsonResponse({ error: 'Failed to query appointments', details: apptError.message }, 500)
    }

    if (!appointments || appointments.length === 0) {
      return jsonResponse({ processed: 0, sent: 0, errors: [] })
    }

    for (const appt of appointments) {
      processed++

      const lead = Array.isArray(appt.leads) ? appt.leads[0] : appt.leads as any
      const property = Array.isArray(appt.properties)
        ? appt.properties[0]
        : (appt.properties as any) ?? null

      if (!lead?.phone) {
        errors.push(`appointment ${appt.id}: lead has no phone`)
        continue
      }

      // Get the WhatsApp instance for this organization
      const { data: instance, error: instError } = await admin
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('organization_id', appt.organization_id)
        .maybeSingle()

      if (instError || !instance?.instance_name) {
        errors.push(`appointment ${appt.id}: no whatsapp instance for org ${appt.organization_id}`)
        continue
      }

      const message = buildReminderMessage({
        leadName: lead.name,
        scheduledAt: appt.scheduled_at,
        propertyTitle: property?.title ?? null,
        propertyLocation: property?.location ?? null,
      })

      // Send via Evolution API
      let sendSuccess = false
      try {
        const evoRes = await fetch(`${evoUrl}/message/sendText/${instance.instance_name}`, {
          method: 'POST',
          headers: {
            apikey: evoKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: lead.phone,
            text: message,
            delay: 1000,
          }),
        })

        if (evoRes.ok) {
          sendSuccess = true
        } else {
          const errText = await evoRes.text()
          errors.push(`appointment ${appt.id}: Evolution send failed (${evoRes.status}): ${errText.slice(0, 200)}`)
        }
      } catch (e) {
        errors.push(`appointment ${appt.id}: Evolution send threw: ${String(e)}`)
      }

      if (sendSuccess) {
        // Mark reminder as sent
        const { error: updateError } = await admin
          .from('appointments')
          .update({ reminder_24h_sent_at: new Date().toISOString() })
          .eq('id', appt.id)

        if (updateError) {
          errors.push(`appointment ${appt.id}: failed to update reminder_24h_sent_at: ${updateError.message}`)
        } else {
          sent++
        }
      }
    }

    return jsonResponse({ processed, sent, errors })
  } catch (e) {
    console.error('[appointment-reminders] Unexpected error:', e)
    return jsonResponse({ error: 'Unexpected error', details: String(e) }, 500)
  }
})
