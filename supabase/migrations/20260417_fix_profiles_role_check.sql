-- =====================================================================
-- Fix: profiles.role check constraint estava barrando 'user' / 'manager'
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'manager', 'admin'));

-- Reset invitation (pra permitir nova tentativa após fix)
update public.organization_invitations
set accepted_at = null
where lower(email) = 'g.sudre@g4educacao.com';
