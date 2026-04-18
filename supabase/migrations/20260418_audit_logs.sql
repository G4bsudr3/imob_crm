-- Audit log for multi-tenant governance.
-- Captures admin actions: role/org changes, member removals, invite create/revoke/accept,
-- lead deletions, organization data edits. Read-only for admins/managers; writes only via triggers.

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_admin_manager ON public.audit_logs;
CREATE POLICY audit_logs_select_admin_manager
  ON public.audit_logs FOR SELECT
  USING (
    organization_id = public.current_user_org_id()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager'))
  );

DROP POLICY IF EXISTS audit_logs_insert_none ON public.audit_logs;
CREATE POLICY audit_logs_insert_none ON public.audit_logs FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS audit_logs_update_none ON public.audit_logs;
CREATE POLICY audit_logs_update_none ON public.audit_logs FOR UPDATE USING (false);
DROP POLICY IF EXISTS audit_logs_delete_none ON public.audit_logs;
CREATE POLICY audit_logs_delete_none ON public.audit_logs FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION public.audit_log_write(
  p_org_id uuid, p_action text, p_target_type text, p_target_id uuid, p_metadata jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid := auth.uid(); v_email text;
BEGIN
  IF v_actor IS NOT NULL THEN
    BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_actor; EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  END IF;
  INSERT INTO public.audit_logs (organization_id, actor_id, actor_email, action, target_type, target_id, metadata)
  VALUES (p_org_id, v_actor, v_email, p_action, p_target_type, p_target_id, p_metadata);
END;
$$;

-- profiles: role/org changes + removal
CREATE OR REPLACE FUNCTION public.audit_profiles_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NULL THEN
    PERFORM public.audit_log_write(OLD.organization_id, 'member.removed', 'profile', NEW.id,
      jsonb_build_object('member_email', OLD.email, 'member_name', OLD.name, 'old_role', OLD.role));
    RETURN NEW;
  END IF;
  IF COALESCE(OLD.role,'') <> COALESCE(NEW.role,'') THEN
    PERFORM public.audit_log_write(COALESCE(NEW.organization_id, OLD.organization_id),
      'member.role_changed', 'profile', NEW.id,
      jsonb_build_object('member_email', NEW.email, 'member_name', NEW.name, 'from', OLD.role, 'to', NEW.role));
  END IF;
  IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT NULL AND OLD.organization_id <> NEW.organization_id THEN
    PERFORM public.audit_log_write(NEW.organization_id, 'member.org_changed', 'profile', NEW.id,
      jsonb_build_object('from_org', OLD.organization_id, 'to_org', NEW.organization_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_audit ON public.profiles;
CREATE TRIGGER profiles_audit AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_trigger();

-- organization_invitations: create / revoke / accept
CREATE OR REPLACE FUNCTION public.audit_invitations_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.audit_log_write(NEW.organization_id, 'invitation.created', 'invitation', NEW.id,
      jsonb_build_object('email', NEW.email, 'role', NEW.role, 'expires_at', NEW.expires_at));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.audit_log_write(OLD.organization_id, 'invitation.revoked', 'invitation', OLD.id,
      jsonb_build_object('email', OLD.email, 'role', OLD.role, 'accepted', OLD.accepted_at IS NOT NULL));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    PERFORM public.audit_log_write(NEW.organization_id, 'invitation.accepted', 'invitation', NEW.id,
      jsonb_build_object('email', NEW.email, 'role', NEW.role));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitations_audit ON public.organization_invitations;
CREATE TRIGGER invitations_audit AFTER INSERT OR UPDATE OR DELETE ON public.organization_invitations
FOR EACH ROW EXECUTE FUNCTION public.audit_invitations_trigger();

-- leads DELETE
CREATE OR REPLACE FUNCTION public.audit_leads_delete_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.audit_log_write(OLD.organization_id, 'lead.deleted', 'lead', OLD.id,
    jsonb_build_object('name', OLD.name, 'phone', OLD.phone, 'status', OLD.status));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS leads_audit_delete ON public.leads;
CREATE TRIGGER leads_audit_delete AFTER DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.audit_leads_delete_trigger();

-- organizations UPDATE (sensitive fields only)
CREATE OR REPLACE FUNCTION public.audit_organizations_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_changed jsonb := '{}'::jsonb;
BEGIN
  IF COALESCE(OLD.cnpj,'') <> COALESCE(NEW.cnpj,'') THEN v_changed := v_changed || jsonb_build_object('cnpj', jsonb_build_object('from', OLD.cnpj, 'to', NEW.cnpj)); END IF;
  IF COALESCE(OLD.legal_name,'') <> COALESCE(NEW.legal_name,'') THEN v_changed := v_changed || jsonb_build_object('legal_name', jsonb_build_object('from', OLD.legal_name, 'to', NEW.legal_name)); END IF;
  IF COALESCE(OLD.email,'') <> COALESCE(NEW.email,'') THEN v_changed := v_changed || jsonb_build_object('email', jsonb_build_object('from', OLD.email, 'to', NEW.email)); END IF;
  IF v_changed <> '{}'::jsonb THEN
    PERFORM public.audit_log_write(NEW.id, 'org.updated', 'organization', NEW.id, v_changed);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_audit ON public.organizations;
CREATE TRIGGER organizations_audit AFTER UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_organizations_trigger();
