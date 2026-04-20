-- reminder_24h_sent_at: tracks when the 24h WhatsApp reminder was sent for an appointment
alter table appointments
  add column if not exists reminder_24h_sent_at timestamptz default null;

-- group_jid: WhatsApp group JID for weekly report messages
alter table whatsapp_instances
  add column if not exists group_jid text default null;
