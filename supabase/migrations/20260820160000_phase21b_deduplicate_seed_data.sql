-- =========================================================
-- Phase 21b: Deduplicate seed data & add unique constraints
-- Date: 2026-08-20
-- Amended: 2026-09-12 — made constraint additions idempotent.
--   "Supabase Preview" CI check was failing with
--   "relation material_prices_name_key already exists (42P07)"
--   because ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS
--   form in Postgres. Wrapped each in a DO block that checks
--   pg_constraint first, so this migration is safe to replay
--   against any environment (fresh, drifted, or already-applied).
--
-- Problem: Seed inserts used `ON CONFLICT DO NOTHING` which only
-- checks the primary key (id = gen_random_uuid()). Since each insert
-- generates a new UUID, there's never a conflict, so every migration
-- re-run created duplicate rows.
--
-- Affected tables (actual / expected):
--   paint_types:        25 / 5   (5x duplicated)
--   labor_rates:        10 / 2   (5x duplicated)
--   material_prices:    30 / 6   (5x duplicated)
--   tile_sizes:         30 / 10  (3x duplicated)
--   tile_materials:     42 / 16  (3x duplicated)
--   pop_materials:    156 / 38   (3x duplicated, by name+workflow)
--   screeding_materials: 9 / 3   (3x duplicated)
--
-- Fix:
--   1. Delete duplicates, keeping the row with lowest sort_order
--      (or earliest created_at as tiebreaker)
--   2. Add UNIQUE constraints on natural keys to prevent future dupes
--      (idempotent — skipped if already present)
--   3. These constraints also make `ON CONFLICT (name) DO NOTHING`
--      in the original migrations work correctly going forward
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. paint_types — dedupe by name, keep lowest sort_order
-- ─────────────────────────────────────────────────────────
DELETE FROM public.paint_types
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.paint_types
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paint_types_name_key'
  ) THEN
    ALTER TABLE public.paint_types
      ADD CONSTRAINT paint_types_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 2. labor_rates — dedupe by name
-- ─────────────────────────────────────────────────────────
DELETE FROM public.labor_rates
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.labor_rates
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labor_rates_name_key'
  ) THEN
    ALTER TABLE public.labor_rates
      ADD CONSTRAINT labor_rates_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 3. material_prices — dedupe by name
-- ─────────────────────────────────────────────────────────
DELETE FROM public.material_prices
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.material_prices
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'material_prices_name_key'
  ) THEN
    ALTER TABLE public.material_prices
      ADD CONSTRAINT material_prices_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 4. tile_sizes — dedupe by name
-- ─────────────────────────────────────────────────────────
DELETE FROM public.tile_sizes
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.tile_sizes
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tile_sizes_name_key'
  ) THEN
    ALTER TABLE public.tile_sizes
      ADD CONSTRAINT tile_sizes_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 5. tile_materials — dedupe by name
-- ─────────────────────────────────────────────────────────
DELETE FROM public.tile_materials
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.tile_materials
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tile_materials_name_key'
  ) THEN
    ALTER TABLE public.tile_materials
      ADD CONSTRAINT tile_materials_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 6. pop_materials — dedupe by name + workflow (composite key)
-- ─────────────────────────────────────────────────────────
DELETE FROM public.pop_materials
WHERE id NOT IN (
  SELECT DISTINCT ON (name, workflow) id
  FROM public.pop_materials
  ORDER BY name, workflow, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pop_materials_name_workflow_key'
  ) THEN
    ALTER TABLE public.pop_materials
      ADD CONSTRAINT pop_materials_name_workflow_key UNIQUE (name, workflow);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- 7. screeding_materials — dedupe by name
-- ─────────────────────────────────────────────────────────
DELETE FROM public.screeding_materials
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM public.screeding_materials
  ORDER BY name, sort_order ASC, created_at ASC
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'screeding_materials_name_key'
  ) THEN
    ALTER TABLE public.screeding_materials
      ADD CONSTRAINT screeding_materials_name_key UNIQUE (name);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────
-- Verification (run manually to confirm):
--   SELECT 'paint_types' as t, count(*) FROM paint_types
--   UNION ALL SELECT 'labor_rates', count(*) FROM labor_rates
--   UNION ALL SELECT 'material_prices', count(*) FROM material_prices
--   UNION ALL SELECT 'tile_sizes', count(*) FROM tile_sizes
--   UNION ALL SELECT 'tile_materials', count(*) FROM tile_materials
--   UNION ALL SELECT 'pop_materials', count(*) FROM pop_materials
--   UNION ALL SELECT 'screeding_materials', count(*) FROM screeding_materials;
-- =========================================================
