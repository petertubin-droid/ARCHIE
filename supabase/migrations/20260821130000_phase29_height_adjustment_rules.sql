/*
# FRELUX — Phase 29: Height Adjustment Rules

Adds FRELUX height adjustment configuration for the painting estimator.

## Changes
1. Updates the existing `standard_room_height` rule with a configured value (8 ft / 2.44 m).
2. Adds `height_adjustment_rule` — defines what happens when wall height exceeds the
   FRELUX standard (7-8 ft). Walls of 9 ft or above are considered "too high" and
   trigger a customer-facing warning plus an optional admin-configurable adjustment factor.

## Security
- No new tables. Only inserts into existing `estimation_calc_rules`.
- RLS already enabled on `estimation_calc_rules`.
*/

-- =========================================================
-- 1. Update standard_room_height with configured value
-- =========================================================
UPDATE estimation_calc_rules
SET
  rule_value = '{"value_ft": 8, "value_m": 2.4384}'::jsonb,
  rule_status = 'verified_frelux',
  description = 'FRELUX standard room wall height: 8 ft (2.44 m). Walls above this height are considered too high and require height adjustment.'
WHERE rule_key = 'standard_room_height'
  AND calculator_type = 'painting';

-- =========================================================
-- 2. Add height adjustment rule
-- =========================================================
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'height_adjustment_rule',
  'painting',
  '{
    "enabled": true,
    "standard_height_ft": 8,
    "standard_height_m": 2.4384,
    "warning_threshold_ft": 8,
    "warning_threshold_m": 2.4384,
    "adjustment_factor": 1.0,
    "adjustment_type": "warning_only",
    "message": "Wall height exceeds the FRELUX standard (7-8 ft). This is considered a high wall. The calculation accounts for the actual wall height. Professional assessment recommended for non-standard heights."
  }'::jsonb,
  'verified_frelux',
  'FRELUX rule: Walls exceeding 8 ft (2.44 m) are considered too high. An admin-configurable adjustment factor may be applied. Default is warning-only (factor 1.0) - the engine already calculates wall area using the actual height, so the warning ensures the customer is aware their walls are above standard.'
)
ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- =========================================================
-- 3. Add opening deduction rule (admin-configurable)
-- =========================================================
-- Default: 100% deduction (full door/window area subtracted from gross wall area)
-- Admin can configure a different percentage (e.g., 50 for half deduction)
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description)
VALUES (
  'opening_deduction_rule',
  'painting',
  '{"deduction_percentage": 100}'::jsonb,
  'verified_frelux',
  'FRELUX rule: Door and window opening areas are fully deducted (100%) from the gross wall area. Admin can configure a different deduction percentage if needed.'
)
ON CONFLICT (rule_key, calculator_type) DO NOTHING;
