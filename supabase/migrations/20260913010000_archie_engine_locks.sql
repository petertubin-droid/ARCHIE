-- =========================================================
-- ARCHIE ENGINE LOCKS (remediation batch 4, 2026-09-13)
-- Single-writer mutual exclusion for consolidation passes.
--
-- Pooled-connection-safe by design: session-level advisory
-- locks are unreliable through PostgREST's connection pool,
-- so writers claim a row keyed by scope instead. Claims are
-- crash-safe — an expired claim is stolen on the next attempt,
-- so a crashed writer can never deadlock the system.
-- RLS: enabled with NO policies — service-role only.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_engine_locks (
  scope text PRIMARY KEY,
  holder text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_engine_locks ENABLE ROW LEVEL SECURITY;

-- Claim: succeeds on fresh insert OR by stealing an EXPIRED
-- claim. Returns false when a live claim is held by anyone.
CREATE OR REPLACE FUNCTION public.frelux_try_engine_lock(
  p_scope text,
  p_holder text,
  p_ttl_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v boolean;
BEGIN
  INSERT INTO frelux_archie_engine_locks (scope, holder, expires_at)
  VALUES (p_scope, p_holder, now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (scope) DO UPDATE
    SET holder = p_holder,
        expires_at = now() + make_interval(secs => p_ttl_seconds)
    WHERE frelux_archie_engine_locks.expires_at < now()
  RETURNING true INTO v;
  RETURN COALESCE(v, false);
END;
$$;

-- Release: only the CURRENT holder can release (a stolen
-- claim belongs to its thief). Idempotent.
CREATE OR REPLACE FUNCTION public.frelux_release_engine_lock(
  p_scope text,
  p_holder text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM frelux_archie_engine_locks
  WHERE scope = p_scope AND holder = p_holder;
END;
$$;

-- Self-verification (loud, per repo convention):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'frelux_archie_engine_locks'
  ) THEN
    RAISE EXCEPTION 'frelux_archie_engine_locks: table missing after create';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
    WHERE proname = 'frelux_try_engine_lock'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'frelux_try_engine_lock: function missing after create';
  END IF;
END;
$$;
