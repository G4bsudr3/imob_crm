-- Add listing_url: external URL of the property listing (own site, VivaReal, Zap, etc.)
alter table public.properties
  add column if not exists listing_url text;
