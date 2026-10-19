-- ============================================================================
-- ARCHIE MULTI-MARKET TRADING INTELLIGENCE & PERSISTENCE
-- Migration: 20261019200000_archie_multi_market_trading.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.archie_broker_connections (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  masked_account_id text NOT NULL,
  account_currency text NOT NULL DEFAULT 'USD',
  balance numeric NOT NULL DEFAULT 0,
  equity numeric NOT NULL DEFAULT 0,
  margin_available numeric NOT NULL DEFAULT 0,
  data_connectivity_status text NOT NULL DEFAULT 'DISCONNECTED',
  trading_permissions text NOT NULL DEFAULT 'READ_ONLY',
  mode text NOT NULL DEFAULT 'PAPER',
  latency_ms integer NOT NULL DEFAULT 0,
  supported_products text[] NOT NULL DEFAULT '{}',
  disclaimers text[] NOT NULL DEFAULT '{}',
  last_sync_date timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_broker_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read archie broker connections"
  ON public.archie_broker_connections
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.archie_dynamic_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id text,
  symbol text NOT NULL,
  side text NOT NULL,
  entry_price numeric NOT NULL,
  current_price numeric NOT NULL,
  initial_stop_price numeric NOT NULL,
  current_stop_price numeric NOT NULL,
  recommended_stop_price numeric NOT NULL,
  break_even_triggered boolean NOT NULL DEFAULT false,
  trailing_mode text NOT NULL DEFAULT 'ATR_VOLATILITY',
  last_evaluated_date timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_dynamic_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read archie dynamic stops"
  ON public.archie_dynamic_stops
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.archie_trade_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  category text NOT NULL,
  action text NOT NULL,
  confidence numeric NOT NULL,
  regime text NOT NULL,
  horizon text NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric NOT NULL,
  risk_reward_ratio numeric NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_trade_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read archie trade signals"
  ON public.archie_trade_signals
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.archie_prediction_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid REFERENCES public.archie_trade_signals(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  forecast_direction text NOT NULL,
  predicted_prob numeric NOT NULL,
  actual_outcome text,
  brier_score numeric,
  calibration_bucket text,
  evaluated_date timestamptz,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_prediction_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read archie prediction ledger"
  ON public.archie_prediction_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
