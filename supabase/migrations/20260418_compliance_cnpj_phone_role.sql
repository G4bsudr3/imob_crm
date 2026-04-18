-- Compliance/governance constraints.
-- 1) organizations.cnpj: normalize to digits-only via trigger + partial UNIQUE index.
-- 2) whatsapp_instances.connected_number: partial UNIQUE cross-org (same WhatsApp line cant be in 2 orgs).
-- 3) profiles.role: CHECK restricting to admin/manager/user.

-- ========= 1) CNPJ normalize + unique =========
CREATE OR REPLACE FUNCTION public.normalize_cnpj_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cnpj IS NOT NULL THEN
    NEW.cnpj := regexp_replace(NEW.cnpj, '\D', '', 'g');
    IF NEW.cnpj = '' THEN NEW.cnpj := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_normalize_cnpj ON public.organizations;
CREATE TRIGGER organizations_normalize_cnpj
BEFORE INSERT OR UPDATE OF cnpj ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.normalize_cnpj_trigger();

-- Backfill
UPDATE public.organizations SET cnpj = regexp_replace(cnpj, '\D', '', 'g') WHERE cnpj IS NOT NULL;
UPDATE public.organizations SET cnpj = NULL WHERE cnpj = '';

-- Partial unique (allows multiple NULLs, blocks duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_cnpj_unique
  ON public.organizations (cnpj)
  WHERE cnpj IS NOT NULL;

-- ========= 2) whatsapp connected_number: cross-org unique =========
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_number_unique
  ON public.whatsapp_instances (connected_number)
  WHERE connected_number IS NOT NULL;

-- ========= 3) profiles.role: CHECK =========
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'profiles'
      AND constraint_name = 'profiles_role_check_values'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check_values
      CHECK (role IN ('admin', 'manager', 'user'));
  END IF;
END $$;
