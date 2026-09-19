-- =========================================================
-- Phase 42: FRELUX Engine Integration Layer
-- =========================================================
-- STRICTLY ADDITIVE: No existing tables are modified destructively.
-- Nigeria remains the default and only active market.
-- Ghana and Kenya profiles remain inactive.
--
-- New tables (all prefixed em_ for "engine management"):
--   1. em_material_profiles      — engine material specifications
--   2. em_roof_materials         — roof material specifications
--   3. em_roof_sections          — roof section/pitch configurations
--   4. em_waste_configs          — configurable waste rules
--   5. em_ai_verification_states  — AI measurement verification tracking
--   6. em_rule_metadata          — rule/source/reference metadata
--   7. em_engine_settings        — global engine configuration key-value store
--
-- No existing tables, policies, triggers, or data are touched.
-- Admin-only access via is_admin() RLS policies.
-- =========================================================

-- =========================================================
-- 1. EM_MATERIAL_PROFILES — engine material specifications
-- =========================================================
-- Maps to MaterialSpec in the measurement engine.
-- Stores coverage, package sizes, waste defaults per material.
CREATE TABLE IF NOT EXISTS em_material_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  material_key text NOT NULL,                  -- engine material ID (e.g. "paint-dulux-20l")
  product_name text NOT NULL,                  -- "Dulux Vinyl Emulsion"
  brand text,                                  -- "Dulux"
  category text NOT NULL DEFAULT 'general',    -- paint, cement, tiles, screeding, primer, etc.

  -- Coverage
  coverage_type text NOT NULL DEFAULT 'area'
    CHECK (coverage_type IN ('area', 'linear', 'count', 'volume', 'weight')),
  coverage_value numeric NOT NULL DEFAULT 0,  -- e.g. 35 (m² per package)
  coverage_unit text NOT NULL DEFAULT 'm2',   -- m2, m, l, kg
  coverage_coats int NOT NULL DEFAULT 1,      -- coats/layers in the coverage spec
  coverage_basis text,                         -- "per_bucket", "per_bag", etc.

  -- Package
  package_size numeric NOT NULL DEFAULT 1,
  package_unit text NOT NULL DEFAULT 'unit',   -- litres, kg, m2, carton
  quantity_unit text NOT NULL DEFAULT 'unit',  -- buckets, bags, cartons

  -- Waste
  default_waste_percent numeric NOT NULL DEFAULT 10,
  min_waste_percent numeric NOT NULL DEFAULT 0,
  max_waste_percent numeric NOT NULL DEFAULT 50,

  -- Market scoping (nullable = all markets)
  market_code text DEFAULT 'NG',               -- which market this profile applies to

  -- Approval
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid,                            -- admin user ID
  approved_at timestamptz,

  -- Status
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,

  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(material_key, market_code)
);

CREATE INDEX IF NOT EXISTS idx_em_material_profiles_category ON em_material_profiles(category, is_active);
CREATE INDEX IF NOT EXISTS idx_em_material_profiles_market ON em_material_profiles(market_code, is_active);
CREATE INDEX IF NOT EXISTS idx_em_material_profiles_approved ON em_material_profiles(is_approved, is_active);

ALTER TABLE em_material_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_material_profiles_admin_read" ON em_material_profiles;
CREATE POLICY "em_material_profiles_admin_read"
  ON em_material_profiles FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_material_profiles_admin_write" ON em_material_profiles;
CREATE POLICY "em_material_profiles_admin_write"
  ON em_material_profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 2. EM_ROOF_MATERIALS — roof material specifications
-- =========================================================
CREATE TABLE IF NOT EXISTS em_roof_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  material_key text NOT NULL,                  -- engine ID
  material_name text NOT NULL,                -- "Stone Coated Roofing Sheet"
  brand text,
  category text NOT NULL DEFAULT 'roofing',    -- roofing, insulation, waterproofing

  -- Coverage
  coverage_type text NOT NULL DEFAULT 'area'
    CHECK (coverage_type IN ('area', 'linear', 'count')),
  coverage_value numeric NOT NULL DEFAULT 0,  -- m² per unit
  coverage_unit text NOT NULL DEFAULT 'm2',
  coverage_basis text,                         -- "per_sheet", "per_tile"

  -- Package
  package_size numeric NOT NULL DEFAULT 1,
  package_unit text NOT NULL DEFAULT 'unit',
  quantity_unit text NOT NULL DEFAULT 'unit',

  -- Waste
  default_waste_percent numeric NOT NULL DEFAULT 5,

  -- Market scoping
  market_code text DEFAULT 'NG',

  -- Approval
  is_approved boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(material_key, market_code)
);

CREATE INDEX IF NOT EXISTS idx_em_roof_materials_category ON em_roof_materials(category, is_active);

ALTER TABLE em_roof_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_roof_materials_admin_read" ON em_roof_materials;
CREATE POLICY "em_roof_materials_admin_read"
  ON em_roof_materials FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_roof_materials_admin_write" ON em_roof_materials;
CREATE POLICY "em_roof_materials_admin_write"
  ON em_roof_materials FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 3. EM_ROOF_SECTIONS — roof section/pitch configurations
-- =========================================================
CREATE TABLE IF NOT EXISTS em_roof_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  section_key text NOT NULL,                   -- engine ID
  section_name text NOT NULL,                  -- "Gable Roof", "Hip Roof"
  roof_type text NOT NULL,                     -- gable, hip, flat, shed, mansard

  -- Pitch configuration
  pitch_type text NOT NULL DEFAULT 'ratio'
    CHECK (pitch_type IN ('ratio', 'degrees', 'flat')),
  pitch_value numeric,                          -- e.g. 4 (for 4:12) or 30 (for 30°)
  pitch_ratio_run int NOT NULL DEFAULT 12,      -- denominator for ratio (e.g. 12 for X:12)
  is_flat boolean NOT NULL DEFAULT false,

  -- Dimensions (defaults)
  default_length numeric,                        -- meters
  default_width numeric,                         -- meters
  default_overhang numeric DEFAULT 0,             -- meters

  -- Area calculation
  area_factor numeric NOT NULL DEFAULT 1.0,     -- multiplier for flat area → actual roof area

  -- Market scoping
  market_code text DEFAULT 'NG',

  -- Status
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(section_key, market_code)
);

CREATE INDEX IF NOT EXISTS idx_em_roof_sections_type ON em_roof_sections(roof_type, is_active);

ALTER TABLE em_roof_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_roof_sections_admin_read" ON em_roof_sections;
CREATE POLICY "em_roof_sections_admin_read"
  ON em_roof_sections FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_roof_sections_admin_write" ON em_roof_sections;
CREATE POLICY "em_roof_sections_admin_write"
  ON em_roof_sections FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 4. EM_WASTE_CONFIGS — configurable waste rules
-- =========================================================
CREATE TABLE IF NOT EXISTS em_waste_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope hierarchy: global → country → market → material_category → user
  scope_level text NOT NULL DEFAULT 'global'
    CHECK (scope_level IN ('global', 'country', 'market', 'category', 'rule')),

  -- Scope keys (nullable at higher levels)
  country_code text,                            -- NG, GH, KE (null = global)
  market_code text,                             -- NG-Lagos, NG-PH (null = country-level)
  material_category text,                       -- paint, cement, tiles (null = all)
  rule_id text,                                  -- specific rule ID (null = all)

  -- Waste value
  waste_percent numeric NOT NULL DEFAULT 10
    CHECK (waste_percent >= 0 AND waste_percent <= 100),
  is_override boolean NOT NULL DEFAULT false,   -- true = overrides lower scopes

  -- Metadata
  source text,                                   -- "admin", "market_survey", "vendor"
  description text,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_em_waste_configs_scope ON em_waste_configs(scope_level, country_code, market_code, material_category);

ALTER TABLE em_waste_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_waste_configs_admin_read" ON em_waste_configs;
CREATE POLICY "em_waste_configs_admin_read"
  ON em_waste_configs FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_waste_configs_admin_write" ON em_waste_configs;
CREATE POLICY "em_waste_configs_admin_write"
  ON em_waste_configs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 5. EM_AI_VERIFICATION_STATES — AI measurement verification
-- =========================================================
CREATE TABLE IF NOT EXISTS em_ai_verification_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to the measurement/estimate
  measurement_type text NOT NULL,               -- space, element, project, fence
  measurement_id text,                           -- engine-generated ID or reference
  project_id uuid,                               -- link to estimation_estimates if applicable

  -- Verification state
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'in_progress', 'verified', 'flagged', 'rejected', 'auto_verified')),

  -- AI analysis
  ai_confidence numeric,                        -- 0–100 confidence score
  ai_notes text,                                 -- AI-generated notes
  ai_flags text[],                              -- ["low_area", "unusual_dimensions", etc.]

  -- Human review
  reviewed_by uuid,                              -- admin user ID
  reviewed_at timestamptz,
  review_notes text,
  corrections jsonb,                            -- suggested corrections

  -- Metadata
  image_url text,                                -- uploaded measurement image (if any)
  input_data jsonb,                              -- original measurement input
  verified_data jsonb,                           -- verified/corrected measurement

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_em_ai_verification_state ON em_ai_verification_states(state, measurement_type);
CREATE INDEX IF NOT EXISTS idx_em_ai_verification_measurement ON em_ai_verification_states(measurement_type, measurement_id);

ALTER TABLE em_ai_verification_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_ai_verification_admin_read" ON em_ai_verification_states;
CREATE POLICY "em_ai_verification_admin_read"
  ON em_ai_verification_states FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_ai_verification_admin_write" ON em_ai_verification_states;
CREATE POLICY "em_ai_verification_admin_write"
  ON em_ai_verification_states FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Public can create verification requests (for AI image estimation)
DROP POLICY IF EXISTS "em_ai_verification_user_create" ON em_ai_verification_states;
CREATE POLICY "em_ai_verification_user_create"
  ON em_ai_verification_states FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =========================================================
-- 6. EM_RULE_METADATA — rule/source/reference metadata
-- =========================================================
CREATE TABLE IF NOT EXISTS em_rule_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rule_id text NOT NULL,                         -- engine rule ID
  rule_name text NOT NULL,
  rule_version text NOT NULL DEFAULT '1.0.0',

  -- Source information
  source_type text NOT NULL DEFAULT 'frelux'
    CHECK (source_type IN ('frelux', 'industry_standard', 'vendor', 'user_survey', 'market_research')),
  source_name text,                              -- "FRELUX Engineering", "NBS", etc.
  source_url text,                               -- link to source document
  source_date date,                              -- when the source was published

  -- Reference information
  reference_doc text,                            -- document title
  reference_page text,                           -- page number / section
  reference_author text,

  -- Verification
  is_verified boolean NOT NULL DEFAULT false,
  verified_by uuid,
  verified_at timestamptz,

  -- Status
  is_active boolean NOT NULL DEFAULT true,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(rule_id, rule_version)
);

CREATE INDEX IF NOT EXISTS idx_em_rule_metadata_rule ON em_rule_metadata(rule_id, is_active);

ALTER TABLE em_rule_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_rule_metadata_admin_read" ON em_rule_metadata;
CREATE POLICY "em_rule_metadata_admin_read"
  ON em_rule_metadata FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_rule_metadata_admin_write" ON em_rule_metadata;
CREATE POLICY "em_rule_metadata_admin_write"
  ON em_rule_metadata FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 7. EM_ENGINE_SETTINGS — global engine configuration
-- =========================================================
CREATE TABLE IF NOT EXISTS em_engine_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  setting_key text NOT NULL UNIQUE,              -- e.g. "default_market_code", "default_waste_percent"
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  setting_type text NOT NULL DEFAULT 'string'
    CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'array')),
  category text NOT NULL DEFAULT 'general',     -- measurement, waste, market, material, roof, ai
  description text,
  is_editable boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE em_engine_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "em_engine_settings_admin_read" ON em_engine_settings;
CREATE POLICY "em_engine_settings_admin_read"
  ON em_engine_settings FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "em_engine_settings_admin_write" ON em_engine_settings;
CREATE POLICY "em_engine_settings_admin_write"
  ON em_engine_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- SEED: Default engine settings (Nigeria defaults)
-- =========================================================
INSERT INTO em_engine_settings (setting_key, setting_value, setting_type, category, description, is_editable)
VALUES
  ('default_market_code', '"NG"', 'string', 'market', 'Default market code (Nigeria)', false),
  ('default_currency', '"NGN"', 'string', 'market', 'Default currency code', false),
  ('default_length_unit', '"meters"', 'string', 'measurement', 'Default length unit', true),
  ('default_area_unit', '"sqm"', 'string', 'measurement', 'Default area unit', true),
  ('default_waste_percent', '10', 'number', 'waste', 'Default waste percentage', true),
  ('default_unit_system', '"metric"', 'string', 'measurement', 'Default unit system', true),
  ('ai_verification_enabled', 'false', 'boolean', 'ai', 'Enable AI measurement verification', true),
  ('ai_verification_threshold', '80', 'number', 'ai', 'AI confidence threshold for auto-verification', true),
  ('roof_pitch_default_run', '12', 'number', 'roof', 'Default pitch ratio denominator', true),
  ('roof_overlap_default', '0.15', 'number', 'roof', 'Default roof overlap in meters', true),
  ('material_approval_required', 'true', 'boolean', 'material', 'Require admin approval for material profiles', true),
  ('rule_versioning_enabled', 'true', 'boolean', 'measurement', 'Enable rule version tracking', true)
ON CONFLICT (setting_key) DO NOTHING;

-- =========================================================
-- SEED: Default waste configs for Nigeria
-- =========================================================
INSERT INTO em_waste_configs (scope_level, country_code, waste_percent, is_override, source, description)
VALUES
  ('global', NULL, 10, false, 'frelux', 'Global default waste percentage'),
  ('country', 'NG', 10, false, 'frelux', 'Nigeria default waste percentage')
ON CONFLICT DO NOTHING;

-- =========================================================
-- SEED: Default rule metadata for existing FRELUX rules
-- =========================================================
INSERT INTO em_rule_metadata (rule_id, rule_name, rule_version, source_type, source_name, is_verified, notes)
VALUES
  ('rule-painting-interior', 'Interior Painting Rule', '1.0.0', 'frelux', 'FRELUX Engineering', true, 'Default interior painting calculation rule'),
  ('rule-tiling-floor', 'Floor Tiling Rule', '1.0.0', 'frelux', 'FRELUX Engineering', true, 'Default floor tiling calculation rule'),
  ('rule-screeding-wall', 'Wall Screeding Rule', '1.0.0', 'frelux', 'FRELUX Engineering', true, 'Default wall screeding calculation rule')
ON CONFLICT (rule_id, rule_version) DO NOTHING;

-- =========================================================
-- UPDATED_AT triggers for all new tables
-- =========================================================
CREATE OR REPLACE FUNCTION em_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES
    ('em_material_profiles'),
    ('em_roof_materials'),
    ('em_roof_sections'),
    ('em_waste_configs'),
    ('em_ai_verification_states'),
    ('em_rule_metadata'),
    ('em_engine_settings')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE event_object_table = t AND trigger_name = 'em_updated_at'
    ) THEN
      EXECUTE format('CREATE TRIGGER em_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION em_update_updated_at()', t);
    END IF;
  END LOOP;
END $$;
