-- Google Calendar integration:
--   calendar_integrations table, appointments calendar columns,
--   get_org_calendar_integration helper RPC.

-- ---- 1. calendar_integrations table --------------------------------
create table if not exists public.calendar_integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null default 'google',
  google_email    text,
  calendar_id     text not null default 'primary',
  access_token    text,
  refresh_token   text not null,
  expires_at      timestamptz,
  scope           text,
  last_error      text,
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_cal_integrations_org on public.calendar_integrations(organization_id);
create index if not exists idx_cal_integrations_user on public.calendar_integrations(user_id);

alter table public.calendar_integrations enable row level security;

drop policy if exists cal_select_own on public.calendar_integrations;
create policy cal_select_own on public.calendar_integrations
  for select to authenticated
  using (user_id = auth.uid() or organization_id = public.current_user_org_id());

drop policy if exists cal_insert_own on public.calendar_integrations;
create policy cal_insert_own on public.calendar_integrations
  for insert to authenticated
  with check (user_id = auth.uid() and organization_id = public.current_user_org_id());

drop policy if exists cal_update_own on public.calendar_integrations;
create policy cal_update_own on public.calendar_integrations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists cal_delete_own on public.calendar_integrations;
create policy cal_delete_own on public.calendar_integrations
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- 2. Google columns on appointments ----------------------------
alter table public.appointments
  add column if not exists google_event_id          text,
  add column if not exists google_calendar_user_id  uuid references auth.users(id) on delete set null;

-- ---- 3. get_org_calendar_integration RPC --------------------------
-- Returns the calendar integration for an org (most recently connected).
-- Used by bot-webhook (service role) to get tokens for GCal events.
create or replace function public.get_org_calendar_integration(p_org_id uuid)
returns table (
  user_id         uuid,
  google_email    text,
  calendar_id     text,
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    user_id,
    google_email,
    calendar_id,
    access_token,
    refresh_token,
    expires_at
  from public.calendar_integrations
  where organization_id = p_org_id
    and provider = 'google'
  order by connected_at desc
  limit 1;
$$;

grant execute on function public.get_org_calendar_integration(uuid) to authenticated, service_role;
