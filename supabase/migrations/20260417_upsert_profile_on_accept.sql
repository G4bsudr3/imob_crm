-- =====================================================================
-- Fix: UPSERT do profile (caso não exista) + debug estendido
-- =====================================================================

-- ---- Reset da invitation pra permitir nova tentativa ----------------
update public.organization_invitations
set accepted_at = null
where lower(email) = 'g.sudre@g4educacao.com';

-- ---- RPC com UPSERT -------------------------------------------------
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
  v_updated int;
begin
  if v_user_id is null then
    return null;
  end if;

  -- Resolver email
  v_email := nullif(current_setting('request.jwt.claim.email', true), '');
  if v_email is null or v_email = '' then
    begin v_email := auth.jwt() ->> 'email'; exception when others then v_email := null; end;
  end if;
  if v_email is null or v_email = '' then
    begin select email into v_email from auth.users where id = v_user_id; exception when others then v_email := null; end;
  end if;
  if v_email is null or v_email = '' then
    return null;
  end if;
  v_email := lower(trim(v_email));

  -- Buscar invitation pendente
  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  if v_org_id is null then
    return null;
  end if;

  -- UPSERT do profile (cria se não existir, atualiza se existir)
  insert into public.profiles (id, email, organization_id, role)
  values (v_user_id, v_email, v_org_id, coalesce(v_role, 'user'))
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        role            = excluded.role;

  get diagnostics v_updated = row_count;

  -- Só marca invitation como aceita se o profile realmente foi atualizado
  if v_updated > 0 then
    update public.organization_invitations
    set accepted_at = now()
    where lower(email) = v_email and accepted_at is null;
  end if;

  return v_org_id;
end;
$$;

-- ---- Debug estendido: mostra estado do profile ---------------------
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
  v_email_auth text;
  v_profile jsonb;
  v_inv_count int;
  v_all_invitations jsonb;
begin
  v_email_claim := current_setting('request.jwt.claim.email', true);
  begin v_email_jwt := auth.jwt() ->> 'email'; exception when others then null; end;
  begin select email into v_email_auth from auth.users where id = v_user_id; exception when others then null; end;

  select to_jsonb(p.*) into v_profile
    from public.profiles p where p.id = v_user_id;

  select count(*), jsonb_agg(jsonb_build_object(
    'email', email,
    'accepted_at', accepted_at,
    'organization_id', organization_id,
    'role', role
  ))
  into v_inv_count, v_all_invitations
  from public.organization_invitations;

  return jsonb_build_object(
    'user_id', v_user_id,
    'email_from_jwt', v_email_jwt,
    'email_from_claim', v_email_claim,
    'email_from_auth_users', v_email_auth,
    'profile_row', v_profile,
    'profile_exists', v_profile is not null,
    'total_invitations_in_db', v_inv_count,
    'all_invitations_visible', v_all_invitations
  );
end;
$$;

grant execute on function public.accept_pending_invitation() to authenticated;
grant execute on function public.debug_my_email() to authenticated;
