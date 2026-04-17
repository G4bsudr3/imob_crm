-- =====================================================================
-- RPC: accept_pending_invitation
-- Para usuários que já têm auth.users mas ainda não foram associados
-- a uma org. Chamado pelo client após login; se houver convite aberto
-- para o email, associa o profile e marca o convite como aceito.
-- =====================================================================

-- Atualiza trigger de anti-escalação para reconhecer um "modo convite"
-- durante o qual o próprio usuário pode mudar o próprio org_id/role
-- (sem ser admin), desde que esteja aceitando um invitation legítimo.
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
  -- Bypass durante aceitação legítima de convite (marcador transacional)
  if current_setting('app.invitation_accepting', true) = 'true' then
    return new;
  end if;

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

-- RPC para o client chamar
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

  -- Email do usuário atual (em auth.users)
  select lower(trim(email)) into v_email from auth.users where id = v_user_id;
  if v_email is null then
    return null;
  end if;

  -- Convite mais recente em aberto para esse email
  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email and accepted_at is null
    order by created_at desc
    limit 1;

  if v_org_id is null then
    return null;
  end if;

  -- Aplica o convite (bypass do trigger de anti-escalação)
  perform set_config('app.invitation_accepting', 'true', true);
  update public.profiles
  set organization_id = v_org_id,
      role = coalesce(v_role, 'user')
  where id = v_user_id;
  perform set_config('app.invitation_accepting', 'false', true);

  -- Marca convite(s) como aceito(s)
  update public.organization_invitations
  set accepted_at = now()
  where lower(email) = v_email and accepted_at is null;

  return v_org_id;
end;
$$;

grant execute on function public.accept_pending_invitation() to authenticated;
