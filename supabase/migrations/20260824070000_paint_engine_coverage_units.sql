-- =========================================================
-- Paint Calculation Engine — Coverage Units & Calibration
-- =========================================================

-- 1. Add coverage_unit to estimation_product_quality
-- Supports: m2_per_liter, m2_per_bucket, ft2_per_liter, ft2_per_bucket, frelux_calibration
ALTER TABLE estimation_product_quality
  ADD COLUMN IF NOT EXISTS coverage_unit text DEFAULT 'm2_per_liter';

COMMENT ON COLUMN estimation_product_quality.coverage_unit IS
  'Unit for coverage value: m2_per_liter, m2_per_bucket, ft2_per_liter, ft2_per_bucket, or frelux_calibration';

-- 2. Add ceiling_coverage to estimation_product_quality
-- Separate ceiling coverage rate (may differ from wall coverage)
ALTER TABLE estimation_product_quality
  ADD COLUMN IF NOT EXISTS ceiling_coverage numeric DEFAULT NULL;

COMMENT ON COLUMN estimation_product_quality.ceiling_coverage IS
  'Separate coverage rate for ceiling. NULL = use same as wall coverage. Must be configured independently per FRELUX rules.';

-- 3. Add ceiling_coverage_unit to estimation_product_quality
ALTER TABLE estimation_product_quality
  ADD COLUMN IF NOT EXISTS ceiling_coverage_unit text DEFAULT NULL;

COMMENT ON COLUMN estimation_product_quality.ceiling_coverage_unit IS
  'Unit for ceiling coverage. NULL = same as coverage_unit.';

-- 4. Add calibration_reference to estimation_calc_rules
-- Stores FRELUX calibration reference points (e.g., 10x12ft room ≈ 1 bucket)
-- rule_key: 'frelux_calibration_references'
-- rule_value: { "references": [ { "room_ft": "10x12", "height_ft": 8, "coats": 2, "buckets": 1.0, "quality_id": "..." } ] }

-- 5. Add ceiling_coverage_rule to estimation_calc_rules
-- Already have ceiling_quantity_per_room; add ceiling_coverage_rate as alternative
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'ceiling_coverage_rate',
  'painting',
  '{"enabled": false, "m2_per_liter": null}',
  'admin_configured',
  'Separate ceiling coverage rate. When enabled and configured, ceiling paint is calculated using this rate instead of the ceiling_quantity_per_room rule.'
) ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- 6. Add coat_count_rule to calc rules (already exists as standard_coat_count)
-- Verify it exists
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'standard_coat_count',
  'painting',
  '{"count": 2}',
  'verified_frelux',
  'FRELUX standard: 2 coats for FRELUX paint products.'
) ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- 7. Add FRELUX calibration references placeholder
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'frelux_calibration_references',
  'painting',
  '{"references": []}',
  'admin_configured',
  'FRELUX calibration reference points for room-based estimating. Example: 10x12ft room at 8ft height, 2 coats ≈ 1 bucket. Admin configures real-world reference data.'
) ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- 8. Add coverage_unit_options rule
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'coverage_unit_options',
  'painting',
  '{"units": ["m2_per_liter", "m2_per_bucket", "ft2_per_liter", "ft2_per_bucket", "frelux_calibration"]}',
  'verified_frelux',
  'Available coverage unit options for admin configuration.'
) ON CONFLICT (rule_key, calculator_type) DO NOTHING;
