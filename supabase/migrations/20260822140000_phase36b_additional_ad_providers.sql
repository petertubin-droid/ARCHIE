-- Phase 36b: Additional web display and rewarded ad providers
-- Seeds the ad_providers table with new provider definitions

-- Amended 2026-09-12: ad_postback_handlers was never created by any migration
-- in this chain (it was created manually in the production dashboard), so a
-- fresh replay of the migration chain (Supabase preview branches / new
-- projects) failed on the INSERT below with 42P01. Added an idempotent
-- CREATE TABLE IF NOT EXISTS so the chain is self-contained. If the manual
-- table already exists, this is a no-op and only the RLS enable runs.

CREATE TABLE IF NOT EXISTS public.ad_postback_handlers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug text NOT NULL UNIQUE,
  postback_url_path text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_postback_handlers ENABLE ROW LEVEL SECURITY;

-- Display ad providers
INSERT INTO ad_providers (slug, name, provider_type, is_active, priority, credentials, settings, is_system)
VALUES
  ('ezoic', 'Ezoic', 'display', false, 30, '{}', '{"lazy_load": true, "mediation": true}', true),
  ('snigel', 'Snigel', 'display', false, 31, '{}', '{"lazy_load": true}', true),
  ('monumetric', 'Monumetric', 'display', false, 32, '{}', '{}', true),
  ('carbon_ads', 'Carbon Ads', 'native', false, 33, '{}', '{}', true),
  ('ethical_ads', 'EthicalAds', 'native', false, 34, '{}', '{"format": "image-text"}', true),
  ('amazon_publisher', 'Amazon Publisher (APS)', 'display', false, 35, '{}', '{}', true),
  ('yllix', 'YlliX', 'display', false, 36, '{}', '{"format": "banner"}', true),
  ('revcontent', 'RevContent', 'native', false, 37, '{}', '{}', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  is_system = true,
  updated_at = now();

-- Rewarded ad providers (offerwall-based)
INSERT INTO ad_providers (slug, name, provider_type, is_active, priority, credentials, settings, is_system)
VALUES
  ('wannads', 'Wannads', 'rewarded', false, 50, '{}', '{}', true),
  ('my_lead', 'MyLead', 'rewarded', false, 51, '{}', '{}', true),
  ('adwork_media', 'AdWork Media', 'rewarded', false, 52, '{}', '{}', true),
  ('revenuehits', 'RevenueHits', 'rewarded', false, 53, '{}', '{}', true),
  ('notik', 'Notik', 'rewarded', false, 54, '{}', '{}', true),
  ('bitcot', 'Bitcot Rewards', 'rewarded', false, 55, '{}', '{}', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  is_system = true,
  updated_at = now();

-- Add postback handler entries for the new rewarded providers
-- These map to the existing edge function postback handler
INSERT INTO ad_postback_handlers (provider_slug, postback_url_path, is_active)
VALUES
  ('wannads', '/api/ad-postback', true),
  ('my_lead', '/api/ad-postback', true),
  ('adwork_media', '/api/ad-postback', true),
  ('revenuehits', '/api/ad-postback', true),
  ('notik', '/api/ad-postback', true),
  ('bitcot', '/api/ad-postback', true)
ON CONFLICT (provider_slug) DO UPDATE SET
  postback_url_path = EXCLUDED.postback_url_path,
  is_active = true,
  updated_at = now();

-- Update the AnalyticsScripts component's known providers list
-- (This is informational - the component already handles dynamic script loading)
