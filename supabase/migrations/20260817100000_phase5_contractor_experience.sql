-- ─────────────────────────────────────────────────────────
-- Phase 5: Professional Contractor Experience
-- ─────────────────────────────────────────────────────────

-- ==========================================================
-- 1. CONTRACTOR PROJECTS — Main project entity
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.contractor_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Project identity
  name text NOT NULL,
  description text,

  -- Wizard parameters
  project_type text NOT NULL DEFAULT 'painting'
    CHECK (project_type IN ('painting','screeding','pop_ceiling','tiling','multi_trade')),
  building_type text NOT NULL DEFAULT 'residential'
    CHECK (building_type IN ('residential','commercial','industrial','institutional','renovation')),
  surface_location text NOT NULL DEFAULT 'interior'
    CHECK (surface_location IN ('interior','exterior','both')),
  construction_type text NOT NULL DEFAULT 'renovation'
    CHECK (construction_type IN ('new_construction','renovation','touch_up')),
  finish_quality text NOT NULL DEFAULT 'standard'
    CHECK (finish_quality IN ('economy','standard','premium','luxury')),
  budget_level text NOT NULL DEFAULT 'standard'
    CHECK (budget_level IN ('economy','standard','premium','luxury')),
  material_quality text NOT NULL DEFAULT 'standard'
    CHECK (material_quality IN ('economy','standard','premium','luxury')),

  -- Client information
  client_name text,
  client_phone text,
  client_email text,
  client_address text,

  -- Project status & progress
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','on_hold','completed','archived')),
  progress_percentage numeric NOT NULL DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),

  -- Notes & metadata
  notes text,
  tags text[] NOT NULL DEFAULT '{}',

  -- Aggregated totals (updated by triggers/app)
  total_material_cost numeric NOT NULL DEFAULT 0,
  total_labour_cost numeric NOT NULL DEFAULT 0,
  total_transport_cost numeric NOT NULL DEFAULT 0,
  total_misc_cost numeric NOT NULL DEFAULT 0,
  total_markup numeric NOT NULL DEFAULT 0,
  total_profit numeric NOT NULL DEFAULT 0,
  total_project_cost numeric NOT NULL DEFAULT 0,
  estimated_duration_days integer,

  -- Currency
  currency text NOT NULL DEFAULT 'NGN',
  currency_symbol text NOT NULL DEFAULT '₦',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_projects_user_id ON public.contractor_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_projects_status ON public.contractor_projects(status);
CREATE INDEX IF NOT EXISTS idx_contractor_projects_created_at ON public.contractor_projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_projects_project_type ON public.contractor_projects(project_type);

ALTER TABLE public.contractor_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own contractor projects" ON contractor_projects;
CREATE POLICY "Users can CRUD own contractor projects"
  ON public.contractor_projects FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ==========================================================
-- 2. PROJECT ROOMS — Room-by-room builder
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  name text NOT NULL,
  room_type text NOT NULL DEFAULT 'custom'
    CHECK (room_type IN ('living_room','bedroom','kitchen','bathroom','balcony','hallway','staircase','office','dining','custom')),
  sort_order integer NOT NULL DEFAULT 0,

  -- Dimensions (stored in meters)
  length_m numeric,
  width_m numeric,
  height_m numeric,
  unit text NOT NULL DEFAULT 'meters' CHECK (unit IN ('meters','feet')),

  -- Surface assessment
  surface_condition text NOT NULL DEFAULT 'good'
    CHECK (surface_condition IN ('excellent','good','fair','poor','damaged')),
  surface_type text NOT NULL DEFAULT 'fresh_plaster'
    CHECK (surface_type IN ('fresh_plaster','old_paint','peeling_paint','moisture','cracks','mould','concrete','wood','metal')),
  wall_smoothness text NOT NULL DEFAULT 'smooth'
    CHECK (wall_smoothness IN ('smooth','slightly_rough','rough','very_rough')),
  porosity text NOT NULL DEFAULT 'medium'
    CHECK (porosity IN ('low','medium','high','very_high')),

  -- Waste factor (auto-calculated from assessment)
  waste_factor_percentage numeric NOT NULL DEFAULT 10 CHECK (waste_factor_percentage >= 0 AND waste_factor_percentage <= 50),

  -- Calculation type for this room
  calculation_type text NOT NULL DEFAULT 'paint'
    CHECK (calculation_type IN ('paint','screeding','pop_ceiling','tiling')),

  -- Full calculation result (JSONB)
  calculation_input jsonb NOT NULL DEFAULT '{}',
  calculation_result jsonb NOT NULL DEFAULT '{}',

  -- Room-specific costs
  material_cost numeric NOT NULL DEFAULT 0,
  labour_cost numeric NOT NULL DEFAULT 0,
  room_total_cost numeric NOT NULL DEFAULT 0,

  -- Surface prep recommendations (auto-generated)
  surface_prep jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_rooms_project_id ON public.project_rooms(project_id);
CREATE INDEX IF NOT EXISTS idx_project_rooms_sort_order ON public.project_rooms(sort_order);

ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own project rooms" ON public.project_rooms;
CREATE POLICY "Users can CRUD own project rooms"
  ON public.project_rooms FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 3. PROJECT SHOPPING LIST ITEMS
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_shopping_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  category text NOT NULL
    CHECK (category IN ('paint','primer','white_cement','screeding_paint','pop_cement','soap','fibre','boards','tiles','tile_adhesive','grout','masking_tape','brushes','rollers','sandpaper','extension_pole','ladders','scaffolding','ppe','accessories','labour','transport','misc')),
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit text NOT NULL DEFAULT 'unit',
  estimated_price numeric NOT NULL DEFAULT 0 CHECK (estimated_price >= 0),
  total_price numeric NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  notes text,
  is_purchased boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_project_id ON public.project_shopping_list(project_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_category ON public.project_shopping_list(category);
CREATE INDEX IF NOT EXISTS idx_shopping_list_is_purchased ON public.project_shopping_list(is_purchased);

ALTER TABLE public.project_shopping_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_shopping_list FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own shopping lists" ON public.project_shopping_list;
CREATE POLICY "Users can CRUD own shopping lists"
  ON public.project_shopping_list FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 4. PROJECT LABOUR PLAN
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_labour_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  role text NOT NULL
    CHECK (role IN ('painter','pop_installer','wall_screeder','tile_installer','labourer','foreman','electrician','plumber','carpenter','supervisor')),
  worker_count integer NOT NULL DEFAULT 1 CHECK (worker_count >= 1),
  days_required integer NOT NULL DEFAULT 1 CHECK (days_required >= 1),
  daily_wage numeric NOT NULL DEFAULT 0 CHECK (daily_wage >= 0),
  total_cost numeric NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labour_plan_project_id ON public.project_labour_plan(project_id);

ALTER TABLE public.project_labour_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_labour_plan FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own labour plans" ON public.project_labour_plan;
CREATE POLICY "Users can CRUD own labour plans"
  ON public.project_labour_plan FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 5. PROJECT QUOTATIONS
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  quotation_number text NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1,

  -- Cost breakdown
  material_cost numeric NOT NULL DEFAULT 0,
  labour_cost numeric NOT NULL DEFAULT 0,
  transport_cost numeric NOT NULL DEFAULT 0,
  misc_cost numeric NOT NULL DEFAULT 0,
  markup_percentage numeric NOT NULL DEFAULT 0,
  markup_amount numeric NOT NULL DEFAULT 0,
  profit_percentage numeric NOT NULL DEFAULT 0,
  profit_amount numeric NOT NULL DEFAULT 0,
  tax_percentage numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,

  -- Terms
  terms_conditions text,
  timeline_days integer,
  validity_days integer NOT NULL DEFAULT 30,
  payment_terms text,

  -- Branding
  company_name text,
  company_logo_url text,
  company_address text,
  company_phone text,
  company_email text,

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired','revised')),

  -- Digital signature
  signed_by text,
  signed_at timestamptz,
  signature_data text,

  currency text NOT NULL DEFAULT 'NGN',
  currency_symbol text NOT NULL DEFAULT '₦',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotations_project_id ON public.project_quotations(project_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.project_quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON public.project_quotations(quotation_number);

ALTER TABLE public.project_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_quotations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own quotations" ON public.project_quotations;
CREATE POLICY "Users can CRUD own quotations"
  ON public.project_quotations FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 6. PROJECT TIMELINES
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_timelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  phase text NOT NULL
    CHECK (phase IN ('preparation','screeding','pop_installation','primer','painting','tiling','drying','inspection','completion','touch_up','cleanup')),
  name text NOT NULL,
  description text,
  days_required integer NOT NULL DEFAULT 1 CHECK (days_required >= 0),
  start_day integer NOT NULL DEFAULT 0 CHECK (start_day >= 0),
  end_day integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  depends_on uuid REFERENCES public.project_timelines(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timelines_project_id ON public.project_timelines(project_id);
CREATE INDEX IF NOT EXISTS idx_timelines_sort_order ON public.project_timelines(sort_order);

ALTER TABLE public.project_timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_timelines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own timelines" ON public.project_timelines;
CREATE POLICY "Users can CRUD own timelines"
  ON public.project_timelines FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 7. PROJECT ATTACHMENTS
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  file_name text NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  file_size bigint NOT NULL DEFAULT 0,
  description text,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_project_id ON public.project_attachments(project_id);

ALTER TABLE public.project_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own attachments" ON public.project_attachments;
CREATE POLICY "Users can CRUD own attachments"
  ON public.project_attachments FOR ALL
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 8. PROJECT VERSIONS — Version history
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.contractor_projects(id) ON DELETE CASCADE,

  version_number integer NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL DEFAULT '{}',
  change_summary text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON public.project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_created_at ON public.project_versions(created_at DESC);

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own project versions" ON public.project_versions;
CREATE POLICY "Users can view own project versions"
  ON public.project_versions FOR SELECT
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own project versions" ON public.project_versions;
CREATE POLICY "Users can insert own project versions"
  ON public.project_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (SELECT id FROM public.contractor_projects WHERE user_id = auth.uid())
  );

-- ==========================================================
-- 9. MATERIAL CATALOG — Extended Nigerian material database
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.material_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  category text NOT NULL
    CHECK (category IN ('paint','primer','white_cement','screeding_paint','pop_cement','soap','fibre','boards','tiles','tile_adhesive','grout','masking_tape','brushes','rollers','sandpaper','extension_pole','ladders','scaffolding','ppe','accessories')),
  name text NOT NULL,
  brand text,
  description text,

  -- Specifications
  coverage_rate numeric,
  coverage_unit text,
  package_size numeric,
  package_unit text,

  -- Pricing by quality tier
  economy_price numeric NOT NULL DEFAULT 0,
  standard_price numeric NOT NULL DEFAULT 0,
  premium_price numeric NOT NULL DEFAULT 0,
  luxury_price numeric NOT NULL DEFAULT 0,

  -- Regional pricing (JSONB: { "lagos": 5000, "abuja": 5200, ... })
  regional_prices jsonb NOT NULL DEFAULT '{}',

  -- Recommendations
  recommended_usage text[] NOT NULL DEFAULT '{}',
  durability_rating text CHECK (durability_rating IN ('low','medium','high','premium')),
  lifespan_years numeric,
  finish_type text,
  maintenance_frequency text,

  -- Quality tier recommendations
  quality_tier text NOT NULL DEFAULT 'standard'
    CHECK (quality_tier IN ('economy','standard','premium','luxury')),

  -- Availability
  is_available boolean NOT NULL DEFAULT true,
  region text,

  -- Admin management
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  currency text NOT NULL DEFAULT 'NGN',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_catalog_category ON public.material_catalog(category);
CREATE INDEX IF NOT EXISTS idx_material_catalog_quality_tier ON public.material_catalog(quality_tier);
CREATE INDEX IF NOT EXISTS idx_material_catalog_active ON public.material_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_material_catalog_brand ON public.material_catalog(brand);

ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_catalog FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active material catalog" ON public.material_catalog;
CREATE POLICY "Public can read active material catalog"
  ON public.material_catalog FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can CRUD material catalog" ON public.material_catalog;
CREATE POLICY "Admins can CRUD material catalog"
  ON public.material_catalog FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==========================================================
-- 10. TIMELINE TEMPLATES — Admin-managed templates
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.timeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,
  project_type text NOT NULL
    CHECK (project_type IN ('painting','screeding','pop_ceiling','tiling','multi_trade')),
  description text,

  -- Template phases (JSONB array of {phase, name, days, depends_on})
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_templates_project_type ON public.timeline_templates(project_type);
CREATE INDEX IF NOT EXISTS idx_timeline_templates_active ON public.timeline_templates(is_active);

ALTER TABLE public.timeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active timeline templates" ON public.timeline_templates;
CREATE POLICY "Public can read active timeline templates"
  ON public.timeline_templates FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can CRUD timeline templates" ON public.timeline_templates;
CREATE POLICY "Admins can CRUD timeline templates"
  ON public.timeline_templates FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==========================================================
-- 11. QUOTATION TEMPLATES — Admin-managed quotation settings
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.quotation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company branding (pulled from site_branding if not set)
  company_name text,
  company_logo_url text,
  company_address text,
  company_phone text,
  company_email text,

  -- Default terms
  default_terms_conditions text NOT NULL DEFAULT '1. Payment: 50% upfront, 50% on completion.
2. Validity: This quotation is valid for 30 days from the date of issue.
3. Materials: All materials used will be of the specified quality grade.
4. Timeline: Work will be completed within the agreed timeline, subject to weather conditions.
5. Changes: Any changes to the scope of work will be quoted separately.
6. Warranty: Workmanship is guaranteed for 12 months from completion date.',
  default_payment_terms text NOT NULL DEFAULT '50% upfront, 50% on completion',
  default_validity_days integer NOT NULL DEFAULT 30,
  default_markup_percentage numeric NOT NULL DEFAULT 15,
  default_profit_percentage numeric NOT NULL DEFAULT 10,
  default_tax_percentage numeric NOT NULL DEFAULT 7.5,

  -- Currency
  currency text NOT NULL DEFAULT 'NGN',
  currency_symbol text NOT NULL DEFAULT '₦',

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read quotation settings" ON public.quotation_settings;
CREATE POLICY "Public can read quotation settings"
  ON public.quotation_settings FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can CRUD quotation settings" ON public.quotation_settings;
CREATE POLICY "Admins can CRUD quotation settings"
  ON public.quotation_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==========================================================
-- 12. WEATHER CACHE — Cached weather data
-- ==========================================================
CREATE TABLE IF NOT EXISTS public.weather_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  forecast_data jsonb NOT NULL DEFAULT '{}',
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weather_cache_location ON public.weather_cache(location);
CREATE INDEX IF NOT EXISTS idx_weather_cache_expires ON public.weather_cache(expires_at);

ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read weather cache" ON public.weather_cache;
CREATE POLICY "Public can read weather cache"
  ON public.weather_cache FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

DROP POLICY IF EXISTS "Anyone can insert weather cache" ON public.weather_cache;
CREATE POLICY "Anyone can insert weather cache"
  ON public.weather_cache FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ==========================================================
-- TRIGGERS — updated_at for all new tables
-- ==========================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Reuse set_updated_at for all new tables
DROP TRIGGER IF EXISTS contractor_projects_set_updated_at ON public.contractor_projects;
CREATE TRIGGER contractor_projects_set_updated_at BEFORE UPDATE ON public.contractor_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_rooms_set_updated_at ON public.project_rooms;
CREATE TRIGGER project_rooms_set_updated_at BEFORE UPDATE ON public.project_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_shopping_list_set_updated_at ON public.project_shopping_list;
CREATE TRIGGER project_shopping_list_set_updated_at BEFORE UPDATE ON public.project_shopping_list FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_labour_plan_set_updated_at ON public.project_labour_plan;
CREATE TRIGGER project_labour_plan_set_updated_at BEFORE UPDATE ON public.project_labour_plan FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_quotations_set_updated_at ON public.project_quotations;
CREATE TRIGGER project_quotations_set_updated_at BEFORE UPDATE ON public.project_quotations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS project_timelines_set_updated_at ON public.project_timelines;
CREATE TRIGGER project_timelines_set_updated_at BEFORE UPDATE ON public.project_timelines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS material_catalog_set_updated_at ON public.material_catalog;
CREATE TRIGGER material_catalog_set_updated_at BEFORE UPDATE ON public.material_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS timeline_templates_set_updated_at ON public.timeline_templates;
CREATE TRIGGER timeline_templates_set_updated_at BEFORE UPDATE ON public.timeline_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS quotation_settings_set_updated_at ON public.quotation_settings;
CREATE TRIGGER quotation_settings_set_updated_at BEFORE UPDATE ON public.quotation_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================
-- SEED DATA
-- ==========================================================

-- Quotation settings (single row)
INSERT INTO public.quotation_settings (company_name, company_address, company_phone, company_email)
VALUES (
  'FRELUX PAINT CALC',
  'Lagos, Nigeria',
  '2349063612439',
  'hello@freluxpaintcalc.com'
)
ON CONFLICT DO NOTHING;

-- Timeline templates
INSERT INTO public.timeline_templates (name, project_type, description, phases, sort_order) VALUES
(
  'Standard Painting Project',
  'painting',
  'Complete interior/exterior painting timeline',
  '[
    {"phase":"preparation","name":"Surface Preparation","days":2,"depends_on":null},
    {"phase":"screeding","name":"Wall Screeding (if needed)","days":3,"depends_on":"preparation"},
    {"phase":"primer","name":"Primer Coat","days":1,"depends_on":"screeding"},
    {"phase":"painting","name":"First Coat","days":2,"depends_on":"primer"},
    {"phase":"drying","name":"Drying Time","days":1,"depends_on":"painting"},
    {"phase":"painting","name":"Second Coat","days":2,"depends_on":"drying"},
    {"phase":"drying","name":"Final Drying","days":1,"depends_on":"painting"},
    {"phase":"inspection","name":"Quality Inspection","days":1,"depends_on":"drying"},
    {"phase":"completion","name":"Final Touch-up & Cleanup","days":1,"depends_on":"inspection"}
  ]'::jsonb,
  1
),
(
  'POP Ceiling Installation',
  'pop_ceiling',
  'Complete POP ceiling installation timeline',
  '[
    {"phase":"preparation","name":"Site Preparation & Measurement","days":1,"depends_on":null},
    {"phase":"pop_installation","name":"Framework Installation","days":2,"depends_on":"preparation"},
    {"phase":"pop_installation","name":"Board Fixing","days":3,"depends_on":"preparation"},
    {"phase":"pop_installation","name":"Jointing & Taping","days":2,"depends_on":"preparation"},
    {"phase":"pop_installation","name":"Finishing & Sanding","days":2,"depends_on":"preparation"},
    {"phase":"primer","name":"Primer Coat","days":1,"depends_on":"pop_installation"},
    {"phase":"painting","name":"Painting","days":2,"depends_on":"primer"},
    {"phase":"inspection","name":"Quality Inspection","days":1,"depends_on":"painting"},
    {"phase":"completion","name":"Cleanup & Handover","days":1,"depends_on":"inspection"}
  ]'::jsonb,
  2
),
(
  'Wall Screeding Project',
  'screeding',
  'Wall screeding and preparation timeline',
  '[
    {"phase":"preparation","name":"Surface Cleaning & Assessment","days":1,"depends_on":null},
    {"phase":"screeding","name":"First Screed Coat","days":2,"depends_on":"preparation"},
    {"phase":"drying","name":"Drying Time","days":1,"depends_on":"screeding"},
    {"phase":"screeding","name":"Second Coat (if needed)","days":2,"depends_on":"drying"},
    {"phase":"drying","name":"Final Drying","days":1,"depends_on":"screeding"},
    {"phase":"inspection","name":"Surface Inspection","days":1,"depends_on":"drying"},
    {"phase":"completion","name":"Cleanup","days":1,"depends_on":"inspection"}
  ]'::jsonb,
  3
),
(
  'Tile Installation Project',
  'tiling',
  'Complete tile installation timeline',
  '[
    {"phase":"preparation","name":"Surface Preparation","days":1,"depends_on":null},
    {"phase":"tiling","name":"Layout & Setting","days":2,"depends_on":"preparation"},
    {"phase":"tiling","name":"Tile Installation","days":4,"depends_on":"preparation"},
    {"phase":"drying","name":"Adhesive Curing","days":1,"depends_on":"tiling"},
    {"phase":"tiling","name":"Grouting","days":1,"depends_on":"drying"},
    {"phase":"drying","name":"Grout Curing","days":1,"depends_on":"tiling"},
    {"phase":"inspection","name":"Quality Inspection","days":1,"depends_on":"drying"},
    {"phase":"completion","name":"Cleanup & Sealing","days":1,"depends_on":"inspection"}
  ]'::jsonb,
  4
),
(
  'Multi-Trade Renovation',
  'multi_trade',
  'Full renovation with multiple trades',
  '[
    {"phase":"preparation","name":"Site Assessment & Preparation","days":2,"depends_on":null},
    {"phase":"screeding","name":"Wall Screeding","days":4,"depends_on":"preparation"},
    {"phase":"pop_installation","name":"POP Ceiling Work","days":5,"depends_on":"preparation"},
    {"phase":"tiling","name":"Floor/Wall Tiling","days":5,"depends_on":"preparation"},
    {"phase":"primer","name":"Primer Application","days":2,"depends_on":"screeding"},
    {"phase":"painting","name":"Painting Coats","days":4,"depends_on":"primer"},
    {"phase":"drying","name":"Final Drying","days":2,"depends_on":"painting"},
    {"phase":"inspection","name":"Quality Inspection","days":1,"depends_on":"drying"},
    {"phase":"completion","name":"Final Cleanup & Handover","days":2,"depends_on":"inspection"}
  ]'::jsonb,
  5
)
ON CONFLICT DO NOTHING;

-- Material catalog seed data
INSERT INTO public.material_catalog (category, name, brand, coverage_rate, coverage_unit, package_size, package_unit, economy_price, standard_price, premium_price, luxury_price, recommended_usage, durability_rating, lifespan_years, quality_tier, sort_order) VALUES
-- Paint brands
('paint', 'Premium Emulsion Paint', 'Dulux', 10, 'm2_per_liter', 4, 'liters', 12000, 18000, 28000, 45000, '{"living_room","bedroom","hallway","office"}', 'high', 7, 'premium', 1),
('paint', 'Vinyl Silk Emulsion', 'Berger', 10, 'm2_per_liter', 4, 'liters', 10000, 15000, 22000, 35000, '{"living_room","bedroom","kitchen"}', 'medium', 5, 'standard', 2),
('paint', 'Weather Guard Exterior', 'Sandtex', 8, 'm2_per_liter', 20, 'liters', 25000, 35000, 50000, 75000, '{"exterior","fence","outside_walls"}', 'high', 10, 'premium', 3),
('paint', 'Economy Emulsion', 'Eagle', 8, 'm2_per_liter', 4, 'liters', 5000, 8000, 12000, 18000, '{"bedroom","store"}', 'low', 3, 'economy', 4),
('paint', 'Luxury Silk Emulsion', 'Crown', 12, 'm2_per_liter', 4, 'liters', 15000, 25000, 40000, 65000, '{"living_room","master_bedroom"}', 'premium', 10, 'luxury', 5),
-- Primers
('primer', 'Universal Primer', 'Dulux', 12, 'm2_per_liter', 4, 'liters', 6000, 9000, 14000, 20000, '{"all_surfaces"}', 'high', 5, 'standard', 1),
('primer', 'Oil-Based Primer', 'Berger', 10, 'm2_per_liter', 4, 'liters', 7000, 11000, 16000, 24000, '{"wood","metal"}', 'high', 5, 'premium', 2),
('primer', 'Economy Primer', 'Eagle', 8, 'm2_per_liter', 4, 'liters', 3000, 5000, 7000, 10000, '{"all_surfaces"}', 'low', 3, 'economy', 3),
-- White cement
('white_cement', 'White Cement', 'Lafarge', 5, 'kg_per_m2', 40, 'kg', 7500, 9000, 12000, 15000, '{"screeding","pop"}', 'high', 10, 'standard', 1),
('white_cement', 'POP Cement', 'Dragon', 3, 'kg_per_m2', 40, 'kg', 8000, 10000, 14000, 18000, '{"pop_ceiling"}', 'high', 15, 'premium', 2),
-- Screeding paint
('screeding_paint', 'Screeding Paint', 'Eagle', 6, 'm2_per_liter', 20, 'liters', 18000, 25000, 35000, 50000, '{"wall_screeding"}', 'medium', 5, 'standard', 1),
-- POP materials
('pop_cement', 'POP Powder', 'Dragon', 2, 'kg_per_m2', 20, 'kg', 7000, 9000, 12000, 16000, '{"pop_ceiling"}', 'high', 15, 'standard', 1),
('fibre', 'POP Fibre Roll', 'Generic', 10, 'm_per_roll', 1, 'roll', 3000, 5000, 7000, 10000, '{"pop_ceiling"}', 'medium', 10, 'standard', 1),
('boards', 'POP Ceiling Board', 'Knauf', 1, 'm2_per_board', 1, 'board', 2500, 3500, 5000, 7000, '{"pop_ceiling"}', 'high', 15, 'standard', 1),
-- Tiles
('tiles', 'Porcelain Floor Tile 600x600', 'Goodwill', 1, 'm2_per_box', 1, 'box', 12000, 18000, 28000, 45000, '{"floor","living_room"}', 'high', 20, 'standard', 1),
('tiles', 'Ceramic Wall Tile 300x600', 'Pamesa', 1, 'm2_per_box', 1, 'box', 8000, 12000, 18000, 28000, '{"wall","bathroom","kitchen"}', 'medium', 15, 'standard', 2),
('tiles', 'Premium Marble Tile 800x800', 'Dynasty', 1, 'm2_per_box', 1, 'box', 25000, 40000, 65000, 95000, '{"floor","living_room"}', 'premium', 25, 'luxury', 3),
('tile_adhesive', 'Tile Adhesive', 'Weber', 5, 'm2_per_bag', 20, 'kg', 8000, 12000, 18000, 25000, '{"tiling"}', 'high', 10, 'standard', 1),
('grout', 'Tile Grout', 'Mapei', 10, 'm2_per_kg', 5, 'kg', 3000, 5000, 7000, 10000, '{"tiling"}', 'high', 10, 'standard', 1),
-- Accessories
('masking_tape', 'Masking Tape', 'Generic', 1, 'unit', 1, 'roll', 500, 800, 1200, 2000, '{"painting"}', 'low', 1, 'standard', 1),
('brushes', 'Paint Brush Set', 'Purdy', 1, 'set', 1, 'set', 2000, 3500, 6000, 10000, '{"painting"}', 'medium', 3, 'standard', 1),
('rollers', 'Paint Roller Set', 'Generic', 1, 'set', 1, 'set', 1500, 2500, 4500, 7500, '{"painting"}', 'medium', 3, 'standard', 1),
('sandpaper', 'Sandpaper Assortment', 'Generic', 1, 'pack', 1, 'pack', 800, 1500, 2500, 4000, '{"preparation"}', 'low', 1, 'standard', 1),
('extension_pole', 'Extension Pole', 'Generic', 1, 'unit', 1, 'unit', 3000, 5000, 8000, 12000, '{"painting"}', 'medium', 5, 'standard', 1),
('ladders', 'Aluminium Ladder', 'Generic', 1, 'unit', 1, 'unit', 15000, 25000, 40000, 60000, '{"painting","pop"}', 'high', 10, 'standard', 1),
('scaffolding', 'Scaffolding Set', 'Generic', 1, 'set', 1, 'set', 25000, 40000, 65000, 95000, '{"painting","pop","exterior"}', 'high', 10, 'standard', 1),
('ppe', 'PPE Kit (Gloves, Goggles, Mask)', 'Generic', 1, 'set', 1, 'set', 2000, 3500, 6000, 10000, '{"safety"}', 'low', 1, 'standard', 1),
('accessories', 'Paint Tray Set', 'Generic', 1, 'set', 1, 'set', 1000, 1800, 3000, 5000, '{"painting"}', 'low', 2, 'standard', 1),
('accessories', 'Filler Knife', 'Generic', 1, 'unit', 1, 'unit', 500, 800, 1200, 2000, '{"preparation"}', 'medium', 3, 'standard', 2)
ON CONFLICT DO NOTHING;

-- Storage bucket for project attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-attachments', 'project-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project-attachments bucket
DROP POLICY IF EXISTS "Authenticated users can upload project attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload project attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-attachments');

DROP POLICY IF EXISTS "Public can read project attachments" ON storage.objects;
CREATE POLICY "Public can read project attachments"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'project-attachments');

DROP POLICY IF EXISTS "Users can delete own project attachments" ON storage.objects;
CREATE POLICY "Users can delete own project attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-attachments' AND owner = auth.uid());
