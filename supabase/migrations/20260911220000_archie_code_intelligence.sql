-- =========================================================
-- ARCHIE FRELUX CODE INTELLIGENCE
--
-- Persistence for deep codebase understanding: audit
-- findings (evidence-gated), calculation traces, and patch
-- proposals (approval-gated). NO MOCK CALCULATIONS, NO FAKE
-- SUCCESS: evidence is required in the schema itself.
-- Production changes remain owner-approval gated; approval
-- is recorded here with its authorization evidence.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Code audit findings
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_code_findings (
  id text PRIMARY KEY,
  layer text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('PLACEHOLDER','HARDCODED_VALUE','MOCK_RESULT','FAKE_CALCULATION','DISCONNECTED_FUNCTION','INCORRECT_FORMULA','DUPLICATED_RULE','UNCONFIGURED_RULE','BROKEN_EDGE_FUNCTION','UNVERIFIED_PROVENANCE')),
  location text NOT NULL,
  evidence text NOT NULL CHECK (length(trim(evidence)) > 0),
  proposed_fix text,
  status text NOT NULL DEFAULT 'OWNER_REVIEW'
    CHECK (status IN ('OPEN','OWNER_REVIEW','CONFIRMED_INTENTIONAL','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_findings_layer
  ON public.archie_code_findings (layer, status);

ALTER TABLE public.archie_code_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_code_findings" ON public.archie_code_findings;
CREATE POLICY "admin_read_code_findings" ON public.archie_code_findings
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_code_findings" ON public.archie_code_findings;
CREATE POLICY "admin_write_code_findings" ON public.archie_code_findings
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 2. Calculation traces — provenance of every step
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_calculation_traces (
  id text PRIMARY KEY,
  calculator text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  valid boolean NOT NULL DEFAULT false,
  verdict jsonb NOT NULL DEFAULT '{}'::jsonb,
  traced_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calc_traces_calculator
  ON public.archie_calculation_traces (calculator, traced_at DESC);

ALTER TABLE public.archie_calculation_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_calc_traces" ON public.archie_calculation_traces;
CREATE POLICY "admin_read_calc_traces" ON public.archie_calculation_traces
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_calc_traces" ON public.archie_calculation_traces;
CREATE POLICY "admin_write_calc_traces" ON public.archie_calculation_traces
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 3. Patch proposals — approval-gated
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_patch_proposals (
  id text PRIMARY KEY,
  fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','TESTED','AWAITING_OWNER_APPROVAL','APPROVED','APPLIED','REJECTED')),
  test_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patch_test_evidence_before_approval
    CHECK (status NOT IN ('TESTED','AWAITING_OWNER_APPROVAL','APPROVED','APPLIED')
           OR jsonb_array_length(test_evidence) > 0)
);

ALTER TABLE public.archie_patch_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_patch_proposals" ON public.archie_patch_proposals;
CREATE POLICY "admin_read_patch_proposals" ON public.archie_patch_proposals
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_patch_proposals" ON public.archie_patch_proposals;
CREATE POLICY "admin_write_patch_proposals" ON public.archie_patch_proposals
  FOR ALL TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());
