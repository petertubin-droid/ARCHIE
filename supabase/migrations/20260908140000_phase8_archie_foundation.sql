-- =========================================================
-- FRELUX PHASE 8 — ARCHIE INTELLIGENCE FOUNDATION
--
-- ARCHIE is FRELUX's built-in AI. Core domain: Architecture.
-- Learning capacity is EXTENSIBLE with no fixed domain
-- ceiling: the domain registry is data, never an enum.
--
-- Builds ON Phase 6.5 (never replaces it): ingestion is the
-- multimodal front door (text/image/document/audio/video/
-- source code/web), while candidate → approval → versioning
-- reuse the frelux_learning_* governance machinery.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ARCHIE domain registry — extensible, no artificial ceiling
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_core boolean NOT NULL DEFAULT false,
  risk_class text NOT NULL DEFAULT 'STANDARD'
    CHECK (risk_class IN ('STANDARD', 'ENGINEERING_REVIEW', 'DETERMINISTIC')),
  active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- Seed: architecture is the CORE domain; the rest are extensible
-- families. Admins (and only admins) may add future domains.
INSERT INTO public.frelux_archie_domains (key, label, is_core, risk_class, description) VALUES
  ('architecture', 'Architecture', true, 'STANDARD',
   'ARCHIE core domain — building design, spaces, forms, plans and architectural practice.'),
  ('construction', 'Construction', false, 'STANDARD',
   'Construction methods, sequencing, site practice and execution knowledge.'),
  ('electrical', 'Electrical Engineering', false, 'ENGINEERING_REVIEW',
   'Electrical systems, wiring, load considerations and installation practice.'),
  ('plumbing', 'Plumbing', false, 'ENGINEERING_REVIEW',
   'Plumbing, drainage, water supply and sanitary systems.'),
  ('structural', 'Structural / Civil Engineering', false, 'DETERMINISTIC',
   'Structural and civil engineering — highest verification bar; never auto-promoted.'),
  ('foundation', 'Foundation Engineering', false, 'DETERMINISTIC',
   'Foundation design and practice — highest verification bar; never auto-promoted.'),
  ('safety', 'Construction Safety', false, 'ENGINEERING_REVIEW',
   'Site safety practices and thresholds — engineering review required.'),
  ('quantity_surveying', 'Quantity Surveying', false, 'STANDARD',
   'Measurement, quantities, takeoff methodology and QS practice.'),
  ('project_planning', 'Project Planning', false, 'STANDARD',
   'Scheduling, sequencing, milestones and project management.'),
  ('property', 'Property Intelligence', false, 'STANDARD',
   'Property markets, condition assessment and property value knowledge.'),
  ('procurement', 'Procurement', false, 'STANDARD',
   'Sourcing, suppliers, purchasing and logistics knowledge.'),
  ('costing', 'Costing', false, 'STANDARD',
   'Cost estimation inputs, pricing practice and market rates.'),
  ('painting_finishes', 'Painting & Finishes', false, 'STANDARD',
   'Painting and finishing materials, methods and regional practice.'),
  ('roofing', 'Roofing', false, 'ENGINEERING_REVIEW',
   'Roof geometry, materials and construction practice.'),
  ('hvac', 'HVAC', false, 'ENGINEERING_REVIEW',
   'Heating, ventilation and air conditioning systems.'),
  ('landscaping', 'Landscaping', false, 'STANDARD',
   'External works, landscaping and site development.'),
  ('regional_practices', 'Regional Practices', false, 'STANDARD',
   'Region-specific terminology, materials, package sizes and construction practice.'),
  ('writing', 'Writing', false, 'STANDARD',
   'Content, articles, documentation and communication.'),
  ('software_engineering', 'Coding / Software Engineering', false, 'STANDARD',
   'Code understanding, review, implementation plans and tests — proposals only, no production authority.'),
  ('business', 'Business', false, 'STANDARD',
   'Business operations, strategy and commercial knowledge.'),
  ('science', 'Science', false, 'STANDARD',
   'General scientific knowledge supporting ARCHIE reasoning.'),
  ('technology', 'Technology', false, 'STANDARD',
   'Technology trends, tools and systems knowledge.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.frelux_archie_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage archie domains" ON public.frelux_archie_domains;
CREATE POLICY "admins manage archie domains" ON public.frelux_archie_domains
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 2. ARCHIE contributors — identity, permission, scope
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'DOMAIN_CONTRIBUTOR'
    CHECK (role IN ('ARCHIE_ADMIN', 'DOMAIN_CONTRIBUTOR', 'OBSERVER')),
  allowed_domains text[] NOT NULL DEFAULT '{}',
  must_review boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_contributors_user
  ON public.frelux_archie_contributors (user_id);

ALTER TABLE public.frelux_archie_contributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage archie contributors" ON public.frelux_archie_contributors;
CREATE POLICY "admins manage archie contributors" ON public.frelux_archie_contributors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contributors read own profile" ON public.frelux_archie_contributors;
CREATE POLICY "contributors read own profile" ON public.frelux_archie_contributors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------
-- 3. Multimodal ingestions — the ARCHIE training front door
--    INPUT → EXTRACT → STRUCTURE → VALIDATE → EVALUATE →
--    AWAITING_APPROVAL → (human approval) → knowledge
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  input_type text NOT NULL
    CHECK (input_type IN (
      'TEXT', 'IMAGE', 'PDF_DOCUMENT', 'SCANNED_TECHNICAL',
      'ENGINEERING_DRAWING', 'TABLE_CALCULATION', 'AUDIO_VOICE',
      'VIDEO_DEMONSTRATION', 'PROJECT_OUTCOME', 'SOURCE_CODE',
      'WEB_INTELLIGENCE'
    )),
  title text NOT NULL,
  domain text NOT NULL,
  region text,
  media_uri text,
  source_ref text,
  raw_text text,
  pipeline_state text NOT NULL DEFAULT 'RECEIVED'
    CHECK (pipeline_state IN (
      'RECEIVED', 'EXTRACTING', 'EXTRACTED', 'STRUCTURED',
      'VALIDATED', 'EVALUATED', 'AWAITING_APPROVAL',
      'APPROVED', 'REJECTED'
    )),
  extraction jsonb,
  flags text[] NOT NULL DEFAULT '{}',
  candidate_count integer NOT NULL DEFAULT 0,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_ingestions_contributor
  ON public.frelux_archie_ingestions (created_by, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_archie_ingestions_state
  ON public.frelux_archie_ingestions (pipeline_state);

ALTER TABLE public.frelux_archie_ingestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage archie ingestions" ON public.frelux_archie_ingestions;
CREATE POLICY "admins manage archie ingestions" ON public.frelux_archie_ingestions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contributors insert own ingestions" ON public.frelux_archie_ingestions;
CREATE POLICY "contributors insert own ingestions" ON public.frelux_archie_ingestions
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "contributors read own ingestions" ON public.frelux_archie_ingestions;
CREATE POLICY "contributors read own ingestions" ON public.frelux_archie_ingestions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- Contributors may UPDATE their own rows ONLY while still
-- before approval (never after APPROVED/REJECTED).
DROP POLICY IF EXISTS "contributors update own pre-approval ingestions" ON public.frelux_archie_ingestions;
CREATE POLICY "contributors update own pre-approval ingestions" ON public.frelux_archie_ingestions
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()
         AND pipeline_state NOT IN ('APPROVED', 'REJECTED'))
  WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------
-- 4. Knowledge items gain ARCHIE context columns
--    (nullable → fully backward compatible)
-- ---------------------------------------------------------
ALTER TABLE public.frelux_knowledge_items
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS knowledge_type text,
  ADD COLUMN IF NOT EXISTS ingestion_id uuid REFERENCES public.frelux_archie_ingestions (id);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_domain
  ON public.frelux_knowledge_items (domain);

-- ---------------------------------------------------------
-- 5. Private storage bucket for training media
--    (images, PDFs, audio, video — never public)
-- ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('archie-media', 'archie-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins manage archie media" ON storage.objects;
CREATE POLICY "admins manage archie media" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'archie-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'archie-media' AND public.is_admin());

DROP POLICY IF EXISTS "contributors upload own archie media" ON storage.objects;
CREATE POLICY "contributors upload own archie media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'archie-media'
              AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "contributors read own archie media" ON storage.objects;
CREATE POLICY "contributors read own archie media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archie-media'
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
