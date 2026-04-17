-- =====================================================================
-- Fix final: trigger de anti-escalação agora checa invitation direto
-- (não depende de GUC), e reset do estado do convidado g.sudre
-- =====================================================================

-- ---- 1. Reset: reabre a invitation órfã + limpa profile ------------
update public.organization_invitations
set accepted_at = null
where lower(email) = lower(trim(
  (select email from auth.users where email ilike 'g.sudre@g4educacao.com' limit 1)
));

-- ---- 2. Trigger de anti-escalação sem GUC ---------------------------
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_current_org uuid;
  v_user_email text;
  v_inv_match boolean := false;
begin
  -- Sem mudança em role/org, libera direto
  if new.role is not distinct from old.role
     and new.organization_id is not distinct from old.organization_id then
    return new;
  end if;

  v_is_admin := coalesce(public.is_org_admin(), false);
  v_current_org := public.current_user_org_id();

  -- Caso 1: admin/manager da org atual do usuário alvo
  if v_is_admin and old.organization_id = v_current_org then
    return new;
  end if;

  -- Caso 2: usuário aceitando convite (null → org com convite ativo)
  if new.id = auth.uid()
     and old.organization_id is null
     and new.organization_id is not null then

    -- Pega email de múltiplas fontes
    v_user_email := lower(trim(coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      (auth.jwt() ->> 'email')
    )));

    if v_user_email is null or v_user_email = '' then
      begin
        select lower(trim(email)) into v_user_email from auth.users where id = auth.uid();
      exception when others then
        v_user_email := null;
      end;
    end if;

    if v_user_email is not null and v_user_email != '' then
      select true into v_inv_match
        from public.organization_invitations
        where organization_id = new.organization_id
          and lower(email) = v_user_email;
    end if;

    if v_inv_match then
      return new;
    end if;
  end if;

  raise exception 'Apenas administradores da organização podem alterar role ou organização'
    using errcode = '42501';
end;
$$;

-- ---- 3. RPC simplificada (sem GUC) ----------------------------------
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

  v_email := nullif(current_setting('request.jwt.claim.email', true), '');
  if v_email is null or v_email = '' then
    begin
      v_email := auth.jwt() ->> 'email';
    exception when others then
      v_email := null;
    end;
  end if;
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

  -- O trigger agora permite essa transição porque checa invitation diretamente
  update public.profiles
  set organization_id = v_org_id,
      role = coalesce(v_role, 'user')
  where id = v_user_id;

  update public.organization_invitations
  set accepted_at = now()
  where lower(email) = v_email and accepted_at is null;

  return v_org_id;
end;
$$;

grant execute on function public.accept_pending_invitation() to authenticated;
