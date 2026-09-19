-- =========================================================
-- Add coverage_adjustment_factor to estimation_surface_conditions
-- Allows admin to configure how much coverage is reduced for each surface type
-- Factor 1.0 = full coverage, 0.85 = 15% reduction, etc.
-- =========================================================

ALTER TABLE estimation_surface_conditions
  ADD COLUMN IF NOT EXISTS coverage_adjustment_factor numeric DEFAULT 1.0;

COMMENT ON COLUMN estimation_surface_conditions.coverage_adjustment_factor IS
  'Multiplier applied to base paint coverage rate. 1.0 = full coverage, 0.85 = 15% more paint needed, etc.';

-- Seed sensible defaults for existing surface conditions
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.80 WHERE condition_key = 'new_plastered';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 1.00 WHERE condition_key = 'previously_painted_sound';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.75 WHERE condition_key = 'peeling_flaking';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.80 WHERE condition_key = 'cracked';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.70 WHERE condition_key = 'damp_moisture';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.85 WHERE condition_key = 'stained';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.75 WHERE condition_key = 'rough_uneven';
UPDATE estimation_surface_conditions SET coverage_adjustment_factor = 0.90 WHERE condition_key = 'unknown';

-- =========================================================
-- Add min_coats_override to estimation_colour_conditions
-- Allows admin to set a minimum coat count for colour transitions
-- =========================================================

ALTER TABLE estimation_colour_conditions
  ADD COLUMN IF NOT EXISTS min_coats_override int DEFAULT 2;

COMMENT ON COLUMN estimation_colour_conditions.min_coats_override IS
  'Minimum number of coats recommended for this colour condition. The calculator will use max(user_input, min_coats_override).';

-- Seed sensible defaults
UPDATE estimation_colour_conditions SET min_coats_override = 2 WHERE condition_key IN ('new_unpainted', 'light', 'previously_painted_same');
UPDATE estimation_colour_conditions SET min_coats_override = 3 WHERE condition_key IN ('dark_strong', 'significant_transition', 'dark_over_light', 'light_over_dark');
