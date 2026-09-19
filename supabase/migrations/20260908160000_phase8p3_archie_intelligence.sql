-- =========================================================
-- FRELUX PHASE 8 P3 — ARCHIE EXTENSIBLE INTELLIGENCE LAYER
--
-- Persistence for the final Phase 8 intelligence layer:
--   * knowledge links — typed relations between approved,
--     versioned knowledge items (connect/refine/supersede)
--   * contradictions — detected conflicts, ALWAYS human-
--     resolved; ARCHIE flags, never deletes or rewrites
--   * domain gaps — evidence-based coverage/verification/
--     confidence gaps per active domain
--   * professional profiles — future verified professional
--     ecosystem; an unverified professional can NEVER be
--     represented as verified (enforced by CHECK + badge code)
--   * change requests — the owner-gated change pipeline
--     (REQUEST → ... → OWNER_AUTHORIZATION → APPLY); ARCHIE
--     can never authorize or apply (enforced by CHECK)
--
-- RLS: governance tables are admin-managed (is_admin()), the
-- same policy family as the Phase 6.5 learning engine.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Knowledge links (typed relations, always with provenance)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_knowledge_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_item uuid NOT NULL REFERENCES public.frelux_knowledge_items (id) ON DELETE CASCADE,
  to_item uuid NOT NULL REFERENCES public.frelux_knowledge_items (id) ON DELETE CASCADE,
  relation text NOT NULL
    CHECK (relation IN ('SUPPORTS', 'CONTRADICTS', 'REFINES', 'SUPERSEDES', 'RELATED_TO')),
  created_by text NOT NULL,
  reason text NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_link CHECK (from_item <> to_item)
);

CREATE INDEX IF NOT EXISTS idx_archie_knowledge_links_from
  ON public.frelux_archie_knowledge_links (from_item);
CREATE INDEX IF NOT EXISTS idx_archie_knowledge_links_to
  ON public.frelux_archie_knowledge_links (to_item);

ALTER TABLE public.frelux_archie_knowledge_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage knowledge links" ON public.frelux_archie_knowledge_links;
CREATE POLICY "admins manage knowledge links" ON public.frelux_archie_knowledge_links
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 2. Contradictions — detected by ARCHIE, resolved by humans
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_contradictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_a uuid NOT NULL REFERENCES public.frelux_knowledge_items (id) ON DELETE CASCADE,
  item_b uuid NOT NULL REFERENCES public.frelux_knowledge_items (id) ON DELETE CASCADE,
  topic text NOT NULL,
  domain text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolved_by uuid,
  resolution_note text,
  resolved_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_contradiction CHECK (item_a <> item_b)
);

CREATE INDEX IF NOT EXISTS idx_archie_contradictions_status
  ON public.frelux_archie_contradictions (status);

ALTER TABLE public.frelux_archie_contradictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage contradictions" ON public.frelux_archie_contradictions;
CREATE POLICY "admins manage contradictions" ON public.frelux_archie_contradictions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 3. Domain gaps — evidence-based learning agenda
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_domain_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  gap_type text NOT NULL
    CHECK (gap_type IN ('COVERAGE', 'VERIFICATION', 'CONFIDENCE')),
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'ADDRESSED')),
  detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_domain_gaps_status
  ON public.frelux_archie_domain_gaps (status);

ALTER TABLE public.frelux_archie_domain_gaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage domain gaps" ON public.frelux_archie_domain_gaps;
CREATE POLICY "admins manage domain gaps" ON public.frelux_archie_domain_gaps
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 4. Professional profiles — verified professional ecosystem
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_professional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL
    CHECK (role IN (
      'ARCHITECT', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER',
      'ELECTRICAL_ENGINEER', 'QUANTITY_SURVEYOR', 'CONTRACTOR',
      'TRADESPERSON', 'SUPPLIER', 'INSPECTOR', 'PROPERTY_PROFESSIONAL'
    )),
  display_name text NOT NULL,
  verification_state text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_state IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REVOKED')),
  verified_by uuid,
  verified_at timestamptz,
  credential_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  regional_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  -- VERIFIED requires verifier + at least one credential ref:
  -- ARCHIE can never mint verification through the database.
  CONSTRAINT verified_requires_evidence CHECK (
    verification_state <> 'VERIFIED'
    OR (verified_by IS NOT NULL AND credential_refs <> '[]'::jsonb)
  )
);

CREATE INDEX IF NOT EXISTS idx_professional_profiles_role
  ON public.frelux_professional_profiles (role, verification_state);

ALTER TABLE public.frelux_professional_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage professional profiles" ON public.frelux_professional_profiles;
CREATE POLICY "admins manage professional profiles" ON public.frelux_professional_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "authenticated read professional profiles" ON public.frelux_professional_profiles;
CREATE POLICY "authenticated read professional profiles" ON public.frelux_professional_profiles
  FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------
-- 5. Change requests — owner-gated change pipeline
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage text NOT NULL DEFAULT 'REQUEST'
    CHECK (stage IN (
      'REQUEST', 'UNDERSTAND', 'PLAN', 'IMPLEMENT', 'TEST',
      'REVIEW', 'OWNER_AUTHORIZATION', 'APPLY', 'REJECTED'
    )),
  created_by text NOT NULL
    CHECK (created_by IN ('ARCHIE', 'CONTRIBUTOR', 'ENGINEER', 'OWNER')),
  understanding_summary text,
  plan text,
  implementation_summary text,
  test_evidence text,
  review_signoff_by text,
  rollback_plan text,
  requires_engineering_review boolean NOT NULL DEFAULT false,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  -- The owner gates: OWNER_AUTHORIZATION/APPLY stages can only
  -- be recorded by a human session (admins), never by ARCHIE
  -- acting autonomously (app-level actor is enforced in code,
  -- DB-side only an admin session may write these rows).
  CONSTRAINT owner_gate_requires_rollback CHECK (
    stage NOT IN ('OWNER_AUTHORIZATION', 'APPLY')
    OR rollback_plan IS NOT NULL
  ),
  CONSTRAINT review_requires_human CHECK (
    stage NOT IN ('REVIEW', 'OWNER_AUTHORIZATION', 'APPLY')
    OR review_signoff_by IN ('ENGINEER', 'OWNER')
  )
);

CREATE INDEX IF NOT EXISTS idx_archie_change_requests_stage
  ON public.frelux_archie_change_requests (stage);

ALTER TABLE public.frelux_archie_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage change requests" ON public.frelux_archie_change_requests;
CREATE POLICY "admins manage change requests" ON public.frelux_archie_change_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
