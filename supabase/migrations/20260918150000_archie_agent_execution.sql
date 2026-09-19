-- =========================================================
-- ARCHIE Internal Agent Execution (audit L-2 fix, 2026-09-13)
-- =========================================================
-- Forensic audit finding L-2 (MEDIUM): the internal-agents
-- system is a real budget/lifecycle ledger with NO execution
-- semantics — "EXECUTING" was a status, not a process.
--
-- This migration closes that gap the audited way:
--   1. frelux_archie_agent_reports — durable work products
--      produced by the agent worker (never fabricated).
--   2. A REGISTERED execution target 'archie-agent-task'
--      (EDGE_FUNCTION -> archie-agent-worker) so agent task
--      execution goes through the execution engine with its
--      full gate stack: initiator policy, admin authority,
--      schema validation, audit runs, bounded retries.
--
-- The worker itself runs the task through the SAME unified
-- cognitive kernel that powers owner chat (one ARCHIE
-- intelligence — never multiple sub-agent minds), with the
-- life-safety and security verdict gates applied to the task
-- text exactly like a chat turn.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Agent work-product reports (append-only, owner-visible)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_agent_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL
    REFERENCES public.frelux_archie_internal_agents(id)
    ON DELETE CASCADE,
  run_id uuid, -- frelux_archie_execution_runs.id (engine audit)
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  gates jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine text NOT NULL DEFAULT 'archie-unified-cognitive',
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_agent
  ON public.frelux_archie_agent_reports (agent_id, created_date DESC);

ALTER TABLE public.frelux_archie_agent_reports
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads agent reports"
  ON public.frelux_archie_agent_reports;
CREATE POLICY "owner reads agent reports"
  ON public.frelux_archie_agent_reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE policies: only the service role — the
--  worker itself — writes reports. Humans never falsify work
--  products; the append-only event ledger cross-references.)

-- ---------------------------------------------------------
-- 2. Registered execution target for agent tasks
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_execution_targets
  (key, label, description, kind, function_name, http_method,
   environment, requires_owner_secret, allowed_initiators,
   input_schema, result_schema, timeout_ms, max_retries,
   retry_backoff_ms, idempotent, risk_class)
VALUES
  ('archie-agent-task', 'ARCHIE Internal Agent Task',
   'Executes an internal agent''s task through the archie-agent-worker — the unified ARCHIE cognitive kernel with life-safety and security verdict gates. Work product is stored as an auditable agent report; no external AI provider.',
   'EDGE_FUNCTION', 'archie-agent-worker', 'POST',
   'STAGING', false,
   '["ARCHIE_AGENTS"]'::jsonb,
   '{"type": "object", "required": ["agent_id"], "properties": {"agent_id": {"type": "string", "format": "uuid"}}}'::jsonb,
   '{"type": "object", "required": ["ok"], "properties": {"ok": {"type": "boolean"}}}'::jsonb,
   120000, 1, 2000, true, 'STANDARD')
ON CONFLICT (key) DO NOTHING;
