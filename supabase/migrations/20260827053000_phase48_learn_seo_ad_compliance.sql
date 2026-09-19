-- Phase 48: Learn section SEO and ad placement compliance
-- Adds missing ad placements referenced in Learn pages and ensures
-- Google Better Ads Standards compliance (ad labeling, density).
--
-- Placements added:
--   learn_article_bottom — after article content + related/recent sections
--   learn_bottom — bottom of Learn hub page
--   learn_category_bottom — bottom of category listing page
--
-- Existing placements (already in DB):
--   learn_in_article — in-article native ad (mid-content)
--   learn_sidebar — desktop sidebar on Learn pages

INSERT INTO ad_placements (placement_key, placement_name, placement_type, page_target, display_rules)
VALUES
  ('learn_article_bottom', 'Learn Article Bottom', 'banner', 'learn', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('learn_bottom', 'Learn Hub Bottom', 'banner', 'learn', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}'),
  ('learn_category_bottom', 'Learn Category Bottom', 'banner', 'learn', '{"mobile":true,"desktop":true,"refresh_seconds":0,"min_height":100}')
ON CONFLICT (placement_key) DO UPDATE SET
  placement_name = EXCLUDED.placement_name,
  placement_type = EXCLUDED.placement_type,
  page_target = EXCLUDED.page_target,
  display_rules = EXCLUDED.display_rules,
  updated_at = now();
