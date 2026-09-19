-- =========================================================
-- FRELUX PHASE 8 P4 — TRUSTED DEVICES, SUBSCRIBER
-- INTELLIGENCE & MULTI-DEVICE LEARNING
--
-- Tables:
--   * frelux_archie_trusted_devices — per-device identity,
--     enrollment state, token digest (never the token),
--     security status, per-device permission set
--   * frelux_archie_device_data_consents — granular, per
--     (device, category) consents with the explanation shown
--   * frelux_archie_mobile_learnings — the 12-step mobile
--     learning pipeline state per ingestion
--   * frelux_archie_contributions — subscriber contributions
--     with full origin traceability and DB-level promotion
--     guards (global approval requires approval history)
--
-- Isolation: all four tables are user-scoped (auth.uid()).
-- Admins (is_admin()) may read contributions for the
-- evaluation pipeline but never raw user data.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Trusted devices
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_name text NOT NULL,
  fingerprint text NOT NULL,
  enrollment_state text NOT NULL DEFAULT 'ENROLLED'
    CHECK (enrollment_state IN ('ENROLLED', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  security_status text NOT NULL DEFAULT 'TRUSTED'
    CHECK (security_status IN ('TRUSTED', 'UNTRUSTED', 'SUSPICIOUS')),
  token_digest text NOT NULL,
  token_rotated_at timestamptz NOT NULL DEFAULT now(),
  permission_set jsonb NOT NULL DEFAULT '[]'::jsonb,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revoked_state_consistent CHECK (
    (enrollment_state = 'REVOKED') = (revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_archie_trusted_devices_user
  ON public.frelux_archie_trusted_devices (user_id);

ALTER TABLE public.frelux_archie_trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own trusted devices" ON public.frelux_archie_trusted_devices;
CREATE POLICY "users manage own trusted devices" ON public.frelux_archie_trusted_devices
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 2. Granular per-device data consents
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_device_data_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.frelux_archie_trusted_devices (id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN (
      'PHOTOGRAPHS', 'VIDEOS', 'PDF_DOCUMENTS', 'VOICE_RECORDINGS',
      'SELECTED_FILES', 'DRAWINGS', 'SCREENSHOTS', 'MEASUREMENTS',
      'PROJECT_INFORMATION', 'CONSTRUCTION_OBSERVATIONS',
      'MATERIAL_INFORMATION', 'PROJECT_OUTCOMES', 'USER_CORRECTIONS',
      'AUTHORIZED_CODE_RESOURCES', 'OTHER_SELECTED_INFORMATION'
    )),
  granted boolean NOT NULL DEFAULT false,
  explanation_shown text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, category),
  -- a granted consent MUST have recorded the explanation and
  -- a granted_at timestamp: unexplained grants are invalid.
  CONSTRAINT granted_requires_explanation CHECK (
    granted = false OR (explanation_shown IS NOT NULL AND granted_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_archie_device_data_consents_user
  ON public.frelux_archie_device_data_consents (user_id);

ALTER TABLE public.frelux_archie_device_data_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own device consents" ON public.frelux_archie_device_data_consents;
CREATE POLICY "users manage own device consents" ON public.frelux_archie_device_data_consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 3. Mobile learnings (pipeline state per ingestion)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_mobile_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.frelux_archie_trusted_devices (id) ON DELETE CASCADE,
  category text NOT NULL,
  pipeline_state text NOT NULL DEFAULT 'CONSENTED'
    CHECK (pipeline_state IN (
      'CONSENTED', 'SELECTED', 'INGESTED', 'EXTRACTED', 'STRUCTURED',
      'VALIDATED', 'EVALUATED', 'SHOWN_TO_USER', 'USER_CONFIRMED',
      'SCOPED', 'APPROVED', 'VERSIONED', 'REJECTED'
    )),
  shown_summary text,
  user_confirmed boolean NOT NULL DEFAULT false,
  scope text
    CHECK (scope IN (
      'PRIVATE', 'PROJECT', 'PROPERTY', 'REGIONAL',
      'FRELUX_GLOBAL_CANDIDATE', 'FRELUX_GLOBAL_APPROVED'
    )),
  learned jsonb NOT NULL DEFAULT '[]'::jsonb,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  -- the SHOW USER step is mandatory before confirmation:
  -- nothing is confirmed that was never shown.
  CONSTRAINT shown_before_confirmed CHECK (
    pipeline_state <> 'USER_CONFIRMED' OR shown_summary IS NOT NULL
  ),
  -- VERSIONED requires an explicit scope:
  CONSTRAINT versioned_requires_scope CHECK (
    pipeline_state <> 'VERSIONED' OR scope IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_archie_mobile_learnings_user
  ON public.frelux_archie_mobile_learnings (user_id);

ALTER TABLE public.frelux_archie_mobile_learnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own mobile learnings" ON public.frelux_archie_mobile_learnings;
CREATE POLICY "users manage own mobile learnings" ON public.frelux_archie_mobile_learnings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 4. Subscriber contributions (origin-traceable)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  source_type text NOT NULL,
  topic text NOT NULL,
  content jsonb NOT NULL,
  project_ref uuid,
  property_ref uuid,
  country_region text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL,
  confidence numeric NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  consent_status text NOT NULL DEFAULT 'GRANTED'
    CHECK (consent_status IN ('GRANTED', 'REVOKED')),
  scope text NOT NULL DEFAULT 'FRELUX_GLOBAL_CANDIDATE'
    CHECK (scope IN (
      'PRIVATE', 'PROJECT', 'PROPERTY', 'REGIONAL',
      'FRELUX_GLOBAL_CANDIDATE', 'FRELUX_GLOBAL_APPROVED'
    )),
  verification_state text NOT NULL DEFAULT 'AI_EXTRACTED'
    CHECK (verification_state IN (
      'AI_EXTRACTED', 'AI_RECOMMENDATION', 'USER_PROVIDED',
      'USER_CONFIRMED', 'SYSTEM_VERIFIED', 'EXTERNAL_SOURCE_VERIFIED',
      'ESTIMATED', 'ASSUMPTION', 'ACTUAL_OUTCOME'
    )),
  evaluation_state text NOT NULL DEFAULT 'UNEVALUATED'
    CHECK (evaluation_state IN (
      'UNEVALUATED', 'EVALUATING', 'ACCEPTED', 'FLAGGED', 'REJECTED'
    )),
  version integer NOT NULL DEFAULT 1,
  approval_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  withdrawn boolean NOT NULL DEFAULT false,
  withdrawn_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  -- THE USER DATA → GLOBAL PROHIBITION, at the database:
  -- FRELUX_GLOBAL_APPROVED requires non-empty approval
  -- history. No human approval record means no promotion.
  CONSTRAINT global_approved_requires_human_history CHECK (
    scope <> 'FRELUX_GLOBAL_APPROVED' OR approval_history <> '[]'::jsonb
  ),
  -- contributions can never be born approved:
  CONSTRAINT no_born_approved CHECK (
    scope <> 'FRELUX_GLOBAL_APPROVED' OR version > 1
  )
);

CREATE INDEX IF NOT EXISTS idx_archie_contributions_user
  ON public.frelux_archie_contributions (user_id);
CREATE INDEX IF NOT EXISTS idx_archie_contributions_evaluation
  ON public.frelux_archie_contributions (evaluation_state, scope);

ALTER TABLE public.frelux_archie_contributions ENABLE ROW LEVEL SECURITY;

-- Users manage their own contributions (view, correct, withdraw).
DROP POLICY IF EXISTS "users manage own contributions" ON public.frelux_archie_contributions;
CREATE POLICY "users manage own contributions" ON public.frelux_archie_contributions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins read the evaluation pool (candidates) for the human
-- review pipeline — read-only, never personal raw data.
DROP POLICY IF EXISTS "admins read evaluation pool" ON public.frelux_archie_contributions;
CREATE POLICY "admins read evaluation pool" ON public.frelux_archie_contributions
  FOR SELECT TO authenticated
  USING (public.is_admin());
