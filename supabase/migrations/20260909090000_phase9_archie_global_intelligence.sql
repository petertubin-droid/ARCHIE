-- =========================================================
-- FRELUX PHASE 9, ARCHIE GLOBAL GENERAL INTELLIGENCE
-- & REUSABLE KNOWLEDGE CORE
--
-- Extends the Phase 8 ARCHIE foundation (never replaces it):
--  1. frelux_archie_domains gains the §16 governance columns
--     (knowledge sources, learning rules, verification
--     requirements, regional/language scope, permissions,
--     versioning, retrieval config, application mappings).
--  2. frelux_archie_languages: extensible language registry.
--  3. frelux_archie_terminology: multilingual construction/
--     property terminology with provenance + verification.
--  4. frelux_archie_market_observations: OBSERVED market data.
--     CHECK-constrained so an observation can never claim to
--     be a FRELUX_CONFIGURED_PRICE: configured prices live ONLY
--     in the calculator configuration tables.
--  5. Phase 9 seed domains (climate, weather, regional
--     market, language, regulations, planning, health).
--
-- Admin-only writes on all new tables; service-role may write
-- market observations (ingestion path); no policy ever exposes
-- one user's data to another.
-- =========================================================

-- ---------------------------------------------------------
-- 1. §16 governance columns on the domain registry
-- ---------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'frelux_archie_domains'
      AND column_name = 'knowledge_sources'
  ) THEN
    ALTER TABLE public.frelux_archie_domains
      ADD COLUMN knowledge_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN learning_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN verification_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN regional_scope text[] NOT NULL DEFAULT '{}',
      ADD COLUMN language_scope text[] NOT NULL DEFAULT '{}',
      ADD COLUMN permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN domain_version int NOT NULL DEFAULT 1,
      ADD COLUMN retrieval_config jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN application_mappings jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 2. Language registry (admin-extensible, no ceiling)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  native_label text NOT NULL,
  common_regions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage archie languages" ON public.frelux_archie_languages;
CREATE POLICY "admins manage archie languages"
  ON public.frelux_archie_languages FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authenticated read archie languages" ON public.frelux_archie_languages;
CREATE POLICY "authenticated read archie languages"
  ON public.frelux_archie_languages FOR SELECT TO authenticated
  USING (true);

-- Seed languages (registry is data; admins extend freely)
INSERT INTO public.frelux_archie_languages (code, label, native_label, common_regions) VALUES
  ('en', 'English', 'English', ARRAY['NG','GB','US']),
  ('pcm', 'Nigerian Pidgin', 'Naija Pidgin', ARRAY['NG']),
  ('ha', 'Hausa', 'Hausa', ARRAY['NG']),
  ('yo', 'Yoruba', 'Yorùbá', ARRAY['NG']),
  ('ig', 'Igbo', 'Igbo', ARRAY['NG']),
  ('fr', 'French', 'Français', ARRAY['FR']),
  ('sw', 'Swahili', 'Kiswahili', ARRAY['KE','TZ']),
  ('es', 'Spanish', 'Español', ARRAY['ES','US'])
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------
-- 3. Multilingual terminology (LEARN → VERIFY → VERSION → USE)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_terminology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  language_code text NOT NULL,
  canonical_term text NOT NULL,
  regional_term text NOT NULL,
  meaning_note text,
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED','VERIFIED','REJECTED')),
  version int NOT NULL DEFAULT 1,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain, language_code, canonical_term)
);

CREATE INDEX IF NOT EXISTS idx_archie_terminology_lookup
  ON public.frelux_archie_terminology (domain, language_code);

ALTER TABLE public.frelux_archie_terminology ENABLE ROW LEVEL SECURITY;

-- Admins manage terminology; users READ verified entries only.
DROP POLICY IF EXISTS "admins manage archie terminology" ON public.frelux_archie_terminology;
CREATE POLICY "admins manage archie terminology"
  ON public.frelux_archie_terminology FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users read verified terminology" ON public.frelux_archie_terminology;
CREATE POLICY "users read verified terminology"
  ON public.frelux_archie_terminology FOR SELECT TO authenticated
  USING (verification_status = 'VERIFIED');

-- ---------------------------------------------------------
-- 4. Market observations: OBSERVED data only.
--    FRELUX_CONFIGURED_PRICE is structurally impossible here;
--    calculator prices live only in the configuration tables.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_market_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('MATERIAL_PRICE','LABOUR_RATE','PACKAGE_SIZE','AVAILABILITY','TREND')),
  region text NOT NULL,
  item text NOT NULL,
  value numeric NOT NULL,
  currency text NOT NULL,
  unit text NOT NULL,
  price_kind text NOT NULL
    CHECK (price_kind IN ('OBSERVED_MARKET_PRICE','ACTUAL_PROJECT_PRICE','ESTIMATE_ASSUMPTION')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  confidence numeric NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  source_ref text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_observations_region
  ON public.frelux_archie_market_observations (region, item, observed_at DESC);

ALTER TABLE public.frelux_archie_market_observations ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for ordinary users: observations inform
-- ARCHIE commentary server-side; they are not raw user data.
-- Service role (edge functions) reads/writes on the ingestion
-- path; admins manage.
DROP POLICY IF EXISTS "admins manage market observations" ON public.frelux_archie_market_observations;
CREATE POLICY "admins manage market observations"
  ON public.frelux_archie_market_observations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 5. Phase 9 seed domains (extensible families, none core)
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_domains
  (key, label, is_core, risk_class, description)
VALUES
  ('climate_environment', 'Climate & Environment', false, 'STANDARD',
   'Environmental and climate intelligence: climate zones, seasonal patterns, sustainability context.'),
  ('weather_intelligence', 'Weather & Environmental Conditions', false, 'STANDARD',
   'Weather/forecast intelligence for project timing and weather-sensitive work advisories.'),
  ('regional_market', 'Regional Market & Price Intelligence', false, 'STANDARD',
   'Observed regional market data (prices, labour, availability). Observations NEVER override FRELUX configured prices.'),
  ('language_intelligence', 'Language & Terminology', false, 'STANDARD',
   'Multilingual intelligence and regional/construction terminology (LEARN, VERIFY, VERSION, USE).'),
  ('regulations_standards', 'Regulations & Standards', false, 'ENGINEERING_REVIEW',
   'Building regulations and standards context where reliable information exists; highest care, never invented.'),
  ('planning_productivity', 'Planning & Productivity', false, 'STANDARD',
   'Daily routines, task planning, productivity and personal organization.'),
  ('health_fitness', 'Health, Fitness & Wellness (general information)', false, 'STANDARD',
   'General wellness information only; never presented as medical diagnosis or treatment.')
ON CONFLICT (key) DO NOTHING;
