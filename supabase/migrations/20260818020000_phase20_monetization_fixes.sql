-- =========================================================
-- Phase 20: Monetization Security & Architecture Fixes
-- Addresses GitHub issues #1-#10 from the monetization audit
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- Issue #2: Revoke direct INSERT on rewarded_unlock_log from clients
-- Unlocks must now go through the grant-rewarded-unlock edge function
-- which uses the service role key and performs server-side verification.
-- ─────────────────────────────────────────────────────────

-- Drop the permissive INSERT policy that allowed anyone to mint fake unlocks
DROP POLICY IF EXISTS "insert_unlock_log" ON rewarded_unlock_log;

-- Only service role can INSERT (RLS blocks anon/authenticated by default
-- when no INSERT policy exists for them). The edge function uses the
-- service role key which bypasses RLS entirely.

-- Keep SELECT restricted to owner/admin (already done in phase 2b)
-- But the original SELECT policy uses client_hash from request headers
-- which is spoofable. Tighten to only allow reading own unlocks by
-- user_id, or by client_hash when the requesting client_hash matches.
-- Since we can't truly verify client_hash in RLS, we keep the existing
-- policy but note this is a known limitation. The real protection is
-- that unlocks can only be created server-side now.

-- ─────────────────────────────────────────────────────────
-- Issue #2: Tighten rewarded_ad_events INSERT
-- Only allow events for known tool_keys (already done in phase 2b)
-- but also require a valid client_hash to prevent anonymous spam
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "insert_ad_events" ON rewarded_ad_events;
CREATE POLICY "insert_ad_events" ON rewarded_ad_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    client_hash IS NOT NULL
    AND tool_key IN (
      SELECT rewarded_tool_config.tool_key
      FROM rewarded_tool_config
      WHERE rewarded_tool_config.is_enabled = true
    )
  );

-- ─────────────────────────────────────────────────────────
-- Issue #9: Add configurable revenue estimate column to rewarded_feature_config
-- ─────────────────────────────────────────────────────────
-- The reward_rules jsonb already has reward_amount, but let's make it
-- a proper column for easier querying and admin UI integration.
ALTER TABLE rewarded_feature_config
  ADD COLUMN IF NOT EXISTS revenue_per_unlock numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN rewarded_feature_config.revenue_per_unlock IS
  'Estimated revenue per unlock in the site currency. Used for analytics tracking.';

-- ─────────────────────────────────────────────────────────
-- Issue #4: Add a flag to site_settings to track if a payment provider is configured
-- ─────────────────────────────────────────────────────────
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS payment_provider_configured boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN site_settings.payment_provider_configured IS
  'Set to true when a real payment provider (Paystack, Stripe, etc.) is connected. Controls whether the Paid AI access mode can be enabled.';

-- ─────────────────────────────────────────────────────────
-- Issue #5: Add ad management config columns to site_settings
-- This allows AdSense to be configured from the admin panel without
-- editing site.ts, and makes AnalyticsScripts read from DB.
-- ─────────────────────────────────────────────────────────
-- These columns may already exist from earlier migrations.
-- Use ADD COLUMN IF NOT EXISTS to be safe.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS adsense_publisher_id text DEFAULT '';

-- Update ad_providers_public view to also include revenue_per_unlock
-- from rewarded_feature_config (no changes needed to the view itself,
-- but let's make sure the view exists and is up to date)
CREATE OR REPLACE VIEW public.ad_providers_public AS
  SELECT id, name, slug, provider_type, is_active, priority,
         settings, is_system, created_at, updated_at,
         jsonb_build_object(
           'publisher_id', credentials->>'publisher_id',
           'client_id', credentials->>'client_id',
           'network_code', credentials->>'network_code',
           'ad_unit_code', credentials->>'ad_unit_code',
           'ad_unit_id', credentials->>'ad_unit_id',
           'app_id', credentials->>'app_id',
           'placement_id', credentials->>'placement_id'
         ) AS credentials
  FROM public.ad_providers;

GRANT SELECT ON public.ad_providers_public TO anon, authenticated;
