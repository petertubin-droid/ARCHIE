-- =========================================================
-- FIX 26 (remediation batch 9, Level 6 security-layer audit,
-- 2026-09-13): frelux_security_events is a split-brain.
--
-- PROBLEM: the table defines `kind`, but three writers insert
-- `event_type` — archie-execute's securityEvent(), archie-
-- chat's recordSecurityEvent(), and the cognitive integrity
-- engine's audit_chain_compromised. PostgREST rejects every
-- such insert (PGRST204) and all three swallow the error, so:
--   * execution security events (non-admin attempts, invalid
--     owner-secret guesses) were NEVER recorded;
--   * the audit-chain-compromise critical — the one event the
--     whole tamper-evidence system exists to raise — was
--     NEVER recorded;
--   * the batch-8 owner-secret throttle (fix 24) counted a
--     nonexistent column, failed open, and never tripped.
-- The chain-compromise row additionally omits user_id, which
-- was NOT NULL — so system-level events could never persist.
--
-- FIX: writers now use `kind` (this migration's ALTER makes
-- user_id nullable so SYSTEM events — chain compromise,
-- degraded audit — can persist without impersonating a user).
-- User-attributed events keep their user_id; consumers should
-- treat NULL user_id as "the system itself".
-- =========================================================

ALTER TABLE public.frelux_security_events
  ALTER COLUMN user_id DROP NOT NULL;

-- Self-verification: user_id must now be nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frelux_security_events'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION '20260913030000 failed: frelux_security_events.user_id is still NOT NULL';
  ELSE
    RAISE NOTICE 'frelux_security_events.user_id is now nullable — SYSTEM events can persist';
  END IF;
END $$;
