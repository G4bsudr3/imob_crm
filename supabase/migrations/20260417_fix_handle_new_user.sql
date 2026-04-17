-- =====================================================================
-- Fix: OTP signup returning 500 — harden handle_new_user against errors
-- Never block user creation in auth.users; log exceptions instead.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(new.email));
  v_org_id uuid;
  v_role text;
begin
  -- Find pending invitation (may match zero rows; vars stay null)
  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  -- Upsert the profile
  insert into public.profiles (id, name, email, organization_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_org_id,
    coalesce(v_role, 'user')
  )
  on conflict (id) do nothing;

  -- Mark invitation(s) as accepted
  if v_org_id is not null then
    update public.organization_invitations
    set accepted_at = now()
    where lower(email) = v_email and accepted_at is null;
  end if;

  return new;
exception when others then
  -- Never block user creation due to our logic. Log and continue.
  raise log 'handle_new_user failed for % (sqlstate: %): %', new.email, SQLSTATE, SQLERRM;
  return new;
end;
$$;

-- Ensure trigger is still wired up (idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
