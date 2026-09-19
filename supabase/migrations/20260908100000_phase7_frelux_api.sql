-- =========================================================
-- FRELUX PHASE 7 — OFFICIAL FRELUX AI API
-- API keys, usage metering, and configurable plans.
--
-- Identity: FRELUX is the API provider. Raw keys are NEVER
-- stored — only a SHA-256 hash plus a display prefix. RLS is
-- owner-only: a user can only see/manage their own keys;
-- admins may view metadata and revoke/disable compromised
-- keys but can never read the secret (it is not there).
-- =========================================================

-- ---------------------------------------------------------
-- API KEYS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  -- Display prefix only (e.g. 'FLX-A7k9…'). Never the raw key.
  key_prefix text NOT NULL CHECK (key_prefix LIKE 'FLX-%'),
  -- SHA-256 hex of the full raw key. UNIQUE prevents duplicates.
  key_hash text NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','disabled','expired')),
  -- Capability allow-list. '*' = all generally-available capabilities.
  permissions jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  plan_key text NOT NULL DEFAULT 'free',
  -- Quota configuration (admin/owner editable; plan defaults applied at creation)
  rate_limit_per_minute int NOT NULL DEFAULT 30,
  daily_quota int NOT NULL DEFAULT 100,
  monthly_quota int NOT NULL DEFAULT 2500,
  expires_at timestamptz,
  last_used_at timestamptz,
  request_count bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_api_keys_owner
  ON public.frelux_api_keys (created_by, created_at DESC);

ALTER TABLE public.frelux_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frelux_api_keys_owner_all ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_owner_all ON public.frelux_api_keys
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Admins may view metadata and change status (revoke/disable),
-- but there is nothing secret to read: the raw key is never stored.
DROP POLICY IF EXISTS frelux_api_keys_admin_metadata ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_admin_metadata ON public.frelux_api_keys
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS frelux_api_keys_admin_status ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_admin_status ON public.frelux_api_keys
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.frelux_api_keys IS
  'Phase 7: FRELUX API keys — FLX- format, hash-only storage, owner-only RLS with admin metadata oversight.';

-- ---------------------------------------------------------
-- API USAGE METERING
-- Written by the API gateway (service role) only; clients can
-- never forge or tamper with metering rows.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.frelux_api_keys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  request_id text NOT NULL,
  endpoint text NOT NULL,
  capability text NOT NULL,
  method text NOT NULL,
  status_code int NOT NULL,
  latency_ms int NOT NULL,
  -- AI provider used, where applicable (observability only —
  -- never exposed to API consumers as the API identity).
  provider text,
  usage_units int NOT NULL DEFAULT 1,
  billing_unit text NOT NULL DEFAULT 'request',
  cost numeric NOT NULL DEFAULT 0,
  region text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_api_usage_key_time
  ON public.frelux_api_usage (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_frelux_api_usage_user_time
  ON public.frelux_api_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_frelux_api_usage_created
  ON public.frelux_api_usage (created_at DESC);

ALTER TABLE public.frelux_api_usage ENABLE ROW LEVEL SECURITY;

-- Owner reads their own metering; nobody writes via client (gateway service-role only).
DROP POLICY IF EXISTS frelux_api_usage_owner_read ON public.frelux_api_usage;
CREATE POLICY frelux_api_usage_owner_read ON public.frelux_api_usage
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS frelux_api_usage_admin_read ON public.frelux_api_usage;
CREATE POLICY frelux_api_usage_admin_read ON public.frelux_api_usage
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.frelux_api_usage IS
  'Phase 7: FRELUX API request metering — gateway-written (service role), owner/admin read-only.';

-- ---------------------------------------------------------
-- API PLANS (configurable monetization; no pricing logic in code)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_api_plans (
  key text PRIMARY KEY CHECK (key IN ('free','developer','pro','business','enterprise','custom')),
  name text NOT NULL,
  -- { description, rateLimitPerMinute, dailyQuota, monthlyQuota, aiRequestsMonthly,
  --   calculatorRequestsMonthly, imageRequestsMonthly, marketRequestsMonthly,
  --   regions, priceMonthly, currency, features[] }
  config jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_api_plans ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read plan configuration (for the portal);
-- only admins may change it. Configuration lives in the database —
-- commercial pricing is NEVER hard-coded in calculation logic.
DROP POLICY IF EXISTS frelux_api_plans_authenticated_read ON public.frelux_api_plans;
CREATE POLICY frelux_api_plans_authenticated_read ON public.frelux_api_plans
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS frelux_api_plans_admin_manage ON public.frelux_api_plans;
CREATE POLICY frelux_api_plans_admin_manage ON public.frelux_api_plans
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.frelux_api_plans IS
  'Phase 7: configurable FRELUX API plans — quotas, limits, regional capabilities, and pricing as DB configuration.';

-- Seed default plan configuration (admin-editable; prices are
-- seed defaults, not logic — Enterprise/Custom are set by negotiation).
INSERT INTO public.frelux_api_plans (key, name, config, active, sort_order) VALUES
  ('free', 'Free', jsonb_build_object(
    'description', 'Evaluation tier — try the FRELUX API.',
    'rateLimitPerMinute', 10, 'dailyQuota', 50, 'monthlyQuota', 1000,
    'aiRequestsMonthly', 100, 'calculatorRequestsMonthly', 1000,
    'imageRequestsMonthly', 0, 'marketRequestsMonthly', 100,
    'regions', jsonb_build_array('NG'),
    'priceMonthly', 0, 'currency', 'USD',
    'features', jsonb_build_array('calculators','capabilities','regions')
  ), true, 1),
  ('developer', 'Developer', jsonb_build_object(
    'description', 'For individual developers building with FRELUX.',
    'rateLimitPerMinute', 60, 'dailyQuota', 1000, 'monthlyQuota', 25000,
    'aiRequestsMonthly', 2000, 'calculatorRequestsMonthly', 25000,
    'imageRequestsMonthly', 100, 'marketRequestsMonthly', 2500,
    'regions', jsonb_build_array('NG','GB','US','CA','AU','ZA','AE'),
    'priceMonthly', 19, 'currency', 'USD',
    'features', jsonb_build_array('calculators','chat','capabilities','regions','market')
  ), true, 2),
  ('pro', 'Pro', jsonb_build_object(
    'description', 'For professional workflows and small teams.',
    'rateLimitPerMinute', 120, 'dailyQuota', 5000, 'monthlyQuota', 100000,
    'aiRequestsMonthly', 10000, 'calculatorRequestsMonthly', 100000,
    'imageRequestsMonthly', 500, 'marketRequestsMonthly', 10000,
    'regions', jsonb_build_array('NG','GB','US','CA','AU','ZA','AE'),
    'priceMonthly', 49, 'currency', 'USD',
    'features', jsonb_build_array('calculators','chat','capabilities','regions','market','feedback')
  ), true, 3),
  ('business', 'Business', jsonb_build_object(
    'description', 'For businesses integrating FRELUX at scale.',
    'rateLimitPerMinute', 300, 'dailyQuota', 20000, 'monthlyQuota', 500000,
    'aiRequestsMonthly', 50000, 'calculatorRequestsMonthly', 500000,
    'imageRequestsMonthly', 2500, 'marketRequestsMonthly', 50000,
    'regions', jsonb_build_array('NG','GB','US','CA','AU','ZA','AE'),
    'priceMonthly', 199, 'currency', 'USD',
    'features', jsonb_build_array('calculators','chat','capabilities','regions','market','feedback')
  ), true, 4),
  ('enterprise', 'Enterprise', jsonb_build_object(
    'description', 'Custom limits, SLAs, and regional coverage.',
    'rateLimitPerMinute', 600, 'dailyQuota', 100000, 'monthlyQuota', 2000000,
    'aiRequestsMonthly', 250000, 'calculatorRequestsMonthly', 2000000,
    'imageRequestsMonthly', 10000, 'marketRequestsMonthly', 250000,
    'regions', jsonb_build_array('*'),
    'priceMonthly', null, 'currency', 'USD',
    'features', jsonb_build_array('calculators','chat','capabilities','regions','market','feedback','priority_support')
  ), true, 5),
  ('custom', 'Custom', jsonb_build_object(
    'description', 'Negotiated plan — quotas configured per key by FRELUX.',
    'rateLimitPerMinute', 60, 'dailyQuota', 1000, 'monthlyQuota', 25000,
    'aiRequestsMonthly', 2000, 'calculatorRequestsMonthly', 25000,
    'imageRequestsMonthly', 0, 'marketRequestsMonthly', 2500,
    'regions', jsonb_build_array('NG'),
    'priceMonthly', null, 'currency', 'USD',
    'features', jsonb_build_array('calculators','chat','capabilities','regions','market')
  ), true, 6)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------
-- ROLE GRANTS
-- The migration runner creates tables without Supabase's
-- default privileges, so the standard roles must be granted
-- explicitly (identical effect to the platform defaults).
-- ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.frelux_api_keys, public.frelux_api_usage, public.frelux_api_plans
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_api_keys TO authenticated;
GRANT SELECT ON public.frelux_api_plans, public.frelux_api_usage TO authenticated;

-- The Phase 6.5 tables the API gateway touches (created via the
-- same migration runner — same missing-grants situation):
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_learning_records TO service_role;
GRANT SELECT ON public.frelux_price_observations TO service_role;
GRANT SELECT ON public.market_pricing, public.market_profiles, public.market_products TO service_role;
