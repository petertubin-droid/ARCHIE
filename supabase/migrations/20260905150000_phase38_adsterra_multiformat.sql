-- =========================================================
-- Phase 38: Adsterra multi-format expansion
--
-- Adds dedicated NATIVE placements so Adsterra's Native Banner
-- format has proper slots (alongside the existing banner slots):
--   home_native           — Home, in-content below TemplatesShowcase
--   learn_article_native  — Learn article body, under the in-article slot
--   calculators_native    — Calculators index, above the bottom banner
--
-- Native placements resolve to the Adsterra Native Banner zone key
-- (native_banner_key credential in Admin → Ads → Adsterra) as soon
-- as the admin configures one. Until then the slots render nothing.
-- Interstitial / Popunder / Social Bar stay site-wide (no placement
-- needed) and go live when their zone keys are filled in the Admin
-- panel.
--
-- Idempotent: safe to run more than once.
-- =========================================================

DO $mig$
BEGIN
  INSERT INTO public.ad_placements (
    placement_key, placement_name, placement_type, page_target,
    is_active, provider_ids, ad_unit_ids, display_rules
  )
  SELECT
    v.key, v.name, 'native', v.page_target,
    true,
    jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada', -- google_adsense
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb'  -- adsterra
    ),
    '{}'::jsonb,
    '{"mobile": true, "desktop": true, "min_height": 100, "refresh_seconds": 0}'::jsonb
  FROM (VALUES
    ('home_native', 'Home Native Banner', 'home'),
    ('learn_article_native', 'Learn Article Native Banner', 'learn'),
    ('calculators_native', 'Calculators Native Banner', 'calculator')
  ) AS v(key, name, page_target)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_placements p WHERE p.placement_key = v.key
  );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- Fix the serve domain credential: the stored value was a full URL
-- (https://www.highrevenueformat.com) which is not an Adsterra serve
-- host. Normalize to the canonical host so the admin panel shows the
-- domain banners actually serve from.
UPDATE public.ad_providers
SET credentials = jsonb_set(credentials, '{serve_domain}', to_jsonb('www.highperformanceformat.com'::text)),
    updated_at = now()
WHERE slug = 'adsterra'
  AND credentials->>'serve_domain' IS DISTINCT FROM 'www.highperformanceformat.com';
