-- Compound indexes for bot-webhook hot paths:
--   daily count per org: (organization_id, direction, sent_at DESC)
--   burst count per lead: (lead_id, sent_at DESC)
--   daily AI cost cap: partial on (organization_id, sent_at DESC) where ai_tokens_used > 0

CREATE INDEX IF NOT EXISTS idx_conversations_org_sent_direction
  ON public.conversations (organization_id, direction, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_lead_sent
  ON public.conversations (lead_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_org_ai_sent
  ON public.conversations (organization_id, sent_at DESC)
  WHERE ai_tokens_used IS NOT NULL AND ai_tokens_used > 0;
