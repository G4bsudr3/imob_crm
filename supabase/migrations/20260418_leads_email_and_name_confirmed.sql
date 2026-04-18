-- Adds email + name_confirmed to leads.
-- name_confirmed tracks whether the AI confirmed the name with the lead
-- (vs. it being the raw WhatsApp pushName which can be "user_1234" etc).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS name_confirmed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email) WHERE email IS NOT NULL;
