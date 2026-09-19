/*
# FRELUX — Phase 3: Tyrolene Estimator

This migration seeds the Tyrolene product, its five materials, the verified
FRELUX material ratio, standard partition dimensions (admin-configurable),
and production rules for Tyrolene.

## Seeded Data
- Tyrolene product in estimation_products (exterior, partition_based, no quality levels)
- 5 materials: cement, sand, acrylic-bond, water-seal, anti-fungal
- Calc rules: standard partition dimensions (null until admin configures),
  material ratio (verified FRELUX values), purchase rounding
- Production rules: Owerri (no minimum), Outside Owerri (unconfigured — NOT invented)

## Security
- Uses existing RLS policies from Phase 1 migration — no new tables.
- All configuration: admin-only write (is_admin()).
- Public read on active catalogue data.
*/

-- =========================================================
-- 1. Tyrolene Product
-- =========================================================

INSERT INTO estimation_products (
  name, slug, category, description, product_type,
  calculation_method, recommended_surface,
  has_quality_levels, is_active, sort_order
) VALUES (
  'Tyrolene',
  'tyrolene',
  'tyrolene',
  'FRELUX Tyrolene — exterior textured/rough finishing system. Partition-based estimation. Exterior only.',
  'coating',
  'partition_based',
  'exterior',
  false,
  true,
  20
) ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. Tyrolene Materials (5)
-- =========================================================

-- Use ON CONFLICT (slug) to avoid duplicates if materials already exist

INSERT INTO estimation_materials (name, slug, category, description, is_active, sort_order) VALUES
  ('Cement', 'cement', 'cement', 'Cement for Tyrolene production mix.', true, 1),
  ('Sand', 'sand', 'aggregate', 'Sand for Tyrolene production mix.', true, 2),
  ('Acrylic Bond', 'acrylic-bond', 'binder', 'Acrylic bonding agent for Tyrolene production mix.', true, 3),
  ('Water Seal', 'water-seal', 'sealer', 'Water seal for Tyrolene production mix.', true, 4),
  ('Anti-fungal', 'anti-fungal', 'additive', 'Anti-fungal additive for Tyrolene production mix.', true, 5)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 3. Tyrolene Calc Rules
-- =========================================================

-- Standard partition dimensions (admin must configure — do NOT invent)
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  (
    'standard_partition_dimensions',
    'tyrolene',
    '{"width": null, "height": null}',
    'admin_configured',
    'Standard partition dimensions (width × height in metres) used as the baseline for Tyrolene estimation. Requires FRELUX admin configuration — do NOT invent a value.'
  ),
  (
    'material_ratio',
    'tyrolene',
    '{
      "partitions_per_ratio": 4,
      "materials": [
        {"slug": "cement", "quantity": 1, "unit": "bags"},
        {"slug": "sand", "quantity": 6, "unit": "bags"},
        {"slug": "acrylic-bond", "quantity": 3, "unit": "kg"},
        {"slug": "water-seal", "quantity": 1, "unit": "kg"},
        {"slug": "anti-fungal", "quantity": 0.5, "unit": "kg"}
      ]
    }',
    'verified_frelux',
    'FRELUX verified Tyrolene material ratio: for every 4 standard partitions — 1 bag cement, 6 bags sand, 3 kg acrylic bond, 1 kg water seal, 0.5 kg anti-fungal. Do NOT change unless FRELUX officially updates the production formula.'
  ),
  (
    'purchase_rounding_rule',
    'tyrolene',
    '{"rule": "ceil"}',
    'verified_frelux',
    'FRELUX rule: Practical purchase quantity rounds up to the nearest full pack for Tyrolene materials.'
  ),
  (
    'labour_policy',
    'tyrolene',
    '{"status": "not_included", "note": "Labour is NOT INCLUDED — NEGOTIATED SEPARATELY"}',
    'verified_frelux',
    'FRELUX Tyrolene labour is negotiated separately with the labourer/contractor. No automatic labour calculation.'
  )
ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- =========================================================
-- 4. Tyrolene Production Rules
-- =========================================================

-- Owerri: no minimum (consistent with FRELUX policy)
INSERT INTO estimation_production_rules (product_category, quality_slug, location_rule, min_quantity, unit, description, sort_order) VALUES
  ('tyrolene', NULL, 'owerri', 0, 'partitions', 'FRELUX Tyrolene production in Owerri — no minimum quantity.', 20)
ON CONFLICT DO NOTHING;

-- Outside Owerri: deliberately NOT configured.
-- Do NOT invent a minimum. Admin must configure when FRELUX provides the value.
-- The application will clearly indicate when production eligibility cannot be determined.

-- =========================================================
-- 5. Default pack sizes for Tyrolene materials
-- =========================================================

-- Insert default pack sizes for materials that don't have one yet.
-- These are admin-configurable starting points.

DO $mig$
BEGIN
  INSERT INTO estimation_pack_sizes (ref_type, ref_id, pack_size, purchase_rule, min_quantity, rounding_rule, is_active, sort_order)
  SELECT 'material', m.id, 1, 'full_pack', 1, 'ceil', true, 1
  FROM estimation_materials m
  WHERE m.slug = 'cement'
    AND NOT EXISTS (
      SELECT 1 FROM estimation_pack_sizes ps
      WHERE ps.ref_type = 'material' AND ps.ref_id = m.id
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


DO $mig$
BEGIN
  INSERT INTO estimation_pack_sizes (ref_type, ref_id, pack_size, purchase_rule, min_quantity, rounding_rule, is_active, sort_order)
  SELECT 'material', m.id, 1, 'full_pack', 1, 'ceil', true, 1
  FROM estimation_materials m
  WHERE m.slug = 'sand'
    AND NOT EXISTS (
      SELECT 1 FROM estimation_pack_sizes ps
      WHERE ps.ref_type = 'material' AND ps.ref_id = m.id
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


DO $mig$
BEGIN
  INSERT INTO estimation_pack_sizes (ref_type, ref_id, pack_size, purchase_rule, min_quantity, rounding_rule, is_active, sort_order)
  SELECT 'material', m.id, 1, 'full_pack', 1, 'ceil', true, 1
  FROM estimation_materials m
  WHERE m.slug = 'acrylic-bond'
    AND NOT EXISTS (
      SELECT 1 FROM estimation_pack_sizes ps
      WHERE ps.ref_type = 'material' AND ps.ref_id = m.id
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


DO $mig$
BEGIN
  INSERT INTO estimation_pack_sizes (ref_type, ref_id, pack_size, purchase_rule, min_quantity, rounding_rule, is_active, sort_order)
  SELECT 'material', m.id, 1, 'full_pack', 1, 'ceil', true, 1
  FROM estimation_materials m
  WHERE m.slug = 'water-seal'
    AND NOT EXISTS (
      SELECT 1 FROM estimation_pack_sizes ps
      WHERE ps.ref_type = 'material' AND ps.ref_id = m.id
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


DO $mig$
BEGIN
  INSERT INTO estimation_pack_sizes (ref_type, ref_id, pack_size, purchase_rule, min_quantity, rounding_rule, is_active, sort_order)
  SELECT 'material', m.id, 1, 'full_pack', 1, 'ceil', true, 1
  FROM estimation_materials m
  WHERE m.slug = 'anti-fungal'
    AND NOT EXISTS (
      SELECT 1 FROM estimation_pack_sizes ps
      WHERE ps.ref_type = 'material' AND ps.ref_id = m.id
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;

