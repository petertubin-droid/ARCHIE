-- =========================================================
-- Phase 41: FRELUX Market Intelligence & Price Engine
-- =========================================================
-- STRICTLY ADDITIVE: No existing tables are modified destructively.
-- Builds on Phase 40 international architecture (market_profiles, market_products).
--
-- New tables (all prefixed mi_ for isolation):
--   1. mi_providers          — provider configurations (free & paid)
--   2. mi_sources            — source registry (websites, suppliers, APIs)
--   3. mi_product_aliases    — product normalization records
--   4. mi_price_observations  — raw collected price observations
--   5. mi_approved_prices    — validated/approved prices for calculator use
--   6. mi_crawl_logs         — crawl/collection event logs (observability)
--   7. mi_provider_usage     — provider usage tracking (cost control)
--   8. mi_anomaly_flags      — detected price anomalies
--
-- No existing tables, policies, triggers, or data are touched.
-- API keys are NEVER stored in these tables — they go in Supabase secrets.
-- =========================================================

-- =========================================================
-- 1. MI_PROVIDERS — provider configurations
-- =========================================================
CREATE TABLE IF NOT EXISTS mi_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  provider_name text NOT NULL UNIQUE,           -- "FRELUX Crawler", "ScraperAPI", "Manual Admin", etc.
  provider_type text NOT NULL
    CHECK (provider_type IN ('crawler', 'scraper_api', 'price_api', 'supplier_api', 'manual', 'hybrid')),

  -- Configuration (NO API KEYS — stored in Supabase secrets)
  api_endpoint text,                            -- base URL for API providers
  has_api_key boolean NOT NULL DEFAULT false,   -- true if a key is stored in Supabase secrets
  secret_name text,                             -- name of the secret in Supabase (e.g. "scraperapi_key")

  -- Usage limits (cost control)
  monthly_request_limit int,                    -- null = unlimited
  daily_request_limit int,                      -- null = unlimited
  credit_limit numeric,                          -- monthly credit budget
  priority int NOT NULL DEFAULT 100,             -- lower = higher priority (1 = first choice)
  is_fallback boolean NOT NULL DEFAULT false,    -- only used when higher-priority providers fail

  -- Supported countries (null/empty = all)
  supported_countries text[],

  -- Status
  is_enabled boolean NOT NULL DEFAULT false,
  is_free boolean NOT NULL DEFAULT true,         -- true = no cost per request

  -- Metadata
  description text,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_providers_priority ON mi_providers(priority, is_enabled);

ALTER TABLE mi_providers ENABLE ROW LEVEL SECURITY;

-- Only admins can manage providers
DROP POLICY IF EXISTS "mi_providers_admin_read" ON mi_providers;
CREATE POLICY "mi_providers_admin_read"
  ON mi_providers FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "mi_providers_admin_write" ON mi_providers;
CREATE POLICY "mi_providers_admin_write"
  ON mi_providers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 2. MI_SOURCES — source registry
-- =========================================================
CREATE TABLE IF NOT EXISTS mi_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  source_name text NOT NULL,
  domain text,                                   -- e.g. "jumia.com.ng"
  source_url text,                               -- full URL if applicable

  -- Market
  country_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE RESTRICT,
  region text,                                   -- "Lagos", "Nairobi", "Accra"
  city text,

  -- Classification
  source_type text NOT NULL
    CHECK (source_type IN (
      'supplier', 'retailer', 'manufacturer', 'marketplace',
      'distributor', 'public_price_database', 'government', 'manual', 'api'
    )),

  -- Provider association
  provider_id uuid REFERENCES mi_providers(id) ON DELETE SET NULL,

  -- Reliability
  reliability_tier int NOT NULL DEFAULT 4
    CHECK (reliability_tier BETWEEN 1 AND 4),
  -- Tier 1 = verified manufacturer/supplier
  -- Tier 2 = established retailer/distributor
  -- Tier 3 = established marketplace
  -- Tier 4 = unknown/low-confidence

  -- Access
  robots_status text,                             -- "allowed", "disallowed", "unknown"
  access_notes text,

  -- Crawl configuration
  crawl_frequency text NOT NULL DEFAULT 'manual'
    CHECK (crawl_frequency IN ('daily', 'weekly', 'monthly', 'manual', 'on_demand')),

  -- Status
  is_active boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,     -- admin-verified source

  -- Tracking
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,

  -- Metadata
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_sources_country ON mi_sources(country_code, is_active);
CREATE INDEX IF NOT EXISTS idx_mi_sources_type ON mi_sources(source_type, reliability_tier);

ALTER TABLE mi_sources ENABLE ROW LEVEL SECURITY;

-- Admins can manage sources; public can read active verified sources (for display)
DROP POLICY IF EXISTS "mi_sources_admin_all" ON mi_sources;
CREATE POLICY "mi_sources_admin_all"
  ON mi_sources FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "mi_sources_public_read" ON mi_sources;
CREATE POLICY "mi_sources_public_read"
  ON mi_sources FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- =========================================================
-- 3. MI_PRODUCT_ALIASES — product normalization records
-- =========================================================
-- Maps raw product names from sources to canonical FRELUX products.
-- Each alias has a confidence score — low confidence never overwrites validated products.
CREATE TABLE IF NOT EXISTS mi_product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The raw name as seen on the source
  raw_name text NOT NULL,

  -- The normalized/canonical product (can reference market_products or be standalone)
  canonical_product_id uuid REFERENCES market_products(id) ON DELETE SET NULL,

  -- Normalized fields
  normalized_brand text,
  normalized_name text NOT NULL,
  normalized_category text,
  normalized_package_size numeric,
  normalized_package_unit text,

  -- Match metadata
  match_confidence text NOT NULL DEFAULT 'review_required'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'review_required')),
  match_score numeric DEFAULT 0,                -- 0-100, algorithmic score

  -- Source of this alias
  source_id uuid REFERENCES mi_sources(id) ON DELETE CASCADE,

  -- Market context
  market_code text REFERENCES market_profiles(country_code) ON DELETE CASCADE,

  -- Whether this alias has been admin-verified
  is_verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,

  -- Metadata
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_pa_raw ON mi_product_aliases(raw_name);
CREATE INDEX IF NOT EXISTS idx_mi_pa_canonical ON mi_product_aliases(canonical_product_id);
CREATE INDEX IF NOT EXISTS idx_mi_pa_confidence ON mi_product_aliases(match_confidence, is_verified);

ALTER TABLE mi_product_aliases ENABLE ROW LEVEL SECURITY;

-- Admins can manage aliases
DROP POLICY IF EXISTS "mi_pa_admin_all" ON mi_product_aliases;
CREATE POLICY "mi_pa_admin_all"
  ON mi_product_aliases FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public can read verified aliases (for product matching)
DROP POLICY IF EXISTS "mi_pa_public_read" ON mi_product_aliases;
CREATE POLICY "mi_pa_public_read"
  ON mi_product_aliases FOR SELECT
  TO anon, authenticated
  USING (is_verified = true);

-- =========================================================
-- 4. MI_PRICE_OBSERVATIONS — raw collected price observations
-- =========================================================
-- Every collected price is a NEW record — never overwrites historical data.
-- This creates a price history.
CREATE TABLE IF NOT EXISTS mi_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Market context
  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,
  country_code text NOT NULL,                    -- denormalized for quick filtering
  region text,
  city text,

  -- Source
  source_id uuid NOT NULL REFERENCES mi_sources(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES mi_providers(id) ON DELETE SET NULL,

  -- Product
  original_product_name text NOT NULL,           -- as seen on source
  canonical_product_id uuid REFERENCES market_products(id) ON DELETE SET NULL,
  normalized_brand text,
  normalized_name text,
  normalized_category text,

  -- Package
  package_size numeric,                           -- 50, 20, 1, etc.
  package_unit text,                               -- "kg", "litres", "carton", "bag"
  package_size_confidence text DEFAULT 'medium'
    CHECK (package_size_confidence IN ('high', 'medium', 'low', 'unknown')),

  -- Price
  price numeric NOT NULL,
  currency_code text NOT NULL,                    -- NGN, GHS, KES, ZAR, etc.

  -- Normalized unit price (if calculable — NOT invented)
  unit_price_per_kg numeric,                       -- price / package_size when unit = kg
  unit_price_per_litre numeric,                    -- price / package_size when unit = litres
  unit_price_calculable boolean NOT NULL DEFAULT false,

  -- Timestamps
  collected_at timestamptz NOT NULL DEFAULT now(),
  source_publication_date date,                    -- when the source published/updated the price

  -- Stock
  stock_status text,                               -- "in_stock", "out_of_stock", "unknown"

  -- Validation
  match_confidence text NOT NULL DEFAULT 'review_required'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'review_required')),

  validation_status text NOT NULL DEFAULT 'collected'
    CHECK (validation_status IN (
      'collected',         -- freshly collected, pending validation
      'validating',        -- being analyzed by validation engine
      'review_required',   -- flagged for admin review
      'approved',          -- validated and approved
      'rejected',          -- rejected by admin or validation
      'anomaly'            -- detected as anomalous
    )),

  -- Freshness (calculated/updated by validation engine)
  freshness text NOT NULL DEFAULT 'fresh'
    CHECK (freshness IN ('fresh', 'recent', 'stale', 'expired')),

  -- Evidence
  source_url text,                                -- direct URL to the priced product page
  raw_extraction_ref jsonb,                        -- raw extracted data (selectors, HTML refs, etc.)
  admin_notes text,

  -- Review
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_action text,                              -- "approved", "rejected", "edited", "flagged"

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_po_market_product ON mi_price_observations(market_code, canonical_product_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_mi_po_source ON mi_price_observations(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mi_po_validation ON mi_price_observations(validation_status, match_confidence);
CREATE INDEX IF NOT EXISTS idx_mi_po_country ON mi_price_observations(country_code, collected_at DESC);

ALTER TABLE mi_price_observations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all observations
DROP POLICY IF EXISTS "mi_po_admin_all" ON mi_price_observations;
CREATE POLICY "mi_po_admin_all"
  ON mi_price_observations FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public can read APPROVED observations only
DROP POLICY IF EXISTS "mi_po_public_read" ON mi_price_observations;
CREATE POLICY "mi_po_public_read"
  ON mi_price_observations FOR SELECT
  TO anon, authenticated
  USING (validation_status = 'approved');

-- =========================================================
-- 5. MI_APPROVED_PRICES — validated prices for calculator use
-- =========================================================
-- The calculator price resolver reads from this table.
-- Only approved, validated prices end up here.
-- One active approved price per market + product + package combination.
CREATE TABLE IF NOT EXISTS mi_approved_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,
  canonical_product_id uuid REFERENCES market_products(id) ON DELETE SET NULL,

  -- Product info (denormalized for quick reads)
  product_name text NOT NULL,
  brand text,
  category text,

  -- Package
  package_size numeric NOT NULL,
  package_unit text NOT NULL,

  -- Approved price
  price numeric NOT NULL,
  currency_code text NOT NULL,

  -- Normalized unit price (if calculable)
  unit_price_per_kg numeric,
  unit_price_per_litre numeric,
  unit_price_calculable boolean NOT NULL DEFAULT false,

  -- Market estimate metadata
  median_price numeric,                           -- median across sources
  min_price numeric,                              -- min across sources
  max_price numeric,                              -- max across sources
  source_count int NOT NULL DEFAULT 1,           -- number of sources contributing
  confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low', 'review_required')),

  -- Freshness
  freshness text NOT NULL DEFAULT 'fresh'
    CHECK (freshness IN ('fresh', 'recent', 'stale', 'expired')),
  last_updated timestamptz NOT NULL DEFAULT now(),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,

  -- Provenance
  source_observations uuid[] NOT NULL DEFAULT '{}'::uuid[],  -- array of mi_price_observations IDs
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  auto_approved boolean NOT NULL DEFAULT false,

  -- Location
  region text,
  city text,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One active approved price per market + product + package
  UNIQUE (market_code, canonical_product_id, package_size, package_unit)
);

CREATE INDEX IF NOT EXISTS idx_mi_ap_market_product ON mi_approved_prices(market_code, canonical_product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mi_ap_freshness ON mi_approved_prices(freshness, is_active);

ALTER TABLE mi_approved_prices ENABLE ROW LEVEL SECURITY;

-- Admins can manage approved prices
DROP POLICY IF EXISTS "mi_ap_admin_all" ON mi_approved_prices;
CREATE POLICY "mi_ap_admin_all"
  ON mi_approved_prices FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public can read active approved prices (calculators need these)
DROP POLICY IF EXISTS "mi_ap_public_read" ON mi_approved_prices;
CREATE POLICY "mi_ap_public_read"
  ON mi_approved_prices FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- =========================================================
-- 6. MI_CRAWL_LOGS — observability event log
-- =========================================================
CREATE TABLE IF NOT EXISTS mi_crawl_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type text NOT NULL
    CHECK (event_type IN (
      'crawl_started', 'crawl_completed', 'crawl_failed',
      'product_matched', 'product_mismatch',
      'price_collected', 'price_rejected', 'price_approved',
      'provider_error', 'source_unavailable',
      'api_limit_reached', 'anomaly_detected',
      'validation_started', 'validation_completed'
    )),

  source_id uuid REFERENCES mi_sources(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES mi_providers(id) ON DELETE SET NULL,
  observation_id uuid REFERENCES mi_price_observations(id) ON DELETE SET NULL,

  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_cl_type ON mi_crawl_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mi_cl_source ON mi_crawl_logs(source_id, created_at DESC);

ALTER TABLE mi_crawl_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs
DROP POLICY IF EXISTS "mi_cl_admin_read" ON mi_crawl_logs;
CREATE POLICY "mi_cl_admin_read"
  ON mi_crawl_logs FOR SELECT
  TO authenticated USING (public.is_admin());

-- Admins can insert logs (from edge functions / admin actions)
DROP POLICY IF EXISTS "mi_cl_admin_insert" ON mi_crawl_logs;
CREATE POLICY "mi_cl_admin_insert"
  ON mi_crawl_logs FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

-- =========================================================
-- 7. MI_PROVIDER_USAGE — cost control tracking
-- =========================================================
CREATE TABLE IF NOT EXISTS mi_provider_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  provider_id uuid NOT NULL REFERENCES mi_providers(id) ON DELETE CASCADE,

  -- Period
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  usage_month int NOT NULL,                       -- extracted from usage_date (1-12)
  usage_year int NOT NULL,                        -- extracted from usage_date

  -- Counters
  requests_today int NOT NULL DEFAULT 0,
  requests_this_month int NOT NULL DEFAULT 0,
  credits_used_today numeric NOT NULL DEFAULT 0,
  credits_used_this_month numeric NOT NULL DEFAULT 0,

  -- Status
  daily_limit_reached boolean NOT NULL DEFAULT false,
  monthly_limit_reached boolean NOT NULL DEFAULT false,

  -- Error tracking
  error_count_today int NOT NULL DEFAULT 0,
  last_error text,
  last_error_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provider_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_mi_pu_provider ON mi_provider_usage(provider_id, usage_date DESC);

ALTER TABLE mi_provider_usage ENABLE ROW LEVEL SECURITY;

-- Admins can manage usage tracking
DROP POLICY IF EXISTS "mi_pu_admin_all" ON mi_provider_usage;
CREATE POLICY "mi_pu_admin_all"
  ON mi_provider_usage FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 8. MI_ANOMALY_FLAGS — detected price anomalies
-- =========================================================
CREATE TABLE IF NOT EXISTS mi_anomaly_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  observation_id uuid NOT NULL REFERENCES mi_price_observations(id) ON DELETE CASCADE,

  -- Anomaly details
  anomaly_type text NOT NULL
    CHECK (anomaly_type IN (
      'price_deviation',       -- price too far from median/average
      'currency_mismatch',     -- currency doesn't match market
      'package_mismatch',      -- package size doesn't match product
      'market_mismatch',       -- market doesn't match source
      'duplicate_suspicious',  -- likely duplicate with different price
      'stale_data',             -- source data is too old
      'unusual_source'          -- source not typically used for this product
    )),

  -- Details
  expected_range jsonb,                           -- {"min": 9000, "max": 11000, "median": 9800}
  actual_value numeric,
  deviation_percent numeric,                      -- how far off from expected
  description text,

  -- Resolution
  resolution text NOT NULL DEFAULT 'open'
    CHECK (resolution IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mi_af_observation ON mi_anomaly_flags(observation_id);
CREATE INDEX IF NOT EXISTS idx_mi_af_resolution ON mi_anomaly_flags(resolution, created_at DESC);

ALTER TABLE mi_anomaly_flags ENABLE ROW LEVEL SECURITY;

-- Admins can manage anomaly flags
DROP POLICY IF EXISTS "mi_af_admin_all" ON mi_anomaly_flags;
CREATE POLICY "mi_af_admin_all"
  ON mi_anomaly_flags FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 9. SEED: DEFAULT PROVIDERS
-- =========================================================
-- Manual Admin Provider (always available, free)
INSERT INTO mi_providers (provider_name, provider_type, is_enabled, is_free, priority, description)
VALUES (
  'Manual Admin Entry', 'manual', true, true, 100,
  'Prices entered manually by FRELUX administrators. Always available at no cost.'
)
ON CONFLICT (provider_name) DO NOTHING;

-- FRELUX Crawler Provider (architecture-ready, not enabled yet)
INSERT INTO mi_providers (provider_name, provider_type, is_enabled, is_free, priority, description)
VALUES (
  'FRELUX Crawler', 'crawler', false, true, 50,
  'FRELUX-owned web crawler for collecting prices from public sources. Free to operate.'
)
ON CONFLICT (provider_name) DO NOTHING;

-- Placeholder for future paid providers (not enabled)
INSERT INTO mi_providers (provider_name, provider_type, is_enabled, is_free, is_fallback, priority, description)
VALUES
  ('ScraperAPI', 'scraper_api', false, false, true, 200,
   'Commercial scraping API. Requires API key configuration. Optional paid provider.'),
  ('Zyte', 'scraper_api', false, false, true, 300,
   'Commercial scraping API. Requires API key configuration. Optional paid provider.'),
  ('Pricewatcha', 'price_api', false, false, true, 250,
   'Commercial price intelligence API. Requires API key configuration. Optional paid provider.')
ON CONFLICT (provider_name) DO NOTHING;

-- =========================================================
-- 10. TRIGGERS — updated_at for all new tables
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_mi_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_providers_updated') THEN
    CREATE TRIGGER trg_mi_providers_updated BEFORE UPDATE ON mi_providers
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_sources_updated') THEN
    CREATE TRIGGER trg_mi_sources_updated BEFORE UPDATE ON mi_sources
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_pa_updated') THEN
    CREATE TRIGGER trg_mi_pa_updated BEFORE UPDATE ON mi_product_aliases
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_po_updated') THEN
    CREATE TRIGGER trg_mi_po_updated BEFORE UPDATE ON mi_price_observations
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_ap_updated') THEN
    CREATE TRIGGER trg_mi_ap_updated BEFORE UPDATE ON mi_approved_prices
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mi_pu_updated') THEN
    CREATE TRIGGER trg_mi_pu_updated BEFORE UPDATE ON mi_provider_usage
      FOR EACH ROW EXECUTE FUNCTION public.set_mi_updated_at();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =========================================================
-- 11. GRANTS
-- =========================================================
GRANT SELECT ON mi_providers TO authenticated;
GRANT SELECT ON mi_sources TO anon, authenticated;
GRANT SELECT ON mi_product_aliases TO anon, authenticated;
GRANT SELECT ON mi_price_observations TO anon, authenticated;
GRANT SELECT ON mi_approved_prices TO anon, authenticated;
GRANT SELECT ON mi_crawl_logs TO authenticated;
GRANT SELECT ON mi_provider_usage TO authenticated;
GRANT SELECT ON mi_anomaly_flags TO authenticated;
