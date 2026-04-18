-- Per-instance secret used to validate Evolution API webhook calls.
-- evolution-proxy generates or reuses on instance `connect`; the URL configured
-- as Evolution webhook becomes `${supabaseUrl}/functions/v1/bot-webhook?s=<secret>`.
-- bot-webhook reads `?s=` query param and rejects if it doesn't match the stored value.

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS webhook_secret text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_webhook_secret
  ON public.whatsapp_instances (webhook_secret)
  WHERE webhook_secret IS NOT NULL;
