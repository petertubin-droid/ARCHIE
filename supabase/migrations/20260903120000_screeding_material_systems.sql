-- =========================================================
-- Screeding Material System Configuration
-- =========================================================
-- Supports two screeding material systems:
--   1. putty — Putty-only screeding (coverage-area model)
--   2. white_cement_paint — White Cement + Screeding Paint (coverage-area model)
--
-- Both use a "coverage area" model: X units per Y m².
-- All values are Admin-configurable. No hardcoded business rules in app code.
-- =========================================================

CREATE TABLE IF NOT EXISTS screeding_system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- System type: 'putty' or 'white_cement_paint'
  system_type TEXT NOT NULL CHECK (system_type IN ('putty', 'white_cement_paint')),
  
  -- Display
  display_name TEXT NOT NULL,
  description TEXT,
  
  -- Common coverage configuration
  coverage_area_m2 NUMERIC NOT NULL DEFAULT 12,
  coverage_unit TEXT NOT NULL DEFAULT 'm²',
  default_coats INTEGER NOT NULL DEFAULT 2,
  waste_percentage NUMERIC NOT NULL DEFAULT 0,
  
  -- Currency
  currency TEXT NOT NULL DEFAULT 'NGN',
  currency_symbol TEXT NOT NULL DEFAULT '₦',
  
  -- Putty-specific (nullable when system_type = 'white_cement_paint')
  putty_name TEXT,
  putty_quantity NUMERIC,        -- buckets required per coverage area
  putty_unit TEXT,               -- e.g. 'bucket'
  putty_price_per_unit NUMERIC DEFAULT 0,
  
  -- Screeding Paint-specific (nullable when system_type = 'putty')
  paint_name TEXT,
  paint_quantity NUMERIC,        -- buckets required per coverage area
  paint_unit TEXT,               -- e.g. 'bucket'
  paint_price_per_unit NUMERIC DEFAULT 0,
  
  -- White Cement-specific (nullable when system_type = 'putty')
  cement_name TEXT,
  cement_quantity NUMERIC,       -- bags required per coverage area
  cement_unit TEXT,              -- e.g. 'bag'
  cement_price_per_unit NUMERIC DEFAULT 0,
  
  -- Rounding rule: 'ceil' (round up to whole purchasable unit) or 'none'
  rounding_rule TEXT NOT NULL DEFAULT 'ceil',
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one active config per system_type
CREATE UNIQUE INDEX IF NOT EXISTS screeding_system_config_active_unique
  ON screeding_system_config (system_type)
  WHERE is_active = true;

-- =========================================================
-- Seed default configurations
-- =========================================================

-- Putty: 2 buckets per 12 m², 2 coats, ₦12,000/bucket
INSERT INTO screeding_system_config (
  system_type, display_name, description,
  coverage_area_m2, coverage_unit, default_coats, waste_percentage,
  currency, currency_symbol,
  putty_name, putty_quantity, putty_unit, putty_price_per_unit,
  rounding_rule, is_active, sort_order
) VALUES (
  'putty',
  'Putty',
  'Professional Putty screeding calculation. Putty is applied directly to prepared walls.',
  12, 'm²', 2, 0,
  'NGN', '₦',
  'Putty', 2, 'bucket', 12000,
  'ceil', true, 0
)
ON CONFLICT DO NOTHING;

-- White Cement + Screeding Paint: 2 paint buckets + 1 cement bag per 20 m², 2 coats, 20% waste
INSERT INTO screeding_system_config (
  system_type, display_name, description,
  coverage_area_m2, coverage_unit, default_coats, waste_percentage,
  currency, currency_symbol,
  paint_name, paint_quantity, paint_unit, paint_price_per_unit,
  cement_name, cement_quantity, cement_unit, cement_price_per_unit,
  rounding_rule, is_active, sort_order
) VALUES (
  'white_cement_paint',
  'White Cement + Screeding Paint',
  'Combined White Cement and Screeding Paint calculation. The traditional screeding mix.',
  20, 'm²', 2, 20,
  'NGN', '₦',
  'Screeding Paint', 2, 'bucket', 25000,
  'White Cement', 1, 'bag', 7500,
  'ceil', true, 1
)
ON CONFLICT DO NOTHING;

-- =========================================================
-- RLS Policies — Admin-only write, public read
-- =========================================================

ALTER TABLE screeding_system_config ENABLE ROW LEVEL SECURITY;

-- Public can read active config (needed for calculator)

DROP POLICY IF EXISTS screeding_system_config_read ON screeding_system_config;
CREATE POLICY screeding_system_config_read
  ON screeding_system_config FOR SELECT
  TO public
  USING (true);

-- Only authenticated users with admin role can write

DROP POLICY IF EXISTS screeding_system_config_admin_write ON screeding_system_config;
CREATE POLICY screeding_system_config_admin_write
  ON screeding_system_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Service role can do everything

DROP POLICY IF EXISTS screeding_system_config_service_all ON screeding_system_config;
CREATE POLICY screeding_system_config_service_all
  ON screeding_system_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =========================================================
-- Auto-update updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION update_screeding_system_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS screeding_system_config_updated_at
  ON screeding_system_config;

CREATE TRIGGER screeding_system_config_updated_at
  BEFORE UPDATE ON screeding_system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_screeding_system_config_timestamp();
