import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-outbound-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function buildReengagementMessage(params: {
  leadName: string | null
  propertyTitle: string
  propertyLocation: string | null
  bedrooms: number | null
  price: number | null
  rentPrice: number | null
}): string {
  const name = params.leadName ?? 'cliente'

  let message =
    `Olá ${name}! 🏠 Acabou de entrar um imóvel que pode ser do seu interesse:\n` +
    `*${params.propertyTitle}*\n`

  if (params.propertyLocation) {
    message += `📍 ${params.propertyLocation}\n`
  }

  if (params.bedrooms && params.bedrooms > 0) {
    message += `🛏 ${params.bedrooms} quarto(s)\n`
  }

  if (params.price && params.price > 0) {
    message += `💰 ${formatCurrency(params.price)}\n`
  } else if (params.rentPrice && params.rentPrice > 0) {
    message += `💰 Aluguel: ${formatCurrency(params.rentPrice)}\n`
  }

  message += `Quer que eu te passe mais detalhes? Responda SIM!`

  return message
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')
  const outboundSecret = Deno.env.get('OUTBOUND_SECRET') || supabaseServiceKey

  if (!evoUrl || !evoKey) return jsonResponse({ error: 'Evolution API nao configurada' }, 500)

  let body: { property_id?: string; organization_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { property_id, organization_id } = body

  if (!property_id || !organization_id) {
    return jsonResponse({ error: 'property_id and organization_id are required' }, 400)
  }

  // Auth: accept x-outbound-secret header OR valid Supabase JWT (from authenticated frontend)
  const providedSecret = req.headers.get('x-outbound-secret')
  const authHeader = req.headers.get('authorization')
  let authorized = !!(providedSecret && providedSecret === outboundSecret)

  if (!authorized && authHeader?.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      const admin = createClient(supabaseUrl, supabaseServiceKey)
      const { data: prof } = await admin.from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle()
      authorized = prof?.organization_id === organization_id
    }
  }

  if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Fetch property details
    const { data: property, error: propError } = await admin
      .from('properties')
      .select('id, title, type, location, neighborhood, city, price, rent_price, bedrooms, listing_purpose, listing_status')
      .eq('id', property_id)
      .eq('organization_id', organization_id)
      .maybeSingle()

    if (propError || !property) {
      return jsonResponse({ error: 'Property not found', details: propError?.message }, 404)
    }

    // Skip if not available
    if (property.listing_status !== 'available') {
      return jsonResponse({ skipped: 'not available' })
    }

    // Find matching leads
    const { data: leads, error: leadsError } = await admin
      .from('leads')
      .select('id, name, phone, property_type, location_interest, budget_max, bedrooms_needed, bot_paused, status')
      .eq('organization_id', organization_id)
      .neq('status', 'descartado')
      .neq('status', 'convertido')
      .eq('bot_paused', false)
      .or(
        [
          `property_type.is.null`,
          `property_type.eq.${property.type}`,
        ].join(',')
      )
      .limit(20)

    if (leadsError) {
      return jsonResponse({ error: 'Failed to query leads', details: leadsError.message }, 500)
    }

    if (!leads || leads.length === 0) {
      return jsonResponse({ matched: 0, sent: 0 })
    }

    // Filter leads in application code for the composite conditions that are
    // hard to express cleanly in PostgREST (location_interest, budget_max, bedrooms_needed)
    const propertyPrice = property.price ?? property.rent_price ?? 0
    const propertyBedrooms = property.bedrooms ?? 99

    const matchedLeads = leads.filter((lead) => {
      // Location check: if lead has a preference, it must match city or neighborhood
      if (lead.location_interest) {
        const interest = lead.location_interest.toLowerCase()
        const cityMatch = property.city
          ? interest.includes(property.city.toLowerCase())
          : false
        const neighMatch = property.neighborhood
          ? interest.includes(property.neighborhood.toLowerCase())
          : false
        if (!cityMatch && !neighMatch) return false
      }

      // Budget check: lead's max budget must be at least 85% of property price
      if (lead.budget_max != null && propertyPrice > 0) {
        if (lead.budget_max < propertyPrice * 0.85) return false
      }

      // Bedrooms check: property must have at least as many bedrooms as the lead needs
      if (lead.bedrooms_needed != null) {
        if (propertyBedrooms < lead.bedrooms_needed) return false
      }

      return true
    })

    if (matchedLeads.length === 0) {
      return jsonResponse({ matched: 0, sent: 0 })
    }

    // Get the WhatsApp instance for the organization
    const { data: instance, error: instError } = await admin
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('organization_id', organization_id)
      .maybeSingle()

    if (instError || !instance?.instance_name) {
      return jsonResponse({ error: 'No whatsapp instance found for organization' }, 500)
    }

    let sent = 0

    for (let i = 0; i < matchedLeads.length; i++) {
      const lead = matchedLeads[i]

      if (!lead.phone) continue

      // Add 2s delay between messages to avoid spam detection (skip before first)
      if (i > 0) {
        await sleep(2000)
      }

      const message = buildReengagementMessage({
        leadName: lead.name,
        propertyTitle: property.title,
        propertyLocation: property.location,
        bedrooms: property.bedrooms,
        price: property.price,
        rentPrice: property.rent_price,
      })

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
          sent++
        } else {
          const errText = await evoRes.text()
          console.warn(
            `[outbound-reengagement] send failed for lead ${lead.id} (${evoRes.status}):`,
            errText.slice(0, 200)
          )
        }
      } catch (e) {
        console.warn(`[outbound-reengagement] send threw for lead ${lead.id}:`, e)
      }
    }

    return jsonResponse({ matched: matchedLeads.length, sent })
  } catch (e) {
    console.error('[outbound-reengagement] Unexpected error:', e)
    return jsonResponse({ error: 'Unexpected error', details: String(e) }, 500)
  }
})
