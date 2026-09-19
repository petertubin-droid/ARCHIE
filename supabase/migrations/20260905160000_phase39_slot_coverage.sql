-- =========================================================
-- Phase 39: Full slot coverage + multi-provider wiring
--
-- 1. New placements (user spec — 5 homepage slots, 4 article slots,
--    2 slots per calculator page):
--      home_top            — Home, above "How FRELUX Works"
--      learn_article_top   — Learn article body, first in-article slot
--      calculator_mid      — calculator detail pages, above the bottom slot
--      estimator_mid       — Build-to-Roof estimator, above the bottom slot
--      calculator_hub_mid — calculator hub pages, above the bottom slot
--    (Existing slots complete the counts: home_mid, home_native,
--     home_sidebar, home_footer; learn_in_article, learn_article_native,
--     learn_article_bottom; calculator_bottom / estimator_bottom /
--     calculator_hub_bottom; calculators_native + calculators_bottom.)
--
-- 2. Wire EVERY non-rewarded placement to all active display
--    providers, in fallback order:
--      1. google_adsense (renders when per-slot units + approval are live)
--      2. adsterra        (banners + native; density-capped at 3 per page)
--      3. monetag          (in-page Native Banner zone once configured)
--
-- 3. Normalize Adsterra per-placement unit values: admins sometimes
--    paste the full dashboard snippet instead of the bare 32-hex zone
--    key. Extract the key so the slot renders.
--
-- Idempotent: safe to run more than once.
-- =========================================================

-- 1. New placements ---------------------------------------------------
DO $mig$
BEGIN
  INSERT INTO public.ad_placements (
    placement_key, placement_name, placement_type, page_target,
    is_active, provider_ids, ad_unit_ids, display_rules
  )
  SELECT
    v.key, v.name, v.ptype, v.page_target,
    true,
    jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada', -- google_adsense
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', -- adsterra
      '545bacb5-ab9c-4301-9a60-a5361e360f8a'  -- monetag
    ),
    '{}'::jsonb,
    '{"mobile": true, "desktop": true, "min_height": 100, "refresh_seconds": 0}'::jsonb
  FROM (VALUES
    ('home_top', 'Home Top', 'banner', 'home'),
    ('learn_article_top', 'Learn Article Top', 'in_article', 'learn'),
    ('calculator_mid', 'Calculator Mid', 'banner', 'calculator'),
    ('estimator_mid', 'Build-to-Roof Estimator Mid', 'banner', 'calculator'),
    ('calculator_hub_mid', 'Calculator Hub Mid', 'banner', 'calculator')
  ) AS v(key, name, ptype, page_target)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_placements p WHERE p.placement_key = v.key
  );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- 2. Wire every non-rewarded placement to the full provider chain -----
UPDATE public.ad_placements
SET provider_ids = jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada', -- google_adsense
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', -- adsterra
      '545bacb5-ab9c-4301-9a60-a5361e360f8a'  -- monetag
    ),
    updated_at = now()
WHERE placement_type <> 'rewarded'
  AND (provider_ids IS NULL OR provider_ids::text IS DISTINCT FROM
    '["06f616f0-b932-4e48-ad64-73589b656ada", "c4373ff9-4b5f-4c45-9974-23d43e21b8cb", "545bacb5-ab9c-4301-9a60-a5361e360f8a"]');

-- 3. Normalize pasted Adsterra snippets to bare 32-hex zone keys -------
UPDATE public.ad_placements p
SET ad_unit_ids = jsonb_set(
      p.ad_unit_ids,
      ARRAY['c4373ff9-4b5f-4c45-9974-23d43e21b8cb'],
      to_jsonb(lower((regexp_match(
        p.ad_unit_ids->>'c4373ff9-4b5f-4c45-9974-23d43e21b8cb',
        '([a-f0-9]{32})'
      ))[1]))
    ),
    updated_at = now()
WHERE p.ad_unit_ids ? 'c4373ff9-4b5f-4c45-9974-23d43e21b8cb'
  AND length(p.ad_unit_ids->>'c4373ff9-4b5f-4c45-9974-23d43e21b8cb') <> 32
  AND regexp_match(p.ad_unit_ids->>'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', '^[a-f0-9]{32}$', 'i') IS NULL
  AND regexp_match(p.ad_unit_ids->>'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', '([a-f0-9]{32})', 'i') IS NOT NULL;
