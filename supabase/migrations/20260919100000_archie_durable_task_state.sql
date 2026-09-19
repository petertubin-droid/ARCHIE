-- ============================================================
-- ARCHIE DURABLE TASK-STEP STATE (gap audit D-2, 2026-09-16)
-- ============================================================
-- The supervised task completion engine ran compound tasks
-- entirely in isolate memory: an isolate recycle mid-task lost
-- every completed step, and a retried task started from zero.
-- This migration adds the durable checkpoint surface:
--
--   archie_task_states — one row per in-flight supervised task.
--   The engine checkpoints after EVERY step (completed steps
--   verbatim, the counters, the honest notes) and marks the
--   row finished with the deterministic verdict. A resumed
--   invocation hydrates the checkpoint and continues from the
--   first unrecorded clause — completed steps are NEVER
--   re-executed and NEVER re-fabricated.
--
-- Access: service-role only. RLS is enabled with NO policies
-- (the established lockdown pattern — anon/authenticated get
-- zero access). Task state is engine-internal, never user
-- surface.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_task_states (
  task_id uuid PRIMARY KEY,
  agent_id uuid, -- originating internal agent, when agent-dispatched
  conversation_id text, -- isolated context the steps ran under
  task text NOT NULL, -- the full task sentence (decomposed deterministically)
  total_clauses int NOT NULL DEFAULT 0,
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- TaskStepReport[], verbatim
  counters jsonb NOT NULL DEFAULT '{}'::jsonb, -- executable/succeeded/confidenceSum/executedCount/notes
  status text NOT NULL DEFAULT 'in_progress'
    CONSTRAINT archie_task_states_status_ck
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  verdict text, -- ACHIEVED | PARTIAL | NOT_ACHIEVED (set when finished)
  started_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_task_states_agent
  ON public.archie_task_states (agent_id, status, updated_date DESC);

CREATE INDEX IF NOT EXISTS idx_archie_task_states_stale
  ON public.archie_task_states (status, updated_date)
  WHERE status = 'in_progress';

ALTER TABLE public.archie_task_states ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: with RLS on and none defined,
-- anon/authenticated have zero access (lockdown pattern from
-- 20260918130000). Only the service role (edge functions)
-- reads and writes task state.

COMMENT ON TABLE public.archie_task_states IS
  'ARCHIE durable task-step state (gap D-2): per-step checkpoints for supervised compound tasks so they survive isolate recycling and resume from the first unrecorded clause.';
