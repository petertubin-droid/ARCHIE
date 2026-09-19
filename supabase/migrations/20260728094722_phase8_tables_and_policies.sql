/*
# Phase 8: Color Library Expansion — Tables, Policies, Indexes

Creates all new tables for the professional color library system:
- color_families
- paint_colors (core library, scalable to 1,000+)
- user_favorites
- user_projects
- user_collections
- user_collection_items
- recently_viewed_colors

Also expands color_categories (adds description + type) and
color_combinations (adds trim/ceiling/door/property/featured/trending columns).

All tables get RLS with appropriate policies.
*/

-- =========================================================
-- color_families
-- =========================================================
create table if not exists public.color_families (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.color_families enable row level security;

drop policy if exists "color_families_public_read" on public.color_families;
create policy "color_families_public_read" on public.color_families for select to anon, authenticated using (is_active = true);
drop policy if exists "color_families_admin_select" on public.color_families;
create policy "color_families_admin_select" on public.color_families for select to authenticated using (public.is_admin());
drop policy if exists "color_families_admin_insert" on public.color_families;
create policy "color_families_admin_insert" on public.color_families for insert to authenticated with check (public.is_admin());
drop policy if exists "color_families_admin_update" on public.color_families;
create policy "color_families_admin_update" on public.color_families for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "color_families_admin_delete" on public.color_families;
create policy "color_families_admin_delete" on public.color_families for delete to authenticated using (public.is_admin());

drop trigger if exists "color_families_set_updated_at" on public.color_families;
create trigger "color_families_set_updated_at" before update on public.color_families for each row execute function public.set_updated_at();

-- =========================================================
-- Expand color_categories
-- =========================================================
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_categories' and column_name='description') then
    alter table public.color_categories add column description text;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_categories' and column_name='type') then
    alter table public.color_categories add column type text not null default 'room' check (type in ('room','style','surface','collection','seasonal'));
  end if;
end $$;

-- =========================================================
-- paint_colors (core library)
-- =========================================================
create table if not exists public.paint_colors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  hex_code text not null,
  rgb_r int not null check (rgb_r >= 0 and rgb_r <= 255),
  rgb_g int not null check (rgb_g >= 0 and rgb_g <= 255),
  rgb_b int not null check (rgb_b >= 0 and rgb_b <= 255),
  hsl_h numeric not null check (hsl_h >= 0 and hsl_h <= 360),
  hsl_s numeric not null check (hsl_s >= 0 and hsl_s <= 100),
  hsl_l numeric not null check (hsl_l >= 0 and hsl_l <= 100),
  color_family_id uuid references public.color_families(id) on delete set null,
  category_id uuid references public.color_categories(id) on delete set null,
  recommended_usage text[] not null default '{}',
  finish_compatibility text[] not null default '{}',
  is_interior boolean not null default true,
  is_exterior boolean not null default false,
  popularity_score int not null default 0,
  is_featured boolean not null default false,
  is_trending boolean not null default false,
  display_order int not null default 0,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_paint_colors_family on public.paint_colors(color_family_id);
create index if not exists idx_paint_colors_category on public.paint_colors(category_id);
create index if not exists idx_paint_colors_active on public.paint_colors(is_active);
create index if not exists idx_paint_colors_featured on public.paint_colors(is_featured) where is_featured = true;
create index if not exists idx_paint_colors_trending on public.paint_colors(is_trending) where is_trending = true;
create index if not exists idx_paint_colors_popularity on public.paint_colors(popularity_score desc);
create index if not exists idx_paint_colors_display_order on public.paint_colors(display_order);
create index if not exists idx_paint_colors_slug on public.paint_colors(slug);

alter table public.paint_colors enable row level security;

drop policy if exists "paint_colors_public_read" on public.paint_colors;
create policy "paint_colors_public_read" on public.paint_colors for select to anon, authenticated using (is_active = true);
drop policy if exists "paint_colors_admin_select" on public.paint_colors;
create policy "paint_colors_admin_select" on public.paint_colors for select to authenticated using (public.is_admin());
drop policy if exists "paint_colors_admin_insert" on public.paint_colors;
create policy "paint_colors_admin_insert" on public.paint_colors for insert to authenticated with check (public.is_admin());
drop policy if exists "paint_colors_admin_update" on public.paint_colors;
create policy "paint_colors_admin_update" on public.paint_colors for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "paint_colors_admin_delete" on public.paint_colors;
create policy "paint_colors_admin_delete" on public.paint_colors for delete to authenticated using (public.is_admin());

drop trigger if exists "paint_colors_set_updated_at" on public.paint_colors;
create trigger "paint_colors_set_updated_at" before update on public.paint_colors for each row execute function public.set_updated_at();

-- =========================================================
-- Expand color_combinations
-- =========================================================
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='trim_color_name') then alter table public.color_combinations add column trim_color_name text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='trim_color_code') then alter table public.color_combinations add column trim_color_code text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='ceiling_color_name') then alter table public.color_combinations add column ceiling_color_name text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='ceiling_color_code') then alter table public.color_combinations add column ceiling_color_code text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='door_color_name') then alter table public.color_combinations add column door_color_name text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='door_color_code') then alter table public.color_combinations add column door_color_code text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='property_type') then alter table public.color_combinations add column property_type text; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='is_interior') then alter table public.color_combinations add column is_interior boolean default true; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='is_featured') then alter table public.color_combinations add column is_featured boolean not null default false; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='is_trending') then alter table public.color_combinations add column is_trending boolean not null default false; end if; end $$;
do $$ begin if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='color_combinations' and column_name='popularity_score') then alter table public.color_combinations add column popularity_score int not null default 0; end if; end $$;

create index if not exists idx_color_combos_featured on public.color_combinations(is_featured) where is_featured = true;
create index if not exists idx_color_combos_trending on public.color_combinations(is_trending) where is_trending = true;
create index if not exists idx_color_combos_style on public.color_combinations(style);
create index if not exists idx_color_combos_popularity on public.color_combinations(popularity_score desc);

-- =========================================================
-- user_favorites
-- =========================================================
create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('color','palette')),
  color_id uuid references public.paint_colors(id) on delete cascade,
  palette_id uuid references public.color_combinations(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((item_type = 'color' and color_id is not null) or (item_type = 'palette' and palette_id is not null))
);
create index if not exists idx_user_fav_user on public.user_favorites(user_id);
create index if not exists idx_user_fav_type on public.user_favorites(item_type);

alter table public.user_favorites enable row level security;
drop policy if exists "user_fav_select_own" on public.user_favorites;
create policy "user_fav_select_own" on public.user_favorites for select to authenticated using (auth.uid() = user_id);
drop policy if exists "user_fav_insert_own" on public.user_favorites;
create policy "user_fav_insert_own" on public.user_favorites for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_fav_delete_own" on public.user_favorites;
create policy "user_fav_delete_own" on public.user_favorites for delete to authenticated using (auth.uid() = user_id);

-- =========================================================
-- user_projects
-- =========================================================
create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  project_type text not null check (project_type in ('screeding','paint_calc','cost_estimate','ai_recommendation','custom')),
  project_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_proj_user on public.user_projects(user_id);
create index if not exists idx_user_proj_type on public.user_projects(project_type);
create index if not exists idx_user_proj_created on public.user_projects(created_at desc);

alter table public.user_projects enable row level security;
drop policy if exists "user_proj_select_own" on public.user_projects;
create policy "user_proj_select_own" on public.user_projects for select to authenticated using (auth.uid() = user_id);
drop policy if exists "user_proj_insert_own" on public.user_projects;
create policy "user_proj_insert_own" on public.user_projects for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_proj_update_own" on public.user_projects;
create policy "user_proj_update_own" on public.user_projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_proj_delete_own" on public.user_projects;
create policy "user_proj_delete_own" on public.user_projects for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists "user_proj_set_updated_at" on public.user_projects;
create trigger "user_proj_set_updated_at" before update on public.user_projects for each row execute function public.set_updated_at();

-- =========================================================
-- user_collections
-- =========================================================
create table if not exists public.user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_user_coll_user on public.user_collections(user_id);

alter table public.user_collections enable row level security;
drop policy if exists "user_coll_select_own" on public.user_collections;
create policy "user_coll_select_own" on public.user_collections for select to authenticated using (auth.uid() = user_id);
drop policy if exists "user_coll_insert_own" on public.user_collections;
create policy "user_coll_insert_own" on public.user_collections for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_coll_update_own" on public.user_collections;
create policy "user_coll_update_own" on public.user_collections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_coll_delete_own" on public.user_collections;
create policy "user_coll_delete_own" on public.user_collections for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists "user_coll_set_updated_at" on public.user_collections;
create trigger "user_coll_set_updated_at" before update on public.user_collections for each row execute function public.set_updated_at();

-- =========================================================
-- user_collection_items
-- =========================================================
create table if not exists public.user_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  color_id uuid not null references public.paint_colors(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (collection_id, color_id)
);
create index if not exists idx_user_coll_items_coll on public.user_collection_items(collection_id);
create index if not exists idx_user_coll_items_color on public.user_collection_items(color_id);

alter table public.user_collection_items enable row level security;
drop policy if exists "user_coll_items_select_own" on public.user_collection_items;
create policy "user_coll_items_select_own" on public.user_collection_items for select to authenticated using (exists (select 1 from public.user_collections where id = collection_id and user_id = auth.uid()));
drop policy if exists "user_coll_items_insert_own" on public.user_collection_items;
create policy "user_coll_items_insert_own" on public.user_collection_items for insert to authenticated with check (exists (select 1 from public.user_collections where id = collection_id and user_id = auth.uid()));
drop policy if exists "user_coll_items_delete_own" on public.user_collection_items;
create policy "user_coll_items_delete_own" on public.user_collection_items for delete to authenticated using (exists (select 1 from public.user_collections where id = collection_id and user_id = auth.uid()));

-- =========================================================
-- recently_viewed_colors
-- =========================================================
create table if not exists public.recently_viewed_colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  color_id uuid not null references public.paint_colors(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists idx_recent_user on public.recently_viewed_colors(user_id);
create index if not exists idx_recent_viewed on public.recently_viewed_colors(user_id, viewed_at desc);
create unique index if not exists idx_recent_unique on public.recently_viewed_colors(user_id, color_id);

alter table public.recently_viewed_colors enable row level security;
drop policy if exists "recent_colors_select_own" on public.recently_viewed_colors;
create policy "recent_colors_select_own" on public.recently_viewed_colors for select to authenticated using (auth.uid() = user_id);
drop policy if exists "recent_colors_insert_own" on public.recently_viewed_colors;
create policy "recent_colors_insert_own" on public.recently_viewed_colors for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "recent_colors_delete_own" on public.recently_viewed_colors;
create policy "recent_colors_delete_own" on public.recently_viewed_colors for delete to authenticated using (auth.uid() = user_id);

-- =========================================================
-- Helper functions
-- =========================================================
create or replace function public.hex_to_rgb(hex text)
returns table(r int, g int, b int) language sql immutable as $$
  select ('x' || substring(hex from 2 for 2))::bit(8)::int, ('x' || substring(hex from 4 for 2))::bit(8)::int, ('x' || substring(hex from 6 for 2))::bit(8)::int;
$$;

create or replace function public.rgb_to_hsl(r int, g int, b int)
returns table(h numeric, s numeric, l numeric) language sql immutable as $$
  with rgb as (select r::numeric/255.0 rr, g::numeric/255.0 gg, b::numeric/255.0 bb),
  calc as (select rr,gg,bb, greatest(rr,gg,bb) mx, least(rr,gg,bb) mn, (greatest(rr,gg,bb)+least(rr,gg,bb))/2.0 l from rgb),
  sat as (select calc.*, case when mx=mn then 0 when l>0.5 then (mx-mn)/(2.0-mx-mn) else (mx-mn)/(mx+mn) end s from calc),
  hc as (select case when mx=mn then 0::numeric when mx=rr then 60.0*(((gg-bb)/(mx-mn))%6) when mx=gg then 60.0*((bb-rr)/(mx-mn)+2) else 60.0*((rr-gg)/(mx-mn)+4) end rh, s, l from sat)
  select case when rh<0 then rh+360.0 else rh end, s*100.0, l*100.0 from hc;
$$;

create or replace function public.add_paint_color(
  p_name text, p_slug text, p_hex text, p_family_slug text, p_cat_slug text,
  p_usage text[], p_finish text[], p_interior boolean, p_exterior boolean,
  p_popularity int, p_featured boolean, p_trending boolean, p_display_order int
) returns void language plpgsql as $$
declare v_r int; v_g int; v_b int; v_h numeric; v_s numeric; v_l numeric; v_fid uuid; v_cid uuid;
begin
  select r,g,b into v_r,v_g,v_b from public.hex_to_rgb(p_hex);
  select h,s,l into v_h,v_s,v_l from public.rgb_to_hsl(v_r,v_g,v_b);
  select id into v_fid from public.color_families where slug=p_family_slug;
  select id into v_cid from public.color_categories where slug=p_cat_slug;
  insert into public.paint_colors (name,slug,hex_code,rgb_r,rgb_g,rgb_b,hsl_h,hsl_s,hsl_l,color_family_id,category_id,recommended_usage,finish_compatibility,is_interior,is_exterior,popularity_score,is_featured,is_trending,display_order,is_active)
  values (p_name,p_slug,p_hex,v_r,v_g,v_b,v_h,v_s,v_l,v_fid,v_cid,p_usage,p_finish,p_interior,p_exterior,p_popularity,p_featured,p_trending,p_display_order,true)
  on conflict (slug) do nothing;
end;
$$;

-- =========================================================
-- Seed color_families
-- =========================================================
insert into public.color_families (name, slug, description, is_active, sort_order) values
  ('White','white','Pure, off-white and cream tones',true,1),
  ('Black','black','Deep blacks and near-blacks',true,2),
  ('Gray','gray','Cool and warm grays',true,3),
  ('Beige','beige','Warm sandy and neutral beige tones',true,4),
  ('Blue','blue','Navy, sky, teal and blue accents',true,5),
  ('Green','green','Sage, forest, olive and mint tones',true,6),
  ('Brown','brown','Earth browns, tans and warm wood tones',true,7),
  ('Red','red','Brick, burgundy and warm red tones',true,8),
  ('Yellow','yellow','Warm yellows, gold and ochre',true,9),
  ('Orange','orange','Terracotta, rust and warm orange tones',true,10),
  ('Purple','purple','Lavender, plum and muted purples',true,11),
  ('Pink','pink','Soft pinks, blush and rose tones',true,12)
on conflict (slug) do nothing;

-- =========================================================
-- Seed expanded color_categories
-- =========================================================
insert into public.color_categories (name, slug, is_active, sort_order, type) values
  ('Exterior Wall Colors','exterior-wall-colors',true,1,'surface'),
  ('Interior Wall Colors','interior-wall-colors',true,2,'surface'),
  ('Ceiling Colors','ceiling-colors',true,3,'surface'),
  ('Accent Colors','accent-colors',true,4,'surface'),
  ('Trim Colors','trim-colors',true,5,'surface'),
  ('Door Colors','door-colors',true,6,'surface'),
  ('Garage Door Colors','garage-door-colors',true,7,'surface'),
  ('Shutter Colors','shutter-colors',true,8,'surface'),
  ('Roof Colors','roof-colors',true,9,'surface'),
  ('Brick Colors','brick-colors',true,10,'surface'),
  ('Stone Colors','stone-colors',true,11,'surface'),
  ('Cladding Colors','cladding-colors',true,12,'surface'),
  ('Fence Colors','fence-colors',true,13,'surface'),
  ('Compound Wall Colors','compound-wall-colors',true,14,'surface'),
  ('Kitchen Colors','kitchen-colors',true,15,'room'),
  ('Bathroom Colors','bathroom-colors',true,16,'room'),
  ('Bedroom Colors','bedroom-colors',true,17,'room'),
  ('Living Room Colors','living-room-colors',true,18,'room'),
  ('Dining Room Colors','dining-room-colors',true,19,'room'),
  ('Office Colors','office-colors',true,20,'room'),
  ('Luxury Colors','luxury-colors',true,21,'style'),
  ('Contemporary Colors','contemporary-colors',true,22,'style'),
  ('Modern Colors','modern-colors',true,23,'style'),
  ('Traditional Colors','traditional-colors',true,24,'style'),
  ('Neutral Colors','neutral-colors',true,25,'style'),
  ('Warm Colors','warm-colors',true,26,'style'),
  ('Cool Colors','cool-colors',true,27,'style'),
  ('White Collection','white-collection',true,28,'collection'),
  ('Black Collection','black-collection',true,29,'collection'),
  ('Gray Collection','gray-collection',true,30,'collection'),
  ('Beige Collection','beige-collection',true,31,'collection'),
  ('Blue Collection','blue-collection',true,32,'collection'),
  ('Green Collection','green-collection',true,33,'collection'),
  ('Brown Collection','brown-collection',true,34,'collection'),
  ('Red Collection','red-collection',true,35,'collection'),
  ('Earth Tone Collection','earth-tone-collection',true,36,'collection'),
  ('Nature Collection','nature-collection',true,37,'collection')
on conflict (slug) do nothing;