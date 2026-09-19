-- =========================================================
-- Phase 40: Ad slot spec — per-page counts + admin reorder
--
-- Slot spec (user-defined):
--   Homepage        : 5 banner  + 3 native
--   Article pages   : 4 banner  + 3 native
--   Calculator pages: 2 banner + 1 native
--   Other pages     : 2 banner  + 1 native
--   (Other formats — rewarded unlock — stay few, as-is.)
--
-- 1. Add sort_order to ad_placements (admin reorder support).
-- 2. Insert the new placements to reach the spec counts.
-- 3. Set sort_order for every placement to match the on-page order
--    shown in the Admin Page Map.
--
-- Idempotent: safe to run more than once.
-- =========================================================

-- 1. sort_order column ------------------------------------------------
ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 999;

-- 2. New placements ---------------------------------------------------
DO $mig$
BEGIN
  INSERT INTO public.ad_placements (
    placement_key, placement_name, placement_type, page_target,
    is_active, provider_ids, ad_unit_ids, display_rules, sort_order
  )
  SELECT
    v.key, v.name, v.ptype, v.ptarget,
    true,
    jsonb_build_array(
      '06f616f0-b932-4e48-ad64-73589b656ada', -- google_adsense
      'c4373ff9-4b5f-4c45-9974-23d43e21b8cb', -- adsterra
      '545bacb5-ab9c-4301-9a60-a5361e360f8a'  -- monetag
    ),
    '{}'::jsonb,
    '{"mobile": true, "desktop": true, "min_height": 100, "refresh_seconds": 0}'::jsonb,
    v.sord
  FROM (VALUES
    -- Homepage → 5 banner + 3 native
    ('home_mid_2',     'Home Mid 2',        'banner', 'home',   60),
    ('home_native_2',  'Home Native 2',     'native', 'home',   50),
    ('home_native_3',  'Home Native 3',     'native', 'home',   80),
    -- Learn articles → 4 banner + 3 native
    ('learn_article_mid_2',   'Article Mid 2',   'in_article', 'learn', 120),
    ('learn_article_native_2','Article Native 2','native',     'learn', 110),
    ('learn_article_native_3','Article Native 3','native',      'learn', 130),
    -- Learn index + category (other pages → 2 banner + 1 native)
    ('learn_native',        'Learn Index Native', 'native', 'learn', 210),
    ('learn_category_mid',  'Category Mid',      'banner', 'learn', 205),
    ('learn_category_native','Category Native',   'native', 'learn', 215),
    -- Calculator pages → 2 banner + 1 native
    ('calculator_native',    'Calculator Native',     'native', 'calculator', 310),
    ('estimator_native',     'Estimator Native',      'native', 'calculator', 410),
    ('calculator_hub_native','Calculator Hub Native', 'native', 'calculator', 510),
    ('calculators_mid',      'Calculators Index Mid', 'banner', 'calculator', 610),
    -- Color gallery + detail (other pages → 2 banner + 1 native)
    ('gallery_native',       'Color Gallery Native', 'native', 'gallery', 710),
    ('color_detail_native',   'Color Detail Native',  'native', 'color_detail', 810),
    -- AI feature pages (other pages → 2 banner + 1 native)
    ('ai_assistant_native',   'AI Assistant Native',  'native', 'ai', 910),
    ('image_estimator_native','Image Estimator Native','native','ai', 1010),
    ('image_estimator_bottom','Image Estimator Bottom','banner','ai', 1020),
    -- Marketplace pages (other pages → 2 banner + 1 native)
    ('marketplace_native', 'Marketplace Native', 'native', 'marketplace', 1110),
    ('marketplace_bottom', 'Marketplace Bottom', 'banner', 'marketplace', 1120)
  ) AS v(key, name, ptype, ptarget, sord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ad_placements p WHERE p.placement_key = v.key
  );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- 3. sort_order for every placement (matches Admin Page Map order) -----
UPDATE public.ad_placements p
SET sort_order = v.sord, updated_at = now()
FROM (VALUES
  -- Homepage: 5 banner + 3 native
  ('home_top',      20),
  ('home_native',   30),
  ('home_mid',      40),
  ('home_native_2', 50),
  ('home_mid_2',    60),
  ('home_native_3', 80),
  ('home_sidebar',  90),
  ('home_footer',   95),
  -- Learn articles: 4 banner + 3 native
  ('learn_article_top',      100),
  ('learn_article_native',   105),
  ('learn_in_article',       108),
  ('learn_article_native_2', 110),
  ('learn_article_mid_2',   120),
  ('learn_article_native_3',130),
  ('learn_article_bottom',  140),
  -- Learn index + category: 2 banner + 1 native
  ('learn_category_mid',    205),
  ('learn_native',          210),
  ('learn_category_native', 215),
  ('learn_sidebar',         220),
  ('learn_bottom',          230),
  ('learn_category_bottom', 235),
  -- Calculator pages: 2 banner + 1 native
  ('calculator_mid',     300),
  ('calculator_native',   305),
  ('calculator_bottom',   310),
  ('estimator_mid',       400),
  ('estimator_native',    410),
  ('estimator_bottom',    420),
  ('calculator_hub_mid',     500),
  ('calculator_hub_native',  505),
  ('calculator_hub_bottom',   510),
  ('calculators_native',     600),
  ('calculators_mid',        605),
  ('calculators_bottom',     610),
  -- Color gallery + detail
  ('gallery_mid',        700),
  ('gallery_native',      710),
  ('colors_gallery_bottom',720),
  ('color_detail_mid',      800),
  ('color_detail_native',   810),
  ('color_detail_footer',   820),
  -- AI feature pages
  ('ai_feature',          900),
  ('ai_assistant_native', 910),
  ('image_estimator_native',1000),
  ('image_estimator_bottom',1010),
  ('ai_assistant_footer',  1020),
  -- Marketplace pages
  ('marketplace_sidebar', 1100),
  ('marketplace_native',  1110),
  ('marketplace_bottom',  1120),
  -- Rewarded / global (kept "few" — ordered last)
  ('rewarded_unlock',    9000)
) AS v(key, sord)
WHERE p.placement_key = v.key
  AND p.sort_order IS DISTINCT FROM v.sord;
