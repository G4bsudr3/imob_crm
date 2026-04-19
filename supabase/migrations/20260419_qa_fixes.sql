-- QA fixes:
--   1. profiles.role default 'agent' -> 'user' (matches CHECK constraint)
--   2. Remove duplicate calendar_integrations policies left by pre-existing DB state
--   3. oauth_states: add explicit deny policy so authenticated clients can't bypass RLS
--      (Edge Functions use service_role and bypass RLS anyway)

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'user';

DROP POLICY IF EXISTS calendar_read_own   ON public.calendar_integrations;
DROP POLICY IF EXISTS calendar_delete_own ON public.calendar_integrations;

DROP POLICY IF EXISTS oauth_states_no_direct_access ON public.oauth_states;
CREATE POLICY oauth_states_no_direct_access ON public.oauth_states
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
