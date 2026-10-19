-- =========================================================
-- ARCHIE TREASURY LEDGER (batch 36, 2026-10-20)
-- =========================================================
-- Money-movement audit trail for the two-account trading
-- surface: deposits, withdrawals and swaps on both the DEMO
-- paper ledger and the LIVE venue account.
--
-- Written ONLY by the service role (archie-trading); the
-- owner reads. Every real-money movement (live withdrawal)
-- is recorded here BEFORE the venue call is even attempted,
-- and the venue's own response is attached after.
--
-- Authority model: identical to frelux_archie_trading_state.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_treasury_ledger (
  id text PRIMARY KEY,
  account text NOT NULL CHECK (account IN ('demo', 'live')),
  kind text NOT NULL CHECK (kind IN ('deposit', 'withdraw', 'swap')),
  asset text NOT NULL,
  amount numeric NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'requested' | 'completed' | 'refused' | 'failed'
  status text NOT NULL DEFAULT 'requested',
  venue_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_ledger_account
  ON public.frelux_archie_treasury_ledger (account, created_at DESC);

ALTER TABLE public.frelux_archie_treasury_ledger
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads treasury ledger"
  ON public.frelux_archie_treasury_ledger;
CREATE POLICY "owner reads treasury ledger"
  ON public.frelux_archie_treasury_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
