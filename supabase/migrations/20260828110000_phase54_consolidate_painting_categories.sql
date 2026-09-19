-- Phase 54: Consolidate painting-related categories into a single "Painting Guides" category
-- 
-- Previously, painting topics were spread across 11 separate categories:
--   painting-guides, diy-tutorials, paint-buying-guides, color-psychology,
--   surface-preparation, painting-tips, faqs, product-reviews, videos,
--   industry-news, case-studies
-- 
-- Now consolidated into a single "Painting Guides" category, matching the
-- structure of the other tool categories (screeding, POP, tile, finishing, construction).

-- 1. Update the painting-guides category to be the consolidated painting hub
UPDATE learn_categories
SET
  name = 'Painting Guides',
  slug = 'painting-guides',
  description = 'Complete guides on painting techniques, surface preparation, color selection, buying tips, and more',
  icon = 'Paintbrush',
  sort_order = 1,
  is_active = true
WHERE slug = 'painting-guides';

-- 2. Move all articles from the old painting-related categories to painting-guides
UPDATE learn_articles
SET category_slug = 'painting-guides'
WHERE category_slug IN (
  'diy-tutorials',
  'paint-buying-guides',
  'color-psychology',
  'surface-preparation',
  'painting-tips',
  'faqs',
  'product-reviews',
  'videos',
  'industry-news',
  'case-studies'
);

-- 3. Deactivate the old painting-related categories
UPDATE learn_categories
SET is_active = false
WHERE slug IN (
  'diy-tutorials',
  'paint-buying-guides',
  'color-psychology',
  'surface-preparation',
  'painting-tips',
  'faqs',
  'product-reviews',
  'videos',
  'industry-news',
  'case-studies'
);

-- 4. Reorder tool categories
UPDATE learn_categories SET sort_order = 2 WHERE slug = 'screeding-guides';
UPDATE learn_categories SET sort_order = 3 WHERE slug = 'pop-ceiling-guides';
UPDATE learn_categories SET sort_order = 4 WHERE slug = 'tile-guides';
UPDATE learn_categories SET sort_order = 5 WHERE slug = 'finishing-guides';
UPDATE learn_categories SET sort_order = 6 WHERE slug = 'construction-guides';
