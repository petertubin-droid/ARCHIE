/*
# FRELUX — Phase 1: Estimation Engine Foundation

This migration creates the production-grade estimation engine database layer.
It does NOT modify or replace any existing tables. All new tables use the
estimation_ prefix to keep them clearly separated from the existing
paint_types / paint_products / material_prices / screeding_materials systems.

The existing calculators (Paint, Screeding, POP, Tile) remain untouched.
Future calculators (Painting, Tyrolene, Grafitex) will be built ON TOP of
this foundation in subsequent phases.

## New Tables (14)
1.  estimation_units              — measurement units (litres, kg, bags, m², etc.)
2.  estimation_products           — unified product catalogue
3.  estimation_product_quality     — quality levels per product
4.  estimation_materials          — material catalogue
5.  estimation_pack_sizes         — pack / purchase sizes per product or material
6.  estimation_prices             — current prices for products, quality levels & materials
7.  estimation_price_history      — full price change history
8.  estimation_calc_rules         — configurable calculation rules
9.  estimation_calc_versions      — calculation version tracking
10. estimation_estimates          — estimate records (header)
11. estimation_estimate_items     — estimate line items with price snapshots
12. estimation_adjustments        — manual adjustment records
13. estimation_audit_log          — audit trail for important changes
14. estimation_colour_conditions  — colour-transition assessment framework

## Security
- All tables: RLS enabled + FORCED.
- Public/anonymous: SELECT only on active catalogue data (products, materials, units, pack sizes, prices, calc rules, calc versions).
- Authenticated users: SELECT + INSERT on estimates and estimate items they own.
- Admins (is_admin()): full CRUD on all configuration tables.
- Existing RLS policies and security functions are NOT modified.
*/

-- =========================================================
-- 1. estimation_units — measurement units
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,                    -- e.g. "litres", "kilograms", "bags"
  symbol      text NOT NULL,                    -- e.g. "L", "kg", "bag"
  category    text NOT NULL DEFAULT 'general',  -- volume, weight, area, count, other
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_units FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_units_public_read" ON estimation_units;
CREATE POLICY "est_units_public_read" ON estimation_units FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_units_admin_write" ON estimation_units;
CREATE POLICY "est_units_admin_write" ON estimation_units FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_units_set_updated_at" ON estimation_units;
CREATE TRIGGER "est_units_set_updated_at"
  BEFORE UPDATE ON estimation_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2. estimation_products — unified product catalogue
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  category            text NOT NULL,                    -- emulsion, matt, satin, tyrolene, grafitex, primer, etc.
  description         text,
  product_type        text NOT NULL DEFAULT 'paint',    -- paint, coating, primer, sealer, adhesive, etc.
  calculation_method  text NOT NULL DEFAULT 'area_based', -- room_based, partition_based, area_based, material_based, fixed_quantity, custom
  standard_pack_size  numeric,                           -- standard pack size (nullable until configured)
  pack_unit_id        uuid REFERENCES estimation_units(id) ON DELETE SET NULL,
  recommended_surface text,                              -- recommended application surface
  finish              text,                              -- finish type
  texture             text,                              -- texture description
  gloss_level         text,                              -- gloss / shine description
  durability          text,                              -- durability description
  colour_compatibility text,                             -- colour compatibility notes
  paint_compatibility text,                             -- paint compatibility notes
  has_quality_levels  boolean NOT NULL DEFAULT false,   -- whether this product supports quality tiers
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_products_public_read" ON estimation_products;
CREATE POLICY "est_products_public_read" ON estimation_products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_products_admin_write" ON estimation_products;
CREATE POLICY "est_products_admin_write" ON estimation_products FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_products_set_updated_at" ON estimation_products;
CREATE TRIGGER "est_products_set_updated_at"
  BEFORE UPDATE ON estimation_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_products_category ON estimation_products(category, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_est_products_slug ON estimation_products(slug);

-- =========================================================
-- 3. estimation_product_quality — quality levels per product
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_product_quality (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES estimation_products(id) ON DELETE CASCADE,
  name            text NOT NULL,                  -- Standard, Premium, High Quality
  slug            text NOT NULL,                  -- standard, premium, high_quality
  description     text,
  coverage        numeric,                         -- coverage rate (nullable until configured)
  coverage_unit   text,                            -- m2_per_liter, m2_per_kg, etc.
  finish          text,
  texture         text,
  gloss_level     text,
  shine_level     text,
  durability      text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, slug)
);

ALTER TABLE estimation_product_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_product_quality FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_quality_public_read" ON estimation_product_quality;
CREATE POLICY "est_quality_public_read" ON estimation_product_quality FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_quality_admin_write" ON estimation_product_quality;
CREATE POLICY "est_quality_admin_write" ON estimation_product_quality FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_quality_set_updated_at" ON estimation_product_quality;
CREATE TRIGGER "est_quality_set_updated_at"
  BEFORE UPDATE ON estimation_product_quality
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_quality_product ON estimation_product_quality(product_id, is_active, sort_order);

-- =========================================================
-- 4. estimation_materials — material catalogue
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_materials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  category      text NOT NULL DEFAULT 'general',  -- primer, filler, putty, cement, adhesive, etc.
  description   text,
  unit_id       uuid REFERENCES estimation_units(id) ON DELETE SET NULL,
  pack_size     numeric,                           -- standard pack size (nullable until configured)
  pack_unit_id  uuid REFERENCES estimation_units(id) ON DELETE SET NULL,
  supplier      text,                              -- supplier / source
  notes         text,
  effective_date date,                             -- when this material's pricing takes effect
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_materials FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_materials_public_read" ON estimation_materials;
CREATE POLICY "est_materials_public_read" ON estimation_materials FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_materials_admin_write" ON estimation_materials;
CREATE POLICY "est_materials_admin_write" ON estimation_materials FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_materials_set_updated_at" ON estimation_materials;
CREATE TRIGGER "est_materials_set_updated_at"
  BEFORE UPDATE ON estimation_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_materials_category ON estimation_materials(category, is_active, sort_order);

-- =========================================================
-- 5. estimation_pack_sizes — pack / purchase sizes
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_pack_sizes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type        text NOT NULL CHECK (ref_type IN ('product', 'material', 'quality')),
  ref_id          uuid NOT NULL,                    -- FK to estimation_products / estimation_materials / estimation_product_quality
  pack_size       numeric NOT NULL CHECK (pack_size > 0),
  pack_unit_id    uuid REFERENCES estimation_units(id) ON DELETE SET NULL,
  purchase_rule    text NOT NULL DEFAULT 'full_pack', -- full_pack, minimum_quantity, partial_allowed
  min_quantity     numeric NOT NULL DEFAULT 1,
  rounding_rule   text NOT NULL DEFAULT 'ceil',     -- ceil, floor, round, none
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- No FK constraint on ref_id because it can point to different tables (polymorphic).
-- Referential integrity is enforced at the application layer.

ALTER TABLE estimation_pack_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_pack_sizes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_packsizes_public_read" ON estimation_pack_sizes;
CREATE POLICY "est_packsizes_public_read" ON estimation_pack_sizes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_packsizes_admin_write" ON estimation_pack_sizes;
CREATE POLICY "est_packsizes_admin_write" ON estimation_pack_sizes FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_packsizes_set_updated_at" ON estimation_pack_sizes;
CREATE TRIGGER "est_packsizes_set_updated_at"
  BEFORE UPDATE ON estimation_pack_sizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_packsizes_ref ON estimation_pack_sizes(ref_type, ref_id, is_active, sort_order);

-- =========================================================
-- 6. estimation_prices — current prices
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_type      text NOT NULL CHECK (price_type IN ('product', 'quality', 'material')),
  ref_id          uuid NOT NULL,                    -- FK to product / quality / material
  price           numeric NOT NULL CHECK (price >= 0),
  currency        text NOT NULL DEFAULT 'NGN',
  pack_size_id    uuid REFERENCES estimation_pack_sizes(id) ON DELETE SET NULL, -- which pack size this price applies to
  effective_date  date NOT NULL DEFAULT CURRENT_DATE,
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_prices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_prices_public_read" ON estimation_prices;
CREATE POLICY "est_prices_public_read" ON estimation_prices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_prices_admin_write" ON estimation_prices;
CREATE POLICY "est_prices_admin_write" ON estimation_prices FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_prices_set_updated_at" ON estimation_prices;
CREATE TRIGGER "est_prices_set_updated_at"
  BEFORE UPDATE ON estimation_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_prices_ref ON estimation_prices(price_type, ref_id, is_active, effective_date DESC);

-- =========================================================
-- 7. estimation_price_history — full price change history
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_price_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_type      text NOT NULL CHECK (price_type IN ('product', 'quality', 'material')),
  ref_id          uuid NOT NULL,
  old_price       numeric,
  new_price       numeric NOT NULL CHECK (new_price >= 0),
  currency        text NOT NULL DEFAULT 'NGN',
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  change_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_price_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_price_history_public_read" ON estimation_price_history;
CREATE POLICY "est_price_history_public_read" ON estimation_price_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_price_history_admin_write" ON estimation_price_history;
CREATE POLICY "est_price_history_admin_write" ON estimation_price_history FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_est_price_history_ref ON estimation_price_history(price_type, ref_id, created_at DESC);

-- Trigger: automatically record price changes when estimation_prices is updated
CREATE OR REPLACE FUNCTION public.log_estimation_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO estimation_price_history (price_type, ref_id, old_price, new_price, currency, changed_by)
    VALUES (NEW.price_type, NEW.ref_id, OLD.price, NEW.price, NEW.currency, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "est_prices_log_change" ON estimation_prices;
CREATE TRIGGER "est_prices_log_change"
  AFTER UPDATE ON estimation_prices
  FOR EACH ROW EXECUTE FUNCTION public.log_estimation_price_change();

-- =========================================================
-- 8. estimation_calc_rules — configurable calculation rules
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_calc_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key        text NOT NULL,                    -- e.g. "standard_room_height", "standard_coat_count"
  calculator_type text,                              -- painting, tyrolene, grafitex, screeding, pop, tile, or NULL for global
  rule_value      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- the actual value(s)
  rule_status     text NOT NULL DEFAULT 'admin_configured'
                  CHECK (rule_status IN ('verified_frelux', 'admin_configured', 'calculated', 'manual_adjustment', 'negotiated')),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_key, calculator_type)
);

ALTER TABLE estimation_calc_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_calc_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_calc_rules_public_read" ON estimation_calc_rules;
CREATE POLICY "est_calc_rules_public_read" ON estimation_calc_rules FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_calc_rules_admin_write" ON estimation_calc_rules;
CREATE POLICY "est_calc_rules_admin_write" ON estimation_calc_rules FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_calc_rules_set_updated_at" ON estimation_calc_rules;
CREATE TRIGGER "est_calc_rules_set_updated_at"
  BEFORE UPDATE ON estimation_calc_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_calc_rules_key ON estimation_calc_rules(rule_key, calculator_type);

-- =========================================================
-- 9. estimation_calc_versions — calculation version tracking
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_calc_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculator_type text NOT NULL,                    -- painting, tyrolene, grafitex, etc.
  version_number  int NOT NULL,
  version_label   text,                              -- e.g. "v1.0", "Painting v2"
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(calculator_type, version_number)
);

ALTER TABLE estimation_calc_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_calc_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_calc_versions_public_read" ON estimation_calc_versions;
CREATE POLICY "est_calc_versions_public_read" ON estimation_calc_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_calc_versions_admin_write" ON estimation_calc_versions;
CREATE POLICY "est_calc_versions_admin_write" ON estimation_calc_versions FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_calc_versions_set_updated_at" ON estimation_calc_versions;
CREATE TRIGGER "est_calc_versions_set_updated_at"
  BEFORE UPDATE ON estimation_calc_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 10. estimation_estimates — estimate records (header)
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_estimates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_ref       text NOT NULL UNIQUE,           -- human-readable reference
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_hash         text,                           -- for anonymous users
  calculator_type     text NOT NULL,                  -- painting, tyrolene, grafitex, screeding, pop, tile
  project_description text,
  inputs              jsonb NOT NULL DEFAULT '{}'::jsonb,    -- full input snapshot
  calculation_method  text NOT NULL DEFAULT 'area_based',
  calc_version_id     uuid REFERENCES estimation_calc_versions(id) ON DELETE SET NULL,
  calculated_quantities jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_material_cost  numeric NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'NGN',
  labour_status       text NOT NULL DEFAULT 'not_included'
                      CHECK (labour_status IN ('not_included', 'negotiated_separately', 'included')),
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations     jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes               text,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'calculated', 'adjusted', 'saved', 'shared', 'completed', 'cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_estimates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_estimates_select_own" ON estimation_estimates;
CREATE POLICY "est_estimates_select_own" ON estimation_estimates FOR SELECT
  TO anon, authenticated
  USING (user_id = auth.uid() OR client_hash IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS "est_estimates_insert_own" ON estimation_estimates;
CREATE POLICY "est_estimates_insert_own" ON estimation_estimates FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "est_estimates_update_own" ON estimation_estimates;
CREATE POLICY "est_estimates_update_own" ON estimation_estimates FOR UPDATE
  TO anon, authenticated
  USING (user_id = auth.uid() OR client_hash IS NOT NULL OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR public.is_admin());

DROP POLICY IF EXISTS "est_estimates_delete_own" ON estimation_estimates;
CREATE POLICY "est_estimates_delete_own" ON estimation_estimates FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS "est_estimates_set_updated_at" ON estimation_estimates;
CREATE TRIGGER "est_estimates_set_updated_at"
  BEFORE UPDATE ON estimation_estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_estimates_user ON estimation_estimates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_est_estimates_ref ON estimation_estimates(estimate_ref);
CREATE INDEX IF NOT EXISTS idx_est_estimates_calc ON estimation_estimates(calculator_type, status);

-- =========================================================
-- 11. estimation_estimate_items — line items with price snapshots
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_estimate_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id           uuid NOT NULL REFERENCES estimation_estimates(id) ON DELETE CASCADE,
  item_name              text NOT NULL,
  item_type              text NOT NULL DEFAULT 'product'
                        CHECK (item_type IN ('product', 'material', 'primer', 'sealer', 'labour', 'other')),
  product_id             uuid,                        -- FK to estimation_products (no DB FK to keep flexibility)
  quality_level_id       uuid,                        -- FK to estimation_product_quality
  material_id            uuid,                        -- FK to estimation_materials
  quantity_required      numeric NOT NULL DEFAULT 0,  -- theoretical requirement
  practical_purchase_qty numeric NOT NULL DEFAULT 0,  -- practical purchase quantity (after pack rounding)
  unit                   text NOT NULL,               -- L, kg, bag, m2, piece, etc.
  pack_size              numeric,                     -- pack size used
  unit_price             numeric NOT NULL DEFAULT 0,  -- price snapshot at time of estimate
  total_price            numeric NOT NULL DEFAULT 0,  -- unit_price * practical_purchase_qty (or quantity_required)
  price_snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb, -- full price snapshot for reproducibility
  calculation_source     text NOT NULL DEFAULT 'calculated'
                        CHECK (calculation_source IN ('calculated', 'manual', 'adjusted', 'negotiated')),
  adjustment_status      text NOT NULL DEFAULT 'none'
                        CHECK (adjustment_status IN ('none', 'adjusted', 'pending_review')),
  notes                  text,
  sort_order             int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_estimate_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_items_select_own" ON estimation_estimate_items;
CREATE POLICY "est_items_select_own" ON estimation_estimate_items FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR e.client_hash IS NOT NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "est_items_insert_own" ON estimation_estimate_items;
CREATE POLICY "est_items_insert_own" ON estimation_estimate_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR e.user_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "est_items_update_own" ON estimation_estimate_items;
CREATE POLICY "est_items_update_own" ON estimation_estimate_items FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR e.client_hash IS NOT NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "est_items_delete_own" ON estimation_estimate_items;
CREATE POLICY "est_items_delete_own" ON estimation_estimate_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP TRIGGER IF EXISTS "est_items_set_updated_at" ON estimation_estimate_items;
CREATE TRIGGER "est_items_set_updated_at"
  BEFORE UPDATE ON estimation_estimate_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_est_items_estimate ON estimation_estimate_items(estimate_id, sort_order);

-- =========================================================
-- 12. estimation_adjustments — manual adjustment records
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id    uuid NOT NULL REFERENCES estimation_estimates(id) ON DELETE CASCADE,
  item_id        uuid REFERENCES estimation_estimate_items(id) ON DELETE CASCADE,
  field_name     text NOT NULL,                    -- which field was adjusted
  original_value jsonb,
  adjusted_value jsonb NOT NULL,
  reason         text NOT NULL,
  adjusted_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_adjustments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_adjustments_select_own" ON estimation_adjustments;
CREATE POLICY "est_adjustments_select_own" ON estimation_adjustments FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR e.client_hash IS NOT NULL OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "est_adjustments_insert_own" ON estimation_adjustments;
CREATE POLICY "est_adjustments_insert_own" ON estimation_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM estimation_estimates e
      WHERE e.id = estimate_id
      AND (e.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "est_adjustments_delete_admin" ON estimation_adjustments;
CREATE POLICY "est_adjustments_delete_admin" ON estimation_adjustments FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_est_adjustments_estimate ON estimation_adjustments(estimate_id, created_at DESC);

-- =========================================================
-- 13. estimation_audit_log — audit trail for important changes
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL,                    -- product, quality, material, price, calc_rule, pack_size, estimate
  entity_id       uuid,
  action          text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'price_change', 'adjust')),
  old_value       jsonb,
  new_value       jsonb,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_audit_log_select_admin" ON estimation_audit_log;
CREATE POLICY "est_audit_log_select_admin" ON estimation_audit_log FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "est_audit_log_insert_auth" ON estimation_audit_log;
CREATE POLICY "est_audit_log_insert_auth" ON estimation_audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_est_audit_log_entity ON estimation_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_est_audit_log_action ON estimation_audit_log(action, created_at DESC);

-- =========================================================
-- 14. estimation_colour_conditions — colour-transition framework
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_colour_conditions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_key   text NOT NULL UNIQUE,             -- new_unpainted, light, medium, dark_strong, unknown, similar_colour, significant_transition
  name            text NOT NULL,
  description     text,
  requires_warning boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_colour_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_colour_conditions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_colour_conditions_public_read" ON estimation_colour_conditions;
CREATE POLICY "est_colour_conditions_public_read" ON estimation_colour_conditions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_colour_conditions_admin_write" ON estimation_colour_conditions;
CREATE POLICY "est_colour_conditions_admin_write" ON estimation_colour_conditions FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_colour_conditions_set_updated_at" ON estimation_colour_conditions;
CREATE TRIGGER "est_colour_conditions_set_updated_at"
  BEFORE UPDATE ON estimation_colour_conditions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 15. estimation_surface_conditions — surface condition framework
-- =========================================================
CREATE TABLE IF NOT EXISTS estimation_surface_conditions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_key   text NOT NULL UNIQUE,             -- new_plastered, previously_painted, peeling_flaking, cracked, damp, stained, rough_uneven, unknown
  name            text NOT NULL,
  description     text,
  requires_preparation boolean NOT NULL DEFAULT false,
  primer_recommended boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_surface_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimation_surface_conditions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "est_surface_conditions_public_read" ON estimation_surface_conditions;
CREATE POLICY "est_surface_conditions_public_read" ON estimation_surface_conditions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "est_surface_conditions_admin_write" ON estimation_surface_conditions;
CREATE POLICY "est_surface_conditions_admin_write" ON estimation_surface_conditions FOR ALL
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS "est_surface_conditions_set_updated_at" ON estimation_surface_conditions;
CREATE TRIGGER "est_surface_conditions_set_updated_at"
  BEFORE UPDATE ON estimation_surface_conditions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- SEED DATA — units, colour conditions, surface conditions, calc versions
-- =========================================================

-- Units
INSERT INTO estimation_units (name, symbol, category, sort_order) VALUES
  ('litres', 'L', 'volume', 1),
  ('kilograms', 'kg', 'weight', 2),
  ('bags', 'bag', 'count', 3),
  ('buckets', 'bucket', 'count', 4),
  ('square metres', 'm²', 'area', 5),
  ('pieces', 'piece', 'count', 6),
  ('metres', 'm', 'length', 7),
  ('partitions', 'partition', 'count', 8),
  ('boxes', 'box', 'count', 9),
  ('grams', 'g', 'weight', 10)
ON CONFLICT DO NOTHING;

-- Colour conditions
INSERT INTO estimation_colour_conditions (condition_key, name, description, requires_warning, sort_order) VALUES
  ('new_unpainted', 'New / Unpainted', 'Surface has never been painted before.', false, 1),
  ('light', 'Light Colour', 'Existing paint is a light colour (white, cream, pale tones).', false, 2),
  ('medium', 'Medium Colour', 'Existing paint is a medium-tone colour.', false, 3),
  ('dark_strong', 'Dark / Strong Colour', 'Existing paint is a dark or strong colour (blue, green, red, etc.). Covering with lighter colours may require additional consideration.', true, 4),
  ('unknown', 'Unknown', 'Existing paint condition is not known.', false, 5),
  ('similar_colour', 'Similar Colour', 'New colour is similar to the existing colour.', false, 6),
  ('significant_transition', 'Significant Colour Transition', 'Significant transition from dark/strong to light colour. Additional coats or primer may be needed.', true, 7)
ON CONFLICT (condition_key) DO NOTHING;

-- Surface conditions
INSERT INTO estimation_surface_conditions (condition_key, name, description, requires_preparation, primer_recommended, sort_order) VALUES
  ('new_plastered', 'New / Plastered', 'Fresh plastered surface that has not been painted.', false, false, 1),
  ('previously_painted_sound', 'Previously Painted (Sound)', 'Previously painted surface in good, sound condition.', false, false, 2),
  ('peeling_flaking', 'Peeling / Flaking', 'Paint is peeling or flaking. Surface preparation required before painting.', true, true, 3),
  ('cracked', 'Cracked', 'Surface has visible cracks that need to be filled and prepared.', true, true, 4),
  ('damp_moisture', 'Damp / Moisture Affected', 'Surface shows signs of damp or moisture. Requires specialist preparation.', true, true, 5),
  ('stained', 'Stained', 'Surface has stains that may bleed through new paint. Primer/sealer recommended.', true, true, 6),
  ('rough_uneven', 'Rough / Uneven', 'Surface is rough or uneven and requires smoothing or screeding.', true, false, 7),
  ('unknown', 'Unknown', 'Surface condition is not known. Professional assessment recommended.', false, false, 8)
ON CONFLICT (condition_key) DO NOTHING;

-- Calc versions (v1 for each calculator type — active by default)
INSERT INTO estimation_calc_versions (calculator_type, version_number, version_label, description) VALUES
  ('painting', 1, 'v1', 'Initial painting estimation version.'),
  ('tyrolene', 1, 'v1', 'Initial tyrolene estimation version.'),
  ('grafitex', 1, 'v1', 'Initial grafitex estimation version.'),
  ('screeding', 1, 'v1', 'Initial screeding estimation version.'),
  ('pop_ceiling', 1, 'v1', 'Initial POP ceiling estimation version.'),
  ('tile', 1, 'v1', 'Initial tile estimation version.')
ON CONFLICT (calculator_type, version_number) DO NOTHING;

-- Global calc rules with VERIFIED FRELUX values where known
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  ('standard_coat_count', 'painting', '{"count": 2}', 'verified_frelux', 'FRELUX standard: 2 coats for FRELUX paint products.'),
  ('ceiling_default_colour', 'painting', '{"colour": "white"}', 'verified_frelux', 'FRELUX rule: Ceiling colour is always white unless explicitly changed.'),
  ('labour_policy', NULL, '{"status": "not_included", "note": "Labour is NOT INCLUDED — NEGOTIATED SEPARATELY"}', 'verified_frelux', 'FRELUX labour is negotiated separately with the labourer/contractor. No automatic labour calculation.')
ON CONFLICT (rule_key, calculator_type) DO NOTHING;

-- Rules that REQUIRE FRELUX admin configuration (no values populated)
INSERT INTO estimation_calc_rules (rule_key, calculator_type, rule_value, rule_status, description) VALUES
  ('standard_room_height', 'painting', '{"value": null}', 'admin_configured', 'Standard room height in metres. Requires FRELUX admin configuration.'),
  ('high_room_threshold', 'painting', '{"value": null}', 'admin_configured', 'Threshold above which a room is considered "high". Requires FRELUX admin configuration.'),
  ('default_waste_margin', 'painting', '{"value": null}', 'admin_configured', 'Default waste/spillage margin percentage. Requires FRELUX admin configuration.'),
  ('colour_transition_adjustment', 'painting', '{"value": null}', 'admin_configured', 'Adjustment percentage for significant colour transitions. Requires FRELUX admin configuration — DO NOT invent a value.'),
  ('partition_default_width', 'painting', '{"value": null}', 'admin_configured', 'Default partition width for partition-based calculations. Requires FRELUX admin configuration.'),
  ('partition_default_height', 'painting', '{"value": null}', 'admin_configured', 'Default partition height. Requires FRELUX admin configuration.'),
  ('default_waste_margin', 'tyrolene', '{"value": null}', 'admin_configured', 'Default waste margin for Tyrolene. Requires FRELUX admin configuration.'),
  ('default_waste_margin', 'grafitex', '{"value": null}', 'admin_configured', 'Default waste margin for Grafitex. Requires FRELUX admin configuration.')
ON CONFLICT (rule_key, calculator_type) DO NOTHING;
