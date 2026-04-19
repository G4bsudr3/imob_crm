-- Performance fixes (Supabase advisor):
--   1. Drop duplicate calendar_integrations indexes (keep pre-existing calendar_integrations_org_idx)
--   2. Add missing FK indexes on appointments, leads, oauth_states, org_invitations
--   3. Fix auth_rls_initplan: wrap auth.uid() in (SELECT auth.uid()) across all policies
--   4. Merge redundant profiles SELECT/UPDATE permissive policies into single policies

-- 1. Duplicate indexes
DROP INDEX IF EXISTS public.idx_cal_integrations_org;
DROP INDEX IF EXISTS public.idx_cal_integrations_user;

-- 2. FK indexes
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id         ON public.appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_property_id     ON public.appointments(property_id);
CREATE INDEX IF NOT EXISTS idx_appointments_gcal_user       ON public.appointments(google_calendar_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to            ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_oauth_states_organization_id ON public.oauth_states(organization_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id         ON public.oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_invited_by   ON public.organization_invitations(invited_by);

-- 3+4. profiles
DROP POLICY IF EXISTS profiles_select_own    ON public.profiles;
DROP POLICY IF EXISTS profiles_select_same_org ON public.profiles;
CREATE POLICY profiles_select_same_org ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (id = (SELECT auth.uid()))
    OR ((organization_id IS NOT NULL) AND (organization_id = current_user_org_id()))
  );

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own   ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_scoped ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    ((SELECT auth.uid()) = id)
    OR ((organization_id = current_user_org_id()) AND is_org_admin())
  )
  WITH CHECK (
    ((SELECT auth.uid()) = id)
    OR (organization_id IS NULL)
    OR (organization_id = current_user_org_id())
  );

-- leads
DROP POLICY IF EXISTS leads_select_scoped ON public.leads;
CREATE POLICY leads_select_scoped ON public.leads
  FOR SELECT TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (is_org_admin() OR (assigned_to IS NULL) OR (assigned_to = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS leads_update_scoped ON public.leads;
CREATE POLICY leads_update_scoped ON public.leads
  FOR UPDATE TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (is_org_admin() OR (assigned_to IS NULL) OR (assigned_to = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS leads_delete_scoped ON public.leads;
CREATE POLICY leads_delete_scoped ON public.leads
  FOR DELETE TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (is_org_admin() OR (assigned_to = (SELECT auth.uid())))
  );

-- conversations
DROP POLICY IF EXISTS conversations_select_scoped ON public.conversations;
CREATE POLICY conversations_select_scoped ON public.conversations
  FOR SELECT TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (
      is_org_admin()
      OR (EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = conversations.lead_id
          AND ((l.assigned_to IS NULL) OR (l.assigned_to = (SELECT auth.uid())))
      ))
    )
  );

-- appointments
DROP POLICY IF EXISTS appointments_select_scoped ON public.appointments;
CREATE POLICY appointments_select_scoped ON public.appointments
  FOR SELECT TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (
      is_org_admin()
      OR (EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = appointments.lead_id
          AND ((l.assigned_to IS NULL) OR (l.assigned_to = (SELECT auth.uid())))
      ))
    )
  );

DROP POLICY IF EXISTS appointments_update_scoped ON public.appointments;
CREATE POLICY appointments_update_scoped ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (
      is_org_admin()
      OR (EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = appointments.lead_id
          AND ((l.assigned_to IS NULL) OR (l.assigned_to = (SELECT auth.uid())))
      ))
    )
  );

DROP POLICY IF EXISTS appointments_delete_scoped ON public.appointments;
CREATE POLICY appointments_delete_scoped ON public.appointments
  FOR DELETE TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (
      is_org_admin()
      OR (EXISTS (
        SELECT 1 FROM leads l
        WHERE l.id = appointments.lead_id
          AND (l.assigned_to = (SELECT auth.uid()))
      ))
    )
  );

-- audit_logs
DROP POLICY IF EXISTS audit_logs_select_admin_manager ON public.audit_logs;
CREATE POLICY audit_logs_select_admin_manager ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = ANY(ARRAY['admin'::text, 'manager'::text])
    ))
  );

-- calendar_integrations
DROP POLICY IF EXISTS cal_select_own ON public.calendar_integrations;
CREATE POLICY cal_select_own ON public.calendar_integrations
  FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()))
    OR (organization_id = current_user_org_id())
  );

DROP POLICY IF EXISTS cal_insert_own ON public.calendar_integrations;
CREATE POLICY cal_insert_own ON public.calendar_integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (SELECT auth.uid()))
    AND (organization_id = current_user_org_id())
  );

DROP POLICY IF EXISTS cal_update_own ON public.calendar_integrations;
CREATE POLICY cal_update_own ON public.calendar_integrations
  FOR UPDATE TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS cal_delete_own ON public.calendar_integrations;
CREATE POLICY cal_delete_own ON public.calendar_integrations
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
