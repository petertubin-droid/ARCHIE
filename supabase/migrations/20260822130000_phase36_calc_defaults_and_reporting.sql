-- =========================================================
-- Phase 36: Calculator defaults, price source fields, and
--           calculation reporting mechanism
-- =========================================================

-- 1. Seed missing calc rules for all calculator types
--    These replace hardcoded frontend defaults with admin-configurable values.

INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  -- Global defaults (applies to all calculators)
  ('default_door_width_m', NULL, '{"value": 0.8}', 'admin_configured', 'Default door width in metres. Used by paint and screeding calculators for opening deductions.'),
  ('default_door_height_m', NULL, '{"value": 2.4}', 'admin_configured', 'Default door height in metres. Used by paint and screeding calculators for opening deductions.'),
  ('default_window_width_m', NULL, '{"value": 1.2}', 'admin_configured', 'Default window width in metres. Used by paint and screeding calculators for opening deductions.'),
  ('default_window_height_m', NULL, '{"value": 1.2}', 'admin_configured', 'Default window height in metres. Used by paint and screeding calculators for opening deductions.'),
  ('estimate_disclaimer', NULL, '{"text": "These estimates are calculated based on the assumptions shown above and may vary according to site conditions, products used, and current market prices. Always confirm with your supplier or contractor before purchasing."}', 'admin_configured', 'Disclaimer text shown on all calculator results. Editable by admin.'),

  -- Painting-specific defaults
  ('default_coverage_m2_per_liter', 'painting', '{"value": 10}', 'admin_configured', 'Default paint coverage rate in square metres per litre per coat. Used when product quality coverage is not configured.'),
  ('default_container_sizes_liters', 'painting', '{"value": [1, 4, 20]}', 'admin_configured', 'Default paint container sizes available for purchase, in litres, ascending.'),
  ('default_waste_margin_pct', 'painting', '{"value": 10}', 'admin_configured', 'Default waste/spillage margin percentage for painting.'),
  ('standard_room_height_m', 'painting', '{"value": 2.4384}', 'admin_configured', 'Standard room height in metres (8 feet). Used when user does not specify height.'),
  ('waste_margin_options', 'painting', '{"value": [0, 5, 10, 15]}', 'admin_configured', 'Quick-select waste margin options shown in the painting calculator UI.'),

  -- Screeding defaults
  ('default_waste_margin_pct', 'screeding', '{"value": 10}', 'admin_configured', 'Default waste/spillage margin percentage for screeding.'),
  ('waste_margin_options', 'screeding', '{"value": [0, 5, 10, 15]}', 'admin_configured', 'Quick-select waste margin options shown in the screeding calculator UI.'),

  -- POP ceiling defaults
  ('default_waste_margin_pct', 'pop_ceiling', '{"value": 10}', 'admin_configured', 'Default waste/spillage margin percentage for POP ceiling.'),
  ('waste_margin_options', 'pop_ceiling', '{"value": [0, 5, 10, 15, 20]}', 'admin_configured', 'Quick-select waste margin options shown in the POP ceiling calculator UI.'),

  -- Tile defaults
  ('default_waste_margin_pct', 'tile', '{"value": 10}', 'admin_configured', 'Default waste/spillage margin percentage for tiling.'),
  ('waste_margin_options', 'tile', '{"value": [5, 10, 15, 20]}', 'admin_configured', 'Quick-select waste margin options shown in the tile calculator UI.'),
  ('default_grout_gap_mm', 'tile', '{"value": 3}', 'admin_configured', 'Default grout gap in millimetres between tiles.'),

  -- Tyrolene defaults
  ('default_waste_margin_pct', 'tyrolene', '{"value": 5}', 'admin_configured', 'Default waste/spillage margin percentage for tyrolene.'),

  -- Finish estimator defaults
  ('default_waste_margin_pct', 'finish', '{"value": 10}', 'admin_configured', 'Default waste/spillage margin percentage for finish estimator.')

ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- 2. Add price_source field to estimation_prices
ALTER TABLE estimation_prices ADD COLUMN IF NOT EXISTS price_source text;
COMMENT ON COLUMN estimation_prices.price_source IS 'Where the price was obtained from, e.g. "market survey", "supplier quote", "online". Admin-configurable.';

-- 3. Create calculation_reports table for "Report Incorrect Calculation"
CREATE TABLE IF NOT EXISTS calculation_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculator_type text NOT NULL CHECK (calculator_type IN ('painting', 'screeding', 'pop_ceiling', 'tile', 'tyrolene', 'finish', 'cost_estimator')),
  page_url        text NOT NULL,
  user_input      jsonb,
  expected_result jsonb,
  actual_result   jsonb,
  description     text NOT NULL,
  contact_email   text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calculation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_reports FORCE ROW LEVEL SECURITY;

-- Public can submit reports; only admins can read/update
DROP POLICY IF EXISTS "calc_reports_public_insert" ON calculation_reports;
CREATE POLICY "calc_reports_public_insert" ON calculation_reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "calc_reports_admin_read" ON calculation_reports;
CREATE POLICY "calc_reports_admin_read" ON calculation_reports FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "calc_reports_admin_update" ON calculation_reports;
CREATE POLICY "calc_reports_admin_update" ON calculation_reports FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "calc_reports_admin_delete" ON calculation_reports;
CREATE POLICY "calc_reports_admin_delete" ON calculation_reports FOR DELETE
  TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS "calc_reports_set_updated_at" ON calculation_reports;
CREATE TRIGGER "calc_reports_set_updated_at"
  BEFORE UPDATE ON calculation_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_calc_reports_status ON calculation_reports(status);
CREATE INDEX IF NOT EXISTS idx_calc_reports_type ON calculation_reports(calculator_type);
CREATE INDEX IF NOT EXISTS idx_calc_reports_created ON calculation_reports(created_at DESC);

-- 4. Add "how_calculated" method description rules for each calculator type
--    These are shown in the "How this estimate is calculated" section
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  ('how_calculated_text', 'painting', '{"text": "1. Wall area = (Length + Width) × 2 × Height\n2. Ceiling area = Length × Width (if included)\n3. Deduct door and window openings\n4. Paintable area = Wall area + Ceiling area - Openings\n5. Paint litres = Paintable area × Coats ÷ Coverage rate\n6. Waste-adjusted litres = Paint litres × (1 + Waste margin)\n7. Containers = Ceiling(waste-adjusted litres ÷ container size)\n8. Ceiling paint = Fixed rule (admin-configured buckets per room)\n9. Total cost = Container count × Price per container"}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for painting.'),
  
  ('how_calculated_text', 'screeding', '{"text": "1. Wall area = (Length + Width) × 2 × Height\n2. Deduct door and window openings\n3. Net screeding area = Wall area - Openings\n4. Paint required = Net area ÷ Coverage rate × (1 + Waste margin)\n5. Buckets needed = Ceiling(Paint litres ÷ Bucket size)\n6. Cement required = Paint litres × Cement consumption ratio\n7. Cement bags = Ceiling(Cement kg ÷ Bag size)\n8. Total cost = (Buckets × Price) + (Bags × Price)"}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for screeding.'),
  
  ('how_calculated_text', 'pop_ceiling', '{"text": "1. Ceiling area = Length × Width\n2. Adjusted area = Ceiling area × (1 + Waste margin)\n3. For each material: Quantity = Adjusted area ÷ Coverage rate\n4. Packages = Ceiling(Quantity ÷ Package size)\n5. Cost = Packages × Unit price\n6. Total = Sum of all material costs\nNote: Labour is not included — negotiated separately."}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for POP ceiling.'),
  
  ('how_calculated_text', 'tile', '{"text": "1. Surface area = Length × Width (floor) or Length × Height (wall)\n2. Adjusted area = Surface area × (1 + Waste margin)\n3. Tiles needed = Ceiling(Adjusted area ÷ Tile area)\n4. Boxes needed = Ceiling(Tiles ÷ Tiles per box)\n5. Adhesive/Cement = Adjusted area ÷ Coverage rate (method-dependent)\n6. Grout = Adjusted area ÷ Coverage rate\n7. Total cost = Sum of all material costs\nNote: Labour is not included — negotiated separately."}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for tiles.'),
  
  ('how_calculated_text', 'tyrolene', '{"text": "1. Partitions are converted to equivalent standard partitions\n2. Material quantities are based on admin-configured ratios per 4 standard partitions\n3. Theoretical vs practical purchase quantities shown separately\n4. Practical quantity rounds up to full packs (ceil)\n5. Total cost = Sum of (Practical quantity × Unit price)\nNote: Labour is not included — negotiated separately."}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for tyrolene.'),
  
  ('how_calculated_text', 'finish', '{"text": "1. Wall area = (Length + Width) × 2 × Height\n2. Deduct door and window openings\n3. Net area = Wall area - Openings\n4. For each finish material: Quantity = Net area ÷ Coverage rate × (1 + Waste margin)\n5. Packages = Ceiling(Quantity ÷ Package size)\n6. Cost = Packages × Unit price\n7. Total = Sum of all material costs\nNote: Labour is not included — negotiated separately."}', 'admin_configured', 'Methodology text shown in the "How this estimate is calculated" section for finish estimator.')

ON CONFLICT (rule_key, calculator_type) DO NOTHING;
