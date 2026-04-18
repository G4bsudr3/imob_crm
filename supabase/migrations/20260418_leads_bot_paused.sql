-- Pauses the AI bot after a lead is agendado or escalated to a human corretor.
-- When bot_paused=true, bot-webhook saves incoming messages but does NOT respond;
-- the broker assumes the conversation via WhatsApp.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_paused_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bot_paused_reason text;
CREATE INDEX IF NOT EXISTS idx_leads_bot_paused ON public.leads (bot_paused) WHERE bot_paused = true;
