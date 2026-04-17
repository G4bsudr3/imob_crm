-- Colunas usadas pelo bot-webhook (estavam faltando)
alter table public.leads
  add column if not exists last_message_at timestamptz,
  add column if not exists source text default 'manual';

create index if not exists idx_leads_last_message
  on public.leads(organization_id, last_message_at desc);
