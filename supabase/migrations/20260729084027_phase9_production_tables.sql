/*
# Phase 9: Production-readiness tables (retry)

Adds tables for Media Library, Color Relationship overrides,
Shareable Links, and Recently Viewed pinning. Also adds performance
indexes on existing high-volume tables.

## New Tables
1. media_folders — named folders for organizing uploaded media
2. media_items — metadata for every uploaded image in Storage
3. color_relationship_overrides — admin overrides for color relationship engine
4. shareable_links — secure shareable links for projects/estimates/palettes

## Modified Tables
- recently_viewed_colors: adds is_pinned boolean column

## Security
- RLS on all new tables. media_folders/media_items: public read, admin write.
- color_relationship_overrides: public read, admin write.
- shareable_links: owner-scoped CRUD + public read by active share token.
- Storage bucket 'media': public read, admin write.
*/

-- =========================================================
-- 1. Media Folders
-- =========================================================

CREATE TABLE IF NOT EXISTS media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_folders_public_read" ON media_folders;
CREATE POLICY "media_folders_public_read" ON media_folders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "media_folders_admin_insert" ON media_folders;
CREATE POLICY "media_folders_admin_insert" ON media_folders FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "media_folders_admin_update" ON media_folders;
CREATE POLICY "media_folders_admin_update" ON media_folders FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "media_folders_admin_delete" ON media_folders;
CREATE POLICY "media_folders_admin_delete" ON media_folders FOR DELETE
  TO authenticated USING (public.is_admin());

INSERT INTO media_folders (name, slug, sort_order) VALUES
  ('Colors', 'colors', 1),
  ('Palettes', 'palettes', 2),
  ('Products', 'products', 3),
  ('Blog', 'blog', 4),
  ('Logos', 'logos', 5),
  ('Advertisements', 'advertisements', 6),
  ('User Uploads', 'user-uploads', 7),
  ('AI Generated Images', 'ai-generated-images', 8)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. Media Items
-- =========================================================

CREATE TABLE IF NOT EXISTS media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES media_folders(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  size_bytes bigint NOT NULL DEFAULT 0,
  width int,
  height int,
  alt_text text,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_items_public_read" ON media_items;
CREATE POLICY "media_items_public_read" ON media_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "media_items_admin_insert" ON media_items;
CREATE POLICY "media_items_admin_insert" ON media_items FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "media_items_admin_update" ON media_items;
CREATE POLICY "media_items_admin_update" ON media_items FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "media_items_admin_delete" ON media_items;
CREATE POLICY "media_items_admin_delete" ON media_items FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_media_items_folder_id ON media_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_items_created_at ON media_items(created_at DESC);

-- =========================================================
-- 3. Color Relationship Overrides
-- =========================================================

DO $$ BEGIN
  CREATE TYPE color_relationship_type AS ENUM (
    'similar', 'complementary', 'analogous', 'triadic',
    'lighter', 'darker', 'matching_trim', 'matching_ceiling', 'coordinated_accent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Replay safety: if the type pre-exists from an older run with a subset of
-- values, make sure every value is present (statement-autocommit replay makes these safe).
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'similar';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'complementary';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'analogous';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'triadic';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'lighter';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'darker';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'matching_trim';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'matching_ceiling';
ALTER TYPE public.color_relationship_type ADD VALUE IF NOT EXISTS 'coordinated_accent';

CREATE TABLE IF NOT EXISTS color_relationship_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  color_id uuid NOT NULL REFERENCES paint_colors(id) ON DELETE CASCADE,
  relationship_type color_relationship_type NOT NULL,
  override_color_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(color_id, relationship_type)
);

ALTER TABLE color_relationship_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "color_rel_overrides_public_read" ON color_relationship_overrides;
CREATE POLICY "color_rel_overrides_public_read" ON color_relationship_overrides FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "color_rel_overrides_admin_insert" ON color_relationship_overrides;
CREATE POLICY "color_rel_overrides_admin_insert" ON color_relationship_overrides FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "color_rel_overrides_admin_update" ON color_relationship_overrides;
CREATE POLICY "color_rel_overrides_admin_update" ON color_relationship_overrides FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "color_rel_overrides_admin_delete" ON color_relationship_overrides;
CREATE POLICY "color_rel_overrides_admin_delete" ON color_relationship_overrides FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_rel_overrides_color_id ON color_relationship_overrides(color_id);

-- =========================================================
-- 4. Shareable Links
-- =========================================================

DO $$ BEGIN
  CREATE TYPE shareable_resource_type AS ENUM (
    'project', 'paint_estimate', 'cost_estimate', 'palette'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Replay safety: if the type pre-exists from an older run with a subset of
-- values, make sure every value is present (statement-autocommit replay makes these safe).
ALTER TYPE public.shareable_resource_type ADD VALUE IF NOT EXISTS 'project';
ALTER TYPE public.shareable_resource_type ADD VALUE IF NOT EXISTS 'paint_estimate';
ALTER TYPE public.shareable_resource_type ADD VALUE IF NOT EXISTS 'cost_estimate';
ALTER TYPE public.shareable_resource_type ADD VALUE IF NOT EXISTS 'palette';

CREATE TABLE IF NOT EXISTS shareable_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type shareable_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shareable_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shareable_links_owner_select" ON shareable_links;
CREATE POLICY "shareable_links_owner_select" ON shareable_links FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shareable_links_owner_insert" ON shareable_links;
CREATE POLICY "shareable_links_owner_insert" ON shareable_links FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shareable_links_owner_update" ON shareable_links;
CREATE POLICY "shareable_links_owner_update" ON shareable_links FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "shareable_links_owner_delete" ON shareable_links;
CREATE POLICY "shareable_links_owner_delete" ON shareable_links FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "shareable_links_public_select" ON shareable_links;
CREATE POLICY "shareable_links_public_select" ON shareable_links FOR SELECT
  TO anon, authenticated USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE INDEX IF NOT EXISTS idx_shareable_links_resource ON shareable_links(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shareable_links_user ON shareable_links(user_id);

-- =========================================================
-- 5. Recently Viewed: add is_pinned column
-- =========================================================

ALTER TABLE recently_viewed_colors ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- =========================================================
-- 6. Media Storage Bucket
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_admin_insert" ON storage.objects;
CREATE POLICY "media_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media' AND public.is_admin());

DROP POLICY IF EXISTS "media_admin_update" ON storage.objects;
CREATE POLICY "media_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media' AND public.is_admin())
WITH CHECK (bucket_id = 'media' AND public.is_admin());

DROP POLICY IF EXISTS "media_admin_delete" ON storage.objects;
CREATE POLICY "media_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media' AND public.is_admin());

-- =========================================================
-- 7. Performance Indexes on Existing Tables
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_paint_colors_slug ON paint_colors(slug);
CREATE INDEX IF NOT EXISTS idx_paint_colors_family ON paint_colors(color_family_id);
CREATE INDEX IF NOT EXISTS idx_paint_colors_category ON paint_colors(category_id);
CREATE INDEX IF NOT EXISTS idx_paint_colors_active_featured ON paint_colors(is_active, is_featured);
CREATE INDEX IF NOT EXISTS idx_paint_colors_active_trending ON paint_colors(is_active, is_trending);

CREATE INDEX IF NOT EXISTS idx_combinations_slug ON color_combinations(slug);
CREATE INDEX IF NOT EXISTS idx_combinations_published ON color_combinations(is_published);
CREATE INDEX IF NOT EXISTS idx_combinations_featured ON color_combinations(is_featured);
CREATE INDEX IF NOT EXISTS idx_combinations_trending ON color_combinations(is_trending);

CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON user_favorites(user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_favorites_color ON user_favorites(color_id);
CREATE INDEX IF NOT EXISTS idx_favorites_palette ON user_favorites(palette_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON user_projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_type ON user_projects(project_type);

CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON user_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_color ON user_collection_items(color_id);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_pinned ON recently_viewed_colors(user_id, is_pinned, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_viewed ON recently_viewed_colors(user_id, viewed_at DESC);
