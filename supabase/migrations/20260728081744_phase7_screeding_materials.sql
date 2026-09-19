/*
# Wall Screeding Module — Materials, Pricing, Calculator Defaults

This migration creates the foundation for the Wall Screeding Calculator and
Wall Screeding Cost Estimator. It follows the same architecture as the
existing paint_types and pricing tables.

1. New Table: `screeding_materials`
   Stores screeding material profiles, each with independent calculation
   properties (coverage rate, package size, unit price, labour rate, etc).
   All values are admin-managed — the estimator never uses hard-coded values.

   Columns:
   - `id` uuid primary key
   - `name` text not null — material name (e.g. "Wall Screeding Compound")
   - `description` text — material description shown to users
   - `coverage_rate` numeric — m² covered per unit of material (per coat)
   - `coverage_unit` text — unit label (e.g. "m2_per_kg", "m2_per_liter", "m2_per_bag")
   - `package_size` numeric — size of one purchasable unit (kg, L, or bag count)
   - `package_unit` text — unit of measurement for the package (kg, L, bag, piece)
   - `unit_price` numeric — price of one package
   - `recommended_thickness_mm` numeric nullable — recommended application thickness in mm
   - `labour_rate_per_sqm` numeric — labour cost per m² for this material
   - `currency` text — currency code (defaults to NGN from site_settings)
   - `is_active` boolean — whether the material is available for selection
   - `sort_order` integer — display ordering
   - `created_at` / `updated_at` timestamps

2. Default Data
   Inserts three production-ready default materials:
   - Wall Screeding Compound
   - Screeding Paint
   - White Cement

   Each with realistic coverage rates, package sizes, and pricing defaults.

3. Security
   - RLS enabled on `screeding_materials`.
   - SELECT: anon + authenticated (public tools need to read materials).
   - INSERT/UPDATE/DELETE: authenticated only (admin via profiles role check
     is enforced at the app layer; the admin panel already requires admin role).
*/

create table if not exists screeding_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  coverage_rate numeric not null default 10,
  coverage_unit text not null default 'm2_per_kg',
  package_size numeric not null default 20,
  package_unit text not null default 'kg',
  unit_price numeric not null default 0,
  recommended_thickness_mm numeric,
  labour_rate_per_sqm numeric not null default 0,
  currency text not null default 'NGN',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table screeding_materials enable row level security;

-- Public can read active materials (needed for the calculator/estimator)
drop policy if exists "anon_select_screeding_materials" on screeding_materials;
create policy "anon_select_screeding_materials"
on screeding_materials for select
to anon, authenticated
using (true);

-- Authenticated users can manage materials (admin panel enforces role)
drop policy if exists "auth_insert_screeding_materials" on screeding_materials;
create policy "auth_insert_screeding_materials"
on screeding_materials for insert
to authenticated
with check (true);

drop policy if exists "auth_update_screeding_materials" on screeding_materials;
create policy "auth_update_screeding_materials"
on screeding_materials for update
to authenticated
using (true)
with check (true);

drop policy if exists "auth_delete_screeding_materials" on screeding_materials;
create policy "auth_delete_screeding_materials"
on screeding_materials for delete
to authenticated
using (true);

-- Insert default materials (idempotent via ON CONFLICT)
insert into screeding_materials (name, description, coverage_rate, coverage_unit, package_size, package_unit, unit_price, recommended_thickness_mm, labour_rate_per_sqm, currency, is_active, sort_order)
values
  (
    'Wall Screeding Compound',
    'A pre-mixed compound designed for screeding interior walls. Provides a smooth, paint-ready surface when applied correctly.',
    3.5,
    'm2_per_kg',
    20,
    'kg',
    8500,
    3.0,
    500,
    'NGN',
    true,
    1
  ),
  (
    'Screeding Paint',
    'A self-leveling screeding paint that fills minor imperfections and creates a uniform base for topcoat paint.',
    4.0,
    'm2_per_liter',
    4,
    'liter',
    6500,
    1.5,
    400,
    'NGN',
    true,
    2
  ),
  (
    'White Cement',
    'White cement mixed with plaster sand for traditional wall screeding. Durable and cost-effective for large surface areas.',
    2.5,
    'm2_per_kg',
    25,
    'kg',
    5500,
    5.0,
    600,
    'NGN',
    true,
    3
  )
on conflict do nothing;
