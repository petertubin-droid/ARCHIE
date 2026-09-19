-- =========================================================
-- FRELUX PHASE 6 STAGE 1 — PROJECT AGENT FOUNDATION
--
-- Project-scoped agent state, memory and append-only activity
-- history. RLS: owner-only (created_by = auth.uid()) — a user can
-- never read or write another user's agent data. No secrets, no
-- sensitive personal data are ever stored in these tables.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'observed'
    CHECK (state IN ('observed','analyzed','recommended','prepared','approved','executed','verified','rejected','cancelled','failed','expired')),
  active_recommendation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_action_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, created_by)
);

CREATE TABLE IF NOT EXISTS public.project_agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, created_by)
);

CREATE TABLE IF NOT EXISTS public.project_agent_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('observation','analysis','recommendation','preparation','approval_request','approval_decision','execution','verification','error')),
  state text NOT NULL,
  summary text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_agent_activity_project
  ON public.project_agent_activity (project_id, created_at DESC);

ALTER TABLE public.project_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_agent_activity ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_agent_sessions','project_agent_memory','project_agent_activity'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (created_by = auth.uid())
         WITH CHECK (created_by = auth.uid())',
      t || '_owner_all', t);
  END LOOP;
END $$;
