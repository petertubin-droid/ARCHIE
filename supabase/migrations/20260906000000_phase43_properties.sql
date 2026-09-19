-- =========================================================
-- Phase 43: Property Intelligence — property profiles
--
-- Prompt 4, Phase 2: unified property profile persistence.
-- Stores only what the user or a legitimate source provided —
-- every externally sourced value keeps provenance. Unknown
-- fields stay NULL; the risk-flag layer surfaces them as
-- explicit gaps. No market data is stored here (future
-- market-data tables will carry their own provenance), and
-- construction costs are NEVER stored as property value.
-- =========================================================

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Identity & name
  name text,

  -- Location (Phase 3). Country is ISO 3166-1 alpha-2 when known;
  -- NULL country means "requires confirmation" — never guessed.
  address text,
  country text check (country is null or (char_length(country) = 2 and country = upper(country))),
  region text,
  city text,
  district text,
  lat double precision check (lat is null or (lat between -90 and 90)),
  lng double precision check (lng is null or (lng between -180 and 180)),

  -- Property & building information
  property_type text check (property_type in
    ('detached','semi_detached','terraced','apartment','duplex','bungalow','commercial','land','other')),
  building_type text,
  number_of_buildings integer check (number_of_buildings is null or number_of_buildings > 0),
  number_of_floors integer check (number_of_floors is null or number_of_floors > 0),
  land_size double precision check (land_size is null or land_size > 0),
  land_unit text,
  construction_status text check (construction_status in
    ('planned','under_construction','completed','renovating','derelict','unknown')),

  -- Link to the user's Construction Intelligence project (Prompt 3).
  -- Set null if the project is deleted — the property survives.
  construction_project_id uuid references public.contractor_projects(id) on delete set null,

  -- Documents/images: [{ id, kind, provenance }] — storage keys only;
  -- the files themselves live in protected storage.
  documents jsonb not null default '[]'::jsonb,

  -- Whole-profile provenance (Phase 4): source, sourceType,
  -- collectedAt, confidence, verificationStatus.
  provenance jsonb
);

-- Row-level security: users see and manage only their own properties.
alter table public.properties enable row level security;

DROP POLICY IF EXISTS "users_select_own_properties" ON public.properties;

create policy "users_select_own_properties"
  on public.properties for select
  to authenticated
  using (created_by = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_properties" ON public.properties;

create policy "users_insert_own_properties"
  on public.properties for insert
  to authenticated
  with check (created_by = auth.uid());

DROP POLICY IF EXISTS "users_update_own_properties" ON public.properties;

create policy "users_update_own_properties"
  on public.properties for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_properties" ON public.properties;

create policy "users_delete_own_properties"
  on public.properties for delete
  to authenticated
  using (created_by = auth.uid());

-- Grants: authenticated users own-scope (RLS enforced), service role full.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.properties to service_role;

-- Keep updated_at current on edits.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- Index for the common "my properties" listing.
create index if not exists properties_created_by_idx on public.properties (created_by, created_at desc);
