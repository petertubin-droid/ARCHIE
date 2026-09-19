-- =========================================================
-- FRELUX PHASE 8 P5 — ARCHIE CRYPTO INTELLIGENCE, FOUNDATIONAL
-- ENGINEERING KNOWLEDGE, INTERNAL AGENT ORCHESTRATION &
-- INFRASTRUCTURE COST GOVERNANCE
--
-- Builds ON Phase 8 (never replaces it): new domains flow into
-- the same frelux_archie_domains registry; agent and cost tables
-- follow the same admin-RLS + append-only audit patterns.
--
-- CRITICAL STRUCTURAL RULE (§4/§5 of the P5 contract):
--   Internal ARCHIE operations and Owner operations are
--   recorded on frelux_infrastructure_costs. Customer
--   operations are recorded on the customer ledgers. The two
--   can never mix:
--     * frelux_api_usage gains operation_class with a CHECK
--       limited to CUSTOMER classes — an internal ARCHIE
--       operation can never be metered as customer usage.
--     * credit_transactions gains a trigger that rejects any
--       row attributed to an internal ARCHIE agent — internal
--       agents can never mint or spend customer credits.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Operation classification (server-side source of truth)
-- ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.frelux_operation_class AS ENUM (
    'INTERNAL_ARCHIE_OPERATION',
    'OWNER_OPERATION',
    'SUBSCRIBER_OPERATION',
    'PUBLIC_USER_OPERATION',
    'API_CUSTOMER_OPERATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Customer metering can only ever carry customer classes.
ALTER TABLE public.frelux_api_usage
  ADD COLUMN IF NOT EXISTS operation_class public.frelux_operation_class
  NOT NULL DEFAULT 'API_CUSTOMER_OPERATION';

DO $$ BEGIN
  ALTER TABLE public.frelux_api_usage
    ADD CONSTRAINT frelux_api_usage_customer_only
    CHECK (operation_class IN (
      'SUBSCRIBER_OPERATION', 'PUBLIC_USER_OPERATION', 'API_CUSTOMER_OPERATION'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
   WHEN undefined_column THEN NULL; END $$;

-- Internal ARCHIE agents can never mint or spend customer credits.
CREATE OR REPLACE FUNCTION public.frelux_guard_credit_ledger_internal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.metadata->>'operation_class' = 'INTERNAL_ARCHIE_OPERATION'
     OR NEW.metadata->>'archie_internal_agent_id' IS NOT NULL THEN
    RAISE EXCEPTION
      'FRELUX cost governance: internal ARCHIE agent activity can never write customer credit transactions. Internal provider costs are recorded on public.frelux_infrastructure_costs.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS frelux_credit_ledger_internal_guard
  ON public.credit_transactions;
CREATE TRIGGER frelux_credit_ledger_internal_guard
  BEFORE INSERT ON public.credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.frelux_guard_credit_ledger_internal();

-- ---------------------------------------------------------
-- 2. Owner-only Crypto & Digital Asset Intelligence domain
--    RLS: admin only. No public read. Never mixed into
--    customer knowledge unless governance expands it.
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.frelux_archie_crypto_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,           -- e.g. BTC
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'coin'
    CHECK (asset_type IN ('coin', 'token', 'stablecoin', 'other')),
  provider_ref text,                     -- e.g. coingecko id
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.frelux_archie_crypto_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_symbol text NOT NULL
    REFERENCES public.frelux_archie_crypto_assets(symbol) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,                  -- provenance: e.g. coingecko:public
  price_usd numeric,
  market_cap_usd numeric,
  volume_24h_usd numeric,
  liquidity_note text,
  volatility_24h_pct numeric,
  change_24h_pct numeric,
  raw jsonb NOT NULL DEFAULT '{}',       -- raw observed payload (no secrets)
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_crypto_obs_symbol_time
  ON public.frelux_archie_crypto_observations (asset_symbol, observed_at DESC);

-- Classified analysis: LIVE_MARKET_DATA / OBSERVED_INFORMATION /
-- ANALYSIS / RISK_ASSESSMENT / RECOMMENDATION / PREDICTION.
-- RECOMMENDATION/PREDICTION MUST carry the mandatory disclaimer.
CREATE TABLE IF NOT EXISTS public.frelux_archie_crypto_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_symbol text NOT NULL,
  classification text NOT NULL CHECK (classification IN (
    'LIVE_MARKET_DATA', 'OBSERVED_INFORMATION', 'ANALYSIS',
    'RISK_ASSESSMENT', 'RECOMMENDATION', 'PREDICTION'
  )),
  statement text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]',
  cited_sources text[] NOT NULL DEFAULT '{}',
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  disclaimer_present boolean NOT NULL DEFAULT false,
  requested_action text,                 -- NULL unless the request named one (guarded)
  provenance jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_crypto_analysis_asset
  ON public.frelux_archie_crypto_analysis (asset_symbol, created_date DESC);

-- Owner-recorded holdings. NON-CUSTODIAL: ARCHIE never holds,
-- moves or can move funds; this is a research notebook only.
CREATE TABLE IF NOT EXISTS public.frelux_archie_crypto_portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  asset_symbol text NOT NULL
    REFERENCES public.frelux_archie_crypto_assets(symbol) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  note text,
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, asset_symbol)
);

ALTER TABLE public.frelux_archie_crypto_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crypto assets" ON public.frelux_archie_crypto_assets;
CREATE POLICY "admins manage crypto assets" ON public.frelux_archie_crypto_assets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.frelux_archie_crypto_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crypto observations" ON public.frelux_archie_crypto_observations;
CREATE POLICY "admins manage crypto observations" ON public.frelux_archie_crypto_observations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.frelux_archie_crypto_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crypto analysis" ON public.frelux_archie_crypto_analysis;
CREATE POLICY "admins manage crypto analysis" ON public.frelux_archie_crypto_analysis
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.frelux_archie_crypto_portfolio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crypto portfolio" ON public.frelux_archie_crypto_portfolio;
CREATE POLICY "admins manage crypto portfolio" ON public.frelux_archie_crypto_portfolio
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed a few legitimate assets (registry data, extendable).
INSERT INTO public.frelux_archie_crypto_assets (symbol, name, asset_type, provider_ref) VALUES
  ('BTC', 'Bitcoin', 'coin', 'bitcoin'),
  ('ETH', 'Ethereum', 'coin', 'ethereum'),
  ('USDT', 'Tether USD', 'stablecoin', 'tether')
ON CONFLICT (symbol) DO NOTHING;

-- ---------------------------------------------------------
-- 3. Internal agent orchestration (lifecycle + append-only audit)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.frelux_archie_internal_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED', 'AUTHORIZED', 'ASSIGNED', 'EXECUTING',
    'MONITORING', 'REPORTING', 'TERMINATED', 'FAILED'
  )),
  task text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]',
  estimated_cost_cents integer NOT NULL DEFAULT 0,
  actual_cost_cents integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_agents_status
  ON public.frelux_archie_internal_agents (status, created_date DESC);

CREATE TABLE IF NOT EXISTS public.frelux_archie_agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL
    REFERENCES public.frelux_archie_internal_agents(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN (
    'CREATE', 'AUTHORIZE', 'ASSIGN', 'EXECUTE',
    'MONITOR', 'REPORT', 'TERMINATE', 'FAIL', 'COST'
  )),
  detail jsonb NOT NULL DEFAULT '{}',
  actor uuid NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_agent_events_agent
  ON public.frelux_archie_agent_events (agent_id, created_date DESC);

ALTER TABLE public.frelux_archie_internal_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage internal agents" ON public.frelux_archie_internal_agents;
CREATE POLICY "admins manage internal agents" ON public.frelux_archie_internal_agents
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.frelux_archie_agent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read agent events" ON public.frelux_archie_agent_events;
CREATE POLICY "admins read agent events" ON public.frelux_archie_agent_events
  FOR SELECT USING (public.is_admin());
-- events are append-only for admins: insert allowed, update/delete denied.
DROP POLICY IF EXISTS "admins append agent events" ON public.frelux_archie_agent_events;
CREATE POLICY "admins append agent events" ON public.frelux_archie_agent_events
  FOR INSERT WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 4. Infrastructure cost ledger + budget controls
--    These are FRELUX infrastructure costs. They are disjoint
--    from customer credits/quotas by structure (see §1) and by
--    RLS: nobody can write either table from the client.
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.frelux_infrastructure_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_class public.frelux_operation_class NOT NULL
    CHECK (operation_class IN ('INTERNAL_ARCHIE_OPERATION', 'OWNER_OPERATION')),
  provider text NOT NULL,
  operation text NOT NULL,
  agent_id uuid REFERENCES public.frelux_archie_internal_agents(id)
    ON DELETE SET NULL,
  cost_estimate_cents integer NOT NULL DEFAULT 0,
  cost_actual_cents integer NOT NULL DEFAULT 0,
  usage_meta jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_infra_costs_month
  ON public.frelux_infrastructure_costs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_infra_costs_provider
  ON public.frelux_infrastructure_costs (provider, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.frelux_infrastructure_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,                -- provider name or '*' for global
  monthly_budget_cents integer NOT NULL CHECK (monthly_budget_cents > 0),
  concurrency_limit integer NOT NULL DEFAULT 8
    CHECK (concurrency_limit >= 0),
  rate_limit_per_minute integer NOT NULL DEFAULT 60
    CHECK (rate_limit_per_minute >= 0),
  emergency_threshold_pct integer NOT NULL DEFAULT 90
    CHECK (emergency_threshold_pct > 0 AND emergency_threshold_pct <= 100),
  exhaustion_policy text NOT NULL DEFAULT 'QUEUE'
    CHECK (exhaustion_policy IN ('QUEUE', 'REDUCE', 'CONSOLIDATE', 'STOP')),
  active boolean NOT NULL DEFAULT true,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

ALTER TABLE public.frelux_infrastructure_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read infra costs" ON public.frelux_infrastructure_costs;
CREATE POLICY "admins read infra costs" ON public.frelux_infrastructure_costs
  FOR SELECT USING (public.is_admin());
-- No client INSERT/UPDATE/DELETE policy at all: writes are
-- service-role (edge functions) only. ARCHIE internal spend
-- can never be forged, hidden or deleted from the client.

ALTER TABLE public.frelux_infrastructure_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage infra budgets" ON public.frelux_infrastructure_budgets;
CREATE POLICY "admins manage infra budgets" ON public.frelux_infrastructure_budgets
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Conservative default global budget until the Owner configures one.
INSERT INTO public.frelux_infrastructure_budgets
  (provider, monthly_budget_cents, concurrency_limit, rate_limit_per_minute,
   emergency_threshold_pct, exhaustion_policy)
VALUES ('*', 10000, 8, 60, 90, 'QUEUE')
ON CONFLICT (provider) DO NOTHING;

-- ---------------------------------------------------------
-- 5. Register the new ARCHIE domains (same registry, no ceiling)
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_domains (key, label, is_core, risk_class, description) VALUES
  ('crypto_intelligence', 'Crypto & Digital Asset Intelligence', false, 'STANDARD',
   'OWNER-ONLY domain: legitimate crypto/digital-asset research, market data, analysis, risk assessment and clearly-labeled predictions. ARCHIE never executes financial actions. Data is owner-private, never customer knowledge.'),
  ('engineering_foundations', 'Engineering Foundations (Base44-taught)', false, 'STANDARD',
   'Foundational engineering knowledge package (React, TypeScript, Vite, Supabase, Postgres, PWA, testing, CI/CD, security…) learned from authorized Base44/FRELUX sources with full provenance. Extensible to any legitimate technology.')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.frelux_archie_crypto_assets IS
  'Phase 8 P5: ARCHIE owner-only crypto asset registry. RLS admin-only; crypto intelligence is owner-private and never mixed into customer knowledge without explicit governance.';
COMMENT ON TABLE public.frelux_archie_crypto_analysis IS
  'Phase 8 P5: classified crypto analysis records. PREDICTION/RECOMMENDATION rows must carry the mandatory disclaimer; guaranteed-profit language is rejected at the edge function before insert.';
COMMENT ON TABLE public.frelux_archie_internal_agents IS
  'Phase 8 P5: ARCHIE internal agent registry with enforced lifecycle CREATE→AUTHORIZE→ASSIGN→EXECUTE→MONITOR→REPORT→TERMINATE. No arbitrary ceiling on agent count; real budget/concurrency limits enforced via frelux_infrastructure_budgets.';
COMMENT ON TABLE public.frelux_infrastructure_costs IS
  'Phase 8 P5: FRELUX infrastructure cost ledger for internal ARCHIE agent external API usage. Service-role written only, admin readable. NEVER consumes user/subscriber/API-customer credits: enforcement is structural (see trigger frelux_credit_ledger_internal_guard and frelux_api_usage_customer_only).';
