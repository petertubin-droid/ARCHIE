-- =========================================================
-- FRELUX Phase 31: Premium Image Estimation
-- Database schema for AI-powered building photo estimation
--
-- Adds columns to site_settings for admin control
-- Creates estimation_usage_daily and estimation_results tables
-- =========================================================

-- ── Add estimation columns to site_settings ──
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS estimation_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimation_access_mode text DEFAULT 'disabled'
    CHECK (estimation_access_mode IN ('free', 'rewarded', 'paid', 'free_rewarded', 'disabled')),
  ADD COLUMN IF NOT EXISTS estimation_daily_free_uses integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimation_rewarded_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimation_paid_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimation_paid_price numeric DEFAULT 500,
  ADD COLUMN IF NOT EXISTS estimation_paid_currency text DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS estimation_reset_period text DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS estimation_admin_override boolean DEFAULT true;

-- ── Estimation usage tracking (server-side consumption) ──
CREATE TABLE IF NOT EXISTS estimation_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_hash text,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  uses_consumed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, usage_date),
  UNIQUE(client_hash, usage_date)
);

ALTER TABLE estimation_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can only read their own usage records
DROP POLICY IF EXISTS "Users read own estimation usage" ON estimation_usage_daily;
CREATE POLICY "Users read own estimation usage"
  ON estimation_usage_daily FOR SELECT
  USING (auth.uid() = user_id);

-- ── Saved estimation results ──
CREATE TABLE IF NOT EXISTS estimation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name text NOT NULL DEFAULT 'Untitled Project',
  image_url text,
  analysis jsonb NOT NULL DEFAULT '{}',
  estimate_summary jsonb NOT NULL DEFAULT '{}',
  full_estimate jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE estimation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own estimation results" ON estimation_results;
CREATE POLICY "Users manage own estimation results"
  ON estimation_results FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_estimation_usage_user_date
  ON estimation_usage_daily(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_estimation_usage_client_date
  ON estimation_usage_daily(client_hash, usage_date);
CREATE INDEX IF NOT EXISTS idx_estimation_results_user
  ON estimation_results(user_id, created_at DESC);

-- ── Updated_at trigger ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_estimation_usage ON estimation_usage_daily;
CREATE TRIGGER set_updated_at_estimation_usage
  BEFORE UPDATE ON estimation_usage_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_estimation_results ON estimation_results;
CREATE TRIGGER set_updated_at_estimation_results
  BEFORE UPDATE ON estimation_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
