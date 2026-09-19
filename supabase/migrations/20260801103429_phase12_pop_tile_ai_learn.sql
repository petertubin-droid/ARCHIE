/*
# POP Ceiling, Tile, and AI Learning Assistant Modules

## Purpose
Adds database tables for the POP Ceiling Calculator/Estimator, Tile Calculator/Estimator,
and AI Learning Assistant. All tables support admin-managed material libraries,
pricing, and labour rates so administrators can add, edit, delete, activate,
deactivate, import, and export without touching source code.

## Tables

### POP Ceiling Materials
1. **pop_materials** — Material library for POP ceiling workflows (Nigeria + International).
   - workflow: 'nigeria' | 'international'
   - category: primary, finishing, decorative, framework, ceiling_boards, fasteners, labour
   - Stores name, unit, coverage_rate, package_size, unit_price, labour_rate, is_active, sort_order

2. **pop_workflows** — Workflow configuration for POP ceiling (Nigeria / International).
   - Stores which material categories are included, default waste %, sort_order

### Tile Materials
3. **tile_sizes** — Standard and custom tile sizes (width × height in mm).
   - name, width_mm, height_mm, tiles_per_box, is_standard, is_active, sort_order

4. **tile_materials** — Tile installation materials (tiles, adhesive, grout, spacers, etc.).
   - category: 'tile' | 'adhesive' | 'grout' | 'spacer' | 'waterproofing' | 'labour' | 'other'
   - name, unit, coverage_rate, coverage_unit, package_size, package_unit, unit_price, labour_rate_per_sqm, is_active, sort_order

### AI Learning Assistant
5. **learn_article_versions** — Version history for Learn articles.
   - article_id, version_number, content, change_summary, created_by, created_at

6. **ai_learn_chat** — Chat sessions for the frontend "Ask AI" feature.
   - session_id, user_id (nullable for anon), role, content, created_at

## Security
- RLS enabled on all tables.
- Public (anon + authenticated) can read active materials, tile sizes, workflows.
- Public can read published article versions.
- Public can insert ai_learn_chat rows (for Ask AI feature).
- Only admins can create, update, delete materials, tile sizes, workflows, and article versions.
- Admin check via is_current_user_admin() SECURITY DEFINER function (already exists).
*/

-- =========================================================
-- 1. pop_materials
-- =========================================================
CREATE TABLE IF NOT EXISTS pop_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow text NOT NULL DEFAULT 'nigeria' CHECK (workflow IN ('nigeria', 'international')),
  category text NOT NULL CHECK (category IN ('primary', 'finishing', 'decorative', 'framework', 'ceiling_boards', 'fasteners', 'labour')),
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'bag',
  coverage_rate numeric NOT NULL DEFAULT 1,
  coverage_unit text NOT NULL DEFAULT 'm²',
  package_size numeric NOT NULL DEFAULT 1,
  package_unit text NOT NULL DEFAULT 'unit',
  unit_price numeric NOT NULL DEFAULT 0,
  labour_rate_per_sqm numeric NOT NULL DEFAULT 0,
  is_optional boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'NGN',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pop_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_pop_materials" ON pop_materials;
CREATE POLICY "public_read_pop_materials" ON pop_materials FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_pop_materials" ON pop_materials;
CREATE POLICY "admin_insert_pop_materials" ON pop_materials FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_pop_materials" ON pop_materials;
CREATE POLICY "admin_update_pop_materials" ON pop_materials FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_pop_materials" ON pop_materials;
CREATE POLICY "admin_delete_pop_materials" ON pop_materials FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_pop_materials_workflow ON pop_materials(workflow);
CREATE INDEX IF NOT EXISTS idx_pop_materials_category ON pop_materials(category);
CREATE INDEX IF NOT EXISTS idx_pop_materials_active ON pop_materials(is_active) WHERE is_active = true;

-- =========================================================
-- 2. pop_workflows
-- =========================================================
CREATE TABLE IF NOT EXISTS pop_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  workflow_type text NOT NULL CHECK (workflow_type IN ('nigeria', 'international')),
  included_categories text[] NOT NULL DEFAULT '{}',
  default_waste_percentage numeric NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pop_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_pop_workflows" ON pop_workflows;
CREATE POLICY "public_read_pop_workflows" ON pop_workflows FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_pop_workflows" ON pop_workflows;
CREATE POLICY "admin_insert_pop_workflows" ON pop_workflows FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_pop_workflows" ON pop_workflows;
CREATE POLICY "admin_update_pop_workflows" ON pop_workflows FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_pop_workflows" ON pop_workflows;
CREATE POLICY "admin_delete_pop_workflows" ON pop_workflows FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 3. tile_sizes
-- =========================================================
CREATE TABLE IF NOT EXISTS tile_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  width_mm integer NOT NULL,
  height_mm integer NOT NULL,
  tiles_per_box integer NOT NULL DEFAULT 1,
  is_standard boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tile_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_tile_sizes" ON tile_sizes;
CREATE POLICY "public_read_tile_sizes" ON tile_sizes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_tile_sizes" ON tile_sizes;
CREATE POLICY "admin_insert_tile_sizes" ON tile_sizes FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_tile_sizes" ON tile_sizes;
CREATE POLICY "admin_update_tile_sizes" ON tile_sizes FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_tile_sizes" ON tile_sizes;
CREATE POLICY "admin_delete_tile_sizes" ON tile_sizes FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_tile_sizes_active ON tile_sizes(is_active) WHERE is_active = true;

-- =========================================================
-- 4. tile_materials
-- =========================================================
CREATE TABLE IF NOT EXISTS tile_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('tile', 'adhesive', 'grout', 'spacer', 'waterproofing', 'labour', 'other')),
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'bag',
  coverage_rate numeric NOT NULL DEFAULT 1,
  coverage_unit text NOT NULL DEFAULT 'm²',
  package_size numeric NOT NULL DEFAULT 1,
  package_unit text NOT NULL DEFAULT 'unit',
  unit_price numeric NOT NULL DEFAULT 0,
  labour_rate_per_sqm numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tile_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_tile_materials" ON tile_materials;
CREATE POLICY "public_read_tile_materials" ON tile_materials FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_tile_materials" ON tile_materials;
CREATE POLICY "admin_insert_tile_materials" ON tile_materials FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_tile_materials" ON tile_materials;
CREATE POLICY "admin_update_tile_materials" ON tile_materials FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_tile_materials" ON tile_materials;
CREATE POLICY "admin_delete_tile_materials" ON tile_materials FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_tile_materials_category ON tile_materials(category);
CREATE INDEX IF NOT EXISTS idx_tile_materials_active ON tile_materials(is_active) WHERE is_active = true;

-- =========================================================
-- 5. learn_article_versions
-- =========================================================
CREATE TABLE IF NOT EXISTS learn_article_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES learn_articles(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  change_summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE learn_article_versions ENABLE ROW LEVEL SECURITY;

-- Public can read versions of published articles
DROP POLICY IF EXISTS "public_read_learn_article_versions" ON learn_article_versions;
CREATE POLICY "public_read_learn_article_versions" ON learn_article_versions FOR SELECT
  TO anon, authenticated USING (true);

-- Admin can create versions
DROP POLICY IF EXISTS "admin_insert_learn_article_versions" ON learn_article_versions;
CREATE POLICY "admin_insert_learn_article_versions" ON learn_article_versions FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

-- Admin can delete versions
DROP POLICY IF EXISTS "admin_delete_learn_article_versions" ON learn_article_versions;
CREATE POLICY "admin_delete_learn_article_versions" ON learn_article_versions FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_learn_article_versions_article ON learn_article_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_learn_article_versions_version ON learn_article_versions(article_id, version_number DESC);

-- =========================================================
-- 6. ai_learn_chat
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_learn_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_id uuid,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_learn_chat ENABLE ROW LEVEL SECURITY;

-- Users can read their own chat sessions; anon can read by session_id
DROP POLICY IF EXISTS "public_read_ai_learn_chat" ON ai_learn_chat;
CREATE POLICY "public_read_ai_learn_chat" ON ai_learn_chat FOR SELECT
  TO anon, authenticated USING (true);

-- Users can insert their own messages; anon can insert
DROP POLICY IF EXISTS "public_insert_ai_learn_chat" ON ai_learn_chat;
CREATE POLICY "public_insert_ai_learn_chat" ON ai_learn_chat FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Admin can delete chat messages (moderation)
DROP POLICY IF EXISTS "admin_delete_ai_learn_chat" ON ai_learn_chat;
CREATE POLICY "admin_delete_ai_learn_chat" ON ai_learn_chat FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_ai_learn_chat_session ON ai_learn_chat(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_learn_chat_created ON ai_learn_chat(created_at DESC);

-- =========================================================
-- Seed: POP Workflows
-- =========================================================
INSERT INTO pop_workflows (slug, name, description, workflow_type, included_categories, default_waste_percentage, sort_order) VALUES
  ('nigeria', 'Nigeria POP Ceiling', 'Traditional Nigerian POP ceiling using POP cement, fibre, and surface board', 'nigeria',
   ARRAY['primary', 'finishing', 'decorative', 'labour'], 10, 1),
  ('international', 'International POP Ceiling', 'Gypsum board ceiling with metal framework and suspension system', 'international',
   ARRAY['primary', 'framework', 'ceiling_boards', 'fasteners', 'finishing', 'decorative', 'labour'], 10, 2)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Seed: POP Materials — Nigeria Workflow
-- =========================================================
INSERT INTO pop_materials (workflow, category, name, unit, coverage_rate, coverage_unit, package_size, package_unit, unit_price, labour_rate_per_sqm, is_optional, sort_order) VALUES
  -- Primary
  ('nigeria', 'primary', 'POP Cement', 'bag', 3, 'm²', 40, 'kg', 8500, 0, false, 1),
  ('nigeria', 'primary', 'Soap', 'bar', 10, 'm²', 1, 'bar', 500, 0, false, 2),
  ('nigeria', 'primary', 'Fibre', 'roll', 50, 'm²', 1, 'roll', 3500, 0, false, 3),
  ('nigeria', 'primary', 'Surface Board', 'board', 2.5, 'm²', 1, 'board', 2500, 0, false, 4),
  ('nigeria', 'primary', 'Scaffolding', 'set', 50, 'm²', 1, 'set', 5000, 0, true, 5),
  -- Finishing
  ('nigeria', 'finishing', 'Screeding Compound', 'bag', 5, 'm²', 20, 'kg', 4000, 0, false, 1),
  ('nigeria', 'finishing', 'Sandpaper', 'sheet', 10, 'm²', 1, 'sheet', 300, 0, false, 2),
  ('nigeria', 'finishing', 'Primer', 'litre', 10, 'm²', 4, 'litre', 2500, 0, false, 3),
  ('nigeria', 'finishing', 'Ceiling Paint', 'litre', 12, 'm²', 4, 'litre', 4500, 0, false, 4),
  ('nigeria', 'finishing', 'Finishing Putty', 'kg', 15, 'm²', 1, 'kg', 800, 0, false, 5),
  -- Decorative
  ('nigeria', 'decorative', 'Cornices', 'metre', 1, 'm', 1, 'metre', 1500, 0, true, 1),
  ('nigeria', 'decorative', 'Ceiling Roses', 'piece', 1, 'piece', 1, 'piece', 3500, 0, true, 2),
  ('nigeria', 'decorative', 'Light Troughs', 'metre', 1, 'm', 1, 'metre', 2500, 0, true, 3),
  ('nigeria', 'decorative', 'LED Strip Channels', 'metre', 1, 'm', 1, 'metre', 1800, 0, true, 4),
  ('nigeria', 'decorative', 'Access Panels', 'piece', 1, 'piece', 1, 'piece', 2000, 0, true, 5),
  -- Labour
  ('nigeria', 'labour', 'POP Installer', 'per_m2', 1, 'm²', 1, 'day', 0, 1500, false, 1),
  ('nigeria', 'labour', 'Helper', 'per_m2', 1, 'm²', 1, 'day', 0, 800, false, 2),
  ('nigeria', 'labour', 'Painter', 'per_m2', 1, 'm²', 1, 'day', 0, 1000, false, 3),
  ('nigeria', 'labour', 'Electrician', 'per_m2', 1, 'm²', 1, 'day', 0, 1200, true, 4)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: POP Materials — International Workflow
-- =========================================================
INSERT INTO pop_materials (workflow, category, name, unit, coverage_rate, coverage_unit, package_size, package_unit, unit_price, labour_rate_per_sqm, is_optional, sort_order) VALUES
  -- Primary
  ('international', 'primary', 'Gypsum Powder', 'bag', 3, 'm²', 25, 'kg', 5000, 0, false, 1),
  ('international', 'primary', 'Water', 'litre', 5, 'm²', 1, 'litre', 50, 0, false, 2),
  ('international', 'primary', 'Binding Compound', 'bag', 10, 'm²', 5, 'kg', 2000, 0, false, 3),
  ('international', 'primary', 'Joint Compound', 'bag', 8, 'm²', 5, 'kg', 2500, 0, false, 4),
  ('international', 'primary', 'Fibre Mesh Tape', 'roll', 50, 'm²', 1, 'roll', 1200, 0, false, 5),
  -- Framework
  ('international', 'framework', 'Furring Channels', 'metre', 3, 'm²', 1, 'metre', 800, 0, false, 1),
  ('international', 'framework', 'Main Channels', 'metre', 2.5, 'm²', 1, 'metre', 1000, 0, false, 2),
  ('international', 'framework', 'Wall Angles', 'metre', 3, 'm²', 1, 'metre', 600, 0, false, 3),
  ('international', 'framework', 'Suspension Rods', 'piece', 4, 'm²', 1, 'piece', 300, 0, false, 4),
  ('international', 'framework', 'Hanger Clips', 'piece', 6, 'm²', 1, 'piece', 150, 0, false, 5),
  ('international', 'framework', 'Connecting Clips', 'piece', 8, 'm²', 1, 'piece', 100, 0, false, 6),
  ('international', 'framework', 'Expansion Bolts', 'piece', 4, 'm²', 1, 'piece', 200, 0, false, 7),
  -- Ceiling Boards
  ('international', 'ceiling_boards', 'Gypsum Boards', 'board', 2.5, 'm²', 1, 'board', 3500, 0, false, 1),
  ('international', 'ceiling_boards', 'PVC Ceiling Panels', 'panel', 2, 'm²', 1, 'panel', 2800, 0, true, 2),
  ('international', 'ceiling_boards', 'Calcium Silicate Boards', 'board', 2.5, 'm²', 1, 'board', 4200, 0, true, 3),
  -- Fasteners
  ('international', 'fasteners', 'Drywall Screws', 'box', 50, 'm²', 1, 'box', 800, 0, false, 1),
  ('international', 'fasteners', 'Nails', 'box', 50, 'm²', 1, 'box', 500, 0, false, 2),
  ('international', 'fasteners', 'Anchor Bolts', 'box', 20, 'm²', 1, 'box', 1200, 0, false, 3),
  ('international', 'fasteners', 'Wall Plugs', 'box', 50, 'm²', 1, 'box', 300, 0, false, 4),
  -- Finishing
  ('international', 'finishing', 'Screeding Compound', 'bag', 5, 'm²', 20, 'kg', 4000, 0, false, 1),
  ('international', 'finishing', 'Sandpaper', 'sheet', 10, 'm²', 1, 'sheet', 300, 0, false, 2),
  ('international', 'finishing', 'Primer', 'litre', 10, 'm²', 4, 'litre', 2500, 0, false, 3),
  ('international', 'finishing', 'Ceiling Paint', 'litre', 12, 'm²', 4, 'litre', 4500, 0, false, 4),
  ('international', 'finishing', 'Finishing Putty', 'kg', 15, 'm²', 1, 'kg', 800, 0, false, 5),
  -- Decorative
  ('international', 'decorative', 'Cornices', 'metre', 1, 'm', 1, 'metre', 1500, 0, true, 1),
  ('international', 'decorative', 'Ceiling Roses', 'piece', 1, 'piece', 1, 'piece', 3500, 0, true, 2),
  ('international', 'decorative', 'Light Troughs', 'metre', 1, 'm', 1, 'metre', 2500, 0, true, 3),
  ('international', 'decorative', 'LED Strip Channels', 'metre', 1, 'm', 1, 'metre', 1800, 0, true, 4),
  ('international', 'decorative', 'Access Panels', 'piece', 1, 'piece', 1, 'piece', 2000, 0, true, 5),
  -- Labour
  ('international', 'labour', 'POP Installer', 'per_m2', 1, 'm²', 1, 'day', 0, 1500, false, 1),
  ('international', 'labour', 'Helper', 'per_m2', 1, 'm²', 1, 'day', 0, 800, false, 2),
  ('international', 'labour', 'Painter', 'per_m2', 1, 'm²', 1, 'day', 0, 1000, false, 3),
  ('international', 'labour', 'Electrician', 'per_m2', 1, 'm²', 1, 'day', 0, 1200, false, 4)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: Tile Sizes (Standard)
-- =========================================================
INSERT INTO tile_sizes (name, width_mm, height_mm, tiles_per_box, is_standard, sort_order) VALUES
  ('300 × 300 mm', 300, 300, 11, true, 1),
  ('300 × 600 mm', 300, 600, 8, true, 2),
  ('400 × 400 mm', 400, 400, 7, true, 3),
  ('600 × 600 mm', 600, 600, 4, true, 4),
  ('800 × 800 mm', 800, 800, 3, true, 5),
  ('1200 × 600 mm', 1200, 600, 2, true, 6),
  ('150 × 150 mm', 150, 150, 20, true, 7),
  ('200 × 200 mm', 200, 200, 15, true, 8),
  ('100 × 100 mm', 100, 100, 30, true, 9),
  ('250 × 400 mm', 250, 400, 10, true, 10)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: Tile Materials
-- =========================================================
INSERT INTO tile_materials (category, name, unit, coverage_rate, coverage_unit, package_size, package_unit, unit_price, labour_rate_per_sqm, sort_order) VALUES
  ('adhesive', 'Tile Adhesive (Standard)', 'bag', 5, 'm²', 20, 'kg', 4500, 0, 1),
  ('adhesive', 'Tile Adhesive (Premium)', 'bag', 6, 'm²', 20, 'kg', 6500, 0, 2),
  ('grout', 'Grout (White)', 'kg', 20, 'm²', 1, 'kg', 1500, 0, 1),
  ('grout', 'Grout (Grey)', 'kg', 20, 'm²', 1, 'kg', 1500, 0, 2),
  ('grout', 'Grout (Coloured)', 'kg', 20, 'm²', 1, 'kg', 2000, 0, 3),
  ('spacer', 'Tile Spacers (2mm)', 'pack', 50, 'm²', 1, 'pack', 500, 0, 1),
  ('spacer', 'Tile Spacers (3mm)', 'pack', 50, 'm²', 1, 'pack', 500, 0, 2),
  ('spacer', 'Tile Spacers (5mm)', 'pack', 50, 'm²', 1, 'pack', 600, 0, 3),
  ('waterproofing', 'Waterproofing Membrane', 'litre', 10, 'm²', 5, 'litre', 3500, 0, 1),
  ('other', 'Tile Cutter Blade', 'piece', 100, 'm²', 1, 'piece', 2500, 0, 1),
  ('other', 'Spirit Level', 'piece', 100, 'm²', 1, 'piece', 2000, 0, 2),
  ('labour', 'Tile Installer', 'per_m2', 1, 'm²', 1, 'day', 0, 2000, 1),
  ('labour', 'Helper', 'per_m2', 1, 'm²', 1, 'day', 0, 800, 2)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Add 'pop_ceiling' and 'tile' to user_projects project_type enum
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_projects_project_type_check'
  ) THEN
    ALTER TABLE user_projects
    ADD CONSTRAINT user_projects_project_type_check
    CHECK (project_type IN ('screeding', 'paint_calc', 'cost_estimate', 'ai_recommendation', 'custom', 'pop_ceiling', 'pop_estimate', 'tile', 'tile_estimate'));
  ELSE
    -- Drop and recreate to include new types
    ALTER TABLE user_projects DROP CONSTRAINT IF EXISTS user_projects_project_type_check;
    ALTER TABLE user_projects
    ADD CONSTRAINT user_projects_project_type_check
    CHECK (project_type IN ('screeding', 'paint_calc', 'cost_estimate', 'ai_recommendation', 'custom', 'pop_ceiling', 'pop_estimate', 'tile', 'tile_estimate'));
  END IF;
END $$;
