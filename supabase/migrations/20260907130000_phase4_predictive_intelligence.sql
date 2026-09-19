-- =========================================================
-- FRELUX PHASE 4 — PREDICTIVE INTELLIGENCE PERSISTENCE
--
-- One cached predictive analysis per project, invalidated by
-- input hash whenever any source row changes (§22). RLS:
-- owner-only — a user can never read another user's analysis.
--
-- No predictions are stored server-side beyond what the user's
-- own project data produces; the analysis is deterministic and
-- recomputable from the project rows at any time.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_predictive_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cache key: digest of every input the analysis depends on.
  -- Same hash + fresh enough → cached result reused; any change
  -- in project data → different hash → recompute (§22).
  input_hash text NOT NULL,

  -- The deterministic analysis bundle (evidence, confidence,
  -- freshness, risks, recommendations, health, scenarios).
  result jsonb NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictive_analyses_project_id
  ON public.project_predictive_analyses(project_id);

CREATE INDEX IF NOT EXISTS idx_predictive_analyses_input_hash
  ON public.project_predictive_analyses(input_hash);

ALTER TABLE public.project_predictive_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_predictive_analyses FORCE ROW LEVEL SECURITY;

-- Owner-only: users see and manage only their own projects' analyses.
DROP POLICY IF EXISTS "predictive_analysis_owner_select" ON public.project_predictive_analyses;
CREATE POLICY "predictive_analysis_owner_select"
  ON public.project_predictive_analyses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "predictive_analysis_owner_insert" ON public.project_predictive_analyses;
CREATE POLICY "predictive_analysis_owner_insert"
  ON public.project_predictive_analyses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "predictive_analysis_owner_update" ON public.project_predictive_analyses;
CREATE POLICY "predictive_analysis_owner_update"
  ON public.project_predictive_analyses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "predictive_analysis_owner_delete" ON public.project_predictive_analyses;
CREATE POLICY "predictive_analysis_owner_delete"
  ON public.project_predictive_analyses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Ensure updated_at reflects cache refreshes.
CREATE OR REPLACE FUNCTION public.handle_predictive_analysis_touch()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_predictive_analysis_changed
  ON public.project_predictive_analyses;

CREATE TRIGGER on_predictive_analysis_changed
  BEFORE UPDATE ON public.project_predictive_analyses
  FOR EACH ROW EXECUTE FUNCTION public.handle_predictive_analysis_touch();
