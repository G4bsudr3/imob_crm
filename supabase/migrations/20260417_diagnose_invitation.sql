-- =====================================================================
-- Diagnóstico + fix robusto: tenta 4 fontes diferentes pro email
-- =====================================================================

create or replace function public.accept_pending_invitation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_role text;
begin
  if v_user_id is null then
    return null;
  end if;

  -- 1. Per-claim GUC (set by PostgREST)
  v_email := nullif(current_setting('request.jwt.claim.email', true), '');

  -- 2. Full JWT claims JSON
  if v_email is null or v_email = '' then
    begin
      v_email := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
    exception when others then
      v_email := null;
    end;
  end if;

  -- 3. auth.jwt() helper
  if v_email is null or v_email = '' then
    begin
      v_email := auth.jwt() ->> 'email';
    exception when others then
      v_email := null;
    end;
  end if;

  -- 4. Fallback: auth.users
  if v_email is null or v_email = '' then
    begin
      select email into v_email from auth.users where id = v_user_id;
    exception when others then
      v_email := null;
    end;
  end if;

  if v_email is null or v_email = '' then
    return null;
  end if;

  v_email := lower(trim(v_email));

  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  if v_org_id is null then
    return null;
  end if;

  perform set_config('app.invitation_accepting', 'true', true);
  update public.profiles
  set organization_id = v_org_id,
      role = coalesce(v_role, 'user')
  where id = v_user_id;
  perform set_config('app.invitation_accepting', 'false', true);

  update public.organization_invitations
  set accepted_at = now()
  where lower(email) = v_email and accepted_at is null;

  return v_org_id;
end;
$$;

-- Diagnóstico detalhado — retorna tudo que a função consegue ver
create or replace function public.debug_my_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email_claim text;
  v_email_jwt text;
  v_email_jwt_err text;
  v_email_auth text;
  v_email_auth_err text;
  v_inv_count int;
  v_all_invitations jsonb;
begin
  v_email_claim := current_setting('request.jwt.claim.email', true);

  begin
    v_email_jwt := auth.jwt() ->> 'email';
  exception when others then
    v_email_jwt_err := SQLERRM;
  end;

  begin
    select email into v_email_auth from auth.users where id = v_user_id;
  exception when others then
    v_email_auth_err := SQLERRM;
  end;

  select count(*), jsonb_agg(jsonb_build_object(
    'email_stored', email,
    'email_lowered', lower(email),
    'accepted_at', accepted_at,
    'organization_id', organization_id
  ))
  into v_inv_count, v_all_invitations
  from public.organization_invitations;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email_from_claim', v_email_claim,
    'email_from_jwt', v_email_jwt,
    'email_from_jwt_error', v_email_jwt_err,
    'email_from_auth_users', v_email_auth,
    'email_from_auth_users_error', v_email_auth_err,
    'total_invitations_in_db', v_inv_count,
    'all_invitations_visible', v_all_invitations
  );
end;
$$;

grant execute on function public.accept_pending_invitation() to authenticated;
grant execute on function public.debug_my_email() to authenticated;
