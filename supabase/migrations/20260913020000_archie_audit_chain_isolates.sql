-- =========================================================
-- FIX 23 (remediation batch 8, Level 5 execution audit,
-- 2026-09-13): per-isolate audit chains.
--
-- PROBLEM: frelux_archie_audit_log used seq as the PRIMARY
-- KEY, but seq is a PER-ISOLATE counter. Two concurrent edge
-- isolates each chain from genesis and both write seq 1..N —
-- the upsert on seq makes them OVERWRITE each other's rows
-- (silent audit-event loss), and the interleaved survivors
-- break verifyChain on the next hydrate, firing a FALSE
-- "audit_chain_compromised" critical event.
--
-- FIX: partition the log by chain_id. Every kernel instance
-- owns a unique chain (crypto.randomUUID at construction);
-- (chain_id, seq) is the primary key, so isolates never
-- collide. Hydrate verifies every persisted chain
-- independently — a break inside any single chain is the
-- only thing that raises a compromise event. The hash
-- material is UNCHANGED, so legacy rows verify as before.
-- Existing rows are backfilled as the 'legacy' chain.
-- =========================================================

ALTER TABLE public.frelux_archie_audit_log
  ADD COLUMN IF NOT EXISTS chain_id text;

UPDATE public.frelux_archie_audit_log
  SET chain_id = 'legacy'
  WHERE chain_id IS NULL;

ALTER TABLE public.frelux_archie_audit_log
  ALTER COLUMN chain_id SET NOT NULL;

ALTER TABLE public.frelux_archie_audit_log
  DROP CONSTRAINT IF EXISTS frelux_archie_audit_log_pkey;

ALTER TABLE public.frelux_archie_audit_log
  ADD CONSTRAINT frelux_archie_audit_log_pkey
  PRIMARY KEY (chain_id, seq);

CREATE INDEX IF NOT EXISTS idx_archie_audit_log_chain
  ON public.frelux_archie_audit_log (chain_id, seq);

-- Self-verification: the new composite PK must exist and no
-- row may lack a chain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'frelux_archie_audit_log_pkey'
      AND table_name = 'frelux_archie_audit_log'
  ) THEN
    RAISE NOTICE 'audit chain partitioning verified: PK (chain_id, seq) in place';
  ELSE
    RAISE EXCEPTION '20260913020000 failed: composite PK missing on frelux_archie_audit_log';
  END IF;
END $$;
