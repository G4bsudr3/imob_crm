-- Fix UPDATE policies missing WITH CHECK (QA audit 2026-04-19):
-- Without WITH CHECK, a client can SET organization_id to any value after the
-- USING clause approves the original row — a silent multi-tenancy bypass.
-- Also: leads.assigned_to FK changed from NO ACTION to SET NULL so removing
-- a profile member does not block if they have leads assigned.

-- leads
DROP POLICY IF EXISTS leads_update_scoped ON public.leads;
CREATE POLICY leads_update_scoped ON public.leads
  FOR UPDATE TO authenticated
  USING (
    (organization_id = current_user_org_id())
    AND (is_org_admin() OR (assigned_to IS NULL) OR (assigned_to = (SELECT auth.uid())))
  )
  WITH CHECK (organization_id = current_user_org_id());

-- appointments
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
  )
  WITH CHECK (organization_id = current_user_org_id());

-- organization_invitations
DROP POLICY IF EXISTS invitations_update_admin ON public.organization_invitations;
CREATE POLICY invitations_update_admin ON public.organization_invitations
  FOR UPDATE TO authenticated
  USING  ((organization_id = current_user_org_id()) AND is_org_admin())
  WITH CHECK (organization_id = current_user_org_id());

-- leads.assigned_to: NO ACTION → SET NULL so profile deletion is not blocked
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
