-- =========================================================
-- Phase 46: AdSense display activation (audit follow-up)
--
-- Audit result (2026-09-06): all 51 code slot keys exist in
-- ad_placements, are active, and are wired to the full active
-- provider chain (google_adsense → adsterra → monetag).
-- The only provider-level blocker was google_adsense having
-- settings.display_ads_enabled = false (set while awaiting
-- approval). AdSense rendering additionally requires per-slot
-- ad unit IDs (Admin → Ads → placement → AdSense unit ID),
-- which remain to be filled from the AdSense dashboard — so
-- enabling this toggle is safe and takes effect per-slot the
-- moment units are added.
--
-- Idempotent: safe to run more than once.
-- =========================================================

UPDATE public.ad_providers
SET settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{display_ads_enabled}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
WHERE slug = 'google_adsense'
  AND (settings ->> 'display_ads_enabled') IS DISTINCT FROM 'true';

-- ---------------------------------------------------------
-- 2. Push placements (article_push_1/2, calculator_push) were
--    wired to Monetag only. Extend them to the full active
--    provider chain so the fallback order applies (Monetag
--    still wins via its per-slot push zone 11734901; the
--    others only serve if a matching unit/zone is configured).
-- ---------------------------------------------------------
UPDATE public.ad_placements
SET provider_ids = jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada', -- google_adsense
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', -- adsterra
      '545bacb5-ab9c-4301-9a60-a5361e360f8a'  -- monetag
    ),
    updated_at = now()
WHERE placement_key IN ('article_push_1', 'article_push_2', 'calculator_push')
  AND provider_ids::text <> jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada',
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb',
      '545bacb5-ab9c-4301-9a60-a5361e360f8a'
    )::text;
