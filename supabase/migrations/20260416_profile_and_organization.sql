-- =====================================================================
-- Profiles + Organizations (imobiliária data)
-- =====================================================================

-- -------- PROFILES: expand ---------------------------------------------
alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles alter column name drop not null;

-- link profile.id to auth.users.id (if not already)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'profiles'
      and constraint_name = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- -------- ORGANIZATIONS: new --------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text,              -- razão social
  trade_name text,              -- nome fantasia
  cnpj text,
  state_registration text,      -- inscrição estadual (IE)
  creci text,                   -- registro CRECI
  email text,
  phone text,
  website text,
  logo_url text,
  address_zip text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,           -- UF
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -------- RLS ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

drop policy if exists "organizations_rw_authenticated" on public.organizations;
create policy "organizations_rw_authenticated"
  on public.organizations for all
  to authenticated using (true) with check (true);

-- -------- AUTO-CREATE profile on signup ---------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------- Backfill profiles for existing auth.users ---------------------
insert into public.profiles (id, name, email)
select u.id,
       coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
       u.email
from auth.users u
on conflict (id) do update
set email = excluded.email
where public.profiles.email is distinct from excluded.email;

-- -------- updated_at auto-touch -----------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();
