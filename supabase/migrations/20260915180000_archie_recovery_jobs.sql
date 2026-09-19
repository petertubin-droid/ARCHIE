-- =========================================================
-- ARCHIE WALLET RECOVERY JOB LEDGER (batch 21, fix 70)
-- 2026-09-15
-- =========================================================
-- Durable AUDIT ledger for abandoned-wallet passphrase
-- recovery jobs (engine: native-engine/crypto/
-- passphrase-recovery.ts, owner directive 2026-09-11).
--
-- THE SECURITY CONTRACT (mirrored from the engine):
--   * PRIVATE KEYS, SEEDS, MNEMONICS AND PASSPHRASES ARE
--     NEVER PERSISTED. This table stores job ACCOUNTING
--     ONLY: what shape of job ran, how many attempts, and
--     whether a checksum-valid candidate matched on-chain
--     activity (public addresses).
--   * The owner receives the full result of their own job
--     in the HTTP response; the durable record stores only
--     the auditable, non-secret summary.
--   * Written ONLY by the service role (archie-wallet-
--     recovery); the owner reads. ARCHIE cannot forge a job
--     record, and a human cannot fabricate recovery
--     history.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Job shape (NON-SECRET accounting only)
  slots integer NOT NULL,
  blanks integer NOT NULL,
  candidate_pool integer NOT NULL,
  passphrase_count integer NOT NULL,
  accounts integer NOT NULL,
  addresses_per_account integer NOT NULL,
  chains jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Attempt accounting from the engine
  attempts jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Outcome (no candidate content)
  found boolean NOT NULL DEFAULT false,
  -- Public addresses with activity only -- never mnemonics
  matched_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_jobs_opened
  ON public.frelux_archie_recovery_jobs (opened_at DESC);

ALTER TABLE public.frelux_archie_recovery_jobs
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads recovery jobs"
  ON public.frelux_archie_recovery_jobs;
CREATE POLICY "owner reads recovery jobs"
  ON public.frelux_archie_recovery_jobs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE policies for humans: only the service
--  role -- the archie-wallet-recovery function -- writes.)
