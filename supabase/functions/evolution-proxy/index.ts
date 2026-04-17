// Supabase Edge Function: evolution-proxy
// Proxy seguro para Evolution API. Mantém API key server-side.
// Apenas admin/manager da org podem invocar.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function instanceNameFor(orgId: string): string {
  return `org_${orgId.replace(/-/g, '')}`
}

type ConnectionState = 'open' | 'close' | 'connecting' | 'disconnected' | string

function mapStatus(state: ConnectionState): 'connected' | 'connecting' | 'disconnected' {
  if (state === 'open') return 'connected'
  if (state === 'connecting') return 'connecting'
  return 'disconnected'
}

Deno.serve(async (req) => {
  console.log('[evolution-proxy] request received:', req.method, req.url)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    console.log('[evolution-proxy] auth header present:', !!authHeader, 'starts:', authHeader?.slice(0, 12))

    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const evoUrl = Deno.env.get('EVOLUTION_API_URL')
    const evoKey = Deno.env.get('EVOLUTION_API_KEY')

    console.log('[evolution-proxy] env vars:', {
      supabaseUrl: !!supabaseUrl,
      supabaseAnonKey: !!supabaseAnonKey,
      supabaseServiceKey: !!supabaseServiceKey,
      evoUrl: !!evoUrl,
      evoKey: !!evoKey,
    })

    if (!evoUrl || !evoKey) {
      console.error('[evolution-proxy] Evolution env vars missing')
      return jsonResponse({ error: 'Evolution API não configurada (secrets ausentes)', debug: { evoUrl: !!evoUrl, evoKey: !!evoKey } }, 500)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: authErr } = await userClient.auth.getUser()
    console.log('[evolution-proxy] auth.getUser result:', { hasUser: !!userData?.user, userId: userData?.user?.id, error: authErr?.message })

    if (authErr || !userData?.user) {
      return jsonResponse({
        error: 'Unauthorized',
        debug: { authErr: authErr?.message, hasUser: !!userData?.user },
      }, 401)
    }

    const user = userData.user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    console.log('[evolution-proxy] profile:', { orgId: profile?.organization_id, role: profile?.role, err: profileErr?.message })

    if (!profile?.organization_id) {
      return jsonResponse({ error: 'Sem organização' }, 403)
    }
    if (!['admin', 'manager'].includes(profile.role)) {
      return jsonResponse({ error: 'Apenas admin/manager podem gerenciar WhatsApp' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    const orgId = profile.organization_id as string
    const instanceName = instanceNameFor(orgId)

    console.log('[evolution-proxy] executing action:', action, 'for instance:', instanceName)

    const evoHeaders = { apikey: evoKey, 'Content-Type': 'application/json' }
    const webhookUrl = `${supabaseUrl}/functions/v1/bot-webhook`

    // --- CONNECT ---
    if (action === 'connect') {
      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders })
      let qrcodeBase64: string | null = null

      if (stateRes.status === 404) {
        const createRes = await fetch(`${evoUrl}/instance/create`, {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
            },
          }),
        })
        if (!createRes.ok) {
          const err = await createRes.text()
          console.error('[evolution-proxy] create failed:', err)
          return jsonResponse({ error: `Evolution create falhou: ${err}` }, 502)
        }
        const createData = await createRes.json()
        qrcodeBase64 = createData.qrcode?.base64 ?? null
      } else {
        const connectRes = await fetch(`${evoUrl}/instance/connect/${instanceName}`, { headers: evoHeaders })
        if (connectRes.ok) {
          const connectData = await connectRes.json()
          qrcodeBase64 = connectData.base64 ?? connectData.qrcode?.base64 ?? null
        }
      }

      await adminClient.from('whatsapp_instances').upsert({
        organization_id: orgId,
        instance_name: instanceName,
        status: 'qrcode',
        last_qr_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: 'organization_id' })

      return jsonResponse({ status: 'qrcode', qrcode: qrcodeBase64, instance_name: instanceName })
    }

    // --- STATUS ---
    if (action === 'status') {
      const stateRes = await fetch(`${evoUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders })

      if (stateRes.status === 404) {
        await adminClient.from('whatsapp_instances').update({
          status: 'disconnected',
          connected_number: null,
        }).eq('organization_id', orgId)
        return jsonResponse({ status: 'disconnected', connected_number: null })
      }

      const stateData = await stateRes.json()
      const rawState = stateData.instance?.state ?? 'disconnected'
      const mapped = mapStatus(rawState)

      let connectedNumber: string | null = null
      if (mapped === 'connected') {
        const infoRes = await fetch(`${evoUrl}/instance/fetchInstances?instanceName=${instanceName}`, { headers: evoHeaders })
        if (infoRes.ok) {
          const info = await infoRes.json()
          const first = Array.isArray(info) ? info[0] : null
          connectedNumber = first?.ownerJid?.split('@')[0] ?? null
        }
      }

      const update: Record<string, unknown> = {
        status: mapped,
        connected_number: connectedNumber,
      }
      if (mapped === 'connected') {
        update.last_connection_at = new Date().toISOString()
      }

      await adminClient.from('whatsapp_instances').update(update).eq('organization_id', orgId)

      // Welcome message (only on first connection)
      if (mapped === 'connected' && connectedNumber) {
        const { data: instRow } = await adminClient
          .from('whatsapp_instances')
          .select('welcome_sent_at')
          .eq('organization_id', orgId)
          .single()

        if (instRow && !instRow.welcome_sent_at) {
          const { data: org } = await adminClient
            .from('organizations')
            .select('trade_name, legal_name')
            .eq('id', orgId)
            .single()

          const orgName = org?.trade_name || org?.legal_name || 'sua imobiliária'
          const welcomeText =
            `✅ *Imob CRM conectado com sucesso!*\n\n` +
            `Seu WhatsApp de *${orgName}* está pronto pra receber leads.\n\n` +
            `A partir de agora, qualquer mensagem que chegar nesse número será respondida automaticamente pelo bot assim que você ativá-lo no painel.\n\n` +
            `_Esta é uma mensagem de teste de conexão — você pode apagá-la._`

          try {
            const sendRes = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
              method: 'POST',
              headers: evoHeaders,
              body: JSON.stringify({ number: connectedNumber, text: welcomeText }),
            })
            if (sendRes.ok) {
              await adminClient
                .from('whatsapp_instances')
                .update({ welcome_sent_at: new Date().toISOString() })
                .eq('organization_id', orgId)
            }
          } catch (e) {
            console.warn('Welcome send threw:', e)
          }
        }
      }

      return jsonResponse({ status: mapped, connected_number: connectedNumber })
    }

    // --- DISCONNECT ---
    if (action === 'disconnect') {
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: evoHeaders })
      await adminClient.from('whatsapp_instances').update({
        status: 'disconnected',
        connected_number: null,
      }).eq('organization_id', orgId)
      return jsonResponse({ status: 'disconnected' })
    }

    // --- DELETE ---
    if (action === 'delete') {
      await fetch(`${evoUrl}/instance/logout/${instanceName}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {})
      await fetch(`${evoUrl}/instance/delete/${instanceName}`, { method: 'DELETE', headers: evoHeaders }).catch(() => {})
      await adminClient.from('whatsapp_instances').delete().eq('organization_id', orgId)
      return jsonResponse({ status: 'disconnected' })
    }

    // --- RESTART ---
    if (action === 'restart') {
      await fetch(`${evoUrl}/instance/restart/${instanceName}`, { method: 'PUT', headers: evoHeaders })
      return jsonResponse({ status: 'connecting' })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[evolution-proxy] unhandled error:', err)
    return jsonResponse({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, 500)
  }
})
