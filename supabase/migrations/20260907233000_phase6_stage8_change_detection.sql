-- =========================================================
-- FRELUX PHASE 6 STAGE 8 — CHANGE DETECTION
--
-- Persistent per-project baseline of the recorded state, so
-- change detection can compare "previous verified state vs
-- current verified state". One baseline per project per user
-- (upserted on every detection run).
--
-- RLS: owner-only (created_by = auth.uid()), identical to the
-- Stage-1 agent tables. No project data table is touched.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_agent_state_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  state jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, created_by)
);

ALTER TABLE public.project_agent_state_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_agent_state_baselines_owner_all
  ON public.project_agent_state_baselines;
CREATE POLICY project_agent_state_baselines_owner_all
  ON public.project_agent_state_baselines FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

COMMENT ON TABLE public.project_agent_state_baselines IS
  'Stage 8: per-project recorded-state baseline used by change detection to explain what/why/effect between captures.';
