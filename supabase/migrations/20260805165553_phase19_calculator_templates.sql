/*
# Calculator Templates System

1. New Tables
- `calculator_templates` — stores built-in and user-saved calculator templates.
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable — null for built-in templates, set for user templates)
  - `template_type` (text — 'paint' | 'screeding' | 'pop_ceiling' | 'tile')
  - `name` (text — display name)
  - `description` (text, nullable)
  - `calculator_data` (jsonb — the full calculator input state)
  - `is_builtin` (boolean — true for system templates, false for user-saved)
  - `is_active` (boolean — soft delete / visibility toggle)
  - `sort_order` (int — ordering for display)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `calculator_templates`.
- Built-in templates (is_builtin = true): readable by anon + authenticated (public).
- User templates: full CRUD scoped to owner via auth.uid() = user_id.
- Only service role can create/update/delete built-in templates (admin panel uses service role).

3. Indexes
- `idx_calc_templates_user` on `user_id` for fast per-user queries.
- `idx_calc_templates_type` on `template_type` for filtering by calculator.
*/

CREATE TABLE IF NOT EXISTS calculator_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('paint', 'screeding', 'pop_ceiling', 'tile')),
  name text NOT NULL,
  description text,
  calculator_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_builtin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE calculator_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_calc_templates_user ON calculator_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_calc_templates_type ON calculator_templates(template_type);

-- Built-in templates: public read
DROP POLICY IF EXISTS "read_builtin_templates" ON calculator_templates;
CREATE POLICY "read_builtin_templates"
  ON calculator_templates FOR SELECT
  TO anon, authenticated
  USING (is_builtin = true AND is_active = true);

-- User templates: owner can read
DROP POLICY IF EXISTS "read_own_templates" ON calculator_templates;
CREATE POLICY "read_own_templates"
  ON calculator_templates FOR SELECT
  TO authenticated
  USING (is_builtin = false AND auth.uid() = user_id);

-- User templates: owner can insert
DROP POLICY IF EXISTS "insert_own_templates" ON calculator_templates;
CREATE POLICY "insert_own_templates"
  ON calculator_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_builtin = false AND auth.uid() = user_id);

-- User templates: owner can update
DROP POLICY IF EXISTS "update_own_templates" ON calculator_templates;
CREATE POLICY "update_own_templates"
  ON calculator_templates FOR UPDATE
  TO authenticated
  USING (is_builtin = false AND auth.uid() = user_id)
  WITH CHECK (is_builtin = false AND auth.uid() = user_id);

-- User templates: owner can delete
DROP POLICY IF EXISTS "delete_own_templates" ON calculator_templates;
CREATE POLICY "delete_own_templates"
  ON calculator_templates FOR DELETE
  TO authenticated
  USING (is_builtin = false AND auth.uid() = user_id);

-- Updated_at trigger
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

-- Seed built-in templates for each calculator type
INSERT INTO calculator_templates (template_type, name, description, calculator_data, is_builtin, is_active, sort_order)
VALUES
  ('paint', 'Standard Living Room', 'Typical living room: 4m x 5m, 3m ceiling, 2 coats', '{"roomLength":"4","roomWidth":"5","ceilingHeight":"3","coats":"2","doors":"1","windows":"2"}'::jsonb, true, true, 1),
  ('paint', 'Bedroom Single Wall', 'One accent wall: 3.5m wide, 2.7m high', '{"method":"single_wall","wallWidth":"3.5","wallHeight":"2.7","wallCount":"1","coats":"2"}'::jsonb, true, true, 2),
  ('screeding', 'Standard Room Screeding', 'Full room: 4m x 4m, 2.7m height', '{"method":"full_room","roomLength":"4","roomWidth":"4","wallHeight":"2.7","doors":"1","windows":"1"}'::jsonb, true, true, 1),
  ('screeding', 'Single Wall Screeding', 'One wall: 5m wide, 2.7m high', '{"method":"single_wall","wallWidth":"5","wallHeight":"2.7","wallCount":"1"}'::jsonb, true, true, 2),
  ('pop_ceiling', 'Standard Ceiling', '4m x 5m room, Nigeria workflow', '{"roomLength":"4","roomWidth":"5","workflow":"nigeria"}'::jsonb, true, true, 1),
  ('pop_ceiling', 'Large Hall Ceiling', '8m x 10m hall, International workflow', '{"roomLength":"8","roomWidth":"10","workflow":"international"}'::jsonb, true, true, 2),
  ('tile', 'Standard Floor Tiles', '4m x 5m floor, 600x600mm tiles', '{"roomLength":"4","roomWidth":"5","tileWidth":"600","tileHeight":"600"}'::jsonb, true, true, 1),
  ('tile', 'Bathroom Wall Tiles', '3m x 2.5m walls, 300x600mm tiles', '{"roomLength":"3","roomWidth":"2.5","tileWidth":"300","tileHeight":"600"}'::jsonb, true, true, 2)
ON CONFLICT DO NOTHING;
