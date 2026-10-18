-- ============================================================================
-- ARCHIE ADVANCED MARKET INTELLIGENCE AND CANDLE READING ENGINE SCHEMA
-- Migration: 20261018210000_archie_market_intelligence.sql
--
-- Persistent storage for multi-market intelligence, validated candles,
-- immutable prediction logs, verified outcomes, model registry, audit trails,
-- and administrative configuration.
-- Strict RLS enabled on all tables. Service role writes; read-only for verified users.
-- Immutable triggers prevent deletion or tampering of historical predictions & audit logs.
-- ============================================================================

-- 1. Financial Instrument Registry
CREATE TABLE IF NOT EXISTS public.market_instruments (
  symbol text PRIMARY KEY,
  canonical_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('FOREX', 'CRYPTO', 'STOCKS', 'INDICES')),
  base_asset text NOT NULL,
  quote_asset text NOT NULL,
  tick_size numeric NOT NULL DEFAULT 0.01,
  contract_or_lot_size numeric NOT NULL DEFAULT 1.0,
  min_volume numeric NOT NULL DEFAULT 0.001,
  max_leverage integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_instruments_category ON public.market_instruments (category, is_active);
ALTER TABLE public.market_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_instruments"
  ON public.market_instruments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_instruments"
  ON public.market_instruments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Validated Candlestick Cache
CREATE TABLE IF NOT EXISTS public.market_candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL REFERENCES public.market_instruments(symbol) ON DELETE CASCADE,
  interval text NOT NULL,
  open_time_ms bigint NOT NULL,
  close_time_ms bigint NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  is_finalized boolean NOT NULL DEFAULT true,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_market_candles_symbol_interval_open UNIQUE (symbol, interval, open_time_ms)
);

CREATE INDEX IF NOT EXISTS idx_market_candles_lookup 
  ON public.market_candles (symbol, interval, open_time_ms DESC);
ALTER TABLE public.market_candles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_candles"
  ON public.market_candles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_candles"
  ON public.market_candles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Immutable Analytical Predictions
CREATE TABLE IF NOT EXISTS public.market_predictions (
  id text PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  symbol text NOT NULL REFERENCES public.market_instruments(symbol),
  category text NOT NULL,
  timeframe text NOT NULL,
  latest_eligible_candle_ms bigint NOT NULL,
  prob_bullish numeric NOT NULL,
  prob_bearish numeric NOT NULL,
  prob_neutral numeric NOT NULL,
  target_price numeric,
  stop_loss_price numeric,
  invalidation_price numeric,
  horizon_candles integer NOT NULL DEFAULT 5,
  market_regime text NOT NULL,
  model_version text NOT NULL,
  rule_version text NOT NULL,
  status text NOT NULL DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED', 'RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_predictions_status
  ON public.market_predictions (status, symbol, created_at DESC);
ALTER TABLE public.market_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_predictions"
  ON public.market_predictions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_predictions"
  ON public.market_predictions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Immutability enforcement trigger for market_predictions
CREATE OR REPLACE FUNCTION prevent_market_predictions_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Immutability violation: market_predictions records cannot be deleted.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Immutability violation: RESOLVED market_predictions cannot be modified.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_market_predictions_immutability
  BEFORE UPDATE OR DELETE ON public.market_predictions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_market_predictions_mutation();

-- 4. Verified Prediction Outcomes
CREATE TABLE IF NOT EXISTS public.market_prediction_outcomes (
  prediction_id text PRIMARY KEY REFERENCES public.market_predictions(id) ON DELETE CASCADE,
  resolved_timestamp timestamptz NOT NULL DEFAULT now(),
  resolution_status text NOT NULL CHECK (resolution_status IN ('HIT_TARGET', 'HIT_STOP_LOSS', 'HORIZON_EXPIRY', 'INVALIDATED', 'AMBIGUOUS_COLLISION')),
  candles_held integer NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric NOT NULL,
  realized_return_pct numeric NOT NULL,
  directional_correctness boolean NOT NULL,
  brier_score numeric NOT NULL,
  log_loss numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_prediction_outcomes_correctness
  ON public.market_prediction_outcomes (directional_correctness, resolved_timestamp DESC);
ALTER TABLE public.market_prediction_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_prediction_outcomes"
  ON public.market_prediction_outcomes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_prediction_outcomes"
  ON public.market_prediction_outcomes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Model Registry & Version Artifacts
CREATE TABLE IF NOT EXISTS public.market_model_registry (
  version text PRIMARY KEY,
  id text NOT NULL UNIQUE,
  name text NOT NULL,
  architecture text NOT NULL,
  weights jsonb NOT NULL,
  feature_schema_version text NOT NULL,
  training_window jsonb NOT NULL,
  evaluation_metrics jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('CANDIDATE', 'APPROVED', 'PROMOTED', 'DEPRECATED', 'ROLLED_BACK')),
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  promoted_by text,
  change_notes text
);

ALTER TABLE public.market_model_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_model_registry"
  ON public.market_model_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_model_registry"
  ON public.market_model_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Structured Market Audit Logs
CREATE TABLE IF NOT EXISTS public.market_audit_logs (
  id text PRIMARY KEY,
  timestamp timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  actor text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  payload_sanitized jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_audit_logs_event_time
  ON public.market_audit_logs (event_type, timestamp DESC);
ALTER TABLE public.market_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_audit_logs"
  ON public.market_audit_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_audit_logs"
  ON public.market_audit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Immutability enforcement trigger for audit logs (append-only)
CREATE OR REPLACE FUNCTION prevent_market_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Immutability violation: market_audit_logs entries are append-only and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_market_audit_logs_immutability
  BEFORE UPDATE OR DELETE ON public.market_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_market_audit_logs_mutation();

-- 7. Owner-Controlled Configuration
CREATE TABLE IF NOT EXISTS public.market_admin_config (
  version integer PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  authorized_providers jsonb NOT NULL,
  enabled_categories jsonb NOT NULL,
  supported_symbols jsonb NOT NULL,
  max_risk_per_trade_pct numeric NOT NULL DEFAULT 0.01,
  min_confidence_directional numeric NOT NULL DEFAULT 0.60,
  max_leverage_ceiling integer NOT NULL DEFAULT 10,
  live_order_execution_enabled boolean NOT NULL DEFAULT false,
  auto_model_promotion_allowed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.market_admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on market_admin_config"
  ON public.market_admin_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role full access on market_admin_config"
  ON public.market_admin_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
