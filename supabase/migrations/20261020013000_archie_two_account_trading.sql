-- =========================================================
-- ARCHIE TWO-ACCOUNT TRADING (batch 35, Oct 20, 2026)
--
-- The owner's directive: a dedicated premium trading surface
-- with TWO accounts --
--   * DEMO (paper): test ARCHIE's market intelligence with
--     simulated execution against REAL daily prices. Risk-free.
--   * LIVE: real trades through the audited venue adapter path.
--
-- This migration adds the durable account layer:
--   1. frelux_archie_trading_accounts -- per-account ledger
--      (demo balance is a real simulated ledger; live balance
--      is informational -- the venue owns the real balance).
--      SAFE DEFAULTS: BOTH accounts start with trading
--      DISABLED and the emergency stop ENGAGED.
--   2. frelux_archie_trading_positions.account -- every
--      position is tagged demo or live (existing rows default
--      to 'demo': the paper ledger they were opened under).
--   3. frelux_archie_trade_analyses -- ARCHIE's own market
--      intelligence output: deterministic daily-bar analysis
--      with walk-forward validation (samples, hit rate, Brier),
--      persisted for auditability. Written by the service role
--      only; a human cannot fabricate an ARCHIE analysis.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Trading accounts (two-row ledger, safe defaults)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_trading_accounts (
  id text PRIMARY KEY, -- 'demo' | 'live'
  type text NOT NULL CHECK (type IN ('demo', 'live')),
  label text NOT NULL,
  -- Simulated cash ledger (demo). For live this is
  -- informational only -- the venue owns the real balance.
  balance_quote numeric NOT NULL DEFAULT 0,
  starting_balance_quote numeric NOT NULL DEFAULT 50000,
  currency text NOT NULL DEFAULT 'USD',
  -- SAFE DEFAULTS: disabled + stop engaged per account.
  trading_enabled boolean NOT NULL DEFAULT false,
  emergency_stop boolean NOT NULL DEFAULT true,
  -- Demo: 'PAPER_SIMULATION'. Live: venue mode (TESTNET/MAINNET).
  venue_mode text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.frelux_archie_trading_accounts
  (id, type, label, balance_quote, starting_balance_quote, venue_mode)
VALUES
  ('demo', 'demo', 'ARCHIE Demo', 50000, 50000, 'PAPER_SIMULATION'),
  ('live', 'live', 'ARCHIE Live', 0, 0, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.frelux_archie_trading_accounts
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads trading accounts"
  ON public.frelux_archie_trading_accounts;
CREATE POLICY "owner reads trading accounts"
  ON public.frelux_archie_trading_accounts
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE/DELETE for humans: only the service role
--  -- the archie-trading function -- writes the ledger.)

-- ---------------------------------------------------------
-- 2. Positions are tagged with their account
-- ---------------------------------------------------------
ALTER TABLE public.frelux_archie_trading_positions
  ADD COLUMN IF NOT EXISTS account text NOT NULL DEFAULT 'demo'
  CHECK (account IN ('demo', 'live'));

CREATE INDEX IF NOT EXISTS idx_trading_positions_account
  ON public.frelux_archie_trading_positions (account, opened_at_ms DESC);

-- ---------------------------------------------------------
-- 3. ARCHIE trade analyses (market intelligence, auditable)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_trade_analyses (
  id text PRIMARY KEY,
  symbol text NOT NULL,
  account text NOT NULL DEFAULT 'demo'
    CHECK (account IN ('demo', 'live')),
  direction text NOT NULL CHECK (direction IN ('long', 'short', 'stand-aside')),
  entry_price numeric NOT NULL,
  stop_price numeric,
  target_price numeric,
  probability double precision NOT NULL,
  calibrated_probability double precision NOT NULL,
  confidence double precision NOT NULL,
  -- Deterministic indicator snapshot the analysis ran on.
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Walk-forward validation block (gate-compatible).
  backtest jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning jsonb NOT NULL DEFAULT '[]'::jsonb,
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- 'eligible' | 'withheld' (model below the gate bar).
  verdict text NOT NULL DEFAULT 'withheld',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_analyses_symbol
  ON public.frelux_archie_trade_analyses (symbol, created_at DESC);

ALTER TABLE public.frelux_archie_trade_analyses
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads trade analyses"
  ON public.frelux_archie_trade_analyses;
CREATE POLICY "owner reads trade analyses"
  ON public.frelux_archie_trade_analyses
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (Service role only writes analyses -- they are ARCHIE's own
--  output, never human-fabricated.)
