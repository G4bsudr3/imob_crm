-- =====================================================================
-- WhatsApp Instances (1 por org) + limpeza de bot_config legado
-- =====================================================================

create table if not exists public.whatsapp_instances (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  instance_name text not null unique,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'qrcode', 'connecting', 'connected', 'error')),
  connected_number text,
  last_qr_at timestamptz,
  last_connection_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_instances_touch_updated_at on public.whatsapp_instances;
create trigger whatsapp_instances_touch_updated_at
  before update on public.whatsapp_instances
  for each row execute function public.touch_updated_at();

-- RLS: membros da org podem VER; apenas service_role (Edge Functions) escreve
alter table public.whatsapp_instances enable row level security;

drop policy if exists "whatsapp_select_same_org" on public.whatsapp_instances;
create policy "whatsapp_select_same_org" on public.whatsapp_instances
  for select to authenticated
  using (organization_id = public.current_user_org_id());
-- (Sem policies de insert/update/delete para authenticated — só service_role)

-- =====================================================================
-- Remove campos de Evolution do bot_config (gerenciados pela plataforma)
-- =====================================================================
alter table public.bot_config
  drop column if exists evolution_api_url,
  drop column if exists evolution_instance_name,
  drop column if exists evolution_api_key,
  drop column if exists n8n_webhook_url,
  drop column if exists whatsapp_number;
