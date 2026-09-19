/*
# Calculator Templates System (Phase 2)

Migrates the existing calculator_templates table to the new schema:
- Adds columns: calculator_type, input_data, schema_version, visibility,
  is_favorite, is_featured, is_published, display_order, slug, seo_title, seo_description
- Migrates data from old columns (template_type, calculator_data, is_builtin, is_active, sort_order)
  ONLY IF those old columns still exist — this makes the migration safe to
  re-run on a table that already has the new schema (e.g. if run twice
  manually via the SQL editor, or if the old columns were already dropped).
- Drops old columns after migration (if present)
- Updates RLS policies for the new access patterns
- Seeds 16 curated public templates (idempotent via unique index on slug)

Templates store INPUT DATA only — never cached calculation results.
The calculator engine always recalculates using current rules and prices.

FIX (2026-08-20): This migration previously failed with
"column template_type does not exist" when re-run against a table that
had already been migrated (old columns already dropped). Step 2 is now
wrapped in existence checks so it's safe to run any number of times,
against a table in ANY of these states:
  - fresh table with only old columns (from phase19)
  - table with both old and new columns (partially migrated)
  - table with only new columns (fully migrated / old columns dropped)
*/

-- =========================================================
-- 1. Add new columns
-- =========================================================
ALTER TABLE calculator_templates
  ADD COLUMN IF NOT EXISTS calculator_type text CHECK (calculator_type IN ('paint', 'tile', 'pop', 'screeding')),
  ADD COLUMN IF NOT EXISTS input_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'unlisted')),
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text;

-- =========================================================
-- 2. Migrate data from old columns (guarded — only if they exist)
-- =========================================================
DO $$
BEGIN
  -- Map old template_type values to new calculator_type
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculator_templates' AND column_name = 'template_type') THEN
    UPDATE calculator_templates
      SET calculator_type = CASE
        WHEN template_type = 'pop_ceiling' THEN 'pop'
        ELSE template_type
      END
      WHERE template_type IS NOT NULL AND calculator_type IS NULL;
  END IF;

  -- Copy calculator_data to input_data where input_data is empty
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculator_templates' AND column_name = 'calculator_data') THEN
    UPDATE calculator_templates
      SET input_data = calculator_data
      WHERE calculator_data IS NOT NULL AND input_data = '{}'::jsonb;
  END IF;

  -- Map is_builtin=true to visibility='public', is_published=true
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculator_templates' AND column_name = 'is_builtin')
    AND EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calculator_templates' AND column_name = 'sort_order') THEN
    UPDATE calculator_templates
      SET visibility = 'public', is_published = true, display_order = sort_order
      WHERE is_builtin = true AND visibility = 'private';
  END IF;
END $$;

-- =========================================================
-- 3. Make calculator_type NOT NULL (after data migration)
-- =========================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calculator_templates' AND column_name = 'calculator_type' AND is_nullable = 'yes') THEN
    -- Set any remaining NULLs to 'paint' as fallback
    UPDATE calculator_templates SET calculator_type = 'paint' WHERE calculator_type IS NULL;
    ALTER TABLE calculator_templates ALTER COLUMN calculator_type SET NOT NULL;
  END IF;
END $$;

-- =========================================================
-- 4. Drop old columns (safe now that data is migrated, if present)
-- =========================================================
-- Drop policies that depend on old columns BEFORE dropping them
DROP POLICY IF EXISTS read_builtin_templates ON calculator_templates;
DROP POLICY IF EXISTS read_own_templates ON calculator_templates;
DROP POLICY IF EXISTS insert_own_templates ON calculator_templates;
DROP POLICY IF EXISTS update_own_templates ON calculator_templates;
DROP POLICY IF EXISTS delete_own_templates ON calculator_templates;
DROP POLICY IF EXISTS template_owner_all ON calculator_templates;

ALTER TABLE calculator_templates
  DROP COLUMN IF EXISTS template_type,
  DROP COLUMN IF EXISTS calculator_data,
  DROP COLUMN IF EXISTS is_builtin,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS sort_order;

-- =========================================================
-- 5. Indexes
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_calc_templates_user ON calculator_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_calc_templates_type ON calculator_templates(calculator_type);
CREATE INDEX IF NOT EXISTS idx_calc_templates_visibility ON calculator_templates(visibility);
CREATE INDEX IF NOT EXISTS idx_calc_templates_published ON calculator_templates(is_published) WHERE is_published = true;

-- Replaced by a UNIQUE index below (idx_calc_templates_slug_unique) so that
-- ON CONFLICT (slug) DO NOTHING in the seed inserts actually prevents
-- duplicate rows on re-run. A plain (non-unique) index on slug previously
-- did nothing to stop re-seeding from creating duplicates.
--
-- NOTE: this is a full (non-partial) unique index, not a partial one
-- filtered by "WHERE slug IS NOT NULL". Postgres already treats multiple
-- NULLs as distinct under a plain UNIQUE index/constraint, so private
-- user templates (slug = NULL) are unaffected. A PARTIAL unique index
-- would require every "ON CONFLICT (slug)" clause to repeat the exact
-- same WHERE predicate to be recognized as a matching arbiter (error
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification" otherwise) -- a full index avoids that footgun.
DROP INDEX IF EXISTS idx_calc_templates_slug;
DROP INDEX IF EXISTS idx_calc_templates_slug_unique;

-- =========================================================
-- 5b. De-duplicate any templates already inserted by prior re-runs
--     (keep the earliest row per slug) before adding the unique index
-- =========================================================
DELETE FROM calculator_templates a
  USING calculator_templates b
  WHERE a.slug IS NOT NULL
    AND a.slug = b.slug
    AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calc_templates_slug_unique
  ON calculator_templates(slug);

-- =========================================================
-- 6. RLS Policies (drop old, create new)
-- =========================================================
ALTER TABLE calculator_templates ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "read_builtin_templates" ON calculator_templates;
DROP POLICY IF EXISTS "read_own_templates" ON calculator_templates;
DROP POLICY IF EXISTS "insert_own_templates" ON calculator_templates;
DROP POLICY IF EXISTS "update_own_templates" ON calculator_templates;
DROP POLICY IF EXISTS "delete_own_templates" ON calculator_templates;

-- Public templates: anyone (anon + authenticated) can read published public templates
DROP POLICY IF EXISTS "read_public_templates" ON calculator_templates;
CREATE POLICY "read_public_templates"
  ON calculator_templates FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public' AND is_published = true);

-- Private templates: owner can read
DROP POLICY IF EXISTS "read_own_templates" ON calculator_templates;
CREATE POLICY "read_own_templates"
  ON calculator_templates FOR SELECT
  TO authenticated
  USING (visibility = 'private' AND auth.uid() = user_id);

-- Private templates: owner can insert
DROP POLICY IF EXISTS "insert_own_templates" ON calculator_templates;
CREATE POLICY "insert_own_templates"
  ON calculator_templates FOR INSERT
  TO authenticated
  WITH CHECK (visibility = 'private' AND auth.uid() = user_id);

-- Private templates: owner can update
DROP POLICY IF EXISTS "update_own_templates" ON calculator_templates;
CREATE POLICY "update_own_templates"
  ON calculator_templates FOR UPDATE
  TO authenticated
  USING (visibility = 'private' AND auth.uid() = user_id)
  WITH CHECK (visibility = 'private' AND auth.uid() = user_id);

-- Private templates: owner can delete
DROP POLICY IF EXISTS "delete_own_templates" ON calculator_templates;
CREATE POLICY "delete_own_templates"
  ON calculator_templates FOR DELETE
  TO authenticated
  USING (visibility = 'private' AND auth.uid() = user_id);

-- =========================================================
-- 7. Updated_at trigger (reuse existing or create new)
-- =========================================================
CREATE OR REPLACE FUNCTION update_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_template_updated_at ON calculator_templates;
CREATE TRIGGER trg_template_updated_at
  BEFORE UPDATE ON calculator_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

-- =========================================================
-- 8. Seed 16 curated public templates
--    ON CONFLICT (slug) now targets the unique index added in step 5b,
--    so re-running this script will NOT create duplicate templates.
-- =========================================================
INSERT INTO calculator_templates
  (user_id, calculator_type, name, description, input_data, visibility, is_published, is_featured, display_order, slug, seo_title, seo_description)
VALUES
  -- Painting templates (4)
  (NULL, 'paint', 'Standard Living Room',
   'Typical Nigerian living room: 4m x 5m, 3m ceiling, 2 coats, 1 door, 2 windows.',
   '{"length":4,"width":5,"wallHeight":3,"coats":2,"doors":1,"windows":2,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 1, 'standard-living-room-painting',
   'Paint Calculator Template: Standard Living Room | FRELUX',
   'Calculate paint needed for a standard living room with this FRELUX template. Pre-configured for 4m x 5m rooms with 3m ceilings.'),
  (NULL, 'paint', 'Master Bedroom',
   'Master bedroom: 4m x 4m, 2.7m ceiling, 2 coats, 1 door, 2 windows.',
   '{"length":4,"width":4,"wallHeight":2.7,"coats":2,"doors":1,"windows":2,"projectType":"interior","includeCeiling":false,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 2, 'master-bedroom-painting',
   'Paint Calculator Template: Master Bedroom | FRELUX',
   'Calculate paint needed for a master bedroom with this FRELUX template.'),
  (NULL, 'paint', 'Single Accent Wall',
   'One accent wall: 3.5m wide, 2.7m high, 2 coats.',
   '{"length":3.5,"width":0,"wallHeight":2.7,"coats":2,"projectType":"interior","includeCeiling":false,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 3, 'single-accent-wall-painting',
   'Paint Calculator Template: Single Accent Wall | FRELUX',
   'Calculate paint for a single accent wall with this FRELUX template.'),
  (NULL, 'paint', 'Exterior Bungalow',
   'Exterior bungalow: 15m perimeter, 4m height, 2 coats.',
   '{"length":15,"width":0,"wallHeight":4,"coats":2,"projectType":"exterior","includeCeiling":false,"wasteMargin":15,"unit":"meters"}'::jsonb,
   'public', true, false, 4, 'exterior-bungalow-painting',
   'Paint Calculator Template: Exterior Bungalow | FRELUX',
   'Calculate paint for exterior bungalow walls with this FRELUX template.'),

  -- Tiling templates (4)
  (NULL, 'tile', 'Standard Floor Tiling',
   '4m x 5m floor, 400x400mm tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":4,"width":5,"tileWidthMm":400,"tileHeightMm":400,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 5, 'standard-floor-tiling',
   'Tile Calculator Template: Standard Floor Tiling | FRELUX',
   'Calculate tiles, adhesive, and grout for a standard floor with this FRELUX template.'),
  (NULL, 'tile', 'Bathroom Wall Tiles',
   '3m x 2.5m walls, 300x600mm tiles, adhesive method.',
   '{"surfaceType":"wall","method":"adhesive","length":3,"width":2.5,"tileWidthMm":300,"tileHeightMm":600,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 6, 'bathroom-wall-tiling',
   'Tile Calculator Template: Bathroom Wall Tiles | FRELUX',
   'Calculate tiles for bathroom walls with this FRELUX template.'),
  (NULL, 'tile', 'Large Hall Floor',
   '8m x 10m hall floor, 600x600mm tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":8,"width":10,"tileWidthMm":600,"tileHeightMm":600,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 7, 'large-hall-floor-tiling',
   'Tile Calculator Template: Large Hall Floor | FRELUX',
   'Calculate tiles for a large hall floor with this FRELUX template.'),
  (NULL, 'tile', 'Kitchen Backsplash',
   '3m x 0.6m backsplash, 100x300mm tiles, adhesive method.',
   '{"surfaceType":"wall","method":"adhesive","length":3,"width":0.6,"tileWidthMm":100,"tileHeightMm":300,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 8, 'kitchen-backsplash-tiling',
   'Tile Calculator Template: Kitchen Backsplash | FRELUX',
   'Calculate tiles for a kitchen backsplash with this FRELUX template.'),

  -- Screeding templates (4)
  (NULL, 'screeding', 'Standard Room Floor Screed',
   '4m x 5m floor, 50mm thickness, standard mix.',
   '{"length":4,"width":5,"thicknessMm":50,"mixRatio":"1:4","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 9, 'standard-room-floor-screed',
   'Screeding Calculator Template: Standard Room Floor | FRELUX',
   'Calculate screeding materials for a standard room floor with this FRELUX template.'),
  (NULL, 'screeding', 'Bathroom Floor Screed',
   '2.5m x 2m floor, 40mm thickness, standard mix.',
   '{"length":2.5,"width":2,"thicknessMm":40,"mixRatio":"1:4","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 10, 'bathroom-floor-screed',
   'Screeding Calculator Template: Bathroom Floor | FRELUX',
   'Calculate screeding materials for a bathroom floor with this FRELUX template.'),
  (NULL, 'screeding', 'Large Hall Screed',
   '8m x 10m floor, 50mm thickness, standard mix.',
   '{"length":8,"width":10,"thicknessMm":50,"mixRatio":"1:4","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 11, 'large-hall-screed',
   'Screeding Calculator Template: Large Hall | FRELUX',
   'Calculate screeding materials for a large hall floor with this FRELUX template.'),
  (NULL, 'screeding', 'Balcony Screed',
   '3m x 1.5m floor, 40mm thickness, standard mix.',
   '{"length":3,"width":1.5,"thicknessMm":40,"mixRatio":"1:4","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 12, 'balcony-screed',
   'Screeding Calculator Template: Balcony | FRELUX',
   'Calculate screeding materials for a balcony floor with this FRELUX template.'),

  -- POP ceiling templates (4)
  (NULL, 'pop', 'Standard Room Ceiling',
   '4m x 5m room, Nigeria workflow, standard board.',
   '{"roomLength":4,"roomWidth":5,"workflow":"nigeria","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 13, 'standard-room-pop-ceiling',
   'POP Ceiling Calculator Template: Standard Room | FRELUX',
   'Calculate POP ceiling materials for a standard room with this FRELUX template.'),
  (NULL, 'pop', 'Large Living Room Ceiling',
   '6m x 8m living room, Nigeria workflow, decorative board.',
   '{"roomLength":6,"roomWidth":8,"workflow":"nigeria","boardType":"decorative","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 14, 'large-living-room-pop-ceiling',
   'POP Ceiling Calculator Template: Large Living Room | FRELUX',
   'Calculate POP ceiling materials for a large living room with this FRELUX template.'),
  (NULL, 'pop', 'Small Office Ceiling',
   '3m x 3m office, Nigeria workflow, standard board.',
   '{"roomLength":3,"roomWidth":3,"workflow":"nigeria","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 15, 'small-office-pop-ceiling',
   'POP Ceiling Calculator Template: Small Office | FRELUX',
   'Calculate POP ceiling materials for a small office with this FRELUX template.'),
  (NULL, 'pop', 'Hall Ceiling with Cornice',
   '8m x 10m hall, Nigeria workflow, decorative cornice.',
   '{"roomLength":8,"roomWidth":10,"workflow":"nigeria","boardType":"decorative","includeDecorative":true,"includeOptional":true,"wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 16, 'hall-ceiling-cornice-pop',
   'POP Ceiling Calculator Template: Hall with Cornice | FRELUX',
   'Calculate POP ceiling materials for a large hall with decorative cornice.')

ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 9. Update the old seed data (if any exists from phase19 migration)
-- =========================================================
-- Old seeded rows had is_builtin=true; after column drop they'll have visibility='public' from the migration above.
-- But we also inserted new curated templates above, so let's remove any old seeds that don't have slugs
-- (they were from the old migration and have been superseded by our new curated templates)
DELETE FROM calculator_templates
  WHERE visibility = 'public' AND slug IS NULL AND user_id IS NULL;
