-- =====================================================================
-- Team invitations + role management
-- =====================================================================

-- ---- 1. Invitations table -------------------------------------------
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'manager', 'admin')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists idx_invitations_email on public.organization_invitations(lower(email));
create index if not exists idx_invitations_org on public.organization_invitations(organization_id);

-- Normalize email to lowercase on insert/update
create or replace function public.invitations_normalize_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists invitations_normalize_email on public.organization_invitations;
create trigger invitations_normalize_email
  before insert or update on public.organization_invitations
  for each row execute function public.invitations_normalize_email();

-- ---- 2. RLS on invitations ------------------------------------------
alter table public.organization_invitations enable row level security;

drop policy if exists "invitations_select_admin" on public.organization_invitations;
create policy "invitations_select_admin" on public.organization_invitations
  for select to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

drop policy if exists "invitations_insert_admin" on public.organization_invitations;
create policy "invitations_insert_admin" on public.organization_invitations
  for insert to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

drop policy if exists "invitations_update_admin" on public.organization_invitations;
create policy "invitations_update_admin" on public.organization_invitations
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

drop policy if exists "invitations_delete_admin" on public.organization_invitations;
create policy "invitations_delete_admin" on public.organization_invitations
  for delete to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  );

-- ---- 3. Update handle_new_user to accept invitations ----------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invitation record;
begin
  v_email := lower(trim(new.email));

  -- Check for a pending invitation
  select organization_id, role
    into v_invitation
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  insert into public.profiles (id, name, email, organization_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_invitation.organization_id,
    coalesce(v_invitation.role, 'user')
  )
  on conflict (id) do nothing;

  -- Mark invitation(s) as accepted
  if v_invitation.organization_id is not null then
    update public.organization_invitations
    set accepted_at = now()
    where lower(email) = v_email and accepted_at is null;
  end if;

  return new;
end;
$$;

-- ---- 4. Admin can update profiles within their org ------------------
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (
    organization_id = public.current_user_org_id()
    and public.is_org_admin()
  )
  with check (
    -- Admin can either keep the user in same org, or remove them (null)
    organization_id is null
    or organization_id = public.current_user_org_id()
  );

-- ---- 5. Prevent role/org escalation for non-admins ------------------
-- A regular user trying to set their own role='admin' or organization_id=X
-- would bypass the application logic unless we block it at DB level.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_current_org uuid;
begin
  v_is_admin := public.is_org_admin();
  v_current_org := public.current_user_org_id();

  if new.role is distinct from old.role
     or new.organization_id is distinct from old.organization_id then
    if not coalesce(v_is_admin, false)
       or old.organization_id is distinct from v_current_org then
      raise exception 'Apenas administradores da organização podem alterar role ou organização'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row
  when (
    old.role is distinct from new.role
    or old.organization_id is distinct from new.organization_id
  )
  execute function public.prevent_role_escalation();
