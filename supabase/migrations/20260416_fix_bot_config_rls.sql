-- =====================================================================
-- Fix: bot_config RLS still leaking to anon (likely leftover permissive
-- policy from Supabase dashboard table creation)
-- =====================================================================

-- Drop any and all existing policies on bot_config
do $$
declare
  pol record;
begin
  for pol in
    select polname from pg_policy
    where polrelid = 'public.bot_config'::regclass
  loop
    execute format('drop policy if exists %I on public.bot_config;', pol.polname);
  end loop;
end $$;

-- Re-enable RLS (idempotent)
alter table public.bot_config enable row level security;
alter table public.bot_config force row level security;

-- Recreate the scoped policies
create policy "bot_config_select_same_org" on public.bot_config
  for select to authenticated
  using (organization_id = public.current_user_org_id());

create policy "bot_config_insert_admin" on public.bot_config
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

create policy "bot_config_update_admin" on public.bot_config
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  )
  with check (organization_id = public.current_user_org_id());
