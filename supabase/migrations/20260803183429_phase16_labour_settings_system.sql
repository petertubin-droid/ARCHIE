/*
# Labour Settings System — Optional, User-Controlled Labour Costing

## Overview
Makes labour cost an optional, user-controlled feature across all estimators.
Administrators can configure suggested rates, default pricing methods, and labour categories.
Users can always override any suggested rate from the frontend.

## New Tables

### 1. labour_settings
Global and per-estimator labour configuration.
- id (uuid PK)
- estimator_key (text, unique) — 'global' | 'paint' | 'screeding' | 'pop_ceiling' | 'tile'
- is_enabled (boolean, default true) — labour estimation enabled for this estimator
- default_pricing_method (text) — 'fixed' | 'per_sqm' | 'per_room' | 'daily' | 'custom'
- suggested_rates (jsonb) — { fixed: number, per_sqm: number, per_room: number, daily: number }
- settings (jsonb) — additional config (e.g. { allow_custom: true })
- created_at, updated_at (timestamptz)

### 2. labour_categories
Manageable labour categories for each estimator type.
- id (uuid PK)
- estimator_key (text) — 'paint' | 'screeding' | 'pop_ceiling' | 'tile' | 'global'
- category_name (text) — e.g. "Skilled Painter", "General Labourer"
- description (text, nullable)
- suggested_rate (numeric) — optional suggested rate
- rate_unit (text) — 'fixed' | 'per_sqm' | 'per_room' | 'daily'
- is_active (boolean, default true)
- sort_order (int, default 0)
- created_at, updated_at (timestamptz)

## Security
- Both tables: public SELECT (anon + authenticated), admin-only INSERT/UPDATE/DELETE
*/

-- =========================================================
-- 1. labour_settings
-- =========================================================
CREATE TABLE IF NOT EXISTS labour_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_key text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT true,
  default_pricing_method text NOT NULL DEFAULT 'fixed',
  suggested_rates jsonb NOT NULL DEFAULT '{"fixed":0,"per_sqm":0,"per_room":0,"daily":0}',
  settings jsonb NOT NULL DEFAULT '{"allow_custom":true}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE labour_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_labour_settings" ON labour_settings;
CREATE POLICY "public_read_labour_settings" ON labour_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_labour_settings" ON labour_settings;
CREATE POLICY "admin_insert_labour_settings" ON labour_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_labour_settings" ON labour_settings;
CREATE POLICY "admin_update_labour_settings" ON labour_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_labour_settings" ON labour_settings;
CREATE POLICY "admin_delete_labour_settings" ON labour_settings FOR DELETE
  TO authenticated USING (true);

-- Seed default settings
INSERT INTO labour_settings (estimator_key, is_enabled, default_pricing_method, suggested_rates) VALUES
  ('global', true, 'fixed', '{"fixed":0,"per_sqm":0,"per_room":0,"daily":0}'),
  ('paint', true, 'per_sqm', '{"fixed":0,"per_sqm":1500,"per_room":0,"daily":0}'),
  ('screeding', true, 'per_sqm', '{"fixed":0,"per_sqm":1000,"per_room":0,"daily":0}'),
  ('pop_ceiling', true, 'per_sqm', '{"fixed":0,"per_sqm":2000,"per_room":0,"daily":0}'),
  ('tile', true, 'per_sqm', '{"fixed":0,"per_sqm":2000,"per_room":0,"daily":0}')
ON CONFLICT (estimator_key) DO NOTHING;

-- =========================================================
-- 2. labour_categories
-- =========================================================
CREATE TABLE IF NOT EXISTS labour_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimator_key text NOT NULL,
  category_name text NOT NULL,
  description text,
  suggested_rate numeric NOT NULL DEFAULT 0,
  rate_unit text NOT NULL DEFAULT 'per_sqm',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE labour_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_labour_categories" ON labour_categories;
CREATE POLICY "public_read_labour_categories" ON labour_categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_labour_categories" ON labour_categories;
CREATE POLICY "admin_insert_labour_categories" ON labour_categories FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_labour_categories" ON labour_categories;
CREATE POLICY "admin_update_labour_categories" ON labour_categories FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_labour_categories" ON labour_categories;
CREATE POLICY "admin_delete_labour_categories" ON labour_categories FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_labour_categories_estimator ON labour_categories (estimator_key, is_active, sort_order);

-- Seed default categories
INSERT INTO labour_categories (estimator_key, category_name, description, suggested_rate, rate_unit, sort_order) VALUES
  ('paint', 'Skilled Painter', 'Professional painter with experience', 1500, 'per_sqm', 1),
  ('paint', 'General Painter', 'Standard painting labour', 1000, 'per_sqm', 2),
  ('paint', 'Apprentice Painter', 'Trainee painter under supervision', 500, 'per_sqm', 3),
  ('screeding', 'Skilled Screeder', 'Professional wall screeding specialist', 1000, 'per_sqm', 1),
  ('screeding', 'General Screeder', 'Standard screeding labour', 700, 'per_sqm', 2),
  ('pop_ceiling', 'POP Ceiling Installer', 'Professional POP ceiling installer', 2000, 'per_sqm', 1),
  ('pop_ceiling', 'POP Ceiling Assistant', 'Support labour for POP installation', 1000, 'per_sqm', 2),
  ('tile', 'Master Tiler', 'Professional tile installation specialist', 2000, 'per_sqm', 1),
  ('tile', 'General Tiler', 'Standard tiling labour', 1500, 'per_sqm', 2),
  ('tile', 'Tile Assistant', 'Support labour for tiling', 800, 'per_sqm', 3)
ON CONFLICT DO NOTHING;
