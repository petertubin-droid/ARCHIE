-- =========================================================
-- ARCHIE RECOVERY ENGINE — RECOVERY LEDGER
-- 20260912090000
--
-- Engine inventory #18 (anatomy "healing"): recovery as a
-- real engine, not just a state. This table is the
-- append-only audit ledger for every recovery decision:
--
--   run → classify → plan → one step (RETRY | COMPENSATE |
--   ESCALATE | CLOSE) → ledger event (this table)
--
-- Recovery NEVER bypasses authority: retries re-enter the
-- execution engine where every policy/admin/owner-secret gate
-- re-runs. Escalations additionally write a security event.
--
-- APPEND-ONLY for every role (service role included) —
-- recovery history can never be rewritten, matching the
-- constitution pattern.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_recovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES public.frelux_archie_execution_runs (id) ON DELETE SET NULL,
  target_key text NOT NULL,
  classification text NOT NULL
    CHECK (classification IN ('TRANSIENT', 'TIMEOUT', 'LOGIC', 'SCHEMA',
                              'AUTH', 'POLICY', 'COMPENSATED',
                              'NOT_RECOVERABLE')),
  action text NOT NULL
    CHECK (action IN ('RETRY', 'COMPENSATE', 'ESCALATE', 'CLOSE', 'NOOP')),
  outcome text NOT NULL
    CHECK (outcome IN ('RECOVERED', 'RETRY_FAILED', 'COMPENSATED',
                       'COMPENSATION_FAILED', 'ESCALATED', 'CLOSED',
                       'NOOP')),
  detail text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_run
  ON public.frelux_archie_recovery_events (run_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_events_target
  ON public.frelux_archie_recovery_events (target_key, created_date DESC);

COMMENT ON TABLE public.frelux_archie_recovery_events IS
  'ARCHIE Recovery Engine — append-only ledger of every failure classification, recovery plan step and outcome. Recovery re-enters the execution engine (all authority gates re-run); escalations are mirrored into frelux_security_events for owner attention.';

-- ---------------------------------------------------------
-- Append-only enforcement (every role, service included)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_recovery_ledger_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ARCHIE recovery ledger is append-only: UPDATE/DELETE is refused for every role. Recovery history is evidence.'
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recovery_ledger_immutable
  ON public.frelux_archie_recovery_events;
CREATE TRIGGER recovery_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.frelux_archie_recovery_events
  FOR EACH ROW EXECUTE FUNCTION public.archie_recovery_ledger_immutable();

-- ---------------------------------------------------------
-- RLS — owner reads, service role writes.
-- ---------------------------------------------------------
ALTER TABLE public.frelux_archie_recovery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads recovery events"
  ON public.frelux_archie_recovery_events;
CREATE POLICY "owner reads recovery events"
  ON public.frelux_archie_recovery_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated roles: the
-- recovery engine writes through the service role only.
