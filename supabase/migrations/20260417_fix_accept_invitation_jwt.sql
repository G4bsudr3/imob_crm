-- =====================================================================
-- Fix: accept_pending_invitation lê email do JWT (mais confiável que
-- querying auth.users, que pode ter restrição de grants)
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

  -- 1. Primeiro tenta o email direto do JWT (funciona sem grants em auth.users)
  v_email := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));

  -- 2. Fallback: query auth.users (se JWT não tiver claim email)
  if v_email is null or v_email = '' then
    begin
      select lower(trim(email)) into v_email from auth.users where id = v_user_id;
    exception when others then
      v_email := null;
    end;
  end if;

  if v_email is null or v_email = '' then
    raise log 'accept_pending_invitation: could not resolve email for user %', v_user_id;
    return null;
  end if;

  raise log 'accept_pending_invitation: checking for invite for email=%', v_email;

  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  if v_org_id is null then
    raise log 'accept_pending_invitation: no pending invitation for email=%', v_email;
    return null;
  end if;

  -- Aplica convite com bypass do trigger de anti-escalação
  perform set_config('app.invitation_accepting', 'true', true);
  update public.profiles
  set organization_id = v_org_id,
      role = coalesce(v_role, 'user')
  where id = v_user_id;
  perform set_config('app.invitation_accepting', 'false', true);

  update public.organization_invitations
  set accepted_at = now()
  where lower(email) = v_email and accepted_at is null;

  raise log 'accept_pending_invitation: accepted org=% role=% for user=%', v_org_id, v_role, v_user_id;

  return v_org_id;
end;
$$;

-- Função de diagnóstico: retorna o que o JWT e auth.users reportam.
-- Útil pra debug quando accept_pending_invitation retorna null.
create or replace function public.debug_my_email()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt_email text;
  v_auth_email text;
  v_inv_count int;
begin
  v_jwt_email := auth.jwt() ->> 'email';

  begin
    select email into v_auth_email from auth.users where id = v_user_id;
  exception when others then
    v_auth_email := 'access_denied: ' || SQLERRM;
  end;

  select count(*) into v_inv_count
    from public.organization_invitations
    where lower(email) = lower(trim(coalesce(v_jwt_email, v_auth_email, '')))
      and accepted_at is null;

  return jsonb_build_object(
    'user_id', v_user_id,
    'jwt_email', v_jwt_email,
    'auth_email', v_auth_email,
    'pending_invitations_for_email', v_inv_count
  );
end;
$$;

grant execute on function public.accept_pending_invitation() to authenticated;
grant execute on function public.debug_my_email() to authenticated;
