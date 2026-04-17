// Supabase Edge Function: bot-webhook
// Recebe eventos do Evolution API. Responde via AI (AWS Bedrock / Claude Haiku)
// usando contexto da org + imóveis disponíveis. Captura dados do lead via tool use.
//
// POST /functions/v1/bot-webhook
// Evolution envia todos os eventos configurados (MESSAGES_UPSERT, CONNECTION_UPDATE)
// ---------------------------------------------------------------------

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { BedrockRuntimeClient, InvokeModelCommand } from 'npm:@aws-sdk/client-bedrock-runtime@3.709.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

// ---------- Types ----------

type EvolutionMessage = {
  event: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text?: string }
      audioMessage?: {
        url?: string
        mimetype?: string
        seconds?: number
        ptt?: boolean
      }
      imageMessage?: {
        url?: string
        mimetype?: string
        caption?: string
      }
      videoMessage?: {
        url?: string
        mimetype?: string
        caption?: string
      }
    }
    messageType?: string
    messageTimestamp?: number
  }
}

type Lead = {
  id: string
  organization_id: string
  name: string | null
  phone: string
  status: string
  property_type: string | null
  location_interest: string | null
  budget_min: number | null
  budget_max: number | null
  bedrooms_needed: number | null
  profile_notes: string | null
}

type Organization = {
  legal_name: string | null
  trade_name: string | null
  website: string | null
  email: string | null
  phone: string | null
  address_city: string | null
  address_state: string | null
}

type BotConfig = {
  is_active: boolean
  persona: string | null
  welcome_message: string
  triagem_localizacao: string
  triagem_tipo: string
  triagem_orcamento: string
  triagem_quartos: string
  mensagem_agendamento: string
  farewell_message: string
  no_properties_message: string
  business_hours_enabled: boolean
  business_hours_start: string
  business_hours_end: string
  outside_hours_message: string
  max_properties_shown: number
  // Toggles de comportamento
  can_schedule: boolean
  can_escalate: boolean
  can_negotiate_price: boolean
  show_listing_links: boolean
  communication_style: 'casual' | 'balanced' | 'formal'
  company_differentials: string | null
  service_areas: string | null
}

// ---------- Main ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return ok()

  let payload: EvolutionMessage
  try {
    payload = await req.json()
  } catch {
    return ok()
  }

  console.log('[bot-webhook] event:', payload.event, 'instance:', payload.instance)

  // Filtra só mensagens de usuários
  if (payload.event !== 'messages.upsert') return ok()
  const data = payload.data
  if (!data?.key) return ok()
  if (data.key.fromMe) return ok() // mensagens que ENVIAMOS, ignora
  if (!data.key.remoteJid) return ok()
  if (data.key.remoteJid.endsWith('@g.us')) return ok() // grupos, ignora

  const phone = data.key.remoteJid.split('@')[0]
  const pushName = data.pushName || null
  const instanceName = payload.instance
  const wamId = data.key.id || null
  if (!instanceName) return ok()

  // Extrai conteúdo da mensagem (texto direto ou transcrição de áudio)
  let text: string | null = data.message?.conversation || data.message?.extendedTextMessage?.text || null
  let isAudio = false

  let imageBase64: string | null = null
  let imageMimetype: string | null = null
  let isImage = false

  if (!text && data.message?.audioMessage) {
    console.log('[bot-webhook] audio detected, transcribing...')
    const media = await fetchMediaBase64(instanceName, { key: data.key, message: data.message }, 'audio/ogg')
    if (media) {
      const transcribed = await transcribeAudio(media.base64, media.mimetype)
      if (transcribed) {
        text = transcribed
        isAudio = true
        console.log('[bot-webhook] transcription:', text.slice(0, 100))
      }
    }
    if (!text) {
      await sendWhatsApp(
        instanceName,
        phone,
        'Oi! Recebi seu áudio mas não consegui entender agora. Pode me mandar por texto o que precisa? 🙏',
      ).catch(() => {})
      return ok()
    }
  }

  if (data.message?.imageMessage) {
    console.log('[bot-webhook] image detected, fetching...')
    const media = await fetchMediaBase64(instanceName, { key: data.key, message: data.message }, 'image/jpeg')
    if (media) {
      // Claude aceita: jpeg, png, gif, webp. Normaliza mimetype
      const mt = media.mimetype.split(';')[0].trim().toLowerCase()
      const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (supported.includes(mt)) {
        imageBase64 = media.base64
        imageMimetype = mt
        isImage = true
        text = data.message.imageMessage.caption || 'Enviei uma imagem. O que você acha?'
      } else {
        console.warn('[bot-webhook] unsupported image type:', mt)
      }
    }
    if (!isImage) {
      await sendWhatsApp(
        instanceName,
        phone,
        'Oi! Recebi sua imagem mas tive dificuldade em processar. Pode me descrever em texto o que precisa?',
      ).catch(() => {})
      return ok()
    }
  }

  if (data.message?.videoMessage) {
    // Vídeo: apenas reconhece caption como texto. Não processa frames no MVP.
    text = data.message.videoMessage.caption || '[vídeo sem legenda]'
    if (!data.message.videoMessage.caption) {
      await sendWhatsApp(
        instanceName,
        phone,
        'Oi! Recebi seu vídeo. No momento não consigo processar vídeos — pode me descrever em texto ou mandar uma foto?',
      ).catch(() => {})
      return ok()
    }
  }

  if (!text || !text.trim()) return ok()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, supabaseServiceKey)

  // Dedup: se já processamos essa mensagem (Evolution às vezes retry), pula
  if (wamId) {
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('whatsapp_message_id', wamId)
      .maybeSingle()
    if (existing) {
      console.log('[bot-webhook] duplicate message, skipping:', wamId)
      return ok()
    }
  }

  // Resolve organização pela instance
  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('organization_id')
    .eq('instance_name', instanceName)
    .maybeSingle()

  if (!instance) {
    console.warn('[bot-webhook] unknown instance:', instanceName)
    return ok()
  }
  const orgId = instance.organization_id as string

  // Busca config do bot
  const { data: config } = await admin
    .from('bot_config')
    .select('*')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!config) {
    console.warn('[bot-webhook] no bot_config for org:', orgId)
    return ok()
  }
  if (!config.is_active) {
    console.log('[bot-webhook] bot inactive, skipping')
    return ok()
  }

  // Upsert lead
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .upsert(
      {
        organization_id: orgId,
        phone,
        whatsapp_id: data.key.remoteJid,
        name: pushName,
        source: 'whatsapp',
        last_message_at: new Date().toISOString(),
      } as any,
      { onConflict: 'organization_id,phone' },
    )
    .select()
    .single()

  if (leadErr || !lead) {
    console.error('[bot-webhook] lead upsert failed:', leadErr)
    return ok()
  }

  // Grava mensagem recebida (prefixo de mídia pra UI admin)
  const storedText = isImage ? `📷 ${text}` : isAudio ? `🎙️ ${text}` : text
  await admin.from('conversations').insert({
    lead_id: lead.id,
    organization_id: orgId,
    message: storedText,
    direction: 'in',
    whatsapp_message_id: wamId,
  })

  // Rate limit per-lead: se lead mandou 5+ msgs nos últimos 10s, pula (está floodando)
  const tenSecAgo = new Date(Date.now() - 10_000).toISOString()
  const { count: recentCount } = await admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id)
    .eq('direction', 'in')
    .gte('sent_at', tenSecAgo)
  if ((recentCount ?? 0) > 5) {
    console.log('[bot-webhook] rate limit hit (flood):', lead.id)
    return ok()
  }

  // Rate limit per-org: se org passou de 300 respostas do bot nas últimas 24h, para
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { count: dailyCount } = await admin
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('direction', 'out')
    .not('ai_tool_used', 'is', null)
    .gte('sent_at', dayAgo)
  if ((dailyCount ?? 0) >= 300) {
    console.warn('[bot-webhook] daily cap reached for org:', orgId)
    const msg = 'Oi! Nosso atendimento está com alta demanda no momento. Um corretor humano vai te responder em breve.'
    await sendWhatsApp(instanceName, phone, msg).catch(() => {})
    await admin.from('conversations').insert({
      lead_id: lead.id,
      organization_id: orgId,
      message: msg,
      direction: 'out',
    })
    return ok()
  }

  // Check horário de atendimento
  if (config.business_hours_enabled) {
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const [sH, sM] = (config.business_hours_start || '08:00').split(':').map(Number)
    const [eH, eM] = (config.business_hours_end || '18:00').split(':').map(Number)
    const startMin = sH * 60 + sM
    const endMin = eH * 60 + eM

    if (nowMin < startMin || nowMin > endMin) {
      const outMsg = (config.outside_hours_message || '')
        .replace('{inicio}', config.business_hours_start)
        .replace('{fim}', config.business_hours_end)
      await sendWhatsApp(instanceName, phone, outMsg)
      await admin.from('conversations').insert({
        lead_id: lead.id,
        organization_id: orgId,
        message: outMsg,
        direction: 'out',
      })
      return ok()
    }
  }

  // Busca contexto — APENAS campos seguros pra expor ao AI/lead.
  // Deliberadamente NÃO trazemos cnpj, creci, state_registration, address_street/number
  // (dados fiscais/endereço completo são sensíveis; o bot só precisa saber a cidade/UF)
  const { data: org } = await admin
    .from('organizations')
    .select('legal_name, trade_name, website, email, phone, address_city, address_state')
    .eq('id', orgId)
    .single()

  const { data: history } = await admin
    .from('conversations')
    .select('message, direction')
    .eq('lead_id', lead.id)
    .order('sent_at', { ascending: false })
    .limit(20)

  const orderedHistory = (history ?? []).reverse()

  // Primeiro contato: histórico só tem a msg que acabamos de salvar (1 mensagem in), sem out anterior
  const outgoingPriorCount = orderedHistory.filter((h) => h.direction === 'out').length
  const isFirstContact = outgoingPriorCount === 0

  // Busca último resultado de search_properties pra dar contexto entre turns
  const { data: lastToolRows } = await admin
    .from('conversations')
    .select('ai_tool_used, ai_tool_output')
    .eq('lead_id', lead.id)
    .eq('ai_tool_used', 'search_properties')
    .not('ai_tool_output', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)

  const lastSearchOutput = lastToolRows?.[0]?.ai_tool_output ?? null

  // Busca agendamentos ativos deste lead (pra bot poder reagendar/cancelar)
  const { data: activeAppts } = await admin
    .from('appointments')
    .select('id, scheduled_at, status, notes, properties(title)')
    .eq('lead_id', lead.id)
    .in('status', ['agendado', 'confirmado'])
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })

  try {
    const response = await generateAiResponse({
      admin,
      orgId,
      lead: lead as Lead,
      org: (org ?? {}) as Organization,
      config: config as BotConfig,
      history: orderedHistory,
      lastSearchOutput,
      currentImage: imageBase64 && imageMimetype
        ? { base64: imageBase64, mimetype: imageMimetype }
        : null,
      activeAppointments: activeAppts ?? [],
      isFirstContact,
    })

    if (response) {
      await sendWhatsApp(instanceName, phone, response.text)
      await admin.from('conversations').insert({
        lead_id: lead.id,
        organization_id: orgId,
        message: response.text,
        direction: 'out',
        ai_tool_used: response.toolUsed,
        ai_tokens_used: response.tokensUsed,
        ai_tool_output: response.toolOutput ?? null,
      })

      // Atualiza status se for primeiro contato
      if (lead.status === 'novo') {
        await admin.from('leads').update({ status: 'em_contato' }).eq('id', lead.id)
      }
    }
  } catch (err) {
    console.error('[bot-webhook] AI error:', err)
    const fallback = 'Oi! Tô com uma dificuldade técnica no momento. Em instantes um corretor vai te responder. 🙏'
    await sendWhatsApp(instanceName, phone, fallback).catch(() => {})
    await admin.from('conversations').insert({
      lead_id: lead.id,
      organization_id: orgId,
      message: fallback,
      direction: 'out',
    })
  }

  return ok()
})

// ---------- Evolution send ----------

async function sendWhatsApp(instanceName: string, phone: string, text: string) {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')!
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')!
  const res = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, text }),
  })
  if (!res.ok) {
    console.warn('[bot-webhook] sendText failed:', await res.text())
  }
}

// ---------- Audio transcription via OpenAI Whisper ----------

async function fetchMediaBase64(
  instanceName: string,
  messagePayload: { key: unknown; message: unknown },
  fallbackMime = 'application/octet-stream',
): Promise<{ base64: string; mimetype: string } | null> {
  const evoUrl = Deno.env.get('EVOLUTION_API_URL')!
  const evoKey = Deno.env.get('EVOLUTION_API_KEY')!
  const res = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: 'POST',
    headers: { apikey: evoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messagePayload, convertToMp4: false }),
  })
  if (!res.ok) {
    console.warn('[bot-webhook] getBase64FromMediaMessage failed:', await res.text())
    return null
  }
  const data = await res.json()
  const base64 = data.base64 || data.mediaBase64 || null
  const mimetype = data.mimetype || data.mediaType || fallbackMime
  if (!base64) return null
  return { base64, mimetype }
}

async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    console.warn('[bot-webhook] OPENAI_API_KEY not set — audio transcription disabled')
    return null
  }

  // Decode base64 → Uint8Array
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const ext = mimetype.includes('mp4') ? 'mp4'
    : mimetype.includes('mpeg') ? 'mp3'
    : mimetype.includes('wav') ? 'wav'
    : 'ogg'

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimetype }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'pt')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  })
  if (!res.ok) {
    console.warn('[bot-webhook] Whisper failed:', await res.text())
    return null
  }
  const data = await res.json()
  return (data.text as string)?.trim() || null
}

// ---------- AI (Bedrock Claude Haiku) ----------

type AiResponse = { text: string; toolUsed?: string; tokensUsed?: number; toolOutput?: unknown }

function formatActiveAppointments(appts?: Array<{ id: string; scheduled_at: string; status: string; properties?: { title?: string } | null }>): string {
  if (!appts || appts.length === 0) return '(nenhum agendamento ativo pra este lead)'
  return appts.map((a) => {
    const d = new Date(a.scheduled_at)
    const fmt = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `[appointment_id: ${a.id}] ${fmt} / ${a.properties?.title ?? 'imóvel'} / status: ${a.status}`
  }).join('\n')
}

function buildSystemPrompt(
  org: Organization,
  config: BotConfig,
  lead: Lead,
  lastSearchOutput?: unknown,
  activeAppointments?: Array<{ id: string; scheduled_at: string; status: string; properties?: { title?: string } | null }>,
  isFirstContact: boolean = false,
): string {
  const orgName = org.trade_name || org.legal_name || 'nossa imobiliária'
  const location = org.address_city && org.address_state
    ? `${org.address_city}/${org.address_state}`
    : org.address_city || ''

  const style = config.communication_style || 'balanced'
  const styleInstructions = {
    casual: 'Tom descontraído, como um amigo experiente em imóveis. Use "você" ou "vc", gírias leves aceitas, emojis com naturalidade. Respostas curtas (1-3 linhas).',
    balanced: 'Tom amigável e profissional ao mesmo tempo. Linguagem natural sem ser formal demais. Emojis ocasionais. Respostas curtas (1-3 linhas).',
    formal: 'Tom profissional e cortês. Trate por "você" mas sem gírias. Emojis apenas quando muito apropriado. Respostas objetivas e respeitosas.',
  }[style]

  // Capacidades baseadas em toggles
  const capabilities: string[] = []
  if (config.can_schedule) {
    capabilities.push('- **Pode agendar visitas**: quando o lead confirmar data/hora pra visita, USE **schedule_visit** com property_id e scheduled_at. NUNCA diga "agendei" sem chamar a ferramenta. Se falta data/hora, pergunte antes.')
  } else {
    capabilities.push('- **NÃO agende diretamente**: quando o lead quiser agendar, diga que um corretor entrará em contato em breve pra confirmar o melhor horário. Colete a preferência dele e use **update_lead** pra registrar.')
  }
  if (config.can_escalate) {
    capabilities.push('- **Pode escalar pra corretor humano**: use **escalate_to_human** quando: lead pedir explicitamente pra falar com alguém; negociação complexa (financiamento, contraproposta); dúvida fora do escopo; reclamação.')
  } else {
    capabilities.push('- **Não escale**: tente resolver sempre. Se não conseguir ajudar, diga que nossa equipe vai retornar o contato em horário comercial.')
  }
  if (config.can_negotiate_price) {
    capabilities.push('- **Pode discutir valores**: pode sugerir negociações e apresentar propostas de desconto razoáveis (sempre dentro do cadastro; NUNCA invente preço).')
  } else {
    capabilities.push('- **NÃO negocie valores**: se o lead pedir desconto, diga com educação que vai passar pra equipe avaliar a proposta.')
  }
  if (config.show_listing_links) {
    capabilities.push('- *Inclua SEMPRE o link do anúncio*: quando o imóvel retornado por search_properties tiver `listing_url` preenchida (não-null), OBRIGATORIAMENTE inclua essa URL pura (sem colchetes, sem texto alternativo, apenas a URL direta no final da descrição do imóvel) pra o lead acessar fotos e detalhes completos. Se listing_url for null/vazio, apenas ignore sem avisar.')
  } else {
    capabilities.push('- *Não envie links*: descreva os imóveis apenas em texto, sem URLs.')
  }

  // Data/hora atual em BRT para cálculo de agendamentos
  const now = new Date()
  const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const currentDate = brtFormatter.format(now)
  const currentIso = now.toISOString()

  // Persona customizada (fallback pra triagem_* legado)
  const customPersona = config.persona?.trim() || [
    config.welcome_message,
    config.triagem_localizacao,
    config.triagem_tipo,
    config.triagem_orcamento,
    config.triagem_quartos,
  ].filter(Boolean).join('\n')

  return `Você é um atendente virtual da ${orgName}, uma imobiliária${location ? ` em ${location}` : ''}.

# Data e hora atuais (use para calcular agendamentos)
Agora: **${currentDate}** (ISO: ${currentIso})
Timezone: BRT (America/Sao_Paulo, UTC-03:00)

# Missão
Ajudar o lead a encontrar o imóvel ideal, qualificando silenciosamente (tipo, localização, orçamento, quartos) e sugerindo imóveis disponíveis cadastrados.

# Tom de voz (estilo ${style})
- ${styleInstructions}
- NUNCA revele ser IA, bot ou assistente virtual

# Formatação de texto (WhatsApp)
Regras estritas:
- Negrito: use *asterisco único* (tipo *assim*). NUNCA dois asteriscos.
- Itálico: use _underscore_
- Tachado: use ~til~
- NÃO use ##, ###, ** ou qualquer coisa fora disso.
- NÃO use listas com "- item" nem "1. item". Escreva em frases corridas naturais.
- NUNCA use travessão (— ou –). Use vírgula ou separe em frases. Exemplo: "Apartamento 2 quartos, Moema" ao invés de "Apartamento 2 quartos — Moema". Travessão fica robótico e desumaniza.
- Emojis são bem-vindos com moderação.

# Contexto da imobiliária
${org.legal_name ? `- Razão social: ${org.legal_name}` : ''}
${org.trade_name ? `- Nome fantasia: ${org.trade_name}` : ''}
${org.website ? `- Site: ${org.website}` : ''}
${org.phone ? `- Telefone: ${org.phone}` : ''}
${location ? `- Cidade: ${location}` : ''}
${config.service_areas ? `- Regiões de atuação: ${config.service_areas}` : ''}
${config.company_differentials ? `- Diferenciais: ${config.company_differentials}` : ''}

${isFirstContact ? `# Primeira mensagem deste lead (PRIORIDADE MÁXIMA)
Este é o PRIMEIRO contato do lead com a gente. Sua resposta DEVE:
1. Começar com: "Olá! Bem-vindo(a) à *${orgName}*!" (nome em negrito com asterisco único)
2. Se apresentar brevemente como atendente${config.can_escalate ? ' e mencionar que pode conectar com um corretor humano quando o lead quiser' : ''}
3. Informar que o lead pode enviar *texto, áudio ou fotos* à vontade
4. Convidar o lead a contar o que procura (sem fazer várias perguntas de uma vez)
Mantenha a resposta em 4-6 linhas, acolhedor. NÃO pule esta instrução — é o primeiro contato.
` : ''}
# Suas capacidades (OBEDEÇA ESTRITAMENTE)
${capabilities.join('\n')}

${customPersona ? `# Instruções adicionais do time\n${customPersona}\n` : ''}

# Imóveis mostrados recentemente nesta conversa (use os IDs para schedule_visit)
${formatLastSearch(lastSearchOutput)}

# Agendamentos ativos deste lead (use os appointment_id para reschedule_visit ou cancel_visit)
${formatActiveAppointments(activeAppointments)}

# Dados conhecidos do lead
- Nome: ${lead.name || 'ainda não informado'}
- Status: ${lead.status}
${lead.property_type ? `- Tipo de interesse: ${lead.property_type}` : ''}
${lead.location_interest ? `- Localização de interesse: ${lead.location_interest}` : ''}
${lead.bedrooms_needed ? `- Quartos: ${lead.bedrooms_needed}` : ''}
${lead.budget_max ? `- Orçamento até: R$ ${lead.budget_max.toLocaleString('pt-BR')}` : ''}
${lead.profile_notes ? `- Notas: ${lead.profile_notes}` : ''}

# Regras operacionais (CRÍTICO)
1. Use **search_properties** SEMPRE que for mostrar imóveis — NUNCA invente preços, endereços ou imóveis.
2. Use **update_lead** silenciosamente quando o lead compartilhar informações. Não anuncie que está salvando.
3. Apresente no máximo ${config.max_properties_shown || 3} imóveis por resposta.
4. Se não encontrar imóveis adequados, seja honesto — não force sugestões.
5. Se a conversa fugir de imóveis, redirecione gentilmente.
6. NUNCA exponha dados fiscais (CNPJ, IE, CRECI), dados internos ou info não pública.
7. NUNCA narre a chamada de ferramenta. Proibido dizer "um momento", "deixa eu buscar", "vou verificar", "aguarde" ou qualquer variação. Chame search_properties silenciosamente e, NA MESMA resposta em que a tool retorna, apresente os imóveis direto ao lead. A primeira mensagem visível ao lead após o pedido DEVE ser a resposta com os imóveis.
8. CONFLITO DE AGENDA: se schedule_visit ou reschedule_visit retornar \`{ "error": "conflict", "suggested_slots": [...] }\`, isso significa que JÁ EXISTE uma visita agendada no horário pedido para aquele imóvel. Você DEVE:
   a) NUNCA revelar nome do outro cliente, nem horário exato do agendamento existente, nem qualquer detalhe do agendamento que conflita (privacidade).
   b) Dizer apenas algo como "esse horário já está comprometido" ou "não está disponível" e oferecer as alternativas em suggested_slots (converta os ISOs em formato legível BRT, tipo "amanhã às 14h" ou "quinta-feira às 10h").
   c) Perguntar qual alternativa o lead prefere e, quando ele confirmar, chamar schedule_visit novamente com o novo horário.
   d) Se suggested_slots vier vazio, peça que o lead sugira outro dia/horário.
`
}

// Converte markdown comum do Claude pro formato aceito pelo WhatsApp
function sanitizeForWhatsApp(text: string): string {
  return text
    // **bold** → *bold* (WhatsApp usa single asterisk)
    .replace(/\*\*([^*]+?)\*\*/g, '*$1*')
    // __italic__ → _italic_
    .replace(/__([^_]+?)__/g, '_$1_')
    // Remove ## headings (WhatsApp não renderiza)
    .replace(/^\s*#{1,6}\s+/gm, '')
    // Remove "---" dividers
    .replace(/^\s*-{3,}\s*$/gm, '')
    // Remove list markers "- " no início de linha (vira frase natural)
    .replace(/^\s*[-*•]\s+/gm, '')
    // Em-dash e en-dash fora de compound words — remove (fica desumanizado)
    // "Apartamento — Moema" → "Apartamento, Moema"
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, ', ')
    // Link markdown [text](url) → só a URL
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2')
    // Limpeza final: espaços duplos e trailing
    .replace(/  +/g, ' ')
    .replace(/ +,/g, ',')
    .trim()
}

function formatLastSearch(output: unknown): string {
  if (!output || typeof output !== 'object') return '(nenhum imóvel consultado ainda nesta conversa)'
  const obj = output as { properties?: Array<{ id?: string; title?: string; price?: number; rent_price?: number; address?: string }> }
  const props = obj.properties
  if (!Array.isArray(props) || props.length === 0) return '(busca anterior não retornou imóveis)'
  return props.slice(0, 5).map((p) => {
    const priceParts = []
    if (p.price) priceParts.push(`R$ ${p.price.toLocaleString('pt-BR')} venda`)
    if (p.rent_price) priceParts.push(`R$ ${p.rent_price.toLocaleString('pt-BR')}/mês aluguel`)
    return `[ID: ${p.id}] ${p.title} / ${p.address ?? ''} / ${priceParts.join(' · ')}`
  }).join('\n')
}

function toolDefinitions(config: BotConfig) {
  const tools: unknown[] = [
    {
      name: 'search_properties',
      description: 'Busca imóveis disponíveis. Traduza o que o lead descreve em filtros concretos. Se retornar 0, use o hint do resultado pra sugerir ampliar critérios.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Tipo: apartamento, casa, cobertura, studio, kitnet, loft, flat, sobrado, terreno, galpao, sala_comercial, predio, rural.' },
          city: { type: 'string', description: 'Cidade (ex: "São Paulo")' },
          neighborhood: { type: 'string', description: 'Bairro (ex: "Pinheiros", "Moema", "Itaim")' },
          min_price: { type: 'number', description: 'Preço mínimo em reais' },
          max_price: { type: 'number', description: 'Preço máximo em reais' },
          bedrooms: { type: 'number', description: 'Número mínimo de quartos' },
          listing_purpose: { type: 'string', enum: ['sale', 'rent'], description: 'Use apenas se o lead EXPLICITAMENTE quiser só venda OU só aluguel. Omita este campo se o lead não disse qual — o bot retorna tudo por padrão.' },
          amenities: {
            type: 'array',
            items: { type: 'string' },
            description: 'Amenidades desejadas. Valores: pool, gym, sauna, barbecue, party_room, playground, concierge_24h, elevator, balcony, gourmet_balcony, ac, pet_friendly, bike_rack, great_view, gourmet_space, green_area, concierge_service, coworking, rooftop, wheelchair.',
          },
        },
      },
    },
    {
      name: 'update_lead',
      description: 'Atualiza dados do lead silenciosamente quando ele compartilha informações (nome, orçamento, preferências). Não anuncie o uso desta ferramenta ao lead.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          property_type: { type: 'string' },
          location_interest: { type: 'string' },
          bedrooms_needed: { type: 'number' },
          budget_min: { type: 'number' },
          budget_max: { type: 'number' },
          profile_notes: { type: 'string', description: 'Observações importantes sobre o lead' },
        },
      },
    },
  ]

  if (config.can_schedule) {
    tools.push({
      name: 'schedule_visit',
      description: 'OBRIGATÓRIO quando o lead aceitar agendar uma visita. Cria o agendamento no sistema. NUNCA diga "agendei" ou "marquei" sem chamar esta ferramenta — seria mentira. Se não tiver data/hora específica do lead, confirme a data/hora com ele ANTES de chamar.',
      input_schema: {
        type: 'object',
        properties: {
          property_id: { type: 'string', description: 'ID do imóvel (UUID retornado por search_properties). Obrigatório.' },
          scheduled_at: { type: 'string', description: 'Data e hora da visita no formato ISO 8601 com timezone BRT (exemplo: "2026-04-18T15:00:00-03:00").' },
          notes: { type: 'string', description: 'Observações da visita (opcional).' },
        },
        required: ['property_id', 'scheduled_at'],
      },
    })

    tools.push({
      name: 'reschedule_visit',
      description: 'OBRIGATÓRIO quando o lead pedir pra mudar/remarcar uma visita já agendada. Use appointment_id da lista de "Agendamentos ativos deste lead". NUNCA diga "remarquei" sem chamar esta ferramenta.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'UUID do agendamento existente (veja "Agendamentos ativos deste lead" no contexto).' },
          new_scheduled_at: { type: 'string', description: 'Nova data e hora ISO 8601 com timezone BRT.' },
          reason: { type: 'string', description: 'Motivo da remarcação (opcional).' },
        },
        required: ['appointment_id', 'new_scheduled_at'],
      },
    })

    tools.push({
      name: 'cancel_visit',
      description: 'OBRIGATÓRIO quando o lead pedir pra cancelar uma visita. Use appointment_id da lista de agendamentos ativos. NUNCA diga "cancelei" sem chamar esta ferramenta.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'UUID do agendamento a cancelar.' },
          reason: { type: 'string', description: 'Motivo do cancelamento (opcional).' },
        },
        required: ['appointment_id'],
      },
    })
  }

  if (config.can_escalate) {
    tools.push({
      name: 'escalate_to_human',
      description: 'Transfere o atendimento pra um corretor humano. Use quando: (1) lead pedir pra falar com alguém humano, (2) negociação virar complexa (financiamento, contraproposta), (3) reclamação séria, (4) fora do escopo.',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Motivo da escalação em uma frase.' },
          urgency: { type: 'string', enum: ['low', 'normal', 'high'] },
        },
        required: ['reason'],
      },
    })
  }

  return tools
}

// Parse datetime tratando como BRT quando Claude esquecer o offset.
// Se vier "2026-04-18T13:00:00" (sem tz) ou "...Z" ou "...+0X", normaliza pra BRT local.
// Se vier com "-03:00" explícito, respeita.
function parseBrtDate(input: string): Date | null {
  const s = input.trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/)
  if (!m) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  const [, date, time] = m
  return new Date(`${date}T${time}-03:00`)
}

// Formata Date como ISO com offset -03:00 (sem converter pra UTC)
function toBrtIso(d: Date): string {
  // Pega Y-M-D H:M:S em BRT
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const h = parts.hour === '24' ? '00' : parts.hour
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}-03:00`
}

// Checa se existe appointment no mesmo imovel dentro de janela de +/- windowMin minutos.
// Retorna apenas contagem — nunca expoe detalhes do agendamento existente.
async function hasConflictingAppointment(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
  at: Date,
  windowMin = 30,
  excludeApptId?: string,
): Promise<boolean> {
  const from = new Date(at.getTime() - windowMin * 60_000).toISOString()
  const to = new Date(at.getTime() + windowMin * 60_000).toISOString()
  let q = admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('property_id', propertyId)
    .in('status', ['agendado', 'confirmado'])
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
  if (excludeApptId) q = q.neq('id', excludeApptId)
  const { count, error } = await q
  if (error) return false
  return (count ?? 0) > 0
}

// Gera sugestoes de horarios livres em torno do horario pedido.
// Regras: dentro de horario comercial (9h-18h BRT), alinhado em blocos de 30min,
// pula conflitos no mesmo imovel. Retorna ate maxSuggestions ISO strings em BRT.
async function suggestAvailableSlots(
  admin: SupabaseClient,
  orgId: string,
  propertyId: string,
  wanted: Date,
  maxSuggestions = 3,
  windowMin = 30,
): Promise<string[]> {
  const suggestions: string[] = []
  const now = Date.now()
  // Candidatos: mesmo dia a partir da hora pedida (+30, +60, +90, +120),
  // depois mesmo dia 2h ANTES (se ainda futuro), depois proximos 2 dias 10h/11h/14h/15h/16h.
  const candidates: Date[] = []

  // Helper para criar Date em BRT a partir de componentes
  function brtDate(baseDate: Date, hour: number, minute: number): Date {
    // Extrai Y-M-D em BRT do baseDate
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(baseDate).reduce<Record<string, string>>((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value
      return acc
    }, {})
    const hh = String(hour).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${hh}:${mm}:00-03:00`)
  }

  // Hora do wanted em BRT
  const wantedParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(wanted).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  let wantedH = parseInt(wantedParts.hour, 10)
  if (wantedH === 24) wantedH = 0
  const wantedM = parseInt(wantedParts.minute, 10)

  // Mesmo dia: deltas em minutos a partir do wanted
  const sameDayDeltas = [30, 60, 90, 120, -60, -30, -90, -120, 180, 240]
  for (const delta of sameDayDeltas) {
    const totalMin = wantedH * 60 + wantedM + delta
    if (totalMin < 9 * 60 || totalMin > 18 * 60) continue
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    if (m !== 0 && m !== 30) continue
    const c = brtDate(wanted, h, m)
    if (c.getTime() > now) candidates.push(c)
  }

  // Proximos 3 dias, horarios comuns
  for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
    const d = new Date(wanted.getTime() + dayOffset * 86_400_000)
    for (const [h, m] of [[10, 0], [11, 0], [14, 0], [15, 0], [16, 0], [17, 0]]) {
      const c = brtDate(d, h, m)
      if (c.getTime() > now) candidates.push(c)
    }
  }

  // Testa candidatos em ordem, pula conflitos
  for (const c of candidates) {
    if (suggestions.length >= maxSuggestions) break
    const conflict = await hasConflictingAppointment(admin, orgId, propertyId, c, windowMin)
    if (!conflict) {
      suggestions.push(toBrtIso(c))
    }
  }
  return suggestions
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: { admin: SupabaseClient; orgId: string; leadId: string; maxProps: number },
): Promise<string> {
  if (toolName === 'search_properties') {
    let q = ctx.admin
      .from('properties')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('listing_status', 'available')
    if (input.type) q = q.eq('type', String(input.type).toLowerCase())
    // Fuzzy: 'city' pode vir com valor de bairro — casa nos dois campos
    if (input.city) q = q.or(`city.ilike.%${input.city}%,neighborhood.ilike.%${input.city}%`)
    if (input.neighborhood) q = q.or(`neighborhood.ilike.%${input.neighborhood}%,city.ilike.%${input.neighborhood}%`)
    if (input.min_price) q = q.gte('price', Number(input.min_price))
    if (input.max_price) q = q.lte('price', Number(input.max_price))
    if (input.bedrooms) q = q.gte('bedrooms', Number(input.bedrooms))
    if (input.listing_purpose) {
      const lp = String(input.listing_purpose)
      if (lp === 'sale' || lp === 'rent') {
        // Imóveis com purpose='both' atendem tanto venda quanto aluguel
        q = q.or(`listing_purpose.eq.${lp},listing_purpose.eq.both`)
      }
      // Se 'both' ou desconhecido, não restringe — retorna tudo (sale+rent+both)
    }
    if (input.amenities && Array.isArray(input.amenities) && input.amenities.length > 0) {
      // amenities é text[]; requer que o imóvel tenha TODAS as amenities pedidas
      q = q.contains('amenities', input.amenities as string[])
    }
    // Prioriza destaques e imóveis mais recentes
    q = q.order('featured', { ascending: false }).order('created_at', { ascending: false })
    q = q.limit(ctx.maxProps)
    const { data, error } = await q
    if (error) return JSON.stringify({ error: error.message })
    const slim = (data ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      featured: p.featured,
      listing_purpose: p.listing_purpose,
      address: [p.location, p.neighborhood, p.address_city || p.city].filter(Boolean).join(', '),
      price: p.price,
      rent_price: p.rent_price,
      condo_fee: p.condo_fee,
      iptu: p.iptu,
      bedrooms: p.bedrooms,
      suites: p.suites,
      bathrooms: p.bathrooms,
      parking_spots: p.parking_spots,
      area_m2: p.area_m2,
      total_area_m2: p.total_area_m2,
      floor: p.floor,
      year_built: p.year_built,
      furnished: p.furnished,
      description: p.description,
      amenities: p.amenities,
      listing_url: p.listing_url,
    }))
    // Se nenhum resultado, dá hint ao AI
    if (slim.length === 0) {
      // Conta total de imóveis disponíveis pra dar contexto
      const { count: totalAvailable } = await ctx.admin
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.orgId)
        .eq('listing_status', 'available')
      return JSON.stringify({
        count: 0,
        properties: [],
        hint: `Nenhum imóvel encontrado com esses filtros. Cadastro total disponível: ${totalAvailable ?? 0}. Sugira ao lead amenizar algum critério (ampliar faixa de preço, considerar bairro vizinho, etc).`,
      })
    }
    return JSON.stringify({ count: slim.length, properties: slim })
  }

  if (toolName === 'update_lead') {
    const patch: Record<string, unknown> = {}
    for (const k of ['name', 'property_type', 'location_interest', 'bedrooms_needed', 'budget_min', 'budget_max', 'profile_notes']) {
      if (input[k] != null) patch[k] = input[k]
    }
    if (Object.keys(patch).length === 0) return JSON.stringify({ ok: true })
    const { error } = await ctx.admin.from('leads').update(patch).eq('id', ctx.leadId)
    if (error) return JSON.stringify({ error: error.message })
    return JSON.stringify({ ok: true, updated: Object.keys(patch) })
  }

  if (toolName === 'escalate_to_human') {
    const reason = String(input.reason ?? 'Escalação automática').trim()
    const urgency = String(input.urgency ?? 'normal')
    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const noteLine = `[${stamp}] Bot escalou: ${reason} (${urgency})`

    // Fetch existing lead notes e anexa
    const { data: leadRow } = await ctx.admin
      .from('leads')
      .select('profile_notes')
      .eq('id', ctx.leadId)
      .single()
    const newNotes = leadRow?.profile_notes
      ? `${leadRow.profile_notes}\n${noteLine}`
      : noteLine

    await ctx.admin.from('leads').update({
      status: 'em_contato',
      profile_notes: newNotes,
    }).eq('id', ctx.leadId)

    return JSON.stringify({ ok: true, escalated: true, reason, urgency })
  }

  if (toolName === 'schedule_visit') {
    const propertyId = String(input.property_id ?? '').trim()
    const scheduledAt = String(input.scheduled_at ?? '').trim()
    const notes = input.notes ? String(input.notes) : null

    if (!propertyId || !scheduledAt) {
      return JSON.stringify({ error: 'property_id e scheduled_at são obrigatórios' })
    }

    // Parse forçando BRT (Claude às vezes esquece o offset)
    const date = parseBrtDate(scheduledAt)
    if (!date || isNaN(date.getTime())) {
      return JSON.stringify({ error: 'Data inválida, use formato ISO 8601 (ex: 2026-04-18T15:00:00-03:00)' })
    }
    if (date.getTime() < Date.now()) {
      return JSON.stringify({ error: 'Data da visita precisa ser no futuro' })
    }

    // Valida que property é da org
    const { data: prop } = await ctx.admin
      .from('properties')
      .select('id, title')
      .eq('id', propertyId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle()
    if (!prop) {
      return JSON.stringify({ error: 'Imóvel não encontrado. Use search_properties antes pra pegar o ID correto.' })
    }

    // Verifica conflito no mesmo imovel (sem expor detalhes do agendamento existente)
    const conflict = await hasConflictingAppointment(ctx.admin, ctx.orgId, propertyId, date, 30)
    if (conflict) {
      const suggested = await suggestAvailableSlots(ctx.admin, ctx.orgId, propertyId, date, 3, 30)
      return JSON.stringify({
        error: 'conflict',
        reason: 'Este imovel ja possui uma visita agendada em horario proximo (janela de 30min).',
        privacy_note: 'NAO revele detalhes (lead, corretor, horario exato) do agendamento existente ao lead. Apenas diga que o horario nao esta disponivel e ofereca alternativas.',
        suggested_slots: suggested,
        instructions_for_ai: 'Peca desculpas brevemente, diga que aquele horario ja esta ocupado e oferece as alternativas em suggested_slots (formate-as em horarios legiveis BRT). Pergunte qual prefere.',
      })
    }

    // Cria appointment
    const { data: appt, error } = await ctx.admin
      .from('appointments')
      .insert({
        organization_id: ctx.orgId,
        lead_id: ctx.leadId,
        property_id: propertyId,
        scheduled_at: date.toISOString(),
        notes,
        status: 'agendado',
      })
      .select('id, scheduled_at')
      .single()

    if (error) return JSON.stringify({ error: error.message })

    // Atualiza status do lead pra "agendado"
    await ctx.admin.from('leads').update({ status: 'agendado' }).eq('id', ctx.leadId)

    return JSON.stringify({
      ok: true,
      appointment_id: appt.id,
      property_title: prop.title,
      scheduled_at: appt.scheduled_at,
    })
  }

  if (toolName === 'reschedule_visit') {
    const apptId = String(input.appointment_id ?? '').trim()
    const newAt = String(input.new_scheduled_at ?? '').trim()
    if (!apptId || !newAt) {
      return JSON.stringify({ error: 'appointment_id e new_scheduled_at obrigatórios' })
    }
    const date = parseBrtDate(newAt)
    if (!date || isNaN(date.getTime())) return JSON.stringify({ error: 'Data inválida' })
    if (date.getTime() < Date.now()) return JSON.stringify({ error: 'Nova data precisa ser no futuro' })

    // Valida ownership (org + lead)
    const { data: existing } = await ctx.admin
      .from('appointments')
      .select('id, status, notes, property_id')
      .eq('id', apptId)
      .eq('organization_id', ctx.orgId)
      .eq('lead_id', ctx.leadId)
      .maybeSingle()
    if (!existing) return JSON.stringify({ error: 'Agendamento não encontrado ou não pertence a este lead.' })
    if (existing.status === 'cancelado' || existing.status === 'realizado') {
      return JSON.stringify({ error: `Agendamento já está ${existing.status} e não pode ser remarcado.` })
    }

    // Verifica conflito no novo horario (excluindo o proprio appt que esta sendo remarcado)
    if (existing.property_id) {
      const conflict = await hasConflictingAppointment(ctx.admin, ctx.orgId, existing.property_id as string, date, 30, apptId)
      if (conflict) {
        const suggested = await suggestAvailableSlots(ctx.admin, ctx.orgId, existing.property_id as string, date, 3, 30)
        return JSON.stringify({
          error: 'conflict',
          reason: 'O novo horario ja possui outra visita agendada proxima no mesmo imovel.',
          privacy_note: 'NAO revele detalhes do outro agendamento. Apenas ofereca as alternativas.',
          suggested_slots: suggested,
          instructions_for_ai: 'Diga que aquele horario nao esta disponivel e oferece as alternativas em suggested_slots. Pergunte qual prefere.',
        })
      }
    }

    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const newNote = input.reason
      ? `[${stamp}] Remarcado: ${input.reason}`
      : `[${stamp}] Remarcado pelo lead via WhatsApp`
    const combinedNotes = existing.notes ? `${existing.notes}\n${newNote}` : newNote

    const { error } = await ctx.admin.from('appointments').update({
      scheduled_at: date.toISOString(),
      notes: combinedNotes,
      status: 'agendado',
    }).eq('id', apptId)
    if (error) return JSON.stringify({ error: error.message })

    return JSON.stringify({
      ok: true,
      appointment_id: apptId,
      new_scheduled_at: date.toISOString(),
    })
  }

  if (toolName === 'cancel_visit') {
    const apptId = String(input.appointment_id ?? '').trim()
    if (!apptId) return JSON.stringify({ error: 'appointment_id obrigatório' })

    const { data: existing } = await ctx.admin
      .from('appointments')
      .select('id, status, notes')
      .eq('id', apptId)
      .eq('organization_id', ctx.orgId)
      .eq('lead_id', ctx.leadId)
      .maybeSingle()
    if (!existing) return JSON.stringify({ error: 'Agendamento não encontrado.' })
    if (existing.status === 'cancelado') return JSON.stringify({ ok: true, already: true })
    if (existing.status === 'realizado') return JSON.stringify({ error: 'Visita já foi realizada, não pode ser cancelada.' })

    const stamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const reason = input.reason ? `: ${input.reason}` : ''
    const note = `[${stamp}] Cancelado pelo lead${reason}`
    const combinedNotes = existing.notes ? `${existing.notes}\n${note}` : note

    const { error } = await ctx.admin.from('appointments').update({
      status: 'cancelado',
      notes: combinedNotes,
    }).eq('id', apptId)
    if (error) return JSON.stringify({ error: error.message })

    return JSON.stringify({ ok: true, appointment_id: apptId, status: 'cancelado' })
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` })
}

async function callBedrock(body: Record<string, unknown>) {
  const client = new BedrockRuntimeClient({
    region: Deno.env.get('AWS_REGION') || 'us-east-1',
    credentials: {
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
    },
  })
  const modelId = Deno.env.get('BEDROCK_MODEL_ID') || 'anthropic.claude-3-5-haiku-20241022-v1:0'
  const cmd = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: new TextEncoder().encode(JSON.stringify(body)),
  })
  const res = await client.send(cmd)
  const text = new TextDecoder().decode(res.body)
  return JSON.parse(text)
}

async function generateAiResponse(args: {
  admin: SupabaseClient
  orgId: string
  lead: Lead
  org: Organization
  config: BotConfig
  history: { message: string; direction: string }[]
  lastSearchOutput?: unknown
  currentImage?: { base64: string; mimetype: string } | null
  activeAppointments?: Array<{ id: string; scheduled_at: string; status: string; properties?: { title?: string } | null }>
  isFirstContact?: boolean
}): Promise<AiResponse | null> {
  const system = buildSystemPrompt(args.org, args.config, args.lead, args.lastSearchOutput, args.activeAppointments, args.isFirstContact)
  const tools = toolDefinitions(args.config)

  // Constrói messages alternando user/assistant a partir do history
  const messages = historyToMessages(args.history)
  if (messages.length === 0) return null

  // Se a mensagem atual tem imagem, injeta no último user message (que é a mensagem atual)
  if (args.currentImage) {
    const last = messages[messages.length - 1]
    if (last && last.role === 'user' && typeof last.content === 'string') {
      last.content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: args.currentImage.mimetype,
            data: args.currentImage.base64,
          },
        },
        { type: 'text', text: last.content.replace(/^📷\s*/, '') },
      ] as any
    }
  }

  let accumulatedMessages: any[] = [...messages]
  let totalTokens = 0
  let toolUsed: string | undefined
  let lastToolOutput: unknown
  let validationErrorFallback = false
  let lastTextBlock: string | null = null
  let toolExecutedInLoop = false

  // Regex de narração (tipo "um momento...") — sinal de resposta incompleta
  const narrationLike = /^\s*(ótimo|perfeito|claro|beleza|certo|tá|ok)?[!.,\s]*(deixa eu|vou buscar|vou verificar|aguarde?|um\s+momento|um\s+instante|só um|so um|procurando|buscando|checando|pesquisando)/i

  function looksLikeNarration(txt: string): boolean {
    if (!txt) return false
    const trimmed = txt.trim()
    if (trimmed.length < 40) return true
    return narrationLike.test(trimmed) && trimmed.length < 200
  }

  // Loop de tool use: até 4 rodadas (Claude chama tool, recebe resultado, continua)
  for (let round = 0; round < 4; round++) {
    const body: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1500,
      system,
      messages: accumulatedMessages,
    }
    // Desabilita tools no fallback (histórico bagunçado) — responde só texto
    if (!validationErrorFallback) body.tools = tools

    let resp: any
    try {
      resp = await callBedrock(body)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Se Claude recusar histórico com tool_use inválido, tenta uma vez sem tools
      if (!validationErrorFallback && msg.includes('tool_use') && msg.includes('tool_result')) {
        console.warn('[bot-webhook] retrying without tools due to history validation error')
        validationErrorFallback = true
        // Reset pra mensagens só de texto (ignora qualquer tool turn)
        accumulatedMessages = messages.filter((m) => typeof m.content === 'string')
        continue
      }
      throw err
    }
    totalTokens += (resp.usage?.input_tokens ?? 0) + (resp.usage?.output_tokens ?? 0)

    const textBlock = (resp.content as any[])?.find((b) => b.type === 'text')
    const toolUseBlock = (resp.content as any[])?.find((b) => b.type === 'tool_use')

    console.log('[bot-webhook] round', round, 'stop_reason:', resp.stop_reason,
      'has_text:', !!textBlock, 'text_len:', textBlock?.text?.length ?? 0,
      'tool:', toolUseBlock?.name ?? null)

    if (textBlock?.text) lastTextBlock = textBlock.text

    if (resp.stop_reason === 'tool_use' && toolUseBlock) {
      toolUsed = toolUseBlock.name
      toolExecutedInLoop = true
      const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input, {
        admin: args.admin,
        orgId: args.orgId,
        leadId: args.lead.id,
        maxProps: args.config.max_properties_shown ?? 3,
      })

      try { lastToolOutput = JSON.parse(toolResult) } catch { lastToolOutput = toolResult }

      // Acumula: assistant completo (com tool_use) + user (tool_result)
      accumulatedMessages = [
        ...accumulatedMessages,
        { role: 'assistant', content: resp.content },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }],
        },
      ]
      continue
    }

    // Resposta final em texto
    if (textBlock?.text) {
      // Proteção: se usamos tool e a resposta ainda parece narração ("um momento...")
      // força uma iteração a mais pra Claude produzir a resposta real
      if (toolExecutedInLoop && looksLikeNarration(textBlock.text) && round < 3) {
        console.warn('[bot-webhook] round', round, 'returned narration after tool, forcing retry')
        accumulatedMessages = [
          ...accumulatedMessages,
          { role: 'assistant', content: resp.content },
          { role: 'user', content: 'Perfeito, agora me apresenta os imóveis direto sem dizer "um momento" ou similar. Mostra os resultados com preços, endereço e link.' },
        ]
        continue
      }
      return { text: sanitizeForWhatsApp(textBlock.text), toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
    }

    break
  }

  // Fallback: se saímos do loop sem retornar, usa o que temos
  if (lastTextBlock && !looksLikeNarration(lastTextBlock)) {
    return { text: sanitizeForWhatsApp(lastTextBlock), toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
  }

  // Último recurso: se search_properties rodou com resultados, monta resposta manual
  if (toolUsed === 'search_properties' && lastToolOutput && typeof lastToolOutput === 'object') {
    const manual = buildManualPropertyResponse(lastToolOutput, args.config)
    if (manual) return { text: manual, toolUsed, tokensUsed: totalTokens, toolOutput: lastToolOutput }
  }

  console.warn('[bot-webhook] exhausted rounds with no valid final response')
  return null
}

function buildManualPropertyResponse(output: unknown, config: BotConfig): string | null {
  const obj = output as { count?: number; properties?: any[]; hint?: string }
  const props = obj.properties ?? []
  if (props.length === 0) {
    return 'Não achei imóveis com esses critérios no momento. Posso ampliar a busca? Me diz se topa bairros vizinhos ou ajustar faixa de preço.'
  }
  const showLinks = config.show_listing_links
  const lines = props.slice(0, config.max_properties_shown || 3).map((p: any) => {
    const pieces: string[] = []
    pieces.push(`*${p.title}*`)
    const loc = [p.address, p.neighborhood].filter(Boolean).join(', ')
    if (loc) pieces.push(loc)
    const priceParts: string[] = []
    if (p.price) priceParts.push(`R$ ${Number(p.price).toLocaleString('pt-BR')} venda`)
    if (p.rent_price) priceParts.push(`R$ ${Number(p.rent_price).toLocaleString('pt-BR')}/mês`)
    if (priceParts.length) pieces.push(priceParts.join(' · '))
    const specs: string[] = []
    if (p.bedrooms) specs.push(`${p.bedrooms} dorm`)
    if (p.bathrooms) specs.push(`${p.bathrooms} banh`)
    if (p.parking_spots) specs.push(`${p.parking_spots} vaga${p.parking_spots > 1 ? 's' : ''}`)
    if (p.area_m2) specs.push(`${p.area_m2}m²`)
    if (specs.length) pieces.push(specs.join(', '))
    if (showLinks && p.listing_url) pieces.push(p.listing_url)
    return pieces.join('\n')
  })
  const intro = props.length === 1 ? 'Encontrei um imóvel que encaixa:' : `Encontrei ${props.length} opções:`
  return sanitizeForWhatsApp(`${intro}\n\n${lines.join('\n\n')}\n\nQuer agendar uma visita em algum desses?`)
}

function historyToMessages(
  history: { message: string; direction: string }[],
): { role: 'user' | 'assistant'; content: string }[] {
  // Coalesca mensagens consecutivas da mesma direção (Claude exige alternância)
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const h of history) {
    const role = h.direction === 'in' ? 'user' : 'assistant'
    const last = out[out.length - 1]
    if (last && last.role === role) {
      last.content += '\n' + h.message
    } else {
      out.push({ role, content: h.message })
    }
  }
  // Deve começar com user
  while (out.length > 0 && out[0].role !== 'user') out.shift()
  return out
}
