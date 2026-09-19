/*
# FRELUX PAINT CALC — Phase 2 foundation schema

Creates the full backend data system: profiles, site_settings, paint_types,
paint_products, material_prices, labor_rates, color_categories,
color_combinations, legal_pages, analytics_events — with RLS, an is_admin()
authorization function, a signup trigger, and seed data.

Order matters: is_admin() is created right after the profiles table so the
profiles RLS policies can reference it.
*/

-- =========================================================
-- Helper: set_updated_at()
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- profiles table (FIRST)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin','user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- is_admin() — created before any RLS policy that uses it
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Now enable RLS and policies on profiles
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop trigger if exists "profiles_set_updated_at" on public.profiles;
create trigger "profiles_set_updated_at"
before update on public.profiles
for each row execute function public.set_updated_at();

-- Trigger: create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists "on_auth_user_created" on auth.users;
create trigger "on_auth_user_created"
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- site_settings (single row)
-- =========================================================
create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  site_name text not null default 'FRELUX PAINT CALC',
  short_name text not null default 'FRELUX',
  tagline text not null default 'Plan Your Perfect Paint Project',
  description text not null default 'Calculate what you need, estimate what it may cost, and discover colors that can transform your space.',
  logo_url text,
  contact_email text not null default 'hello@freluxpaintcalc.com',
  whatsapp_number text not null default '2349063612439',
  default_currency text not null default 'NGN',
  default_currency_symbol text not null default '₦',
  default_unit text not null default 'meters' check (default_unit in ('meters','feet')),
  maintenance_mode boolean not null default false,
  seo_title text,
  seo_description text,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
on public.site_settings for select
to anon, authenticated
using (true);

drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write"
on public.site_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop trigger if exists "site_settings_set_updated_at" on public.site_settings;
create trigger "site_settings_set_updated_at"
before update on public.site_settings
for each row execute function public.set_updated_at();

-- =========================================================
-- paint_types
-- =========================================================
create table if not exists public.paint_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  coverage_rate numeric not null check (coverage_rate > 0),
  coverage_unit text not null default 'm2_per_liter',
  container_sizes int[] not null default '{1,4,20}',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paint_types enable row level security;

drop policy if exists "paint_types_public_read" on public.paint_types;
create policy "paint_types_public_read"
on public.paint_types for select
to anon, authenticated
using (is_active = true);

drop policy if exists "paint_types_admin_select" on public.paint_types;
create policy "paint_types_admin_select"
on public.paint_types for select
to authenticated
using (public.is_admin());

drop policy if exists "paint_types_admin_insert" on public.paint_types;
create policy "paint_types_admin_insert"
on public.paint_types for insert
to authenticated
with check (public.is_admin());

drop policy if exists "paint_types_admin_update" on public.paint_types;
create policy "paint_types_admin_update"
on public.paint_types for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "paint_types_admin_delete" on public.paint_types;
create policy "paint_types_admin_delete"
on public.paint_types for delete
to authenticated
using (public.is_admin());

drop trigger if exists "paint_types_set_updated_at" on public.paint_types;
create trigger "paint_types_set_updated_at"
before update on public.paint_types
for each row execute function public.set_updated_at();

-- =========================================================
-- paint_products
-- =========================================================
create table if not exists public.paint_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  paint_type_id uuid references public.paint_types(id) on delete set null,
  container_size numeric not null check (container_size > 0),
  price numeric not null check (price >= 0),
  currency text not null default 'NGN',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paint_products enable row level security;

drop policy if exists "paint_products_public_read" on public.paint_products;
create policy "paint_products_public_read"
on public.paint_products for select
to anon, authenticated
using (is_active = true);

drop policy if exists "paint_products_admin_select" on public.paint_products;
create policy "paint_products_admin_select"
on public.paint_products for select
to authenticated
using (public.is_admin());

drop policy if exists "paint_products_admin_insert" on public.paint_products;
create policy "paint_products_admin_insert"
on public.paint_products for insert
to authenticated
with check (public.is_admin());

drop policy if exists "paint_products_admin_update" on public.paint_products;
create policy "paint_products_admin_update"
on public.paint_products for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "paint_products_admin_delete" on public.paint_products;
create policy "paint_products_admin_delete"
on public.paint_products for delete
to authenticated
using (public.is_admin());

drop trigger if exists "paint_products_set_updated_at" on public.paint_products;
create trigger "paint_products_set_updated_at"
before update on public.paint_products
for each row execute function public.set_updated_at();

-- =========================================================
-- material_prices
-- =========================================================
create table if not exists public.material_prices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('primer','filler','putty','sandpaper','brushes','rollers','other')),
  unit text not null,
  price numeric not null check (price >= 0),
  currency text not null default 'NGN',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.material_prices enable row level security;

drop policy if exists "material_prices_public_read" on public.material_prices;
create policy "material_prices_public_read"
on public.material_prices for select
to anon, authenticated
using (is_active = true);

drop policy if exists "material_prices_admin_select" on public.material_prices;
create policy "material_prices_admin_select"
on public.material_prices for select
to authenticated
using (public.is_admin());

drop policy if exists "material_prices_admin_insert" on public.material_prices;
create policy "material_prices_admin_insert"
on public.material_prices for insert
to authenticated
with check (public.is_admin());

drop policy if exists "material_prices_admin_update" on public.material_prices;
create policy "material_prices_admin_update"
on public.material_prices for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "material_prices_admin_delete" on public.material_prices;
create policy "material_prices_admin_delete"
on public.material_prices for delete
to authenticated
using (public.is_admin());

drop trigger if exists "material_prices_set_updated_at" on public.material_prices;
create trigger "material_prices_set_updated_at"
before update on public.material_prices
for each row execute function public.set_updated_at();

-- =========================================================
-- labor_rates
-- =========================================================
create table if not exists public.labor_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate_per_sqm numeric not null check (rate_per_sqm >= 0),
  currency text not null default 'NGN',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.labor_rates enable row level security;

drop policy if exists "labor_rates_public_read" on public.labor_rates;
create policy "labor_rates_public_read"
on public.labor_rates for select
to anon, authenticated
using (is_active = true);

drop policy if exists "labor_rates_admin_select" on public.labor_rates;
create policy "labor_rates_admin_select"
on public.labor_rates for select
to authenticated
using (public.is_admin());

drop policy if exists "labor_rates_admin_insert" on public.labor_rates;
create policy "labor_rates_admin_insert"
on public.labor_rates for insert
to authenticated
with check (public.is_admin());

drop policy if exists "labor_rates_admin_update" on public.labor_rates;
create policy "labor_rates_admin_update"
on public.labor_rates for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "labor_rates_admin_delete" on public.labor_rates;
create policy "labor_rates_admin_delete"
on public.labor_rates for delete
to authenticated
using (public.is_admin());

drop trigger if exists "labor_rates_set_updated_at" on public.labor_rates;
create trigger "labor_rates_set_updated_at"
before update on public.labor_rates
for each row execute function public.set_updated_at();

-- =========================================================
-- color_categories
-- =========================================================
create table if not exists public.color_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.color_categories enable row level security;

drop policy if exists "color_categories_public_read" on public.color_categories;
create policy "color_categories_public_read"
on public.color_categories for select
to anon, authenticated
using (is_active = true);

drop policy if exists "color_categories_admin_select" on public.color_categories;
create policy "color_categories_admin_select"
on public.color_categories for select
to authenticated
using (public.is_admin());

drop policy if exists "color_categories_admin_insert" on public.color_categories;
create policy "color_categories_admin_insert"
on public.color_categories for insert
to authenticated
with check (public.is_admin());

drop policy if exists "color_categories_admin_update" on public.color_categories;
create policy "color_categories_admin_update"
on public.color_categories for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "color_categories_admin_delete" on public.color_categories;
create policy "color_categories_admin_delete"
on public.color_categories for delete
to authenticated
using (public.is_admin());

drop trigger if exists "color_categories_set_updated_at" on public.color_categories;
create trigger "color_categories_set_updated_at"
before update on public.color_categories
for each row execute function public.set_updated_at();

-- =========================================================
-- color_combinations
-- =========================================================
create table if not exists public.color_combinations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  main_color_name text not null,
  main_color_code text not null,
  secondary_color_name text not null,
  secondary_color_code text not null,
  accent_color_name text not null,
  accent_color_code text not null,
  recommended_rooms text[] not null default '{}',
  style text not null,
  image_url text not null,
  category_ids uuid[] not null default '{}',
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.color_combinations enable row level security;

drop policy if exists "color_combinations_public_read" on public.color_combinations;
create policy "color_combinations_public_read"
on public.color_combinations for select
to anon, authenticated
using (is_published = true);

drop policy if exists "color_combinations_admin_select" on public.color_combinations;
create policy "color_combinations_admin_select"
on public.color_combinations for select
to authenticated
using (public.is_admin());

drop policy if exists "color_combinations_admin_insert" on public.color_combinations;
create policy "color_combinations_admin_insert"
on public.color_combinations for insert
to authenticated
with check (public.is_admin());

drop policy if exists "color_combinations_admin_update" on public.color_combinations;
create policy "color_combinations_admin_update"
on public.color_combinations for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "color_combinations_admin_delete" on public.color_combinations;
create policy "color_combinations_admin_delete"
on public.color_combinations for delete
to authenticated
using (public.is_admin());

drop trigger if exists "color_combinations_set_updated_at" on public.color_combinations;
create trigger "color_combinations_set_updated_at"
before update on public.color_combinations
for each row execute function public.set_updated_at();

-- =========================================================
-- legal_pages
-- =========================================================
create table if not exists public.legal_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content text not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legal_pages enable row level security;

drop policy if exists "legal_pages_public_read" on public.legal_pages;
create policy "legal_pages_public_read"
on public.legal_pages for select
to anon, authenticated
using (is_published = true);

drop policy if exists "legal_pages_admin_select" on public.legal_pages;
create policy "legal_pages_admin_select"
on public.legal_pages for select
to authenticated
using (public.is_admin());

drop policy if exists "legal_pages_admin_insert" on public.legal_pages;
create policy "legal_pages_admin_insert"
on public.legal_pages for insert
to authenticated
with check (public.is_admin());

drop policy if exists "legal_pages_admin_update" on public.legal_pages;
create policy "legal_pages_admin_update"
on public.legal_pages for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "legal_pages_admin_delete" on public.legal_pages;
create policy "legal_pages_admin_delete"
on public.legal_pages for delete
to authenticated
using (public.is_admin());

drop trigger if exists "legal_pages_set_updated_at" on public.legal_pages;
create trigger "legal_pages_set_updated_at"
before update on public.legal_pages
for each row execute function public.set_updated_at();

-- =========================================================
-- analytics_events
-- =========================================================
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  params jsonb,
  page_path text,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

drop policy if exists "analytics_events_public_insert" on public.analytics_events;
create policy "analytics_events_public_insert"
on public.analytics_events for insert
to anon, authenticated
with check (true);

drop policy if exists "analytics_events_admin_read" on public.analytics_events;
create policy "analytics_events_admin_read"
on public.analytics_events for select
to authenticated
using (public.is_admin());

-- =========================================================
-- Seed: site_settings (single row)
-- =========================================================
insert into public.site_settings (id, site_name, short_name, tagline, description, contact_email, whatsapp_number)
values (
  '00000000-0000-0000-0000-000000000001',
  'FRELUX PAINT CALC',
  'FRELUX',
  'Plan Your Perfect Paint Project',
  'Calculate what you need, estimate what it may cost, and discover colors that can transform your space.',
  'hello@freluxpaintcalc.com',
  '2349063612439'
)
on conflict (id) do nothing;

-- =========================================================
-- Seed: paint_types
-- =========================================================
insert into public.paint_types (name, description, coverage_rate, coverage_unit, container_sizes, is_active, sort_order)
values
  ('Emulsion', 'Water-based wall paint for interior walls.', 10, 'm2_per_liter', '{1,4,20}', true, 1),
  ('Gloss', 'High-sheen finish for doors and trims.', 12, 'm2_per_liter', '{1,4}', true, 2),
  ('Satin', 'Soft-sheen finish for walls and woodwork.', 11, 'm2_per_liter', '{1,4,20}', true, 3),
  ('Enamel', 'Durable oil-based finish for metal and wood.', 13, 'm2_per_liter', '{1,4}', true, 4),
  ('Primer-only', 'Undercoat primer for prepared surfaces.', 12, 'm2_per_liter', '{1,4,20}', true, 5)
on conflict do nothing;

-- =========================================================
-- Seed: labor_rates
-- =========================================================
insert into public.labor_rates (name, rate_per_sqm, currency, is_active, sort_order)
values
  ('Standard painter', 1500, 'NGN', true, 1),
  ('Premium painter', 2500, 'NGN', true, 2)
on conflict do nothing;

-- =========================================================
-- Seed: material_prices
-- =========================================================
insert into public.material_prices (name, category, unit, price, currency, is_active, sort_order)
values
  ('General purpose primer', 'primer', 'liter', 5000, 'NGN', true, 1),
  ('Wall filler', 'filler', 'kg', 1500, 'NGN', true, 2),
  ('Surface putty', 'putty', 'kg', 1200, 'NGN', true, 3),
  ('Sandpaper assorted', 'sandpaper', 'pack', 1000, 'NGN', true, 4),
  ('Paint brush set', 'brushes', 'pack', 2000, 'NGN', true, 5),
  ('Roller kit', 'rollers', 'pack', 2500, 'NGN', true, 6)
on conflict do nothing;

-- =========================================================
-- Seed: color_categories
-- =========================================================
insert into public.color_categories (name, slug, is_active, sort_order)
values
  ('Living Room', 'living-room', true, 1),
  ('Bedroom', 'bedroom', true, 2),
  ('Kitchen', 'kitchen', true, 3),
  ('Exterior', 'exterior', true, 4),
  ('Modern', 'modern', true, 5),
  ('Luxury', 'luxury', true, 6),
  ('Neutral', 'neutral', true, 7),
  ('Warm', 'warm', true, 8),
  ('Bold', 'bold', true, 9)
on conflict (slug) do nothing;

-- =========================================================
-- Seed: color_combinations (published)
-- =========================================================
do $$
declare
  cat_living uuid; cat_bedroom uuid; cat_kitchen uuid; cat_exterior uuid;
  cat_modern uuid; cat_luxury uuid; cat_neutral uuid; cat_warm uuid; cat_bold uuid;
begin
  select id into cat_living from public.color_categories where slug='living-room';
  select id into cat_bedroom from public.color_categories where slug='bedroom';
  select id into cat_kitchen from public.color_categories where slug='kitchen';
  select id into cat_exterior from public.color_categories where slug='exterior';
  select id into cat_modern from public.color_categories where slug='modern';
  select id into cat_luxury from public.color_categories where slug='luxury';
  select id into cat_neutral from public.color_categories where slug='neutral';
  select id into cat_warm from public.color_categories where slug='warm';
  select id into cat_bold from public.color_categories where slug='bold';

  insert into public.color_combinations
    (title, slug, description, main_color_name, main_color_code, secondary_color_name, secondary_color_code, accent_color_name, accent_color_code, recommended_rooms, style, image_url, category_ids, is_published, sort_order)
  values
    ('Serene Living','serene-living','A calming blend of soft neutrals with a muted blue accent for airy living spaces.','Warm White','#F5F1E8','Soft Greige','#D9D2C5','Muted Blue','#7B9EA8','{Living Room,Hallway}','Modern minimalist with a relaxed, airy feel.','https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_living,cat_neutral,cat_modern], true, 1),
    ('Coastal Calm','coastal-calm','Crisp whites paired with sandy beige and a gentle seafoam green for a breezy coastal mood.','Crisp White','#FAFAFA','Sandy Beige','#E4D9C8','Seafoam Green','#A8C9B6','{Living Room,Bedroom}','Coastal and fresh, ideal for naturally lit rooms.','https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_living,cat_bedroom,cat_neutral], true, 2),
    ('Soft Sand','soft-sand','Warm sandy tones layered with cream and a subtle terracotta highlight.','Sand','#E3D5B5','Cream','#F8F0DE','Terracotta','#C97B5A','{Bedroom,Living Room}','Warm and inviting, perfect for cozy retreats.','https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_bedroom,cat_warm,cat_neutral], true, 3),
    ('Terracotta Dream','terracotta-dream','Earthy terracotta with deep cream and a forest green accent for a grounded, organic look.','Terracotta','#B5654A','Deep Cream','#EDE0C8','Forest Green','#3E5641','{Kitchen,Dining,Living Room}','Earthy and organic with a Mediterranean spirit.','https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_living,cat_kitchen,cat_warm,cat_bold], true, 4),
    ('Forest Retreat','forest-retreat','Deep forest green balanced with warm off-white and a brass accent for a sophisticated mood.','Forest Green','#2C4A3E','Off-White','#EFEAE0','Brass','#B08D57','{Bedroom,Study}','Moody and luxurious, suited to focused or restful rooms.','https://images.pexels.com/photos/6969833/pexels-photo-6969833.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_bedroom,cat_luxury,cat_bold], true, 5),
    ('Midnight Luxe','midnight-luxe','Deep navy paired with charcoal and a soft gold accent for a refined, contemporary feel.','Midnight Navy','#1B2A41','Charcoal','#3A3F44','Soft Gold','#C9A86A','{Living Room,Dining}','Bold and elegant with a contemporary edge.','https://images.pexels.com/photos/1571463/pexels-photo-1571463.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_living,cat_luxury,cat_bold], true, 6),
    ('Modern Cream Kitchen','modern-cream-kitchen','Clean cream cabinetry with matte black accents and a soft sage wall for a modern kitchen.','Cream','#F2EBDC','Soft Sage','#B8C5A6','Matte Black','#2B2B2B','{Kitchen}','Crisp, modern, and highly functional.','https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_kitchen,cat_modern,cat_neutral], true, 7),
    ('Warm Exterior Stone','warm-exterior-stone','Natural stone tones with crisp white trims and a deep olive accent for welcoming facades.','Stone','#C9B79C','Crisp White','#F4F1EA','Deep Olive','#5B5A3F','{Exterior,Entry}','Classic and welcoming with natural curb appeal.','https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_exterior,cat_warm,cat_neutral], true, 8),
    ('Modern Exterior Charcoal','modern-exterior-charcoal','Bold charcoal cladding with warm wood tones and crisp white for a striking modern facade.','Charcoal','#3A3A3A','Warm Wood','#A07855','Crisp White','#F0F0F0','{Exterior}','Architectural and modern with strong contrast.','https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200', array[cat_exterior,cat_modern,cat_bold], true, 9)
  on conflict (slug) do nothing;
end $$;

-- =========================================================
-- Seed: legal_pages (unpublished drafts)
-- =========================================================
insert into public.legal_pages (title, slug, content, is_published)
values
  ('Privacy Policy','privacy-policy','Draft privacy policy content. This will be finalized before launch.', false),
  ('Terms of Service','terms','Draft terms of service content. This will be finalized before launch.', false),
  ('Cookie Policy','cookie-policy','Draft cookie policy content. This will be finalized before launch.', false),
  ('Disclaimer','disclaimer','Draft disclaimer content. This will be finalized before launch.', false),
  ('AI Disclaimer','ai-disclaimer','Draft AI disclaimer content. This will be finalized before launch.', false)
on conflict (slug) do nothing;
