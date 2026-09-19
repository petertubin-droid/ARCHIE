-- =========================================================
-- ARCHIE TRADING SURFACE (batch 20, fixes 64-69, 2026-09-15)
-- =========================================================
-- The trading engines (trade-gate, exchange execution,
-- order lifecycle, portfolio) exist in the shared native
-- engine with full test coverage, but had NO operator
-- surface: no HTTP entrypoint, no persistence, no screens.
--
-- This migration adds the durable state layer:
--   1. frelux_archie_trading_state -- single-row owner
--      trading configuration. SAFE DEFAULTS: trading is
--      DISABLED and the EMERGENCY STOP IS ENGAGED until the
--      owner explicitly enables it. No table default can
--      ever make a trade possible -- the trade-gate still
--      enforces every check on every request.
--   2. frelux_archie_trading_positions -- durable positions
--      opened through the audited execution path. Written
--      ONLY by the service role (archie-trading); the owner
--      reads. A human can never forge a position record.
--
-- Authority model: identical to archie-agent-execution --
-- owner reads via is_admin(), service role writes.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Owner trading state (single row, safe defaults)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_trading_state (
  id text PRIMARY KEY DEFAULT 'owner',
  -- SAFE DEFAULT: stop engaged -- nothing may execute until
  -- the owner explicitly disengages it through the console.
  emergency_stop boolean NOT NULL DEFAULT true,
  -- SAFE DEFAULT: trading disabled until the owner enables.
  trading_enabled boolean NOT NULL DEFAULT false,
  -- TradingLimits JSON (trade-gate.ts DEFAULT_TRADING_LIMITS
  -- when absent).
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_trading_state
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads trading state"
  ON public.frelux_archie_trading_state;
CREATE POLICY "owner reads trading state"
  ON public.frelux_archie_trading_state
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE policies for humans: only the service
--  role -- the archie-trading function -- writes state.)

-- ---------------------------------------------------------
-- 2. Durable positions from the audited execution path
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_trading_positions (
  id text PRIMARY KEY, -- Position.id from the lifecycle engine
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric NOT NULL,
  stop_price numeric NOT NULL,
  target_price numeric NOT NULL,
  position_size_quote numeric NOT NULL,
  portfolio_value_quote numeric NOT NULL,
  opened_at_ms bigint NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'CLOSED')),
  status text NOT NULL DEFAULT 'PENDING',
  exit_price numeric,
  closed_at_ms bigint,
  realized_pnl_quote numeric,
  realized_pnl_pct numeric,
  fees_paid_quote numeric NOT NULL DEFAULT 0,
  -- Full gate decision (every check + honest details).
  gate_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Execution event stream (id + atMs + detail).
  execution_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- REDACTED venue detail: fill price/qty/order id only.
  -- Raw venue responses are NOT persisted here.
  venue_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_positions_opened
  ON public.frelux_archie_trading_positions (opened_at_ms DESC);

ALTER TABLE public.frelux_archie_trading_positions
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads trading positions"
  ON public.frelux_archie_trading_positions;
CREATE POLICY "owner reads trading positions"
  ON public.frelux_archie_trading_positions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- (No INSERT/UPDATE/DELETE policies for humans: only the
--  service role writes positions through the execution
--  engine. A human cannot fabricate trading history.)
