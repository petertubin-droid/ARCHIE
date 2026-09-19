-- =========================================================
-- Phase 44: Marketplace Expansion — Favorites, Reviews, Reports, Seller Profiles
-- =========================================================
-- STRICTLY ADDITIVE. No existing tables modified destructively.
-- Reuses: profiles, pro_profiles, marketplace_listings, marketplace_products
--
-- New tables:
--   1. marketplace_favorites     — saved products, professionals, projects
--   2. marketplace_reviews        — reviews for sellers, professionals, listings
--   3. marketplace_reports        — user reports for moderation
--   4. marketplace_seller_profiles — seller type & business info
--   5. marketplace_search_logs    — search analytics (optional)
-- =========================================================

-- =========================================================
-- 1. MARKETPLACE_FAVORITES — saved items
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('product', 'listing', 'professional', 'project')),
  product_id uuid REFERENCES marketplace_products(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  pro_profile_id uuid REFERENCES pro_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_user_product
  ON marketplace_favorites(user_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_user_listing
  ON marketplace_favorites(user_id, listing_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_user_pro
  ON marketplace_favorites(user_id, pro_profile_id) WHERE pro_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fav_user ON marketplace_favorites(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fav_type ON marketplace_favorites(item_type);

ALTER TABLE marketplace_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fav_owner_read" ON marketplace_favorites;
CREATE POLICY "fav_owner_read" ON marketplace_favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "fav_owner_insert" ON marketplace_favorites;
CREATE POLICY "fav_owner_insert" ON marketplace_favorites FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "fav_owner_delete" ON marketplace_favorites;
CREATE POLICY "fav_owner_delete" ON marketplace_favorites FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "fav_admin_all" ON marketplace_favorites;
CREATE POLICY "fav_admin_all" ON marketplace_favorites FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================================================
-- 2. MARKETPLACE_REVIEWS — ratings & reviews
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_type text NOT NULL CHECK (review_type IN ('seller', 'professional', 'product', 'listing')),
  seller_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  pro_profile_id uuid REFERENCES pro_profiles(id) ON DELETE CASCADE,
  product_id uuid REFERENCES marketplace_products(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  body text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'flagged', 'removed')),
  admin_notes text,
  seller_response text,
  seller_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_seller ON marketplace_reviews(seller_id, status) WHERE seller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_pro ON marketplace_reviews(pro_profile_id, status) WHERE pro_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_product ON marketplace_reviews(product_id, status) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON marketplace_reviews(listing_id, status) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON marketplace_reviews(reviewer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_product ON marketplace_reviews(reviewer_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_pro ON marketplace_reviews(reviewer_id, pro_profile_id) WHERE pro_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_listing ON marketplace_reviews(reviewer_id, listing_id) WHERE listing_id IS NOT NULL;

ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews_public_read" ON marketplace_reviews;
CREATE POLICY "reviews_public_read" ON marketplace_reviews FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS "reviews_owner_read" ON marketplace_reviews;
CREATE POLICY "reviews_owner_read" ON marketplace_reviews FOR SELECT TO authenticated USING (reviewer_id = auth.uid());
DROP POLICY IF EXISTS "reviews_create" ON marketplace_reviews;
CREATE POLICY "reviews_create" ON marketplace_reviews FOR INSERT TO authenticated WITH CHECK (
  reviewer_id = auth.uid()
  AND seller_id IS DISTINCT FROM auth.uid()
  AND pro_profile_id NOT IN (SELECT id FROM pro_profiles WHERE user_id = auth.uid())
);
DROP POLICY IF EXISTS "reviews_owner_update" ON marketplace_reviews;
CREATE POLICY "reviews_owner_update" ON marketplace_reviews FOR UPDATE TO authenticated USING (reviewer_id = auth.uid()) WITH CHECK (reviewer_id = auth.uid());
DROP POLICY IF EXISTS "reviews_owner_delete" ON marketplace_reviews;
CREATE POLICY "reviews_owner_delete" ON marketplace_reviews FOR DELETE TO authenticated USING (reviewer_id = auth.uid());
DROP POLICY IF EXISTS "reviews_admin_all" ON marketplace_reviews;
CREATE POLICY "reviews_admin_all" ON marketplace_reviews FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================================================
-- 3. MARKETPLACE_REPORTS — user reports for moderation
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('product', 'listing', 'review', 'seller', 'professional')),
  product_id uuid REFERENCES marketplace_products(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  review_id uuid REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  pro_profile_id uuid REFERENCES pro_profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN (
    'scam', 'counterfeit', 'prohibited_item', 'misleading_information',
    'inappropriate_content', 'duplicate', 'wrong_category', 'spam', 'other'
  )),
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON marketplace_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON marketplace_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_product ON marketplace_reports(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_listing ON marketplace_reports(listing_id) WHERE listing_id IS NOT NULL;

ALTER TABLE marketplace_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reports_owner_read" ON marketplace_reports;
CREATE POLICY "reports_owner_read" ON marketplace_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
DROP POLICY IF EXISTS "reports_create" ON marketplace_reports;
CREATE POLICY "reports_create" ON marketplace_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "reports_owner_delete" ON marketplace_reports;
CREATE POLICY "reports_owner_delete" ON marketplace_reports FOR DELETE TO authenticated USING (reporter_id = auth.uid());
DROP POLICY IF EXISTS "reports_admin_all" ON marketplace_reports;
CREATE POLICY "reports_admin_all" ON marketplace_reports FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================================================
-- 4. MARKETPLACE_SELLER_PROFILES — seller type & business info
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_type text NOT NULL DEFAULT 'individual' CHECK (seller_type IN (
    'individual', 'business', 'supplier', 'manufacturer', 'distributor', 'professional'
  )),
  business_name text,
  business_registration text,
  tax_id text,
  business_address text,
  business_phone text,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'pending', 'verified', 'rejected', 'suspended')
  ),
  verification_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  default_currency text NOT NULL DEFAULT 'NGN',
  default_location_state text,
  default_location_city text,
  default_delivery_available boolean NOT NULL DEFAULT false,
  default_pickup_available boolean NOT NULL DEFAULT true,
  active_listing_count int NOT NULL DEFAULT 0,
  total_sales int NOT NULL DEFAULT 0,
  rating_avg numeric(3, 2) NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_suspended boolean NOT NULL DEFAULT false,
  suspended_reason text,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_user ON marketplace_seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_type ON marketplace_seller_profiles(seller_type);
CREATE INDEX IF NOT EXISTS idx_seller_verification ON marketplace_seller_profiles(verification_status);

ALTER TABLE marketplace_seller_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "seller_public_read" ON marketplace_seller_profiles;
CREATE POLICY "seller_public_read" ON marketplace_seller_profiles FOR SELECT USING (is_active AND NOT is_suspended);
DROP POLICY IF EXISTS "seller_owner_read" ON marketplace_seller_profiles;
CREATE POLICY "seller_owner_read" ON marketplace_seller_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "seller_owner_insert" ON marketplace_seller_profiles;
CREATE POLICY "seller_owner_insert" ON marketplace_seller_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "seller_owner_update" ON marketplace_seller_profiles;
CREATE POLICY "seller_owner_update" ON marketplace_seller_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "seller_admin_all" ON marketplace_seller_profiles;
CREATE POLICY "seller_admin_all" ON marketplace_seller_profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================================================
-- 5. MARKETPLACE_SEARCH_LOGS — search analytics
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  results_count int NOT NULL DEFAULT 0,
  category_id uuid,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created ON marketplace_search_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_query ON marketplace_search_logs(query);

ALTER TABLE marketplace_search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "search_log_insert" ON marketplace_search_logs;
CREATE POLICY "search_log_insert" ON marketplace_search_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS "search_log_admin_read" ON marketplace_search_logs;
CREATE POLICY "search_log_admin_read" ON marketplace_search_logs FOR SELECT TO authenticated USING (public.is_admin());

-- =========================================================
-- 6. EXTEND PRODUCT CATEGORIES — additional seed data
-- =========================================================
INSERT INTO marketplace_product_categories (slug, name, sort_order) VALUES
  ('roofing', 'Roofing', 9),
  ('pop-ceiling', 'POP & Ceiling', 10),
  ('screeding', 'Screeding Materials', 11),
  ('interior-furniture', 'Interior & Furniture', 12),
  ('services', 'Services', 13),
  ('professionals', 'Professionals', 14)
ON CONFLICT (slug) DO NOTHING;

-- Building Materials subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'cement', 'Cement', id, 1 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'blocks', 'Blocks', id, 2 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'sand', 'Sand', id, 3 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'granite', 'Granite', id, 4 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'steel', 'Steel & Rebar', id, 5 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

-- Roofing subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'aluminium-roofing', 'Aluminium', id, 1 FROM marketplace_product_categories WHERE slug = 'roofing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'longspan-roofing', 'Longspan', id, 2 FROM marketplace_product_categories WHERE slug = 'roofing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'stone-coated-roofing', 'Stone-coated', id, 3 FROM marketplace_product_categories WHERE slug = 'roofing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'step-tiles-roofing', 'Step Tiles', id, 4 FROM marketplace_product_categories WHERE slug = 'roofing'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'ridge-flashing', 'Ridge & Flashing', id, 5 FROM marketplace_product_categories WHERE slug = 'roofing'
ON CONFLICT (slug) DO NOTHING;

-- POP & Ceiling subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'pop-cement', 'POP Cement', id, 1 FROM marketplace_product_categories WHERE slug = 'pop-ceiling'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'ceiling-boards', 'Ceiling Boards', id, 2 FROM marketplace_product_categories WHERE slug = 'pop-ceiling'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'pop-tools', 'POP Tools & Accessories', id, 3 FROM marketplace_product_categories WHERE slug = 'pop-ceiling'
ON CONFLICT (slug) DO NOTHING;

-- Screeding subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'screeding-paint', 'Screeding Paint', id, 1 FROM marketplace_product_categories WHERE slug = 'screeding'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'screeding-tools', 'Screeding Tools', id, 2 FROM marketplace_product_categories WHERE slug = 'screeding'
ON CONFLICT (slug) DO NOTHING;

-- Paint & Decoration subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'emulsion-paint', 'Emulsion', id, 4 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'matt-paint', 'Matt', id, 5 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'satin-paint', 'Satin', id, 6 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'exterior-paint', 'Exterior Paint', id, 7 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'tyrolene', 'Tyrolene', id, 8 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'grafitex', 'Grafitex', id, 9 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

-- Services subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'painting-service', 'Painting', id, 1 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'screeding-service', 'Screeding', id, 2 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'tiling-service', 'Tiling', id, 3 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'roofing-service', 'Roofing', id, 4 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'pop-service', 'POP Ceiling', id, 5 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'plumbing-service', 'Plumbing', id, 6 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'electrical-service', 'Electrical', id, 7 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'masonry-service', 'Masonry', id, 8 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'carpentry-service', 'Carpentry', id, 9 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'architecture-service', 'Architecture', id, 10 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'engineering-service', 'Engineering', id, 11 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'general-contracting', 'General Contracting', id, 12 FROM marketplace_product_categories WHERE slug = 'services'
ON CONFLICT (slug) DO NOTHING;

-- Tiles & Flooring subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'floor-tiles', 'Floor Tiles', id, 1 FROM marketplace_product_categories WHERE slug = 'flooring'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'wall-tiles', 'Wall Tiles', id, 2 FROM marketplace_product_categories WHERE slug = 'flooring'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'porcelain-tiles', 'Porcelain', id, 3 FROM marketplace_product_categories WHERE slug = 'flooring'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'ceramic-tiles', 'Ceramic', id, 4 FROM marketplace_product_categories WHERE slug = 'flooring'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'outdoor-tiles', 'Outdoor Tiles', id, 5 FROM marketplace_product_categories WHERE slug = 'flooring'
ON CONFLICT (slug) DO NOTHING;

-- Tools & Equipment subcategories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'power-tools', 'Power Tools', id, 1 FROM marketplace_product_categories WHERE slug = 'tools-kits'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'hand-tools', 'Hand Tools', id, 2 FROM marketplace_product_categories WHERE slug = 'tools-kits'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'scaffolding', 'Scaffolding', id, 3 FROM marketplace_product_categories WHERE slug = 'tools-kits'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'construction-equipment', 'Construction Equipment', id, 4 FROM marketplace_product_categories WHERE slug = 'tools-kits'
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 7. PRICING UNITS CONFIGURATION TABLE
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_pricing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'volume', 'weight', 'length', 'area', 'quantity', 'service')),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO marketplace_pricing_units (unit, label, category, sort_order) VALUES
  ('piece', 'Per Piece', 'quantity', 1),
  ('bag', 'Per Bag', 'quantity', 2),
  ('bucket', 'Per Bucket', 'volume', 3),
  ('carton', 'Per Carton', 'quantity', 4),
  ('litre', 'Per Litre', 'volume', 5),
  ('gallon', 'Per Gallon', 'volume', 6),
  ('metre', 'Per Metre', 'length', 7),
  ('square_metre', 'Per Square Metre', 'area', 8),
  ('square_foot', 'Per Square Foot', 'area', 9),
  ('kilogram', 'Per Kilogram', 'weight', 10),
  ('tonne', 'Per Tonne', 'weight', 11),
  ('trip', 'Per Trip', 'quantity', 12),
  ('set', 'Per Set', 'quantity', 13),
  ('service', 'Per Service', 'service', 14),
  ('negotiable', 'Negotiable', 'service', 15)
ON CONFLICT (unit) DO NOTHING;

ALTER TABLE marketplace_pricing_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_units_public_read" ON marketplace_pricing_units;
CREATE POLICY "pricing_units_public_read" ON marketplace_pricing_units FOR SELECT USING (true);

-- =========================================================
-- 8. UPDATED_AT TRIGGERS for new tables
-- =========================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['marketplace_reviews', 'marketplace_reports', 'marketplace_seller_profiles']) LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %s', tbl, tbl);
      EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', tbl, tbl);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
