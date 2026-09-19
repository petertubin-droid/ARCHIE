-- =========================================================
-- Phase 22: Template enhancements + Client CRM + Analytics
-- Date: 2026-08-21
--
-- Adds:
-- 1. Template categories + default flag + building_type field
-- 2. Client management table (Mini CRM)
-- 3. Client communications table
-- 4. Estimate analytics views
-- 5. Integration settings table
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. Template enhancements: category, building_type, is_default
-- ─────────────────────────────────────────────────────────
ALTER TABLE calculator_templates
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Index for category-based queries
CREATE INDEX IF NOT EXISTS idx_calc_templates_category ON calculator_templates(category);
CREATE INDEX IF NOT EXISTS idx_calc_templates_building ON calculator_templates(building_type) WHERE building_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calc_templates_default ON calculator_templates(is_default) WHERE is_default = true;

-- ─────────────────────────────────────────────────────────
-- 2. Building-type default templates (8 building types × 4 calculators = 32 templates)
--    These are professional templates for specific building types
-- ─────────────────────────────────────────────────────────
INSERT INTO calculator_templates
  (user_id, calculator_type, name, description, input_data, visibility, is_published, is_featured, display_order, slug, seo_title, seo_description, category, building_type)
VALUES
  -- ── RESIDENTIAL ──
  (NULL, 'paint', 'Residential Interior Painting',
   'Standard residential interior: living room + 3 bedrooms, 2 coats, economy quality.',
   '{"length":12,"width":10,"wallHeight":3,"coats":2,"doors":4,"windows":6,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 101, 'residential-interior-painting',
   'Paint Template: Residential Interior | FRELUX',
   'Complete residential interior painting template for standard homes.',
   'residential', 'residential'),
  (NULL, 'screeding', 'Residential Wall Screeding',
   'Full residential screeding: all interior walls, standard finish.',
   '{"method":"full_room","roomLength":12,"roomWidth":10,"wallHeight":3,"doors":4,"windows":6,"unit":"meters"}'::jsonb,
   'public', true, false, 102, 'residential-wall-screeding',
   'Screeding Template: Residential Walls | FRELUX',
   'Complete wall screeding template for residential buildings.',
   'residential', 'residential'),
  (NULL, 'pop', 'Residential POP Ceiling',
   'Standard residential POP ceiling: living room + bedrooms, Nigeria workflow.',
   '{"roomLength":12,"roomWidth":10,"workflow":"nigeria","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 103, 'residential-pop-ceiling',
   'POP Template: Residential Ceiling | FRELUX',
   'Complete POP ceiling template for residential buildings.',
   'residential', 'residential'),
  (NULL, 'tile', 'Residential Floor Tiling',
   'Residential floor tiling: all rooms, 400x400mm ceramic tiles.',
   '{"surfaceType":"floor","method":"adhesive","length":12,"width":10,"tileWidthMm":400,"tileHeightMm":400,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 104, 'residential-floor-tiling',
   'Tile Template: Residential Floors | FRELUX',
   'Complete floor tiling template for residential buildings.',
   'residential', 'residential'),

  -- ── COMMERCIAL ──
  (NULL, 'paint', 'Commercial Office Painting',
   'Commercial office space: 200m² floor area, 3m ceilings, premium finish.',
   '{"length":20,"width":10,"wallHeight":3,"coats":2,"doors":4,"windows":8,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 111, 'commercial-office-painting',
   'Paint Template: Commercial Office | FRELUX',
   'Professional painting template for commercial office spaces.',
   'commercial', 'commercial'),
  (NULL, 'screeding', 'Commercial Wall Screeding',
   'Commercial screeding: large office walls, standard finish.',
   '{"method":"full_room","roomLength":20,"roomWidth":10,"wallHeight":3,"doors":4,"windows":8,"unit":"meters"}'::jsonb,
   'public', true, false, 112, 'commercial-wall-screeding',
   'Screeding Template: Commercial Walls | FRELUX',
   'Professional wall screeding template for commercial buildings.',
   'commercial', 'commercial'),
  (NULL, 'pop', 'Commercial POP Ceiling',
   'Commercial POP ceiling: open office, International workflow, fire-rated boards.',
   '{"roomLength":20,"roomWidth":10,"workflow":"international","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 113, 'commercial-pop-ceiling',
   'POP Template: Commercial Ceiling | FRELUX',
   'Professional POP ceiling template for commercial buildings.',
   'commercial', 'commercial'),
  (NULL, 'tile', 'Commercial Floor Tiling',
   'Commercial floor tiling: 600x600mm porcelain, heavy traffic rated.',
   '{"surfaceType":"floor","method":"adhesive","length":20,"width":10,"tileWidthMm":600,"tileHeightMm":600,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 114, 'commercial-floor-tiling',
   'Tile Template: Commercial Floors | FRELUX',
   'Professional floor tiling template for commercial buildings.',
   'commercial', 'commercial'),

  -- ── INDUSTRIAL ──
  (NULL, 'paint', 'Industrial Warehouse Painting',
   'Industrial warehouse: 500m² floor area, 6m walls, epoxy paint, 2 coats.',
   '{"length":50,"width":10,"wallHeight":6,"coats":2,"doors":6,"windows":4,"projectType":"interior","includeCeiling":false,"wasteMargin":15,"unit":"meters"}'::jsonb,
   'public', true, false, 121, 'industrial-warehouse-painting',
   'Paint Template: Industrial Warehouse | FRELUX',
   'Heavy-duty painting template for industrial facilities.',
   'industrial', 'industrial'),
  (NULL, 'screeding', 'Industrial Wall Screeding',
   'Industrial screeding: warehouse walls, rough finish, high durability.',
   '{"method":"full_room","roomLength":50,"roomWidth":10,"wallHeight":6,"doors":6,"windows":4,"unit":"meters"}'::jsonb,
   'public', true, false, 122, 'industrial-wall-screeding',
   'Screeding Template: Industrial Walls | FRELUX',
   'Heavy-duty wall screeding template for industrial buildings.',
   'industrial', 'industrial'),
  (NULL, 'pop', 'Industrial POP Ceiling',
   'Industrial POP ceiling: warehouse, International workflow, moisture-resistant.',
   '{"roomLength":50,"roomWidth":10,"workflow":"international","boardType":"standard","wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 123, 'industrial-pop-ceiling',
   'POP Template: Industrial Ceiling | FRELUX',
   'Industrial-grade POP ceiling template for warehouses and factories.',
   'industrial', 'industrial'),
  (NULL, 'tile', 'Industrial Floor Tiling',
   'Industrial floor tiling: 600x600mm vitrified tiles, chemical resistant.',
   '{"surfaceType":"floor","method":"cement","length":50,"width":10,"tileWidthMm":600,"tileHeightMm":600,"wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 124, 'industrial-floor-tiling',
   'Tile Template: Industrial Floors | FRELUX',
   'Heavy-duty floor tiling template for industrial facilities.',
   'industrial', 'industrial'),

  -- ── HOTELS ──
  (NULL, 'paint', 'Hotel Room Painting',
   'Hotel guest room: 5m x 4m, 2.7m ceiling, luxury finish, 2 coats.',
   '{"length":5,"width":4,"wallHeight":2.7,"coats":2,"doors":1,"windows":1,"projectType":"interior","includeCeiling":true,"wasteMargin":8,"unit":"meters"}'::jsonb,
   'public', true, false, 131, 'hotel-room-painting',
   'Paint Template: Hotel Guest Room | FRELUX',
   'Premium painting template for hotel guest rooms.',
   'hospitality', 'hotel'),
  (NULL, 'screeding', 'Hotel Wall Screeding',
   'Hotel screeding: smooth premium finish for guest room walls.',
   '{"method":"full_room","roomLength":5,"roomWidth":4,"wallHeight":2.7,"doors":1,"windows":1,"unit":"meters"}'::jsonb,
   'public', true, false, 132, 'hotel-wall-screeding',
   'Screeding Template: Hotel Walls | FRELUX',
   'Premium wall screeding template for hotel guest rooms.',
   'hospitality', 'hotel'),
  (NULL, 'pop', 'Hotel POP Ceiling',
   'Hotel POP ceiling: guest room, decorative cornices, International workflow.',
   '{"roomLength":5,"roomWidth":4,"workflow":"international","boardType":"decorative","includeDecorative":true,"wasteMargin":8,"unit":"meters"}'::jsonb,
   'public', true, false, 133, 'hotel-pop-ceiling',
   'POP Template: Hotel Ceiling | FRELUX',
   'Premium POP ceiling template for hotel guest rooms.',
   'hospitality', 'hotel'),
  (NULL, 'tile', 'Hotel Bathroom Tiling',
   'Hotel bathroom: 3m x 2.5m walls, 300x600mm premium tiles, adhesive method.',
   '{"surfaceType":"wall","method":"adhesive","length":3,"width":2.5,"tileWidthMm":300,"tileHeightMm":600,"wasteMargin":8,"unit":"meters"}'::jsonb,
   'public', true, false, 134, 'hotel-bathroom-tiling',
   'Tile Template: Hotel Bathroom | FRELUX',
   'Premium bathroom tiling template for hotels.',
   'hospitality', 'hotel'),

  -- ── HOSPITALS ──
  (NULL, 'paint', 'Hospital Ward Painting',
   'Hospital ward: 8m x 6m, 3m ceiling, anti-bacterial paint, 2 coats.',
   '{"length":8,"width":6,"wallHeight":3,"coats":2,"doors":2,"windows":4,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 141, 'hospital-ward-painting',
   'Paint Template: Hospital Ward | FRELUX',
   'Hygienic painting template for hospital wards and medical facilities.',
   'healthcare', 'hospital'),
  (NULL, 'screeding', 'Hospital Wall Screeding',
   'Hospital screeding: smooth hygienic walls, standard finish.',
   '{"method":"full_room","roomLength":8,"roomWidth":6,"wallHeight":3,"doors":2,"windows":4,"unit":"meters"}'::jsonb,
   'public', true, false, 142, 'hospital-wall-screeding',
   'Screeding Template: Hospital Walls | FRELUX',
   'Hygienic wall screeding template for hospital facilities.',
   'healthcare', 'hospital'),
  (NULL, 'pop', 'Hospital POP Ceiling',
   'Hospital POP ceiling: ward, Nigeria workflow, washable boards.',
   '{"roomLength":8,"roomWidth":6,"workflow":"nigeria","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 143, 'hospital-pop-ceiling',
   'POP Template: Hospital Ceiling | FRELUX',
   'Hygienic POP ceiling template for hospital facilities.',
   'healthcare', 'hospital'),
  (NULL, 'tile', 'Hospital Floor Tiling',
   'Hospital floor: 8m x 6m, 600x600mm anti-slip tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":8,"width":6,"tileWidthMm":600,"tileHeightMm":600,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 144, 'hospital-floor-tiling',
   'Tile Template: Hospital Floors | FRELUX',
   'Anti-slip floor tiling template for hospital facilities.',
   'healthcare', 'hospital'),

  -- ── SCHOOLS ──
  (NULL, 'paint', 'School Classroom Painting',
   'Classroom: 8m x 6m, 3m ceiling, durable paint, 2 coats.',
   '{"length":8,"width":6,"wallHeight":3,"coats":2,"doors":2,"windows":6,"projectType":"interior","includeCeiling":true,"wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 151, 'school-classroom-painting',
   'Paint Template: School Classroom | FRELUX',
   'Durable painting template for school classrooms.',
   'education', 'school'),
  (NULL, 'screeding', 'School Wall Screeding',
   'School screeding: classroom walls, durable standard finish.',
   '{"method":"full_room","roomLength":8,"roomWidth":6,"wallHeight":3,"doors":2,"windows":6,"unit":"meters"}'::jsonb,
   'public', true, false, 152, 'school-wall-screeding',
   'Screeding Template: School Walls | FRELUX',
   'Durable wall screeding template for school buildings.',
   'education', 'school'),
  (NULL, 'pop', 'School POP Ceiling',
   'School POP ceiling: classroom, Nigeria workflow, standard boards.',
   '{"roomLength":8,"roomWidth":6,"workflow":"nigeria","boardType":"standard","wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 153, 'school-pop-ceiling',
   'POP Template: School Ceiling | FRELUX',
   'Durable POP ceiling template for school buildings.',
   'education', 'school'),
  (NULL, 'tile', 'School Floor Tiling',
   'School floor: 8m x 6m, 400x400mm durable ceramic tiles.',
   '{"surfaceType":"floor","method":"cement","length":8,"width":6,"tileWidthMm":400,"tileHeightMm":400,"wasteMargin":12,"unit":"meters"}'::jsonb,
   'public', true, false, 154, 'school-floor-tiling',
   'Tile Template: School Floors | FRELUX',
   'Durable floor tiling template for school buildings.',
   'education', 'school'),

  -- ── DUPLEXES ──
  (NULL, 'paint', 'Duplex Interior Painting',
   'Duplex: ground + first floor, 200m² total, 3m ceilings, 2 coats.',
   '{"length":15,"width":8,"wallHeight":6,"coats":2,"doors":6,"windows":10,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 161, 'duplex-interior-painting',
   'Paint Template: Duplex Interior | FRELUX',
   'Complete painting template for duplex interiors.',
   'residential', 'duplex'),
  (NULL, 'screeding', 'Duplex Wall Screeding',
   'Duplex screeding: two floors, full interior walls, standard finish.',
   '{"method":"full_room","roomLength":15,"roomWidth":8,"wallHeight":6,"doors":6,"windows":10,"unit":"meters"}'::jsonb,
   'public', true, false, 162, 'duplex-wall-screeding',
   'Screeding Template: Duplex Walls | FRELUX',
   'Complete wall screeding template for duplex buildings.',
   'residential', 'duplex'),
  (NULL, 'pop', 'Duplex POP Ceiling',
   'Duplex POP ceiling: two floors, Nigeria workflow, decorative edges.',
   '{"roomLength":15,"roomWidth":8,"workflow":"nigeria","boardType":"decorative","includeDecorative":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 163, 'duplex-pop-ceiling',
   'POP Template: Duplex Ceiling | FRELUX',
   'Complete POP ceiling template for duplex buildings.',
   'residential', 'duplex'),
  (NULL, 'tile', 'Duplex Floor Tiling',
   'Duplex tiling: all floors, 400x400mm ceramic, cement method.',
   '{"surfaceType":"floor","method":"cement","length":15,"width":8,"tileWidthMm":400,"tileHeightMm":400,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 164, 'duplex-floor-tiling',
   'Tile Template: Duplex Floors | FRELUX',
   'Complete floor tiling template for duplex buildings.',
   'residential', 'duplex'),

  -- ── APARTMENTS ──
  (NULL, 'paint', 'Apartment Interior Painting',
   'Apartment: 3 rooms, 60m² total, 2.7m ceiling, 2 coats.',
   '{"length":10,"width":6,"wallHeight":2.7,"coats":2,"doors":3,"windows":4,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 171, 'apartment-interior-painting',
   'Paint Template: Apartment Interior | FRELUX',
   'Complete painting template for apartment interiors.',
   'residential', 'apartment'),
  (NULL, 'screeding', 'Apartment Wall Screeding',
   'Apartment screeding: compact space, smooth finish, standard quality.',
   '{"method":"full_room","roomLength":10,"roomWidth":6,"wallHeight":2.7,"doors":3,"windows":4,"unit":"meters"}'::jsonb,
   'public', true, false, 172, 'apartment-wall-screeding',
   'Screeding Template: Apartment Walls | FRELUX',
   'Complete wall screeding template for apartment buildings.',
   'residential', 'apartment'),
  (NULL, 'pop', 'Apartment POP Ceiling',
   'Apartment POP ceiling: standard rooms, Nigeria workflow.',
   '{"roomLength":10,"roomWidth":6,"workflow":"nigeria","boardType":"standard","wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 173, 'apartment-pop-ceiling',
   'POP Template: Apartment Ceiling | FRELUX',
   'Complete POP ceiling template for apartment buildings.',
   'residential', 'apartment'),
  (NULL, 'tile', 'Apartment Floor Tiling',
   'Apartment tiling: 400x400mm ceramic, adhesive method, all rooms.',
   '{"surfaceType":"floor","method":"adhesive","length":10,"width":6,"tileWidthMm":400,"tileHeightMm":400,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 174, 'apartment-floor-tiling',
   'Tile Template: Apartment Floors | FRELUX',
   'Complete floor tiling template for apartment buildings.',
   'residential', 'apartment')
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 3. Clients table (Mini CRM)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blacklisted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

DROP POLICY IF EXISTS "clients_owner_select" ON clients;
CREATE POLICY "clients_owner_select"
  ON clients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "clients_owner_insert" ON clients;
CREATE POLICY "clients_owner_insert"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "clients_owner_update" ON clients;
CREATE POLICY "clients_owner_update"
  ON clients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "clients_owner_delete" ON clients;
CREATE POLICY "clients_owner_delete"
  ON clients FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────
-- 4. Client communications log
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('call', 'email', 'whatsapp', 'meeting', 'note')),
  subject text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_comm_client ON client_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_client_comm_user ON client_communications(user_id);

DROP POLICY IF EXISTS "client_comm_owner_select" ON client_communications;
CREATE POLICY "client_comm_owner_select"
  ON client_communications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "client_comm_owner_insert" ON client_communications;
CREATE POLICY "client_comm_owner_insert"
  ON client_communications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "client_comm_owner_delete" ON client_communications;
CREATE POLICY "client_comm_owner_delete"
  ON client_communications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────
-- 5. Project folders for multi-project management
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT 'neutral',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_folders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_folders_user ON project_folders(user_id);

DROP POLICY IF EXISTS "project_folders_owner_select" ON project_folders;
CREATE POLICY "project_folders_owner_select"
  ON project_folders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_folders_owner_insert" ON project_folders;
CREATE POLICY "project_folders_owner_insert"
  ON project_folders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_folders_owner_update" ON project_folders;
CREATE POLICY "project_folders_owner_update"
  ON project_folders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_folders_owner_delete" ON project_folders;
CREATE POLICY "project_folders_owner_delete"
  ON project_folders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Add folder_id to contractor_projects
ALTER TABLE contractor_projects
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES project_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contractor_projects_folder ON contractor_projects(folder_id) WHERE folder_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────
-- 6. Integration settings table
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('payment', 'analytics', 'communication', 'maps', 'storage', 'advertising')),
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_settings_admin_all" ON integration_settings;
CREATE POLICY "integration_settings_admin_all"
  ON integration_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed default integration entries (all disabled)
INSERT INTO integration_settings (integration_key, display_name, category, is_enabled, config)
VALUES
  ('paystack', 'Paystack', 'payment', false, '{"public_key":"","secret_key":""}'::jsonb),
  ('stripe', 'Stripe', 'payment', false, '{"public_key":"","secret_key":""}'::jsonb),
  ('google_maps', 'Google Maps', 'maps', false, '{"api_key":""}'::jsonb),
  ('google_analytics', 'Google Analytics', 'analytics', false, '{"measurement_id":""}'::jsonb),
  ('google_search_console', 'Google Search Console', 'analytics', false, '{"verification_token":""}'::jsonb),
  ('google_adsense', 'Google AdSense', 'advertising', false, '{"publisher_id":"","client_id":""}'::jsonb),
  ('whatsapp_business', 'WhatsApp Business', 'communication', false, '{"phone_number":"","api_token":""}'::jsonb),
  ('email_provider', 'Email Provider (SMTP)', 'communication', false, '{"host":"","port":587,"username":"","from_email":""}'::jsonb),
  ('cloud_storage', 'Cloud Storage', 'storage', false, '{"provider":"","bucket":"","region":""}'::jsonb)
ON CONFLICT (integration_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- 7. Estimate analytics table (for tracking estimate history)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estimate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  calculator_type text NOT NULL CHECK (calculator_type IN ('paint', 'tile', 'pop', 'screeding')),
  project_name text,
  total_cost numeric,
  material_cost numeric,
  labour_cost numeric,
  currency text DEFAULT 'NGN',
  input_data jsonb DEFAULT '{}'::jsonb,
  result_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimate_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_estimate_history_user ON estimate_history(user_id);
CREATE INDEX IF NOT EXISTS idx_estimate_history_type ON estimate_history(calculator_type);
CREATE INDEX IF NOT EXISTS idx_estimate_history_created ON estimate_history(created_at DESC);

DROP POLICY IF EXISTS "estimate_history_owner_select" ON estimate_history;
CREATE POLICY "estimate_history_owner_select"
  ON estimate_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "estimate_history_owner_insert" ON estimate_history;
CREATE POLICY "estimate_history_owner_insert"
  ON estimate_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "estimate_history_owner_delete" ON estimate_history;
CREATE POLICY "estimate_history_owner_delete"
  ON estimate_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────
-- GRANT permissions for new tables
-- ─────────────────────────────────────────────────────────
GRANT SELECT ON calculator_templates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calculator_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON integration_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON estimate_history TO authenticated, anon;

-- Also grant on the existing contractor_projects for the new folder_id column
GRANT SELECT, INSERT, UPDATE, DELETE ON contractor_projects TO authenticated;
