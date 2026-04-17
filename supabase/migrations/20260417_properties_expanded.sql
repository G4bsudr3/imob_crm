-- =====================================================================
-- Properties: expanded fields (market-grade listing data)
-- =====================================================================

alter table public.properties
  -- listing
  add column if not exists listing_purpose text
    check (listing_purpose in ('sale', 'rent', 'both'))
    default 'sale',
  add column if not exists listing_status text
    check (listing_status in ('available', 'reserved', 'sold', 'rented'))
    default 'available',
  add column if not exists ref_code text,
  add column if not exists featured boolean default false,
  add column if not exists internal_notes text,
  -- financial
  add column if not exists rent_price numeric,
  add column if not exists condo_fee numeric,
  add column if not exists iptu numeric,
  add column if not exists accepts_financing boolean default false,
  add column if not exists accepts_fgts boolean default false,
  add column if not exists accepts_exchange boolean default false,
  -- dimensions
  add column if not exists total_area_m2 numeric,
  add column if not exists suites int,
  add column if not exists parking_spots int,
  add column if not exists floor int,
  add column if not exists year_built int,
  -- condition
  add column if not exists furnished text
    check (furnished in ('furnished', 'semi', 'unfurnished')),
  add column if not exists amenities text[] default '{}',
  -- address (structured)
  add column if not exists address_zip text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_state text,
  -- media
  add column if not exists video_url text,
  add column if not exists virtual_tour_url text;

-- Indexes for common filters
create index if not exists idx_properties_listing_status on public.properties(listing_status);
create index if not exists idx_properties_listing_purpose on public.properties(listing_purpose);
create index if not exists idx_properties_featured on public.properties(featured) where featured = true;

-- Backfill listing_status from legacy `available` boolean
update public.properties
set listing_status = case when available then 'available' else 'sold' end
where listing_status is null;

-- Keep `available` in sync with listing_status (derived)
create or replace function public.properties_sync_available()
returns trigger
language plpgsql
as $$
begin
  new.available = (coalesce(new.listing_status, 'available') = 'available');
  return new;
end;
$$;

drop trigger if exists properties_sync_available on public.properties;
create trigger properties_sync_available
  before insert or update on public.properties
  for each row execute function public.properties_sync_available();

-- Re-run the trigger logic on existing rows to align state
update public.properties set listing_status = listing_status;
