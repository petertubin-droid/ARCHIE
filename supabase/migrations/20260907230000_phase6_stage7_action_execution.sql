-- =========================================================
-- FRELUX PHASE 6 STAGE 7 — ACTION EXECUTION
--
-- Stage 7 is the ONLY layer that writes project data tables.
-- These additive columns record, on the action row itself, the
-- full audit of what an execution did:
--   executed_at       — when the write was attempted
--   verified_at       — when the change was confirmed in
--                       recorded state (null if it never was)
--   execution_result  — what was written, to which tables,
--                       with what outcome and honest reason
--
-- RLS: unchanged (owner-only, Stage 6). No project data table
-- is touched by this migration.
-- =========================================================

ALTER TABLE public.project_agent_actions
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

ALTER TABLE public.project_agent_actions
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.project_agent_actions
  ADD COLUMN IF NOT EXISTS execution_result jsonb;

COMMENT ON COLUMN public.project_agent_actions.executed_at IS
  'Stage 7: when the approved action''s write was attempted (execution began).';
COMMENT ON COLUMN public.project_agent_actions.verified_at IS
  'Stage 7: when the change was verified in recorded state. NULL for failed/pre-flight-refused executions.';
COMMENT ON COLUMN public.project_agent_actions.execution_result IS
  'Stage 7 audit: { outcome, attemptedAt, verifiedAt?, summary, writtenTables, failureReason?, note? }.';
