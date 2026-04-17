-- Remove images column — app does not host images, only listing_url (external)
alter table public.properties drop column if exists images;
