-- Invitation expiry (7 days default) + profile.phone unique per org.

-- 1) organization_invitations.expires_at
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

UPDATE public.organization_invitations
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL OR expires_at < created_at;

-- Rewrite accept_pending_invitation: only valid if not accepted AND not expired.
CREATE OR REPLACE FUNCTION public.accept_pending_invitation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_role text;
  v_updated int;
begin
  if v_user_id is null then return null; end if;

  v_email := nullif(current_setting('request.jwt.claim.email', true), '');
  if v_email is null or v_email = '' then
    begin v_email := auth.jwt() ->> 'email'; exception when others then v_email := null; end;
  end if;
  if v_email is null or v_email = '' then
    begin select email into v_email from auth.users where id = v_user_id; exception when others then v_email := null; end;
  end if;
  if v_email is null or v_email = '' then return null; end if;
  v_email := lower(trim(v_email));

  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;

  if v_org_id is null then return null; end if;

  insert into public.profiles (id, email, organization_id, role)
  values (v_user_id, v_email, v_org_id, coalesce(v_role, 'user'))
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        role            = excluded.role;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    update public.organization_invitations
    set accepted_at = now()
    where lower(email) = v_email and accepted_at is null and expires_at > now();
  end if;

  return v_org_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(new.email));
  v_org_id uuid;
  v_role text;
begin
  select organization_id, role
    into v_org_id, v_role
    from public.organization_invitations
    where lower(email) = v_email
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;

  insert into public.profiles (id, name, email, organization_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_org_id,
    coalesce(v_role, 'user')
  )
  on conflict (id) do nothing;

  if v_org_id is not null then
    update public.organization_invitations
    set accepted_at = now()
    where lower(email) = v_email and accepted_at is null and expires_at > now();
  end if;

  return new;
exception when others then
  raise log 'handle_new_user failed for % (sqlstate: %): %', new.email, SQLSTATE, SQLERRM;
  return new;
end;
$function$;

-- 2) profiles.phone unique per org (normalized to digits-only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_per_org
  ON public.profiles (organization_id, regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
  WHERE phone IS NOT NULL AND phone <> '';
