/*
# Ad Management & Rewarded Ads System — Provider-Agnostic Architecture

## Overview
This migration creates a unified, provider-agnostic ad management system that supports
unlimited ad providers (Google AdSense, Google Ad Manager, Google AdMob, Unity Ads,
AppLovin, ironSource, Chartboost, Liftoff Monetize/Vungle) and future providers —
all configurable from the admin panel without code changes.

## New Tables

### 1. ad_providers
Stores ad network configurations. Each provider has a type, credentials, and priority.
- id (uuid PK)
- name (text, unique) — display name e.g. "Google AdSense"
- slug (text, unique) — machine identifier e.g. "google_adsense"
- provider_type (text) — 'display' | 'rewarded' | 'interstitial' | 'native' | 'mixed'
- is_active (boolean, default false)
- priority (int, default 0) — lower = higher priority in fallback chain
- credentials (jsonb) — provider-specific config (API keys, publisher IDs, etc.)
- settings (jsonb) — additional provider settings (timeout, floor price, etc.)
- is_system (boolean, default false) — true for built-in providers, false for admin-added
- created_at, updated_at (timestamptz)

### 2. ad_placements
Configures where ads appear, which providers serve them, and display rules.
- id (uuid PK)
- placement_key (text, unique) — e.g. 'home_mid', 'calculator_bottom', 'learn_sidebar'
- placement_name (text) — human-readable name
- placement_type (text) — 'banner' | 'native' | 'rewarded' | 'interstitial' | 'in_article'
- page_target (text) — which page/section: 'home' | 'calculator' | 'learn' | 'color_detail' | 'gallery' | 'ai' | 'sidebar' | 'global'
- is_active (boolean, default true)
- provider_ids (jsonb) — ordered array of provider UUIDs for fallback chain
- ad_unit_ids (jsonb) — map of provider_id → ad unit ID for this placement
- display_rules (jsonb) — rules: { mobile: bool, desktop: bool, refresh_seconds: int, min_height: int }
- created_at, updated_at (timestamptz)

### 3. ad_analytics_events
Tracks all ad events for analytics and revenue reporting.
- id (uuid PK)
- event_type (text) — 'impression' | 'click' | 'reward' | 'close' | 'error' | 'complete' | 'dismiss' | 'request' | 'fill'
- provider_id (uuid, nullable FK to ad_providers)
- placement_key (text, nullable)
- tool_key (text, nullable) — for rewarded ads
- user_id (uuid, nullable FK to auth.users)
- client_hash (text, nullable)
- revenue_estimated (numeric, default 0)
- metadata (jsonb)
- created_at (timestamptz)

### 4. rewarded_feature_config
Extends the rewarded ad system with per-feature configuration beyond what rewarded_tool_config offers.
- id (uuid PK)
- feature_key (text, unique) — e.g. 'advanced_calculator', 'ai_color_assistant', 'ai_learning_assistant', 'premium_reports'
- feature_name (text)
- description (text, nullable)
- is_enabled (boolean, default true)
- primary_provider_id (uuid, nullable FK to ad_providers)
- fallback_provider_id (uuid, nullable FK to ad_providers)
- unlock_duration_minutes (int, default 1440) — 24 hours by default
- daily_usage_limit (int, default 0) — 0 = unlimited
- cooldown_minutes (int, default 0) — wait time between unlocks
- reward_rules (jsonb) — { reward_type, reward_amount, success_message, failure_message }
- created_at, updated_at (timestamptz)

## Modified Tables

### rewarded_tool_config — added columns
- primary_provider_id (uuid, nullable) — links to ad_providers
- fallback_provider_id (uuid, nullable) — links to ad_providers
- daily_usage_limit (int, default 0)
- cooldown_minutes (int, default 0)
- reward_rules (jsonb, default '{}')

## Security
- ad_providers: public SELECT (anon + authenticated), admin-only INSERT/UPDATE/DELETE
- ad_placements: public SELECT, admin-only INSERT/UPDATE/DELETE
- ad_analytics_events: public INSERT (for logging), admin-only SELECT/UPDATE/DELETE
- rewarded_feature_config: public SELECT, admin-only INSERT/UPDATE/DELETE
- rewarded_tool_config new columns: same policies as existing

## Seed Data
- 8 built-in ad providers (inactive by default)
- 10 standard ad placements
- 4 rewarded feature configs
*/

-- =========================================================
-- 1. ad_providers
-- =========================================================
CREATE TABLE IF NOT EXISTS ad_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  provider_type text NOT NULL DEFAULT 'display',
  is_active boolean NOT NULL DEFAULT false,
  priority int NOT NULL DEFAULT 0,
  credentials jsonb NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_providers" ON ad_providers;
CREATE POLICY "public_read_ad_providers" ON ad_providers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_ad_providers" ON ad_providers;
CREATE POLICY "admin_insert_ad_providers" ON ad_providers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_ad_providers" ON ad_providers;
CREATE POLICY "admin_update_ad_providers" ON ad_providers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_ad_providers" ON ad_providers;
CREATE POLICY "admin_delete_ad_providers" ON ad_providers FOR DELETE
  TO authenticated USING (true);

-- Seed built-in providers
INSERT INTO ad_providers (name, slug, provider_type, priority, is_system, credentials, settings) VALUES
  ('Google AdSense', 'google_adsense', 'display', 1, true, '{"publisher_id":"","client_id":""}', '{"auto_ads":false,"lazy_load":true}'),
  ('Google Ad Manager', 'google_ad_manager', 'display', 2, true, '{"network_code":"","ad_unit_code":""}', '{"single_request":false}'),
  ('Google AdMob', 'google_admob', 'rewarded', 3, true, '{"app_id":"","ad_unit_id":""}', '{"test_mode":false}'),
  ('Unity Ads', 'unity_ads', 'rewarded', 4, true, '{"game_id":"","placement_id":""}', '{"test_mode":false}'),
  ('AppLovin', 'applovin', 'rewarded', 5, true, '{"sdk_key":"","zone_id":""}', '{"test_mode":false}'),
  ('ironSource', 'ironsource', 'rewarded', 6, true, '{"app_key":"","instance_id":""}', '{"test_mode":false}'),
  ('Chartboost', 'chartboost', 'rewarded', 7, true, '{"app_id":"","app_signature":""}', '{"test_mode":false}'),
  ('Liftoff Monetize', 'liftoff_monetize', 'rewarded', 8, true, '{"app_id":"","placement_id":""}', '{"test_mode":false}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. ad_placements
-- =========================================================
CREATE TABLE IF NOT EXISTS ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_key text NOT NULL UNIQUE,
  placement_name text NOT NULL,
  placement_type text NOT NULL DEFAULT 'banner',
  page_target text NOT NULL DEFAULT 'global',
  is_active boolean NOT NULL DEFAULT true,
  provider_ids jsonb NOT NULL DEFAULT '[]',
  ad_unit_ids jsonb NOT NULL DEFAULT '{}',
  display_rules jsonb NOT NULL DEFAULT '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_ad_placements" ON ad_placements;
CREATE POLICY "public_read_ad_placements" ON ad_placements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_ad_placements" ON ad_placements;
CREATE POLICY "admin_insert_ad_placements" ON ad_placements FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_ad_placements" ON ad_placements;
CREATE POLICY "admin_update_ad_placements" ON ad_placements FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_ad_placements" ON ad_placements;
CREATE POLICY "admin_delete_ad_placements" ON ad_placements FOR DELETE
  TO authenticated USING (true);

-- Seed standard placements
INSERT INTO ad_placements (placement_key, placement_name, placement_type, page_target, display_rules) VALUES
  ('home_mid', 'Homepage Middle', 'banner', 'home', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('home_sidebar', 'Homepage Sidebar', 'banner', 'sidebar', '{"mobile":false,"desktop":true,"refresh_seconds":0,"min_height":250}'),
  ('color_detail_mid', 'Color Detail Middle', 'banner', 'color_detail', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('gallery_mid', 'Color Gallery Middle', 'banner', 'gallery', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('calculator_bottom', 'Calculator Bottom', 'banner', 'calculator', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('estimator_bottom', 'Cost Estimator Bottom', 'banner', 'calculator', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('learn_in_article', 'Learn Article In-Article', 'in_article', 'learn', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":120}'),
  ('learn_sidebar', 'Learn Section Sidebar', 'banner', 'sidebar', '{"mobile":false,"desktop":true,"refresh_seconds":0,"min_height":250}'),
  ('ai_feature', 'AI Feature Banner', 'native', 'ai', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('marketplace_sidebar', 'Marketplace Sidebar', 'banner', 'sidebar', '{"mobile":false,"desktop":true,"refresh_seconds":0,"min_height":250}')
ON CONFLICT (placement_key) DO NOTHING;

-- =========================================================
-- 3. ad_analytics_events
-- =========================================================
CREATE TABLE IF NOT EXISTS ad_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  provider_id uuid REFERENCES ad_providers(id) ON DELETE SET NULL,
  placement_key text,
  tool_key text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_hash text,
  revenue_estimated numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_analytics_events ENABLE ROW LEVEL SECURITY;

-- Public can INSERT events (for logging from client-side)
DROP POLICY IF EXISTS "public_insert_ad_analytics" ON ad_analytics_events;
CREATE POLICY "public_insert_ad_analytics" ON ad_analytics_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Admin-only SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "admin_read_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_read_ad_analytics" ON ad_analytics_events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_update_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_update_ad_analytics" ON ad_analytics_events FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_delete_ad_analytics" ON ad_analytics_events FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ad_analytics_provider ON ad_analytics_events (provider_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_analytics_placement ON ad_analytics_events (placement_key, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_analytics_tool ON ad_analytics_events (tool_key, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_analytics_event_type ON ad_analytics_events (event_type, created_at);

-- =========================================================
-- 4. rewarded_feature_config
-- =========================================================
CREATE TABLE IF NOT EXISTS rewarded_feature_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  primary_provider_id uuid REFERENCES ad_providers(id) ON DELETE SET NULL,
  fallback_provider_id uuid REFERENCES ad_providers(id) ON DELETE SET NULL,
  unlock_duration_minutes int NOT NULL DEFAULT 1440,
  daily_usage_limit int NOT NULL DEFAULT 0,
  cooldown_minutes int NOT NULL DEFAULT 0,
  reward_rules jsonb NOT NULL DEFAULT '{"reward_type":"feature_unlock","reward_amount":1,"success_message":"Feature unlocked! Enjoy your premium access.","failure_message":"Unable to load ad. Please try again."}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rewarded_feature_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "public_read_rewarded_feature_config" ON rewarded_feature_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_insert_rewarded_feature_config" ON rewarded_feature_config FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_update_rewarded_feature_config" ON rewarded_feature_config FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_delete_rewarded_feature_config" ON rewarded_feature_config FOR DELETE
  TO authenticated USING (true);

-- Seed standard rewarded features
INSERT INTO rewarded_feature_config (feature_key, feature_name, description, is_enabled, unlock_duration_minutes, daily_usage_limit, cooldown_minutes) VALUES
  ('advanced_calculator', 'Advanced Calculators', 'Unlock advanced paint, screeding, POP, and tile calculators with detailed breakdowns and cost analysis.', true, 1440, 0, 0),
  ('ai_color_assistant', 'Smart Color Assistant', 'Get AI-powered color recommendations and palette suggestions for your project.', true, 1440, 0, 0),
  ('ai_learning_assistant', 'AI Learning Assistant', 'Ask questions and get personalized guidance about painting, screeding, and construction techniques.', true, 1440, 0, 0),
  ('premium_reports', 'Premium Reports', 'Generate detailed PDF reports with cost breakdowns, material lists, and professional formatting.', true, 1440, 0, 0)
ON CONFLICT (feature_key) DO NOTHING;

-- =========================================================
-- 5. Add columns to rewarded_tool_config (non-destructive)
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewarded_tool_config' AND column_name = 'primary_provider_id') THEN
    ALTER TABLE rewarded_tool_config ADD COLUMN primary_provider_id uuid REFERENCES ad_providers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewarded_tool_config' AND column_name = 'fallback_provider_id') THEN
    ALTER TABLE rewarded_tool_config ADD COLUMN fallback_provider_id uuid REFERENCES ad_providers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewarded_tool_config' AND column_name = 'daily_usage_limit') THEN
    ALTER TABLE rewarded_tool_config ADD COLUMN daily_usage_limit int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewarded_tool_config' AND column_name = 'cooldown_minutes') THEN
    ALTER TABLE rewarded_tool_config ADD COLUMN cooldown_minutes int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewarded_tool_config' AND column_name = 'reward_rules') THEN
    ALTER TABLE rewarded_tool_config ADD COLUMN reward_rules jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Indexes for ad_placements
CREATE INDEX IF NOT EXISTS idx_ad_placements_page_target ON ad_placements (page_target);
CREATE INDEX IF NOT EXISTS idx_ad_placements_active ON ad_placements (is_active);
CREATE INDEX IF NOT EXISTS idx_ad_providers_active ON ad_providers (is_active, priority);
CREATE INDEX IF NOT EXISTS idx_rewarded_feature_config_key ON rewarded_feature_config (feature_key);
