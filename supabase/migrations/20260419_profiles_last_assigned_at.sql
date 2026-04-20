-- last_assigned_at: tracks when this agent was last assigned a lead (used for round-robin)
alter table profiles
  add column if not exists last_assigned_at timestamptz default null;
