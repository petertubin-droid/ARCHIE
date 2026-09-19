-- Phase 39: Marketplace Products — dual-section marketplace (Jobs + Products)
-- Creates marketplace_products table for building materials, painting materials, interior design products

-- ============================================================
-- PRODUCT CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES marketplace_product_categories(id) ON DELETE SET NULL,
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  seo_title TEXT,
  seo_description TEXT,
  seo_indexable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial product categories
INSERT INTO marketplace_product_categories (slug, name, sort_order) VALUES
  ('painting-materials', 'Painting Materials', 1),
  ('building-materials', 'Building Materials', 2),
  ('interior-design', 'Interior Design Products', 3),
  ('tools-kits', 'Tools & Kits', 4),
  ('flooring', 'Flooring & Tiles', 5),
  ('lighting', 'Lighting & Fixtures', 6),
  ('plumbing', 'Plumbing & Sanitary', 7),
  ('electrical', 'Electrical Supplies', 8)
ON CONFLICT (slug) DO NOTHING;

-- Sub-categories
INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'paints-primers', 'Paints & Primers', id, 1 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'brushes-rollers', 'Brushes & Rollers', id, 2 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'spray-equipment', 'Spray Equipment', id, 3 FROM marketplace_product_categories WHERE slug = 'painting-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'cement-aggregates', 'Cement & Aggregates', id, 1 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'roofing', 'Roofing Materials', id, 2 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'doors-windows', 'Doors & Windows', id, 3 FROM marketplace_product_categories WHERE slug = 'building-materials'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'wall-decor', 'Wall Decor & Art', id, 1 FROM marketplace_product_categories WHERE slug = 'interior-design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'furniture', 'Furniture', id, 2 FROM marketplace_product_categories WHERE slug = 'interior-design'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO marketplace_product_categories (slug, name, parent_id, sort_order)
SELECT 'soft-furnishings', 'Soft Furnishings', id, 3 FROM marketplace_product_categories WHERE slug = 'interior-design'
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES marketplace_product_categories(id) ON DELETE SET NULL,

  -- Pricing
  price NUMERIC(12, 2) NOT NULL,
  compare_at_price NUMERIC(12, 2), -- original price for discounts
  currency TEXT NOT NULL DEFAULT 'NGN',
  negotiable BOOLEAN NOT NULL DEFAULT false,

  -- Inventory
  condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'like_new', 'good', 'fair')),
  quantity INT NOT NULL DEFAULT 1,
  unit TEXT, -- e.g. 'bag', 'litre', 'piece', 'set', 'sqm'

  -- Images
  images TEXT[] NOT NULL DEFAULT '{}',
  primary_image_idx INT NOT NULL DEFAULT 0,

  -- Location
  location_state TEXT,
  location_city TEXT,
  location_area TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  -- Shipping
  delivery_available BOOLEAN NOT NULL DEFAULT false,
  delivery_fee NUMERIC(10, 2),
  pickup_available BOOLEAN NOT NULL DEFAULT true,

  -- Specs / attributes (flexible JSON)
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',

  -- Brand
  brand TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'paused', 'removed')),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  admin_removed BOOLEAN NOT NULL DEFAULT false,
  admin_notes TEXT,

  -- SEO
  seo_title TEXT,
  seo_description TEXT,
  seo_indexable BOOLEAN NOT NULL DEFAULT true,

  -- Analytics
  view_count INT NOT NULL DEFAULT 0,
  inquiry_count INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_seller ON marketplace_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON marketplace_products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON marketplace_products(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_location ON marketplace_products(location_state, location_city);
CREATE INDEX IF NOT EXISTS idx_products_created ON marketplace_products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_featured ON marketplace_products(is_featured DESC, created_at DESC) WHERE status = 'active' AND admin_removed = false;
CREATE INDEX IF NOT EXISTS idx_products_tags ON marketplace_products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_products_title_trgm ON marketplace_products USING GIN(title gin_trgm_ops);

-- Enable trigram for title search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- PRODUCT INQUIRIES (buyer contacts seller)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_product_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  offered_price NUMERIC(12, 2),
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'closed', 'spam')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_product ON marketplace_product_inquiries(product_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_buyer ON marketplace_product_inquiries(buyer_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE marketplace_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_product_inquiries ENABLE ROW LEVEL SECURITY;

-- Product categories: public read
DROP POLICY IF EXISTS "product_categories_public_read" ON marketplace_product_categories;
CREATE POLICY "product_categories_public_read" ON marketplace_product_categories
  FOR SELECT USING (true);

-- Products: public read active, seller write
DROP POLICY IF EXISTS "products_public_read" ON marketplace_products;
CREATE POLICY "products_public_read" ON marketplace_products
  FOR SELECT USING (status = 'active' AND admin_removed = false);

DROP POLICY IF EXISTS "products_seller_insert" ON marketplace_products;
CREATE POLICY "products_seller_insert" ON marketplace_products
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "products_seller_update" ON marketplace_products;
CREATE POLICY "products_seller_update" ON marketplace_products
  FOR UPDATE USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "products_admin_all" ON marketplace_products;
CREATE POLICY "products_admin_all" ON marketplace_products
  FOR ALL USING (
    is_admin()
  );

-- Inquiries: buyer creates, seller reads
DROP POLICY IF EXISTS "inquiries_buyer_insert" ON marketplace_product_inquiries;
CREATE POLICY "inquiries_buyer_insert" ON marketplace_product_inquiries
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "inquiries_participant_read" ON marketplace_product_inquiries;
CREATE POLICY "inquiries_participant_read" ON marketplace_product_inquiries
  FOR SELECT USING (
    auth.uid() = buyer_id OR
    auth.uid() IN (SELECT seller_id FROM marketplace_products WHERE id = product_id) OR
    is_admin()
  );

DROP POLICY IF EXISTS "inquiries_seller_update" ON marketplace_product_inquiries;
CREATE POLICY "inquiries_seller_update" ON marketplace_product_inquiries
  FOR UPDATE USING (
    auth.uid() IN (SELECT seller_id FROM marketplace_products WHERE id = product_id) OR
    is_admin()
  );

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS update_marketplace_products_updated_at ON marketplace_products;
CREATE TRIGGER update_marketplace_products_updated_at
  BEFORE UPDATE ON marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_marketplace_product_inquiries_updated_at ON marketplace_product_inquiries;
CREATE TRIGGER update_marketplace_product_inquiries_updated_at
  BEFORE UPDATE ON marketplace_product_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RPC: increment product view count
-- ============================================================
CREATE OR REPLACE FUNCTION increment_product_view_count(p_product_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_products
  SET view_count = view_count + 1
  WHERE id = p_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: search products with filters
-- ============================================================
CREATE OR REPLACE FUNCTION search_marketplace_products(
  p_search TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_min_price NUMERIC DEFAULT NULL,
  p_max_price NUMERIC DEFAULT NULL,
  p_condition TEXT DEFAULT NULL,
  p_location_state TEXT DEFAULT NULL,
  p_location_city TEXT DEFAULT NULL,
  p_delivery_available BOOLEAN DEFAULT NULL,
  p_sort TEXT DEFAULT 'newest',
  p_limit INT DEFAULT 24,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  price NUMERIC,
  compare_at_price NUMERIC,
  currency TEXT,
  negotiable BOOLEAN,
  condition TEXT,
  quantity INT,
  unit TEXT,
  images TEXT[],
  primary_image_idx INT,
  location_state TEXT,
  location_city TEXT,
  location_area TEXT,
  delivery_available BOOLEAN,
  delivery_fee NUMERIC,
  pickup_available BOOLEAN,
  brand TEXT,
  tags TEXT[],
  is_featured BOOLEAN,
  view_count INT,
  inquiry_count INT,
  category_name TEXT,
  seller_name TEXT,
  seller_avatar TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.title, p.description, p.price, p.compare_at_price, p.currency,
    p.negotiable, p.condition, p.quantity, p.unit,
    p.images, p.primary_image_idx,
    p.location_state, p.location_city, p.location_area,
    p.delivery_available, p.delivery_fee, p.pickup_available,
    p.brand, p.tags, p.is_featured, p.view_count, p.inquiry_count,
    c.name AS category_name,
    pr.full_name AS seller_name,
    pr.avatar_url AS seller_avatar,
    p.created_at
  FROM marketplace_products p
  LEFT JOIN marketplace_product_categories c ON p.category_id = c.id
  LEFT JOIN profiles pr ON p.seller_id = pr.id
  WHERE p.status = 'active'
    AND p.admin_removed = false
    AND (p_search IS NULL OR p.title ILIKE '%' || p_search || '%' OR p.description ILIKE '%' || p_search || '%' OR p.brand ILIKE '%' || p_search || '%' OR p.tags && ARRAY[p_search])
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_min_price IS NULL OR p.price >= p_min_price)
    AND (p_max_price IS NULL OR p.price <= p_max_price)
    AND (p_condition IS NULL OR p.condition = p_condition)
    AND (p_location_state IS NULL OR p.location_state = p_location_state)
    AND (p_location_city IS NULL OR p.location_city ILIKE '%' || p_location_city || '%')
    AND (p_delivery_available IS NULL OR p.delivery_available = p_delivery_available)
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN p.created_at END DESC,
    CASE WHEN p_sort = 'price_low' THEN p.price END ASC,
    CASE WHEN p_sort = 'price_high' THEN p.price END DESC,
    CASE WHEN p_sort = 'popular' THEN p.view_count END DESC,
    CASE WHEN p_sort = 'featured' THEN p.is_featured END DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: find nearby products
-- ============================================================
CREATE OR REPLACE FUNCTION find_nearby_products(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km INT DEFAULT 25,
  p_category_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  price NUMERIC,
  currency TEXT,
  images TEXT[],
  primary_image_idx INT,
  location_state TEXT,
  location_city TEXT,
  location_area TEXT,
  distance_km DOUBLE PRECISION,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.title, p.price, p.currency,
    p.images, p.primary_image_idx,
    p.location_state, p.location_city, p.location_area,
    (6371 * acos(cos(radians(p_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(p.latitude)))) AS distance_km,
    p.created_at
  FROM marketplace_products p
  WHERE p.status = 'active'
    AND p.admin_removed = false
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (6371 * acos(cos(radians(p_lat)) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(p.latitude)))) <= p_radius_km
  ORDER BY distance_km ASC, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Amended 2026-09-12: these triggers originally referenced
-- update_updated_at_column(), which is not defined until
-- 20260825020000_phase44_marketplace_expansion.sql. On a fresh
-- chain replay the CREATE TRIGGER failed with 42883 and aborted
-- the run. Switched to public.set_updated_at() — the shared
-- trigger function that has existed since
-- 20260817100000_phase5_contractor_experience.sql (and which
-- phase27's header note already mandates for exactly this reason).
-- Same behavior: sets updated_at = now() on UPDATE.
