-- =========================================================
-- Phase 40: International Architecture & Multi-Market Engine
-- =========================================================
-- STRICTLY ADDITIVE: No existing tables are modified destructively.
-- Nigeria remains the default market. All existing behavior is preserved.
--
-- New tables:
--   1. market_profiles          — country/market configurations
--   2. market_material_rules    — material calculation rules per market
--   3. market_products          — products keyed by market + currency
--   4. market_pricing           — price entries keyed by market + currency
--   5. market_calculator_config — calculator availability/rules per market
--   6. user_market_preferences  — user's selected market + unit preference
--
-- Additive nullable columns on existing tables:
--   estimation_estimates: market_code, input_unit, normalized_unit
--     (all nullable with safe defaults — existing rows get NULL = Nigeria)
--
-- No existing policies, triggers, or data are touched.
-- =========================================================

-- =========================================================
-- 1. MARKET_PROFILES — country/market configurations
-- =========================================================
CREATE TABLE IF NOT EXISTS market_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  country_code text NOT NULL UNIQUE,        -- ISO 3166-1 alpha-2: NG, GH, KE, ZA, etc.
  country_name text NOT NULL,                -- "Nigeria", "Ghana", etc.
  region text,                               -- "West Africa", "East Africa", etc.

  -- Currency
  currency_code text NOT NULL,               -- NGN, GHS, KES, ZAR, etc.
  currency_symbol text NOT NULL,             -- ₦, ₵, KSh, R, etc.
  currency_name text,                        -- "Naira", "Cedi", "Shilling", etc.

  -- Measurement
  default_measurement_system text NOT NULL DEFAULT 'metric'
    CHECK (default_measurement_system IN ('metric', 'imperial', 'mixed')),
  supported_length_units text[] NOT NULL DEFAULT '{meters,feet}',
  supported_area_units text[] NOT NULL DEFAULT '{sqm,sqft}',
  default_length_unit text NOT NULL DEFAULT 'meters',
  default_area_unit text NOT NULL DEFAULT 'sqm',

  -- Language
  default_language text NOT NULL DEFAULT 'en',

  -- Local terminology (JSON: key → local term)
  -- e.g. {"paint_bucket": "gallon", "cement_bag": "50kg bag"}
  local_terminology jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Status
  status text NOT NULL DEFAULT 'unsupported'
    CHECK (status IN ('active', 'coming_soon', 'unsupported', 'test_only')),

  -- Inheritance: if set, this market inherits from the named profile
  -- and overrides only what it defines. NULL = inherits from global defaults.
  inherits_from text,                         -- country_code of parent market

  -- Configuration version (for calculation traceability)
  profile_version text NOT NULL DEFAULT '1.0.0',

  -- Metadata
  sort_order int NOT NULL DEFAULT 100,
  is_visible boolean NOT NULL DEFAULT false,  -- visible in country selector?
  admin_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_profiles_status ON market_profiles(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_market_profiles_code ON market_profiles(country_code);

ALTER TABLE market_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read active/coming_soon market profiles (for country selector)
DROP POLICY IF EXISTS "market_profiles_public_read" ON market_profiles;
CREATE POLICY "market_profiles_public_read"
  ON market_profiles FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'coming_soon'));

-- Admin can manage all market profiles
DROP POLICY IF EXISTS "market_profiles_admin_all" ON market_profiles;
CREATE POLICY "market_profiles_admin_all"
  ON market_profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 2. MARKET_MATERIAL_RULES — material calculation rules per market
-- =========================================================
-- Separates geometry (area/volume) from material rules.
-- A rule says: "for market X, calculator Y, surface area A → material quantity M"
-- This is NOT a product record. Products determine packaging.
CREATE TABLE IF NOT EXISTS market_material_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,

  -- Which calculator this rule applies to
  calculator_type text NOT NULL
    CHECK (calculator_type IN ('painting', 'screeding', 'pop_ceiling', 'tile', 'tyrolene', 'grafitex', 'block', 'roofing', 'cost_estimator', 'foundation', 'structural', 'build_to_roof', 'sequence')),

  -- Rule identification
  rule_key text NOT NULL,                     -- e.g. "screeding_cement_ratio", "paint_coverage_per_coat"
  rule_label text,                            -- human-readable: "Cement-Sand Mix Ratio"

  -- The rule value(s)
  -- Could be a single number, a ratio, a formula reference, or structured data
  -- e.g. {"ratio": "1:3", "unit": "m² per bag"} or {"coverage": 35, "coverage_unit": "m² per bucket"}
  rule_value jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Description of what this rule means
  description text,

  -- Version of this rule (for calculation traceability)
  rule_version text NOT NULL DEFAULT '1.0.0',

  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,                           -- NULL = currently active

  -- Audit
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One active rule per market+calculator+rule_key
  UNIQUE (market_code, calculator_type, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_mmr_market ON market_material_rules(market_code, calculator_type);
CREATE INDEX IF NOT EXISTS idx_mmr_active ON market_material_rules(market_code, calculator_type, is_active);

ALTER TABLE market_material_rules ENABLE ROW LEVEL SECURITY;

-- Public can read active material rules (calculations need them)
DROP POLICY IF EXISTS "mmr_public_read" ON market_material_rules;
CREATE POLICY "mmr_public_read"
  ON market_material_rules FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admin can manage all material rules
DROP POLICY IF EXISTS "mmr_admin_all" ON market_material_rules;
CREATE POLICY "mmr_admin_all"
  ON market_material_rules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 3. MARKET_PRODUCTS — products keyed by market + currency
-- =========================================================
-- This is the market-specific product database.
-- It is SEPARATE from the existing estimation_products table.
-- Existing estimation_products remains untouched.
CREATE TABLE IF NOT EXISTS market_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,

  -- Product identity
  product_name text NOT NULL,
  brand text,
  category text NOT NULL,                     -- "paint", "cement", "tile", "screeding_mix", etc.

  -- Which calculators this product is compatible with
  calculator_compatibility text[] NOT NULL DEFAULT '{}'::text[],

  -- Packaging
  package_size numeric,                        -- 20 (litres), 50 (kg), 1 (carton), etc.
  package_unit text,                           -- "litres", "kg", "carton", "bag", "bucket", etc.

  -- Coverage / yield (how much surface this package covers)
  coverage_value numeric,                      -- 35 (m² per bucket)
  coverage_unit text,                          -- "m² per bucket", "m² per bag", etc.

  -- Pricing (stored as separate entries in market_pricing, but
  -- we also store a current_price snapshot for quick reads)
  current_price numeric,
  currency_code text NOT NULL,                 -- NGN, GHS, KES, etc.

  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,

  -- Metadata
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkp_market_cat ON market_products(market_code, category, is_active);
CREATE INDEX IF NOT EXISTS idx_mkp_name ON market_products(market_code, product_name);
CREATE INDEX IF NOT EXISTS idx_mkp_calc ON market_products USING gin (calculator_compatibility);

ALTER TABLE market_products ENABLE ROW LEVEL SECURITY;

-- Public can read active products
DROP POLICY IF EXISTS "mkp_public_read" ON market_products;
CREATE POLICY "mkp_public_read"
  ON market_products FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admin can manage all products
DROP POLICY IF EXISTS "mkp_admin_all" ON market_products;
CREATE POLICY "mkp_admin_all"
  ON market_products FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 4. MARKET_PRICING — price entries keyed by market + currency
-- =========================================================
-- Prices are never hardcoded in calculator formulas.
-- Each price is associated with a market, currency, product, and effective date.
CREATE TABLE IF NOT EXISTS market_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,
  product_id uuid REFERENCES market_products(id) ON DELETE CASCADE,

  -- Can reference a market_products entry OR be a standalone material price
  -- (e.g. "labour per m²" that isn't a product)
  price_label text,                            -- human-readable label
  price_type text NOT NULL DEFAULT 'product'
    CHECK (price_type IN ('product', 'material', 'labour', 'quality_level')),

  -- The price
  price numeric NOT NULL DEFAULT 0,
  currency_code text NOT NULL,                 -- NGN, GHS, KES, etc.

  -- What the price is per (e.g. "per bucket", "per bag", "per m²")
  price_unit text,                             -- "bucket", "bag", "m²", "carton"

  -- Package size reference (if applicable)
  package_size numeric,
  package_unit text,

  -- Effective dates
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,                            -- NULL = currently active

  -- Version
  pricing_version text NOT NULL DEFAULT '1.0.0',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkpr_market ON market_pricing(market_code, currency_code, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_mkpr_product ON market_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_mkpr_active ON market_pricing(market_code, effective_to) WHERE effective_to IS NULL;

ALTER TABLE market_pricing ENABLE ROW LEVEL SECURITY;

-- Public can read active prices (calculations need them)
DROP POLICY IF EXISTS "mkpr_public_read" ON market_pricing;
CREATE POLICY "mkpr_public_read"
  ON market_pricing FOR SELECT
  TO anon, authenticated
  USING (effective_to IS NULL);

-- Admin can manage all pricing
DROP POLICY IF EXISTS "mkpr_admin_all" ON market_pricing;
CREATE POLICY "mkpr_admin_all"
  ON market_pricing FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 5. MARKET_CALCULATOR_CONFIG — calculator availability per market
-- =========================================================
-- Defines which calculators are available in each market
-- and any market-specific calculator settings.
CREATE TABLE IF NOT EXISTS market_calculator_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  market_code text NOT NULL REFERENCES market_profiles(country_code) ON DELETE CASCADE,
  calculator_type text NOT NULL
    CHECK (calculator_type IN ('painting', 'screeding', 'pop_ceiling', 'tile', 'tyrolene', 'grafitex', 'block', 'roofing', 'cost_estimator', 'foundation', 'structural', 'build_to_roof', 'sequence')),

  -- Availability
  is_available boolean NOT NULL DEFAULT false,

  -- Market-specific calculator settings (overrides global defaults)
  -- e.g. {"default_coats": 2, "default_waste_margin": 0.1}
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Label overrides for this market
  -- e.g. {"calculator_name": "Painting Calculator", "result_unit": "buckets"}
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Version of this calculator config
  config_version text NOT NULL DEFAULT '1.0.0',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (market_code, calculator_type)
);

CREATE INDEX IF NOT EXISTS idx_mcc_market ON market_calculator_config(market_code, is_available);

ALTER TABLE market_calculator_config ENABLE ROW LEVEL SECURITY;

-- Public can read available calculator configs
DROP POLICY IF EXISTS "mcc_public_read" ON market_calculator_config;
CREATE POLICY "mcc_public_read"
  ON market_calculator_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin can manage all calculator configs
DROP POLICY IF EXISTS "mcc_admin_all" ON market_calculator_config;
CREATE POLICY "mcc_admin_all"
  ON market_calculator_config FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 6. USER_MARKET_PREFERENCES — user's market + unit preferences
-- =========================================================
-- Stored separately from calculation data.
-- If no preference exists, system defaults to Nigeria.
CREATE TABLE IF NOT EXISTS user_market_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Selected market
  market_code text NOT NULL DEFAULT 'NG'
    REFERENCES market_profiles(country_code) ON DELETE RESTRICT,

  -- Measurement preferences
  preferred_length_unit text NOT NULL DEFAULT 'meters'
    CHECK (preferred_length_unit IN ('meters', 'feet', 'inches')),
  preferred_area_unit text NOT NULL DEFAULT 'sqm'
    CHECK (preferred_area_unit IN ('sqm', 'sqft')),

  -- Preferred currency display (defaults to market currency)
  display_currency text,                       -- NULL = use market default

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ump_user ON user_market_preferences(user_id);

ALTER TABLE user_market_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read their own preferences
DROP POLICY IF EXISTS "ump_user_read" ON user_market_preferences;
CREATE POLICY "ump_user_read"
  ON user_market_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own preferences
DROP POLICY IF EXISTS "ump_user_insert" ON user_market_preferences;
CREATE POLICY "ump_user_insert"
  ON user_market_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own preferences
DROP POLICY IF EXISTS "ump_user_update" ON user_market_preferences;
CREATE POLICY "ump_user_update"
  ON user_market_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own preferences (reset to default)
DROP POLICY IF EXISTS "ump_user_delete" ON user_market_preferences;
CREATE POLICY "ump_user_delete"
  ON user_market_preferences FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin can read all (for analytics)
DROP POLICY IF EXISTS "ump_admin_read" ON user_market_preferences;
CREATE POLICY "ump_admin_read"
  ON user_market_preferences FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- =========================================================
-- 7. ADDITIVE COLUMNS on estimation_estimates
-- =========================================================
-- These are all nullable with no default changes.
-- Existing rows: NULL = treated as Nigeria (backward compatible).
-- New rows: can store market context for traceability.

DO $$
BEGIN
  -- Only add if not already present (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimation_estimates' AND column_name = 'market_code'
  ) THEN
    ALTER TABLE estimation_estimates ADD COLUMN market_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimation_estimates' AND column_name = 'input_unit'
  ) THEN
    ALTER TABLE estimation_estimates ADD COLUMN input_unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimation_estimates' AND column_name = 'normalized_unit'
  ) THEN
    ALTER TABLE estimation_estimates ADD COLUMN normalized_unit text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimation_estimates' AND column_name = 'market_profile_version'
  ) THEN
    ALTER TABLE estimation_estimates ADD COLUMN market_profile_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimation_estimates' AND column_name = 'material_rule_version'
  ) THEN
    ALTER TABLE estimation_estimates ADD COLUMN material_rule_version text;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =========================================================
-- 8. SEED: NIGERIA MARKET PROFILE (the first and primary market)
-- =========================================================
-- Nigeria is the first active market. This preserves all existing behavior.
INSERT INTO market_profiles (
  country_code, country_name, region,
  currency_code, currency_symbol, currency_name,
  default_measurement_system,
  supported_length_units, supported_area_units,
  default_length_unit, default_area_unit,
  default_language,
  local_terminology,
  status, profile_version, sort_order, is_visible
) VALUES (
  'NG', 'Nigeria', 'West Africa',
  'NGN', '₦', 'Naira',
  'mixed',
  '{meters,feet,inches}',
  '{sqm,sqft}',
  'meters', 'sqm',
  'en',
  '{
    "paint_bucket": "gallon (4 litres)",
    "cement_bag": "50kg bag",
    "white_cement_bag": "40kg bag",
    "screeding_mix": "Plastering Sand + Cement",
    "tile_carton": "carton",
    "pop_bag": "25kg bag"
  }'::jsonb,
  'active', '1.0.0', 1, true
)
ON CONFLICT (country_code) DO NOTHING;

-- =========================================================
-- 9. SEED: GHANA MARKET PROFILE (coming_soon — architecture demo)
-- =========================================================
-- Ghana is architecturally supported but NOT active.
-- No material rules, prices, or products are invented.
-- This demonstrates the multi-market architecture without fabricating data.
INSERT INTO market_profiles (
  country_code, country_name, region,
  currency_code, currency_symbol, currency_name,
  default_measurement_system,
  supported_length_units, supported_area_units,
  default_length_unit, default_area_unit,
  default_language,
  local_terminology,
  status, profile_version, sort_order, is_visible
) VALUES (
  'GH', 'Ghana', 'West Africa',
  'GHS', '₵', 'Cedi',
  'metric',
  '{meters,feet}',
  '{sqm,sqft}',
  'meters', 'sqm',
  'en',
  '{}'::jsonb,
  'coming_soon', '0.1.0', 10, true
)
ON CONFLICT (country_code) DO NOTHING;

-- =========================================================
-- 10. SEED: KENYA MARKET PROFILE (coming_soon)
-- =========================================================
INSERT INTO market_profiles (
  country_code, country_name, region,
  currency_code, currency_symbol, currency_name,
  default_measurement_system,
  supported_length_units, supported_area_units,
  default_length_unit, default_area_unit,
  default_language,
  local_terminology,
  status, profile_version, sort_order, is_visible
) VALUES (
  'KE', 'Kenya', 'East Africa',
  'KES', 'KSh', 'Kenyan Shilling',
  'metric',
  '{meters,feet}',
  '{sqm,sqft}',
  'meters', 'sqm',
  'en',
  '{}'::jsonb,
  'coming_soon', '0.1.0', 20, true
)
ON CONFLICT (country_code) DO NOTHING;

-- =========================================================
-- 11. SEED: SOUTH AFRICA MARKET PROFILE (coming_soon)
-- =========================================================
INSERT INTO market_profiles (
  country_code, country_name, region,
  currency_code, currency_symbol, currency_name,
  default_measurement_system,
  supported_length_units, supported_area_units,
  default_length_unit, default_area_unit,
  default_language,
  local_terminology,
  status, profile_version, sort_order, is_visible
) VALUES (
  'ZA', 'South Africa', 'Southern Africa',
  'ZAR', 'R', 'Rand',
  'metric',
  '{meters,feet}',
  '{sqm,sqft}',
  'meters', 'sqm',
  'en',
  '{}'::jsonb,
  'coming_soon', '0.1.0', 30, true
)
ON CONFLICT (country_code) DO NOTHING;

-- =========================================================
-- 12. SEED: NIGERIA CALCULATOR CONFIG (all calculators available)
-- =========================================================
-- Nigeria has all calculators active (preserving existing behavior).
INSERT INTO market_calculator_config (market_code, calculator_type, is_available, config_version)
VALUES
  ('NG', 'painting',       true, '1.0.0'),
  ('NG', 'screeding',       true, '1.0.0'),
  ('NG', 'pop_ceiling',     true, '1.0.0'),
  ('NG', 'tile',           true, '1.0.0'),
  ('NG', 'tyrolene',       true, '1.0.0'),
  ('NG', 'grafitex',       true, '1.0.0'),
  ('NG', 'cost_estimator', true, '1.0.0')
ON CONFLICT (market_code, calculator_type) DO NOTHING;

-- =========================================================
-- 13. TRIGGERS — updated_at for all new tables
-- =========================================================
CREATE OR REPLACE FUNCTION update_market_table_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mp_profiles_updated') THEN
    CREATE TRIGGER trg_mp_profiles_updated BEFORE UPDATE ON market_profiles
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mmr_updated') THEN
    CREATE TRIGGER trg_mmr_updated BEFORE UPDATE ON market_material_rules
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mkp_updated') THEN
    CREATE TRIGGER trg_mkp_updated BEFORE UPDATE ON market_products
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mkpr_updated') THEN
    CREATE TRIGGER trg_mkpr_updated BEFORE UPDATE ON market_pricing
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mcc_updated') THEN
    CREATE TRIGGER trg_mcc_updated BEFORE UPDATE ON market_calculator_config
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ump_updated') THEN
    CREATE TRIGGER trg_ump_updated BEFORE UPDATE ON user_market_preferences
      FOR EACH ROW EXECUTE FUNCTION update_market_table_updated_at();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =========================================================
-- 14. GRANTS
-- =========================================================
GRANT SELECT ON market_profiles TO anon, authenticated;
GRANT SELECT ON market_material_rules TO anon, authenticated;
GRANT SELECT ON market_products TO anon, authenticated;
GRANT SELECT ON market_pricing TO anon, authenticated;
GRANT SELECT ON market_calculator_config TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_market_preferences TO authenticated;
