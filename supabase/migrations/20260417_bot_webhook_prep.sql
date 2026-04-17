-- =====================================================================
-- Preparação para bot-webhook: upsert de lead por (org, phone) + source
-- =====================================================================

-- Unique constraint pra permitir upsert de lead por telefone dentro da org
-- (se tiver duplicatas, essa migration vai falhar; nesse caso, limpar antes)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_org_phone_unique'
  ) then
    alter table public.leads
      add constraint leads_org_phone_unique unique (organization_id, phone);
  end if;
end $$;

-- Campo opcional pra rastrear último tool_call da AI (útil pra analytics depois)
alter table public.conversations
  add column if not exists ai_tool_used text,
  add column if not exists ai_tokens_used integer;

-- Index pra buscas de histórico por lead
create index if not exists idx_conversations_lead_sent
  on public.conversations(lead_id, sent_at desc);
