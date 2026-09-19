-- =========================================================
-- ARCHIE EXECUTION & RUNTIME ENGINE
-- 20260910040000
--
-- The real, audited execution layer connecting ARCHIE's
-- intelligence to authorized backend execution:
--
--   INTELLIGENCE → REASON → VERIFY → AUTHORITY → EXECUTION
--   → RESULT VERIFY → MEMORY (immutable audit runs)
--
-- Targets are a REGISTRY: only registered, enabled targets can
-- ever run. Production targets require the server-verified
-- Owner Secret. Every run is audited with redacted payloads.
-- No anonymous/authenticated (non-admin) access: RLS gives
-- owner-only access; service role reaches both tables for the
-- engine itself.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Target registry
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_execution_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  kind text NOT NULL
    CHECK (kind IN ('EDGE_FUNCTION', 'HTTP_API')),
  function_name text,
  endpoint text,
  http_method text NOT NULL DEFAULT 'POST'
    CHECK (http_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  -- header name → ENV var name. Values are read server-side at
  -- execution time only; never persisted, logged or returned.
  secret_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  environment text NOT NULL
    CHECK (environment IN ('SANDBOX', 'STAGING', 'PRODUCTION')),
  requires_owner_secret boolean NOT NULL DEFAULT true,
  -- calling systems allowed to initiate: ARCHIE_CHAT, OWNER_PWA,
  -- CODING_STUDIO, FRELUX_APP, AUTOMATION, EXECUTION_ROLLBACK
  allowed_initiators jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_schema jsonb,
  timeout_ms integer NOT NULL DEFAULT 15000
    CHECK (timeout_ms BETWEEN 1000 AND 120000),
  max_retries integer NOT NULL DEFAULT 2
    CHECK (max_retries BETWEEN 0 AND 5),
  retry_backoff_ms integer NOT NULL DEFAULT 500,
  -- retries ONLY happen for idempotent targets
  idempotent boolean NOT NULL DEFAULT false,
  -- target key invoked as compensation (rollback) on terminal failure
  compensation_key text,
  enabled boolean NOT NULL DEFAULT true,
  risk_class text NOT NULL DEFAULT 'STANDARD'
    CHECK (risk_class IN ('STANDARD', 'ELEVATED', 'DETERMINISTIC')),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exec_target_shape CHECK (
    (kind = 'EDGE_FUNCTION' AND function_name IS NOT NULL)
    OR (kind = 'HTTP_API' AND endpoint IS NOT NULL)
  )
);

COMMENT ON TABLE public.frelux_archie_execution_targets IS
  'ARCHIE Execution & Runtime Engine — registry of authorized execution targets. Only enabled registered targets can run; production targets require the server-verified Owner Secret.';

-- ---------------------------------------------------------
-- 2. Run audit log (append-oriented; owner reads, engine writes)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_execution_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key text NOT NULL,
  environment text NOT NULL
    CHECK (environment IN ('SANDBOX', 'STAGING', 'PRODUCTION')),
  status text NOT NULL
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED',
                      'TIMEOUT', 'ROLLED_BACK', 'REJECTED')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  http_status integer,
  result_validated boolean,
  attempts integer NOT NULL DEFAULT 0,
  duration_ms integer,
  initiator_system text NOT NULL,
  initiated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  device_fingerprint text,
  authority_method text NOT NULL
    CHECK (authority_method IN ('JWT_ADMIN', 'JWT_ADMIN_OWNER_SECRET', 'SERVICE_ROLE', 'NONE')),
  compensation_run_id uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_runs_target
  ON public.frelux_archie_execution_runs (target_key, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_exec_runs_status
  ON public.frelux_archie_execution_runs (status, created_date DESC);

COMMENT ON TABLE public.frelux_archie_execution_runs IS
  'ARCHIE Execution & Runtime Engine — immutable audit trail of every execution attempt, with redacted inputs/results. Payloads are redacted by the engine before persistence.';

-- ---------------------------------------------------------
-- 3. RLS — owner-only. The engine acts through the service
--    role; humans only through admin (owner) sessions.
-- ---------------------------------------------------------
ALTER TABLE public.frelux_archie_execution_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_execution_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages execution targets" ON public.frelux_archie_execution_targets;
CREATE POLICY "owner manages execution targets"
  ON public.frelux_archie_execution_targets
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "owner audits execution runs" ON public.frelux_archie_execution_runs;
CREATE POLICY "owner audits execution runs"
  ON public.frelux_archie_execution_runs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE policies for runs: only the service role
--  (the engine itself) writes them — humans never falsify audit.)

-- ---------------------------------------------------------
-- 4. Seed REAL production targets (registered, not mocked)
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_execution_targets
  (key, label, description, kind, function_name, http_method,
   environment, requires_owner_secret, allowed_initiators,
   input_schema, result_schema, timeout_ms, max_retries,
   retry_backoff_ms, idempotent, risk_class)
VALUES
  -- SANDBOX: read-only health probe, safe for chat + any system
  ('health-check', 'Platform Health Check',
   'Invokes the health edge function — read-only platform health status (database, providers, payments).',
   'EDGE_FUNCTION', 'health', 'GET',
   'SANDBOX', false,
   '["ARCHIE_CHAT", "OWNER_PWA", "CODING_STUDIO", "FRELUX_APP", "AUTOMATION", "EXECUTION_ROLLBACK"]'::jsonb,
   '{}'::jsonb,
   '{"type": "object", "required": ["status"], "properties": {"status": {"type": "string"}}}'::jsonb,
   10000, 1, 500, true, 'STANDARD'),

  -- STAGING: ARCHIE status inspection (read-only)
  ('archie-status', 'ARCHIE Status Inspection',
   'Invokes the archie-status edge function — read-only ARCHIE system status snapshot.',
   'EDGE_FUNCTION', 'archie-status', 'GET',
   'STAGING', false,
   '["ARCHIE_CHAT", "OWNER_PWA", "CODING_STUDIO", "AUTOMATION"]'::jsonb,
   '{}'::jsonb,
   NULL,
   10000, 1, 500, true, 'STANDARD'),

  -- PRODUCTION: sitemap regeneration — Owner Secret required,
  -- deliberately NOT allowed from chat (dashboard/studio only)
  ('sitemap-regenerate', 'Sitemap Regeneration (Production)',
   'Invokes the sitemap edge function to regenerate the public sitemap — PRODUCTION action; requires the Owner Secret; never initiated from chat.',
   'EDGE_FUNCTION', 'sitemap', 'GET',
   'PRODUCTION', true,
   '["OWNER_PWA", "CODING_STUDIO", "AUTOMATION"]'::jsonb,
   '{}'::jsonb,
   NULL,
   60000, 1, 2000, true, 'ELEVATED')
ON CONFLICT (key) DO NOTHING;
