-- Phase 36: New ad slots (global footer, home footer, color detail footer,
-- AI assistant footer) + Google AdSense multi-format support.
--
-- New placements each render through the existing <AdSlot> system, appear
-- in Admin → Ads → Placements with their own Active toggle, and inherit the
-- standard provider fallback chain from an existing active placement so
-- they start working immediately. Fully additive — existing placements are
-- untouched. Idempotent: safe to re-run.

INSERT INTO ad_placements (placement_key, placement_name, placement_type, page_target, provider_ids, ad_unit_ids, display_rules)
VALUES
  ('global_footer', 'Global Footer (all pages)', 'banner', 'global',
   COALESCE((SELECT ap.provider_ids FROM ad_placements ap WHERE ap.is_active AND ap.provider_ids <> '[]'::jsonb LIMIT 1), '[]'::jsonb),
   '{}'::jsonb,
   '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('home_footer', 'Home Footer', 'banner', 'home',
   COALESCE((SELECT ap.provider_ids FROM ad_placements ap WHERE ap.is_active AND ap.provider_ids <> '[]'::jsonb LIMIT 1), '[]'::jsonb),
   '{}'::jsonb,
   '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('color_detail_footer', 'Color Detail Footer', 'banner', 'color_detail',
   COALESCE((SELECT ap.provider_ids FROM ad_placements ap WHERE ap.is_active AND ap.provider_ids <> '[]'::jsonb LIMIT 1), '[]'::jsonb),
   '{}'::jsonb,
   '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('ai_assistant_footer', 'AI Color Assistant Footer', 'banner', 'ai',
   COALESCE((SELECT ap.provider_ids FROM ad_placements ap WHERE ap.is_active AND ap.provider_ids <> '[]'::jsonb LIMIT 1), '[]'::jsonb),
   '{}'::jsonb,
   '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}')
ON CONFLICT (placement_key) DO NOTHING;

-- Google AdSense: activate the provider row and document the new format
-- settings (anchor_ads, vignette_ads, interstitial_ads, rewarded_ads are
-- provider settings edited in the admin UI — no schema change needed since
-- ad_providers.settings is a jsonb document).
UPDATE ad_providers
SET is_active = true,
    updated_at = now()
WHERE slug = 'google_adsense';
