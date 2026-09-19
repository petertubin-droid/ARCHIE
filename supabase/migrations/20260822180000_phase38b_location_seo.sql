-- =========================================================
-- Phase 38b: Location-based discovery + SEO infrastructure
-- =========================================================
-- 1. Add lat/lng to pro_locations for distance calculation
-- 2. Add lat/lng to marketplace_listings for distance calculation
-- 3. Add SEO metadata columns to pro_categories, pro_locations, pro_profiles, marketplace_listings
-- 4. Create Haversine distance function
-- 5. Create seo_page_settings table for admin-controlled SEO on dynamic pages
-- 6. Add seo_slug columns for clean URL generation

-- =========================================================
-- 1. Add coordinates to pro_locations
-- =========================================================
ALTER TABLE pro_locations
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- =========================================================
-- 2. Add coordinates to marketplace_listings
-- =========================================================
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- =========================================================
-- 3. Add SEO metadata to pro_categories
-- =========================================================
ALTER TABLE pro_categories
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;

-- =========================================================
-- 4. Add SEO metadata to pro_locations
-- =========================================================
ALTER TABLE pro_locations
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS slug text;

-- Generate slugs for existing pro_locations
DO $$
DECLARE
  r record;
  new_slug text;
BEGIN
  FOR r IN SELECT id, state, city, area FROM pro_locations WHERE slug IS NULL OR slug = '' LOOP
    new_slug := lower(COALESCE(r.city, r.state));
    IF r.area IS NOT NULL AND r.area != '' THEN
      new_slug := new_slug || '-' || lower(regexp_replace(r.area, '[^a-zA-Z0-9]+', '-', 'g'));
    END IF;
    new_slug := lower(regexp_replace(new_slug, '[^a-zA-Z0-9]+', '-', 'g'));
    new_slug := trim(both '-' from new_slug);
    UPDATE pro_locations SET slug = new_slug WHERE id = r.id;
  END LOOP;
END $$;

-- Make slug unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_locations_slug
  ON pro_locations(slug) WHERE slug IS NOT NULL;

-- =========================================================
-- 5. Add SEO metadata to pro_profiles
-- =========================================================
ALTER TABLE pro_profiles
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;

-- =========================================================
-- 6. Add SEO metadata to marketplace_listings
-- =========================================================
ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;

-- =========================================================
-- 7. Haversine distance function (returns km between two points)
-- =========================================================
CREATE OR REPLACE FUNCTION haversine_distance(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
RETURNS double precision AS $$
DECLARE
  earth_radius_km double precision := 6371.0;
  d_lat double precision;
  d_lng double precision;
  a double precision;
  c double precision;
BEGIN
  d_lat := radians(lat2 - lat1);
  d_lng := radians(lng2 - lng1);
  a := sin(d_lat / 2) * sin(d_lat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(d_lng / 2) * sin(d_lng / 2);
  c := 2 * asin(sqrt(a));
  RETURN earth_radius_km * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =========================================================
-- 8. SEO Page Settings — admin-managed SEO metadata for
--    dynamic pages (category pages, location pages, etc.)
-- =========================================================
CREATE TABLE IF NOT EXISTS seo_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type text NOT NULL, -- 'marketplace_category', 'marketplace_location', 'pro_category_location', 'seller_profile', 'listing_detail'
  entity_id text, -- the id of the referenced entity (nullable for composite pages)
  category_slug text, -- for category+location combo pages
  location_slug text, -- for category+location combo pages
  seo_title text NOT NULL,
  seo_description text NOT NULL,
  canonical_path text,
  is_indexable boolean NOT NULL DEFAULT true,
  structured_data jsonb, -- additional JSON-LD to inject
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE seo_page_settings ENABLE ROW LEVEL SECURITY;

-- Public can read indexable settings
DROP POLICY IF EXISTS "read_seo_page_settings" ON seo_page_settings;
CREATE POLICY "read_seo_page_settings"
  ON seo_page_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin can manage
DROP POLICY IF EXISTS "admin_manage_seo_page_settings" ON seo_page_settings;
CREATE POLICY "admin_manage_seo_page_settings"
  ON seo_page_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 9. Indexes for location-based queries
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_pro_locations_coords
  ON pro_locations(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_coords
  ON marketplace_listings(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_location_status
  ON marketplace_listings(location_state, location_city, status)
  WHERE is_active = true AND admin_removed = false;

-- =========================================================
-- 10. RPC: find_nearby_professionals
-- Returns pro_profiles within a radius, ordered by distance
-- =========================================================
CREATE OR REPLACE FUNCTION find_nearby_professionals(
  user_lat double precision,
  user_lng double precision,
  radius_km int DEFAULT 25,
  cat_slug text DEFAULT NULL,
  min_rating numeric DEFAULT 0,
  verified_only boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  display_name text,
  business_name text,
  slug text,
  profile_image_url text,
  bio text,
  verification_status text,
  availability text,
  rating_avg numeric,
  rating_count int,
  project_count int,
  years_experience int,
  category_id uuid,
  distance_km double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.display_name,
    pp.business_name,
    pp.slug,
    pp.profile_image_url,
    pp.bio,
    pp.verification_status,
    pp.availability,
    pp.rating_avg,
    pp.rating_count,
    pp.project_count,
    pp.years_experience,
    pp.category_id,
    haversine_distance(user_lat, user_lng, pl.latitude, pl.longitude) AS distance_km
  FROM pro_profiles pp
  JOIN pro_profile_locations ppl ON ppl.profile_id = pp.id
  JOIN pro_locations pl ON pl.id = ppl.location_id
  WHERE pp.is_listed = true
    AND pp.verification_status != 'suspended'
    AND pl.latitude IS NOT NULL
    AND pl.longitude IS NOT NULL
    AND haversine_distance(user_lat, user_lng, pl.latitude, pl.longitude) <= radius_km
    AND (cat_slug IS NULL OR pp.category_id IN (
      SELECT id FROM pro_categories WHERE slug = cat_slug AND is_active = true
    ))
    AND pp.rating_avg >= min_rating
    AND (verified_only = false OR pp.verification_status = 'verified')
  ORDER BY
    -- Sort by verification, distance, then rating
    CASE pp.verification_status
      WHEN 'verified' THEN 0
      WHEN 'pending' THEN 1
      ELSE 2
    END ASC,
    distance_km ASC,
    pp.rating_avg DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- 11. RPC: find_nearby_listings
-- Returns marketplace listings within a radius, ordered by distance
-- =========================================================
CREATE OR REPLACE FUNCTION find_nearby_listings(
  user_lat double precision,
  user_lng double precision,
  radius_km int DEFAULT 25,
  filter_project_type text DEFAULT NULL,
  filter_category_slug text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  project_type text,
  budget_min numeric,
  budget_max numeric,
  currency text,
  location_state text,
  location_city text,
  location_area text,
  status text,
  urgency text,
  is_featured boolean,
  bid_count int,
  created_at timestamptz,
  distance_km double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ml.id,
    ml.title,
    ml.description,
    ml.project_type,
    ml.budget_min,
    ml.budget_max,
    ml.currency,
    ml.location_state,
    ml.location_city,
    ml.location_area,
    ml.status,
    ml.urgency,
    ml.is_featured,
    ml.bid_count,
    ml.created_at,
    haversine_distance(user_lat, user_lng, ml.latitude, ml.longitude) AS distance_km
  FROM marketplace_listings ml
  WHERE ml.is_active = true
    AND ml.admin_removed = false
    AND ml.status IN ('open', 'awarded', 'in_progress')
    AND ml.latitude IS NOT NULL
    AND ml.longitude IS NOT NULL
    AND haversine_distance(user_lat, user_lng, ml.latitude, ml.longitude) <= radius_km
    AND (filter_project_type IS NULL OR ml.project_type = filter_project_type)
    AND (filter_category_slug IS NULL OR ml.category_id IN (
      SELECT id FROM pro_categories WHERE slug = filter_category_slug AND is_active = true
    ))
  ORDER BY
    ml.is_featured DESC,
    distance_km ASC,
    ml.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
