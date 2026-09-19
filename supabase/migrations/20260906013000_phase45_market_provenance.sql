-- =========================================================
-- PHASE 45: Market provenance, service grants, factual profiles
-- (Prompt 2 / Phase 4 + 6 + 12 foundations)
--
-- 1. market_pricing gains the provenance fields required by the
--    global architecture: source, source URL, date collected and
--    confidence. Effective dates already existed.
-- 2. service_role gains the grants on the international tables that
--    phase 40 only gave to anon/authenticated (service_role bypasses
--    RLS but still needs table GRANTs).
-- 3. market_profiles is seeded with FACTUAL regional data for the
--    seven target countries (ISO codes, currencies, unit systems,
--    languages). NO prices, rules or market data are fabricated:
--    every non-NG market is 'coming_soon' and not visible, which
--    surfaces an honest "not available in your region yet" state.
--
--    Currency note: exchange rates are deliberately NOT stored or
--    seeded. Currency conversion requires a configured rate source
--    with its own timestamp and confidence; the platform never
--    fabricates rates.
-- =========================================================

-- ── 1. market_pricing provenance (Prompt 2 / Phase 6) ──
ALTER TABLE market_pricing
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS collected_at date,
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low'));

-- Existing rows were admin-entered; label them honestly so no row
-- carries an ambiguous origin.
UPDATE market_pricing
SET source_name = COALESCE(source_name, 'Admin manual entry'),
    collected_at = COALESCE(collected_at, effective_from)
WHERE source_name IS NULL OR collected_at IS NULL;

-- Index for provenance-based auditing (source + collection date)
CREATE INDEX IF NOT EXISTS idx_mkpr_provenance
  ON market_pricing(source_name, collected_at DESC);

-- ── 2. service_role grants (bypasses RLS, still needs GRANTs) ──
GRANT SELECT ON public.market_profiles TO service_role;
GRANT SELECT ON public.market_material_rules TO service_role;
GRANT SELECT ON public.market_products TO service_role;
GRANT SELECT ON public.market_pricing TO service_role;
GRANT SELECT ON public.market_calculator_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_market_preferences TO service_role;

-- ── 3. Factual market profiles (Prompt 2 / Phase 12) ──
-- Identity/currency/unit facts only — sourced from ISO 4217 and
-- each country's official measurement conventions. is_visible is
-- false for every market that has no priced data yet, so the
-- country selector shows nothing unbacked.

INSERT INTO market_profiles (
  country_code, country_name, region,
  currency_code, currency_symbol, currency_name,
  default_measurement_system,
  supported_length_units, supported_area_units,
  default_length_unit, default_area_unit,
  default_language, local_terminology,
  status, inherits_from, profile_version,
  sort_order, is_visible, admin_notes
) VALUES
  -- Nigeria: the only market with live priced calculators today.
  ('NG', 'Nigeria', 'West Africa',
   'NGN', '₦', 'Naira',
   'mixed',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'active', NULL, '1.0.0',
   10, true, 'Primary market. Live pricing via market intelligence pipeline.'),

  -- United Kingdom
  ('GB', 'United Kingdom', 'Europe',
   'GBP', '£', 'Pound Sterling',
   'mixed',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   100, false, 'Architecture seeded. No priced market data yet — no prices fabricated.'),

  -- United States
  ('US', 'United States', 'North America',
   'USD', '$', 'US Dollar',
   'imperial',
   '{feet,inches,meters}', '{sqft,sqm}',
   'feet', 'sqft',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   101, false, 'Architecture seeded. Imperial construction units. No priced market data yet.'),

  -- Canada
  ('CA', 'Canada', 'North America',
   'CAD', 'C$', 'Canadian Dollar',
   'mixed',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   102, false, 'Architecture seeded. Metric official, imperial common in trade. No priced data yet.'),

  -- Australia
  ('AU', 'Australia', 'Oceania',
   'AUD', 'A$', 'Australian Dollar',
   'metric',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   103, false, 'Architecture seeded. Metric construction industry. No priced market data yet.'),

  -- South Africa
  ('ZA', 'South Africa', 'Southern Africa',
   'ZAR', 'R', 'South African Rand',
   'metric',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   104, false, 'Architecture seeded. Metric construction industry. No priced market data yet.'),

  -- United Arab Emirates
  ('AE', 'United Arab Emirates', 'Middle East',
   'AED', 'د.إ', 'UAE Dirham',
   'metric',
   '{meters,feet,inches}', '{sqm,sqft}',
   'meters', 'sqm',
   'en', '{}'::jsonb,
   'coming_soon', 'NG', '1.0.0',
   105, false, 'Architecture seeded. Metric construction industry. No priced market data yet.')
ON CONFLICT (country_code) DO UPDATE SET
  country_name = EXCLUDED.country_name,
  region = EXCLUDED.region,
  currency_code = EXCLUDED.currency_code,
  currency_symbol = EXCLUDED.currency_symbol,
  currency_name = EXCLUDED.currency_name,
  default_measurement_system = EXCLUDED.default_measurement_system,
  supported_length_units = EXCLUDED.supported_length_units,
  supported_area_units = EXCLUDED.supported_area_units,
  default_length_unit = EXCLUDED.default_length_unit,
  default_area_unit = EXCLUDED.default_area_unit,
  default_language = EXCLUDED.default_language,
  profile_version = EXCLUDED.profile_version,
  updated_at = now()
  -- status, is_visible, local_terminology and notes are intentionally
  -- NOT overwritten: operators may have adjusted launch state locally.
;
