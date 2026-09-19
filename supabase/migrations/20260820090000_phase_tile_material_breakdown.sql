/*
# Phase: Tile Calculator Material Breakdown Update

Updates the tile_materials table to support the new installation methods:
  - Traditional Method: Cement + Sharp Sand
  - Tile Adhesive Method: Tile Adhesive

Adds 'cement' and 'sand' to the category CHECK constraint.
Seeds default cement and sharp sand materials.
Removes non-purchasable materials (waterproofing, other/misc) from the
active set — they are excluded from quotations per product decision.

Purchasable quotation materials after this migration:
  - tile (user-entered price in calculator)
  - adhesive
  - grout
  - spacer
  - cement
  - sand
*/

-- =========================================================
-- 1. Update category CHECK constraint to include cement + sand
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'tile_materials_category_check'
  ) THEN
    ALTER TABLE tile_materials DROP CONSTRAINT tile_materials_category_check;
  END IF;
END $$;

-- Reclassify any categories not in the new CHECK constraint BEFORE adding it
UPDATE tile_materials
  SET category = 'other', updated_at = now()
  WHERE category NOT IN ('tile', 'adhesive', 'grout', 'spacer', 'cement', 'sand', 'labour', 'other');

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tile_materials_category_check'
                 AND conrelid = 'public.tile_materials'::regclass) THEN
ALTER TABLE tile_materials
  ADD CONSTRAINT tile_materials_category_check
  CHECK (category IN ('tile', 'adhesive', 'grout', 'spacer', 'cement', 'sand', 'labour', 'other'));
  END IF;
END
$mig$;


-- =========================================================
-- 2. Deactivate non-purchasable material categories
--    (waterproofing, misc "other" items — NOT in quotation breakdown)
-- =========================================================
UPDATE tile_materials
  SET is_active = false, updated_at = now()
  WHERE category IN ('waterproofing', 'other')
    AND is_active = true;

-- =========================================================
-- 3. Seed default cement and sharp sand materials
--    Coverage rates and prices are configurable from the admin panel.
-- =========================================================
INSERT INTO tile_materials (category, name, unit, coverage_rate, coverage_unit, package_size, package_unit, unit_price, labour_rate_per_sqm, sort_order, is_active)
VALUES
  ('cement', 'Cement (Standard)', 'bag', 5, 'm²', 1, 'bag', 4500, 0, 1, true),
  ('cement', 'Cement (Premium)', 'bag', 6, 'm²', 1, 'bag', 5500, 0, 2, true),
  ('sand', 'Sharp Sand', 'bag', 5, 'm²', 1, 'bag', 3000, 0, 1, true)
ON CONFLICT DO NOTHING;
