-- Add Google Analytics, Search Console verification, and Meta Pixel columns to site_settings
-- These are synced from integration_settings for backward compatibility with AnalyticsScripts.tsx
-- and AdSlot legacy fallback

-- Amended 2026-09-12: the GRANT below originally ran unconditionally, but
-- integration_settings is not created until 20260821090000_phase22_template_crm_analytics.sql.
-- On a fresh replay of the migration chain (Supabase preview branches / new
-- projects) this file runs FIRST, so the GRANT failed with 42P01 and aborted
-- the whole migration run. Wrapped in a to_regclass guard — on any environment
-- where the table already exists the grant still applies; where it does not,
-- phase22's own GRANT (line ~474) covers it once the table is created.

ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS ga_measurement_id text,
ADD COLUMN IF NOT EXISTS google_site_verification text,
ADD COLUMN IF NOT EXISTS meta_pixel_id text;

-- Ensure integration_settings has proper grants for authenticated users
DO $$
BEGIN
  IF to_regclass('public.integration_settings') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON integration_settings TO authenticated;
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN site_settings.ga_measurement_id IS 'GA4 Measurement ID (G-XXXXXXXXXX) — synced from integration_settings';
COMMENT ON COLUMN site_settings.google_site_verification IS 'Google Search Console verification token — synced from integration_settings';
COMMENT ON COLUMN site_settings.meta_pixel_id IS 'Meta/Facebook Pixel ID — synced from integration_settings';
