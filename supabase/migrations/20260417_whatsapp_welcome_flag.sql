-- Flag pra evitar reenviar a mensagem de welcome a cada polling de status
alter table public.whatsapp_instances
  add column if not exists welcome_sent_at timestamptz;
