-- =========================================================
-- FRELUX AI MULTILINGUAL CONSTRUCTION DICTIONARY
--
-- construction_terms: the full terminology record set
-- (spec §2). construction_term_versions: audit history so
-- every terminology change is versioned and reversible
-- (spec §16). RLS: admins manage, everyone authenticated can
-- read; verification is a deliberate human action, never
-- automatic (spec §13).
--
-- The dictionary never touches calculator engines or math:
-- it resolves terminology and intent AROUND the engines.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Language registry extension (spec §1, §22): languages
--    are data. pt/ar/hi/zh join the Phase 9 registry.
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_languages (code, label, native_label, common_regions, active) VALUES
  ('pt', 'Portuguese', 'Português', ARRAY['PT','BR'], true),
  ('ar', 'Arabic', 'العربية', ARRAY['SA','EG'], true),
  ('hi', 'Hindi', 'हिन्दी', ARRAY['IN'], true),
  ('zh', 'Chinese', '中文', ARRAY['CN'], true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------
-- 2. construction_terms
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.construction_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_term text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('building','roofing','concrete','foundation','finishing','estimating',
                        'measurements','tools_equipment','materials','safety','project_management')),
  definition text NOT NULL,
  technical_definition text NOT NULL,
  simple_definition text NOT NULL,
  language text NOT NULL,
  translation text,
  alternative_terms text[] NOT NULL DEFAULT '{}',
  local_terms text[] NOT NULL DEFAULT '{}',
  synonyms text[] NOT NULL DEFAULT '{}',
  abbreviations text[] NOT NULL DEFAULT '{}',
  unit text,
  measurement_type text,
  construction_context text NOT NULL,
  example_usage text NOT NULL,
  related_terms text[] NOT NULL DEFAULT '{}',
  common_mistakes text[] NOT NULL DEFAULT '{}',
  translation_notes text,
  country text NOT NULL DEFAULT 'NG',
  region text NOT NULL DEFAULT 'West Africa',
  source text,
  source_url text,
  source_date text,
  confidence_score numeric NOT NULL DEFAULT 0.5
    CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verified boolean NOT NULL DEFAULT false,
  verified_by text,
  translation_status text NOT NULL DEFAULT 'needs_review'
    CHECK (translation_status IN ('verified','provisional','needs_review','untranslated')),
  keep_in_english boolean NOT NULL DEFAULT false,
  explanation_required boolean NOT NULL DEFAULT false,
  nigerian_terminology jsonb,
  source_details jsonb,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- one canonical term per language (no duplicates)
  CONSTRAINT construction_terms_unique UNIQUE (canonical_term, language),
  -- low-confidence records can never masquerade as verified
  CONSTRAINT construction_terms_confidence_gate
    CHECK (NOT verified OR confidence_score >= 0.75),
  -- unverifiable translations are flagged, never hidden
  CONSTRAINT construction_terms_review_gate
    CHECK (translation_status <> 'needs_review' OR NOT verified)
);

CREATE INDEX IF NOT EXISTS idx_construction_terms_lookup
  ON public.construction_terms (language, canonical_term);
CREATE INDEX IF NOT EXISTS idx_construction_terms_category
  ON public.construction_terms (category);
CREATE INDEX IF NOT EXISTS idx_construction_terms_updated
  ON public.construction_terms (updated_at DESC);

ALTER TABLE public.construction_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage construction terms" ON public.construction_terms;
CREATE POLICY "admins manage construction terms"
  ON public.construction_terms FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authenticated read construction terms" ON public.construction_terms;
CREATE POLICY "authenticated read construction terms"
  ON public.construction_terms FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------
-- 3. construction_term_versions: audit history (spec §16)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.construction_term_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.construction_terms (id) ON DELETE CASCADE,
  version int NOT NULL,
  canonical_term text NOT NULL,
  language text NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}',
  changed_by text,
  change_note text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT construction_term_versions_unique UNIQUE (term_id, version)
);

CREATE INDEX IF NOT EXISTS idx_construction_term_versions_term
  ON public.construction_term_versions (term_id, version DESC);

ALTER TABLE public.construction_term_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage construction term versions" ON public.construction_term_versions;
CREATE POLICY "admins manage construction term versions"
  ON public.construction_term_versions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authenticated read construction term versions" ON public.construction_term_versions;
CREATE POLICY "authenticated read construction term versions"
  ON public.construction_term_versions FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------
-- 4. Full-text search support (spec §15): trigram-style
--    fuzzy search needs no extension; a plain index on the
--    canonical term supports the exact path, typo tolerance
--    runs in the application layer with edit distance.
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_construction_terms_translation
  ON public.construction_terms (translation);
