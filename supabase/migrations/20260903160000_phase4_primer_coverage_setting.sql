-- =========================================================
-- Phase 4: Add primer coverage multiplier to engine settings
-- =========================================================
-- The primer coverage multiplier (1.3 = primer covers 30% more area
-- per litre than paint) was hardcoded in calc.ts and paint-engine.ts.
-- Moving it to em_engine_settings makes it admin-configurable.
-- =========================================================

INSERT INTO em_engine_settings (setting_key, setting_value, setting_type, category, description, is_editable)
VALUES
  ('primer_coverage_multiplier', '1.3', 'number', 'material',
   'Multiplier applied to paint coverage rate to determine primer coverage rate. 1.3 = primer covers 30% more area per litre than paint.',
   true)
ON CONFLICT (setting_key) DO NOTHING;
