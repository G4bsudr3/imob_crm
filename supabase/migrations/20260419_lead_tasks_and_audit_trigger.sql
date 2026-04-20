-- lead_tasks: follow-up tasks per lead, created by agents/managers
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead ON public.lead_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_org ON public.lead_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_assigned ON public.lead_tasks(assigned_to);

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_tasks_select ON public.lead_tasks;
CREATE POLICY lead_tasks_select ON public.lead_tasks FOR SELECT
  USING (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS lead_tasks_insert ON public.lead_tasks;
CREATE POLICY lead_tasks_insert ON public.lead_tasks FOR INSERT
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS lead_tasks_update ON public.lead_tasks;
CREATE POLICY lead_tasks_update ON public.lead_tasks FOR UPDATE
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS lead_tasks_delete ON public.lead_tasks;
CREATE POLICY lead_tasks_delete ON public.lead_tasks FOR DELETE
  USING (organization_id = public.current_user_org_id());

-- Audit trigger for lead status/assignment changes (powers the timeline in LeadDetail)
CREATE OR REPLACE FUNCTION public.audit_leads_update_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.status,'') <> COALESCE(NEW.status,'') THEN
    PERFORM public.audit_log_write(
      NEW.organization_id, 'lead.status_changed', 'lead', NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'name', NEW.name)
    );
  END IF;
  IF COALESCE(OLD.assigned_to::text,'') <> COALESCE(NEW.assigned_to::text,'') THEN
    PERFORM public.audit_log_write(
      NEW.organization_id, 'lead.assigned', 'lead', NEW.id,
      jsonb_build_object(
        'from', OLD.assigned_to,
        'to', NEW.assigned_to,
        'name', NEW.name
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_audit_update ON public.leads;
CREATE TRIGGER leads_audit_update AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_leads_update_trigger();
