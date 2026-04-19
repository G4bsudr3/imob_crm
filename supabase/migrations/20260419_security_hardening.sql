-- Security hardening (QA audit 2026-04-19):
--   1. Restrict dangerous functions: revoke anon/PUBLIC grants, grant only to service_role/authenticated as needed
--      - get_org_calendar_integration: anon-callable → exposed OAuth tokens
--      - debug_my_email: authenticated-callable → exposed all org invitations
--      - seed_demo_data / seed_my_org_demo: anon-callable → could pollute any org
--      - cleanup_expired_oauth_states: anon-callable → no need for anon access
--   2. Add missing 'remarcado' to appointments_status_check
--   3. Drop duplicate profiles_role_check_values (identical to profiles_role_check, different ordering)

-- 1. Function grants
REVOKE EXECUTE ON FUNCTION public.get_org_calendar_integration(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_org_calendar_integration(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.debug_my_email() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.debug_my_email() TO service_role;

REVOKE EXECUTE ON FUNCTION public.seed_demo_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_my_org_demo() FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_oauth_states() TO service_role;

-- 2. appointments status enum
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check
  CHECK (status = ANY (ARRAY['agendado','confirmado','cancelado','realizado','remarcado']));

-- 3. Duplicate CHECK constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check_values;
