-- =========================================================
-- FRELUX LOCATION INTELLIGENCE — canonical project location
--
-- Adds the canonical `location` JSONB column to the two project
-- entities. The column stores the sanitized canonical location record
-- (see src/lib/location-intelligence/model.ts):
--   latitude, longitude, accuracy_m, formatted_address, country,
--   country_code, region, city, postcode, place_id, source,
--   captured_at, verification
--
-- Principles:
-- - NULL means "location not set" — nothing is guessed or defaulted.
-- - No price/labour/market data lives here; regional resolution reads
--   the existing market_profiles architecture at runtime.
-- - RLS is inherited from the host tables (user-scoped select/update),
--   so one user's location is never exposed to another user.
-- =========================================================

-- Construction Intelligence projects.
-- NOTE: contractor_projects already carried a Phase-56 free-text
-- `location` column (empty in production — nothing stored free-text is a
-- canonical record). Convert it to the canonical jsonb shape so there is
-- exactly ONE location system. Non-JSON legacy text becomes NULL rather
-- than being guessed into a record.
alter table public.contractor_projects
  add column if not exists location jsonb;
alter table public.contractor_projects
  alter column location type jsonb
  using case
    when location is null or location = '' then null
    when location ~ '^\{' then location::jsonb
    else null
  end;

comment on column public.contractor_projects.location is
  'Canonical FRELUX location record (location-intelligence model). NULL = not set.';

-- Calculator / estimator projects
alter table public.user_projects
  add column if not exists location jsonb;

comment on column public.user_projects.location is
  'Canonical FRELUX location record (location-intelligence model). NULL = not set.';

-- Partial index: find projects that have a location cheaply.
create index if not exists idx_contractor_projects_with_location
  on public.contractor_projects (id)
  where location is not null;

create index if not exists idx_user_projects_with_location
  on public.user_projects (id)
  where location is not null;
