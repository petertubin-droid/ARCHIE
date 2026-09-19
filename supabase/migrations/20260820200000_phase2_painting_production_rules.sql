/*
# FRELUX — Phase 2: Painting Estimator Production Rules

This migration adds the production rules table for FRELUX paint production
eligibility, plus seeds painting-specific calculation rules that were not
covered in Phase 1.

## New Tables (1)
1. estimation_production_rules — configurable production minimums per product/location

## Seeded Data
- Ceiling rule (0.5 bucket per room ceiling) — verified FRELUX rule
- Purchase rounding rule (ceil to nearest full pack) — verified FRELUX rule
- Production minimum rules (Emulsion 15, Matt 15, Satin High Quality 5, Other 10)
- Owerri location rule (no minimum)

## Security
- RLS enabled + FORCED.
- Public/anonymous: SELECT only.
- Admins (is_admin()): full CRUD.
*/

-- =========================================================
-- 1. estimation_production_rules — production minimums
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_production_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_category text NOT NULL,                 -- emulsion, matt, satin, etc.
  quality_slug    text,                            -- high_quality, standard, premium, or NULL for all qualities
  location_rule   text NOT NULL DEFAULT 'outside_owerri', -- owerri, outside_owerri
  min_quantity     numeric NOT NULL DEFAULT 0,      -- minimum production quantity in buckets
  unit            text NOT NULL DEFAULT 'buckets',
  is_active       boolean NOT NULL DEFAULT true,
  description     text,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_production_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_production_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_prod_rules_public_read" ON estimation_production_rules;
CREATE POLICY "est_prod_rules_public_read" ON estimation_production_rules FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_prod_rules_admin_write" ON estimation_production_rules;
CREATE POLICY "est_prod_rules_admin_write" ON estimation_production_rules FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_prod_rules_set_updated_at" ON estimation_production_rules;
CREATE TRIGGER "est_prod_rules_set_updated_at"
  BEFORE UPDATE ON estimation_production_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_prod_rules_cat ON estimation_production_rules(product_category, location_rule, is_active);

-- =========================================================
-- SEED: Painting-specific calculation rules
-- =========================================================

-- Ceiling rule: 1/2 bucket per room ceiling (verified FRELUX rule)
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  ('ceiling_quantity_per_room', 'painting', '{"buckets": 0.5}', 'verified_frelux', 'FRELUX rule: A single room ceiling uses 1/2 bucket of FRELUX paint regardless of room size under the currently established methodology.'),
  ('purchase_rounding_rule', 'painting', '{"rule": "ceil"}', 'verified_frelux', 'FRELUX rule: Practical purchase quantity rounds up to the nearest full bucket.'),
  ('ceiling_default_paint_type', 'painting', '{"paint_type": "emulsion"}', 'verified_frelux', 'FRELUX rule: Ceiling uses emulsion paint by default.'),
  ('pack_size_bucket_litres', 'painting', '{"litres": 20}', 'verified_frelux', 'FRELUX standard pack size: 20 litres per bucket.')
ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- =========================================================
-- SEED: Production rules
-- =========================================================

-- Owerri: no minimum for any product
INSERT INTO estimation_production_rules (product_category, quality_slug, location_rule, min_quantity, unit, description, sort_order) VALUES
  ('emulsion', NULL, 'owerri', 0, 'buckets', 'FRELUX production in Owerri — no minimum quantity for emulsion.', 1),
  ('matt', NULL, 'owerri', 0, 'buckets', 'FRELUX production in Owerri — no minimum quantity for matt.', 2),
  ('satin', NULL, 'owerri', 0, 'buckets', 'FRELUX production in Owerri — no minimum quantity for satin.', 3)
ON CONFLICT DO NOTHING;

-- Outside Owerri: product-specific minimums
INSERT INTO estimation_production_rules (product_category, quality_slug, location_rule, min_quantity, unit, description, sort_order) VALUES
  ('emulsion', NULL, 'outside_owerri', 15, 'buckets', 'FRELUX production outside Owerri — minimum 15 buckets for emulsion.', 10),
  ('matt', NULL, 'outside_owerri', 15, 'buckets', 'FRELUX production outside Owerri — minimum 15 buckets for matt.', 11),
  ('satin', 'high_quality', 'outside_owerri', 5, 'buckets', 'FRELUX production outside Owerri — minimum 5 buckets for High Quality Satin.', 12),
  ('satin', NULL, 'outside_owerri', 10, 'buckets', 'FRELUX production outside Owerri — minimum 10 buckets for other Satin qualities.', 13)
ON CONFLICT DO NOTHING;
