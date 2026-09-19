-- =========================================================
-- Phase 13: Wall Screeding Mix Model + Rewarded Access System
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. Screeding Mix Configuration
-- Replaces the standalone "screeding_materials" product model with a
-- mixture of Screeding Paint (20 L buckets) + White Cement (40 kg bags).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS screeding_mix_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Screeding Paint (sold in 20 L buckets)
  paint_coverage_rate_m2_per_l numeric NOT NULL DEFAULT 6,
  paint_bucket_size_l numeric NOT NULL DEFAULT 20,
  paint_price_per_bucket numeric NOT NULL DEFAULT 25000,
  -- White Cement (sold in 40 kg bags)
  cement_consumption_ratio_kg_per_l numeric NOT NULL DEFAULT 1.5,
  cement_bag_size_kg numeric NOT NULL DEFAULT 40,
  cement_price_per_bag numeric NOT NULL DEFAULT 7500,
  -- Mix & labour
  default_mix_ratio text NOT NULL DEFAULT '2:1',
  labour_rate_per_sqm numeric NOT NULL DEFAULT 500,
  waste_percentage numeric NOT NULL DEFAULT 10,
  tax_vat_percentage numeric NOT NULL DEFAULT 7.5,
  currency text NOT NULL DEFAULT 'NGN',
  currency_symbol text NOT NULL DEFAULT '₦',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE screeding_mix_config ENABLE ROW LEVEL SECURITY;

-- Public read (calculator needs config); only admins write via service role.
DROP POLICY IF EXISTS "read_screeding_mix_config" ON screeding_mix_config;
CREATE POLICY "read_screeding_mix_config" ON screeding_mix_config
  FOR SELECT TO anon, authenticated USING (true);

DO $mig$
BEGIN
  INSERT INTO screeding_mix_config (
    paint_coverage_rate_m2_per_l, paint_bucket_size_l, paint_price_per_bucket,
    cement_consumption_ratio_kg_per_l, cement_bag_size_kg, cement_price_per_bag,
    default_mix_ratio, labour_rate_per_sqm, waste_percentage, tax_vat_percentage,
    currency, currency_symbol, is_active
  ) VALUES (
    6, 20, 25000,
    1.5, 40, 7500,
    '2:1', 500, 10, 7.5,
    'NGN', '₦', true
  );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- ─────────────────────────────────────────────────────────
-- 2. Rewarded Access System
-- Generic, reusable daily-unlock system powered by rewarded ads.
-- Any "premium tool" can register a tool_key and track unlocks.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rewarded_tool_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_key text NOT NULL UNIQUE,
  tool_label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  ad_provider text NOT NULL DEFAULT 'adsense',
  ad_unit_id text,
  unlock_duration_hours numeric NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rewarded_tool_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_rewarded_tool_config" ON rewarded_tool_config;
CREATE POLICY "read_rewarded_tool_config" ON rewarded_tool_config
  FOR SELECT TO anon, authenticated USING (true);

-- Seed the Advanced Calculator as the first tool
INSERT INTO rewarded_tool_config (tool_key, tool_label, description, is_enabled, ad_provider, unlock_duration_hours)
VALUES (
  'advanced_calculator',
  'Advanced Calculator',
  'Unlock advanced material breakdown, AI recommendations, PDF export, and more.',
  true,
  'adsense',
  24
) ON CONFLICT (tool_key) DO NOTHING;

-- Track per-user (or per-browser) daily unlocks.
-- Uses a client_hash for anonymous users, user_id for authenticated.
CREATE TABLE IF NOT EXISTS rewarded_unlock_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_key text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_hash text,
  unlock_date date NOT NULL DEFAULT CURRENT_DATE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ad_provider text,
  ad_revenue_estimated numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rewarded_unlock_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own unlocks (by user_id or client_hash)
DROP POLICY IF EXISTS "read_own_unlocks" ON rewarded_unlock_log;
CREATE POLICY "read_own_unlocks" ON rewarded_unlock_log
  FOR SELECT TO anon, authenticated USING (
    auth.uid() = user_id OR client_hash = current_setting('request.headers', true)::json->>'x-client-hash'
  );

-- Anyone can insert an unlock record (the ad-watch event creates it)
DROP POLICY IF EXISTS "insert_unlock_log" ON rewarded_unlock_log;
CREATE POLICY "insert_unlock_log" ON rewarded_unlock_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- 3. Rewarded Ad Event Tracking (analytics)
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rewarded_ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_key text NOT NULL,
  event_type text NOT NULL, -- 'impression', 'click', 'reward', 'close', 'error'
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_hash text,
  ad_provider text,
  revenue_estimated numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rewarded_ad_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_ad_events" ON rewarded_ad_events;
CREATE POLICY "insert_ad_events" ON rewarded_ad_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────
-- 4. Advanced Calculator Saved Estimates
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS advanced_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_hash text,
  tool_key text NOT NULL DEFAULT 'advanced_calculator',
  title text NOT NULL,
  project_type text,
  estimate_data jsonb NOT NULL,
  total_cost numeric,
  currency text DEFAULT 'NGN',
  is_saved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advanced_estimates ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own estimates
DROP POLICY IF EXISTS "select_own_estimates" ON advanced_estimates;
CREATE POLICY "select_own_estimates" ON advanced_estimates
  FOR SELECT TO anon, authenticated USING (
    auth.uid() = user_id OR client_hash = current_setting('request.headers', true)::json->>'x-client-hash'
  );

DROP POLICY IF EXISTS "insert_own_estimates" ON advanced_estimates;
CREATE POLICY "insert_own_estimates" ON advanced_estimates
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_estimates" ON advanced_estimates;
CREATE POLICY "update_own_estimates" ON advanced_estimates
  FOR UPDATE TO anon, authenticated USING (
    auth.uid() = user_id OR client_hash = current_setting('request.headers', true)::json->>'x-client-hash'
  );

DROP POLICY IF EXISTS "delete_own_estimates" ON advanced_estimates;
CREATE POLICY "delete_own_estimates" ON advanced_estimates
  FOR DELETE TO anon, authenticated USING (
    auth.uid() = user_id OR client_hash = current_setting('request.headers', true)::json->>'x-client-hash'
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rewarded_unlock_log_tool_date ON rewarded_unlock_log (tool_key, unlock_date);
CREATE INDEX IF NOT EXISTS idx_rewarded_ad_events_tool ON rewarded_ad_events (tool_key, created_at);
CREATE INDEX IF NOT EXISTS idx_advanced_estimates_user ON advanced_estimates (user_id, client_hash);
