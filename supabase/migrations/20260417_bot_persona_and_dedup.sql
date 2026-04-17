-- =====================================================================
-- Chunk 4: campo "persona" pro bot + dedup de mensagens do Evolution
-- =====================================================================

-- 1. Persona: instrução livre em markdown que substitui os 5 triagem_*
alter table public.bot_config
  add column if not exists persona text;

-- Backfill: se persona está null, popula a partir dos campos antigos
update public.bot_config
set persona = trim(concat_ws(E'\n\n',
  case when welcome_message is not null and welcome_message <> '' then '## Mensagem inicial' || E'\n' || welcome_message end,
  '## Perguntas de qualificação (use como guia, adapte naturalmente)',
  case when triagem_localizacao is not null and triagem_localizacao <> '' then '- Localização: ' || triagem_localizacao end,
  case when triagem_tipo is not null and triagem_tipo <> '' then '- Tipo de imóvel: ' || triagem_tipo end,
  case when triagem_orcamento is not null and triagem_orcamento <> '' then '- Orçamento: ' || triagem_orcamento end,
  case when triagem_quartos is not null and triagem_quartos <> '' then '- Quartos: ' || triagem_quartos end,
  case when mensagem_agendamento is not null and mensagem_agendamento <> '' then '## Ao sugerir agendamento' || E'\n' || mensagem_agendamento end,
  case when no_properties_message is not null and no_properties_message <> '' then '## Quando não encontrar imóveis' || E'\n' || no_properties_message end,
  case when farewell_message is not null and farewell_message <> '' then '## Despedida' || E'\n' || farewell_message end
))
where persona is null;

-- 2. Dedup: guarda o ID da mensagem do Evolution pra evitar processamento duplicado
alter table public.conversations
  add column if not exists whatsapp_message_id text;

-- Unique (mas permite NULL — mensagens manuais do admin não têm ID do Evolution)
create unique index if not exists conversations_whatsapp_msg_id_unique
  on public.conversations(whatsapp_message_id)
  where whatsapp_message_id is not null;
