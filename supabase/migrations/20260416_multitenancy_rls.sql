-- =====================================================================
-- Multi-tenancy + RLS (organization_id scoping on all data tables)
-- =====================================================================
-- Idempotent — safe to re-run.
-- Assumes previous migration (20260416_profile_and_organization.sql) ran.
-- =====================================================================

-- ---- 1. Add organization_id columns ---------------------------------
alter table public.profiles
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.leads
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.properties
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.appointments
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.conversations
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.bot_config
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- ---- 2. Indexes -----------------------------------------------------
create index if not exists idx_profiles_org on public.profiles(organization_id);
create index if not exists idx_leads_org on public.leads(organization_id);
create index if not exists idx_properties_org on public.properties(organization_id);
create index if not exists idx_appointments_org on public.appointments(organization_id);
create index if not exists idx_conversations_org on public.conversations(organization_id);

-- ---- 3. bot_config: one row per org ---------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bot_config_organization_id_key'
  ) then
    alter table public.bot_config
      add constraint bot_config_organization_id_key unique (organization_id);
  end if;
end $$;

-- ---- 4. Helper functions --------------------------------------------
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(role in ('admin', 'manager'), false)
  from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_org_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_org_admin() to authenticated;

-- ---- 5. Backfill (single-tenant state) ------------------------------
-- Link existing profiles and bot_config rows to the one existing org.
update public.profiles
set organization_id = (select id from public.organizations order by created_at asc limit 1),
    role = 'admin'
where organization_id is null
  and (select count(*) from public.organizations) = 1;

update public.bot_config
set organization_id = (select id from public.organizations order by created_at asc limit 1)
where organization_id is null
  and (select count(*) from public.organizations) = 1;

-- ---- 6. Trigger: creator of a new org becomes its admin -------------
create or replace function public.link_profile_to_new_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set organization_id = new.id,
      role = 'admin'
  where id = auth.uid() and organization_id is null;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.link_profile_to_new_org();

-- ---- 7. Enable RLS on data tables -----------------------------------
alter table public.leads enable row level security;
alter table public.properties enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.bot_config enable row level security;
-- profiles & organizations already have RLS from previous migration

-- ---- 8. Policies: LEADS ---------------------------------------------
drop policy if exists "leads_select_same_org" on public.leads;
create policy "leads_select_same_org" on public.leads
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "leads_insert_same_org" on public.leads;
create policy "leads_insert_same_org" on public.leads
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists "leads_update_same_org" on public.leads;
create policy "leads_update_same_org" on public.leads
  for update to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

drop policy if exists "leads_delete_same_org" on public.leads;
create policy "leads_delete_same_org" on public.leads
  for delete to authenticated
  using (organization_id = public.current_user_org_id());

-- ---- 9. Policies: PROPERTIES ----------------------------------------
drop policy if exists "properties_select_same_org" on public.properties;
create policy "properties_select_same_org" on public.properties
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "properties_insert_same_org" on public.properties;
create policy "properties_insert_same_org" on public.properties
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists "properties_update_same_org" on public.properties;
create policy "properties_update_same_org" on public.properties
  for update to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

drop policy if exists "properties_delete_same_org" on public.properties;
create policy "properties_delete_same_org" on public.properties
  for delete to authenticated
  using (organization_id = public.current_user_org_id());

-- ---- 10. Policies: APPOINTMENTS -------------------------------------
drop policy if exists "appointments_select_same_org" on public.appointments;
create policy "appointments_select_same_org" on public.appointments
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "appointments_insert_same_org" on public.appointments;
create policy "appointments_insert_same_org" on public.appointments
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists "appointments_update_same_org" on public.appointments;
create policy "appointments_update_same_org" on public.appointments
  for update to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

drop policy if exists "appointments_delete_same_org" on public.appointments;
create policy "appointments_delete_same_org" on public.appointments
  for delete to authenticated
  using (organization_id = public.current_user_org_id());

-- ---- 11. Policies: CONVERSATIONS ------------------------------------
drop policy if exists "conversations_select_same_org" on public.conversations;
create policy "conversations_select_same_org" on public.conversations
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "conversations_insert_same_org" on public.conversations;
create policy "conversations_insert_same_org" on public.conversations
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());
-- NOTE: conversations are normally inserted by the bot webhook using
-- service_role (which bypasses RLS). This insert policy exists for
-- completeness if the client ever creates a message manually.

-- ---- 12. Policies: BOT_CONFIG (admin/manager only) ------------------
drop policy if exists "bot_config_select_same_org" on public.bot_config;
create policy "bot_config_select_same_org" on public.bot_config
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "bot_config_insert_admin" on public.bot_config;
create policy "bot_config_insert_admin" on public.bot_config
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

drop policy if exists "bot_config_update_admin" on public.bot_config;
create policy "bot_config_update_admin" on public.bot_config
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  )
  with check (organization_id = public.current_user_org_id());

-- ---- 13. Policies: PROFILES (refine from previous migration) --------
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_same_org" on public.profiles;
create policy "profiles_select_same_org" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (organization_id is not null
        and organization_id = public.current_user_org_id())
  );

-- profiles_insert_own and profiles_update_own remain from previous migration.

-- ---- 14. Policies: ORGANIZATIONS (replace permissive policy) --------
drop policy if exists "organizations_rw_authenticated" on public.organizations;

drop policy if exists "organizations_select_own" on public.organizations;
create policy "organizations_select_own" on public.organizations
  for select to authenticated
  using (
    id = public.current_user_org_id()
    or public.current_user_org_id() is null
  );

drop policy if exists "organizations_insert_first" on public.organizations;
create policy "organizations_insert_first" on public.organizations
  for insert to authenticated
  with check (public.current_user_org_id() is null);

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin" on public.organizations
  for update to authenticated
  using (id = public.current_user_org_id() and public.is_org_admin())
  with check (id = public.current_user_org_id());

drop policy if exists "organizations_delete_admin" on public.organizations;
create policy "organizations_delete_admin" on public.organizations
  for delete to authenticated
  using (id = public.current_user_org_id() and public.is_org_admin());
