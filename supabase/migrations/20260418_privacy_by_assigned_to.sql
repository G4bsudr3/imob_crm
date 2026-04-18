-- Privacy by assigned_to:
-- admin/manager always see everything within their org;
-- role=user only sees rows where the related lead is unassigned (shared triage)
-- OR assigned to themselves.
-- Applies to leads (direct), conversations + appointments (derived via lead.assigned_to).
--
-- Backward-compat: existing single-admin orgs are unaffected because they always pass
-- the is_org_admin() branch of the policy.

DROP POLICY IF EXISTS leads_select_same_org ON public.leads;
CREATE POLICY leads_select_scoped ON public.leads FOR SELECT
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS leads_update_same_org ON public.leads;
CREATE POLICY leads_update_scoped ON public.leads FOR UPDATE
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR assigned_to IS NULL
    OR assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS leads_delete_same_org ON public.leads;
CREATE POLICY leads_delete_scoped ON public.leads FOR DELETE
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR assigned_to = auth.uid()
  )
);

DROP POLICY IF EXISTS conversations_select_same_org ON public.conversations;
CREATE POLICY conversations_select_scoped ON public.conversations FOR SELECT
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = conversations.lead_id
        AND (l.assigned_to IS NULL OR l.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS appointments_select_same_org ON public.appointments;
CREATE POLICY appointments_select_scoped ON public.appointments FOR SELECT
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = appointments.lead_id
        AND (l.assigned_to IS NULL OR l.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS appointments_update_same_org ON public.appointments;
CREATE POLICY appointments_update_scoped ON public.appointments FOR UPDATE
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = appointments.lead_id
        AND (l.assigned_to IS NULL OR l.assigned_to = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS appointments_delete_same_org ON public.appointments;
CREATE POLICY appointments_delete_scoped ON public.appointments FOR DELETE
USING (
  organization_id = public.current_user_org_id()
  AND (
    public.is_org_admin()
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = appointments.lead_id
        AND l.assigned_to = auth.uid()
    )
  )
);
