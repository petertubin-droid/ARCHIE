-- =========================================================
-- FRELUX PHASE 6 STAGE 6 — PREPARED ACTIONS & APPROVALS
--
-- The agent prepares actions WITHOUT committing them. Nothing
-- here touches project data tables — a prepared action is only
-- ever intent, traceable to a recommendation and validated
-- against recorded state at prepare time.
--
-- RLS: owner-only (created_by = auth.uid()) — a user can never
-- read or write another user's agent data. No secrets, no
-- sensitive personal data are ever stored in these tables.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('record_purchase','confirm_stage_completion','update_material_price')),
  -- Human description of what the approved action WILL do.
  what text NOT NULL,
  -- Why — grounded in the recommendation it came from.
  why text NOT NULL,
  -- Traceable data basis (fact keys / engine ids).
  data_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_result text NOT NULL,
  -- Permission level required (fixed taxonomy from Stage 1).
  permission text NOT NULL CHECK (permission IN ('read','prepare','confirm','prohibited')),
  state text NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('observed','analyzed','recommended','prepared','approved','executed','verified','rejected','cancelled','failed','expired')),
  -- The recommendation (re-derived fresh at prepare time) that
  -- grounds this action. Honest traceability, never a guess.
  recommendation_id text NOT NULL,
  recommendation_summary text NOT NULL,
  -- Concrete, validated operation parameters — recorded state
  -- as it was when the action was prepared (payload only).
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  -- Duplicate/double-tap submissions collapse to one action.
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.project_agent_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.project_agent_actions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','approved','rejected','cancelled','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  -- Stale approvals expire; a lapsed window means re-prepare.
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_project_agent_actions_project
  ON public.project_agent_actions (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_agent_approvals_action
  ON public.project_agent_approvals (action_id, created_at DESC);

ALTER TABLE public.project_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_agent_approvals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_agent_actions','project_agent_approvals'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (created_by = auth.uid())
         WITH CHECK (created_by = auth.uid())',
      t || '_owner_all', t);
  END LOOP;
END $$;
