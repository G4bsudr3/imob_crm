-- =====================================================================
-- Fix: permite que o criador de uma nova organização seja auto-promovido
-- a admin pelo trigger on_organization_created, sem ser bloqueado pelo
-- prevent_role_escalation.
--
-- Caso novo (3): usuário com organization_id=null ganhando admin na primeira
-- org que ainda não tem nenhum admin/manager — ou seja, ele é o criador.
-- Invariante: toda org tem exatamente um primeiro admin (quem criou).
-- =====================================================================

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
  v_has_other_admin boolean;
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

  -- Caso 3: criador da nova organização (primeiro admin).
  -- Só permite se a org ainda não tem admin/manager algum, garantindo
  -- que ninguém possa "invadir" uma org já estabelecida.
  if new.id = auth.uid()
     and old.organization_id is null
     and new.organization_id is not null
     and new.role = 'admin' then

    select exists(
      select 1 from public.profiles
      where organization_id = new.organization_id
        and role in ('admin', 'manager')
        and id <> auth.uid()
    ) into v_has_other_admin;

    if not v_has_other_admin then
      return new;
    end if;
  end if;

  raise exception 'Apenas administradores da organização podem alterar role ou organização'
    using errcode = '42501';
end;
$$;
