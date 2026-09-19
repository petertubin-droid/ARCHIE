-- =========================================================
-- FRELUX PHASE 6.5 — CONTINUOUS LEARNING & SELF-IMPROVEMENT
--
-- The unified FRELUX Learning Engine schema:
--   * frelux_learning_records   — ARCHIE/Gemini/OpenAI/user
--                                 reference submissions with a
--                                 candidate → verify → evaluate →
--                                 approve lifecycle. NEVER promoted
--                                 by ingestion itself.
--   * frelux_learning_events    — unified learning signal stream
--                                 (AI corrections, chat signals,
--                                 actual outcomes). Owner-scoped.
--   * frelux_knowledge_items     — the VERSIONED production
--                                 Knowledge Layer. Only APPROVED
--                                 records may create these; every
--                                 item is traceable to its record.
--   * frelux_learning_versions   — immutable version snapshots
--                                 for rollback.
--   * frelux_learning_audit      — append-only audit trail.
--   * frelux_improvement_proposals — DRAFT → EVALUATING →
--                                 READY_FOR_REVIEW → APPROVED /
--                                 REJECTED / DEFERRED.
--   * frelux_learning_rate_limits — ingestion rate limiting.
--   * frelux_evaluation_{datasets,cases,results} — versioned
--                                 evaluation datasets and results.
--
-- Security model:
--   * Admins (is_admin()) can review, approve, reject, defer,
--     and roll back. Regular users can only insert their OWN
--     learning events (corrections, signals) — never read or
--     write other users' data, never touch records, knowledge,
--     versions, audit or proposals.
--   * Audit rows have NO update/delete policies for any
--     authenticated role (append-only for admins; the service
--     role is used only by the archie-ingestion edge function).
--   * Ingestion alone can NEVER create knowledge — the
--     archie-ingestion function inserts records with
--     lifecycle_status = 'ARCHIE_RECEIVED' only.
--
-- Deterministic engines are untouched: no calculator table,
-- rule, or formula is modified by this migration.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Learning records (candidate knowledge with lifecycle)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL
    CHECK (source IN ('ARCHIE', 'GEMINI', 'OPENAI', 'USER', 'OUTCOME', 'SYSTEM')),
  source_type text,
  provider text,
  model_version text,
  topic text NOT NULL,
  capability text NOT NULL,
  request_context text,
  recommendation text,
  conclusion text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  cited_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_scope text NOT NULL
    CHECK (proposed_scope IN ('GLOBAL', 'REGIONAL', 'PROJECT', 'PROPERTY', 'USER')),
  scope_key text,
  project_id uuid,
  property_id uuid,
  created_by uuid,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'PENDING',
  evaluation_status text NOT NULL DEFAULT 'NOT_EVALUATED',
  lifecycle_status text NOT NULL DEFAULT 'CANDIDATE'
    CHECK (lifecycle_status IN (
      'ARCHIE_RECEIVED', 'CANDIDATE', 'VERIFYING', 'EVALUATING',
      'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED'
    )),
  requires_engineering_review boolean NOT NULL DEFAULT false,
  content_hash text,
  payload_size integer,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_learning_records_status
  ON public.frelux_learning_records (lifecycle_status, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_frelux_learning_records_hash
  ON public.frelux_learning_records (content_hash);
CREATE INDEX IF NOT EXISTS idx_frelux_learning_records_capability
  ON public.frelux_learning_records (capability, proposed_scope, scope_key);

ALTER TABLE public.frelux_learning_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage learning records" ON public.frelux_learning_records;
CREATE POLICY "admins manage learning records" ON public.frelux_learning_records
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Note: regular users get NO direct policy here — submissions go
-- through the authenticated archie-ingestion edge function or the
-- owner-scoped frelux_learning_events stream below.

-- ---------------------------------------------------------
-- 2. Learning events (unified signal stream, owner-scoped)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL
    CHECK (event_type IN (
      'USER_CORRECTION', 'AI_EXTRACTION_CORRECTION', 'CHAT_SIGNAL',
      'MISSING_INFO', 'RETRIEVAL_FAILURE', 'TOOL_SELECTION',
      'ACTUAL_OUTCOME'
    )),
  source text NOT NULL
    CHECK (source IN ('GEMINI', 'OPENAI', 'ARCHIE', 'USER', 'OUTCOME', 'SYSTEM')),
  capability text NOT NULL,
  subject text NOT NULL,
  ai_value text,
  user_value text,
  expected_value text,
  actual_value text,
  delta numeric,
  region text,
  project_id uuid,
  plan_document_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_learning_events_capability
  ON public.frelux_learning_events (capability, source, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_frelux_learning_events_user
  ON public.frelux_learning_events (created_by, created_date DESC);

ALTER TABLE public.frelux_learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users insert own learning events" ON public.frelux_learning_events;
CREATE POLICY "users insert own learning events" ON public.frelux_learning_events
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "users read own learning events" ON public.frelux_learning_events;
CREATE POLICY "users read own learning events" ON public.frelux_learning_events
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

-- No UPDATE/DELETE policies: events are append-only signals.

-- ---------------------------------------------------------
-- 3. Knowledge items (versioned production Knowledge Layer)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.frelux_learning_records (id),
  capability text NOT NULL,
  scope text NOT NULL
    CHECK (scope IN ('GLOBAL', 'REGIONAL', 'PROJECT', 'PROPERTY', 'USER')),
  scope_key text,
  topic text NOT NULL,
  content jsonb NOT NULL,
  evidence_state text NOT NULL
    CHECK (evidence_state IN (
      'AI_EXTRACTED', 'AI_RECOMMENDATION', 'USER_PROVIDED',
      'USER_CONFIRMED', 'SYSTEM_VERIFIED', 'EXTERNAL_SOURCE_VERIFIED',
      'ESTIMATED', 'ASSUMPTION', 'ACTUAL_OUTCOME'
    )),
  confidence numeric,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ROLLED_BACK')),
  change_reason text,
  created_by uuid,
  approved_by uuid,
  approved_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_knowledge_items_lookup
  ON public.frelux_knowledge_items (capability, scope, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frelux_knowledge_items_version
  ON public.frelux_knowledge_items (record_id, version);

ALTER TABLE public.frelux_knowledge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage knowledge items" ON public.frelux_knowledge_items;
CREATE POLICY "admins manage knowledge items" ON public.frelux_knowledge_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 4. Version snapshots (rollback support)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_learning_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.frelux_learning_records (id),
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  change_reason text,
  reviewer uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, version)
);

ALTER TABLE public.frelux_learning_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read versions" ON public.frelux_learning_versions;
CREATE POLICY "admins read versions" ON public.frelux_learning_versions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins insert versions" ON public.frelux_learning_versions;
CREATE POLICY "admins insert versions" ON public.frelux_learning_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 5. Append-only audit trail
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_learning_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid,
  action text NOT NULL
    CHECK (action IN (
      'INGESTED', 'DUPLICATE_BLOCKED', 'RATE_BLOCKED', 'REJECTED_INVALID',
      'ADVANCED', 'VERIFIED', 'EVALUATED', 'READY_FOR_REVIEW',
      'APPROVED', 'REJECTED', 'DEFERRED', 'REQUEST_VERIFICATION',
      'PROMOTED', 'ROLLED_BACK'
    )),
  actor uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_learning_audit_record
  ON public.frelux_learning_audit (record_id, created_date DESC);

ALTER TABLE public.frelux_learning_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read audit" ON public.frelux_learning_audit;
CREATE POLICY "admins read audit" ON public.frelux_learning_audit
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins insert audit" ON public.frelux_learning_audit;
CREATE POLICY "admins insert audit" ON public.frelux_learning_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- No UPDATE/DELETE policies: the audit trail is immutable.

-- ---------------------------------------------------------
-- 6. Improvement proposals
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_improvement_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES public.frelux_learning_records (id),
  capability text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_benefit text,
  risk text,
  evaluation jsonb,
  requires_engineering_review boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'EVALUATING', 'READY_FOR_REVIEW',
                      'APPROVED', 'REJECTED', 'DEFERRED')),
  reviewer uuid,
  version integer NOT NULL DEFAULT 1,
  rollback_path text,
  proposed_by uuid,
  approved_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_proposals_status
  ON public.frelux_improvement_proposals (status, created_date DESC);

ALTER TABLE public.frelux_improvement_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage proposals" ON public.frelux_improvement_proposals;
CREATE POLICY "admins manage proposals" ON public.frelux_improvement_proposals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "users insert own proposals" ON public.frelux_improvement_proposals;
CREATE POLICY "users insert own proposals" ON public.frelux_improvement_proposals
  FOR INSERT TO authenticated
  WITH CHECK (proposed_by = auth.uid());

-- ---------------------------------------------------------
-- 7. Ingestion rate limiting
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_learning_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.frelux_learning_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge function) touches it.

-- ---------------------------------------------------------
-- 8. Evaluation datasets and results (versioned)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_evaluation_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  capability text NOT NULL,
  region text,
  dataset_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, capability, dataset_version)
);

CREATE TABLE IF NOT EXISTS public.frelux_evaluation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.frelux_evaluation_datasets (id) ON DELETE CASCADE,
  input jsonb NOT NULL,
  expected jsonb NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.frelux_evaluation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.frelux_evaluation_datasets (id),
  provider text NOT NULL,
  model_version text,
  metrics jsonb NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_eval_cases_dataset
  ON public.frelux_evaluation_cases (dataset_id);

ALTER TABLE public.frelux_evaluation_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_evaluation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_evaluation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage eval datasets" ON public.frelux_evaluation_datasets;
CREATE POLICY "admins manage eval datasets" ON public.frelux_evaluation_datasets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage eval cases" ON public.frelux_evaluation_cases;
CREATE POLICY "admins manage eval cases" ON public.frelux_evaluation_cases
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins manage eval results" ON public.frelux_evaluation_results;
CREATE POLICY "admins manage eval results" ON public.frelux_evaluation_results
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
