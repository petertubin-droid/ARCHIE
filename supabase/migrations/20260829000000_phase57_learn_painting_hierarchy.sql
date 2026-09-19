-- =========================================================
-- Phase 57: Learn Section — Painting Category Hierarchy
-- Add parent_slug to learn_categories to support parent-child hierarchy.
-- Create "painting" parent category and link all painting subcategories to it.
-- =========================================================

-- 1. Add parent_slug column
ALTER TABLE learn_categories ADD COLUMN IF NOT EXISTS parent_slug text REFERENCES learn_categories(slug) ON DELETE SET NULL;

-- 2. Create the "painting" parent category (sort_order 1, before screeding at 12)
INSERT INTO learn_categories (slug, name, description, icon, sort_order, parent_slug)
VALUES ('painting', 'Painting', 'Complete painting guides, tutorials, buying guides, tips, and techniques', 'Paintbrush', 1, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon;

-- 3. Link all painting-related subcategories to the "painting" parent
UPDATE learn_categories SET parent_slug = 'painting' WHERE slug IN (
  'painting-guides',
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

-- 4. Reorder: painting parent at 1, painting subcategories 2-12, then other tool categories 13+
UPDATE learn_categories SET sort_order = 1 WHERE slug = 'painting';
UPDATE learn_categories SET sort_order = 2 WHERE slug = 'painting-guides';
UPDATE learn_categories SET sort_order = 3 WHERE slug = 'diy-tutorials';
UPDATE learn_categories SET sort_order = 4 WHERE slug = 'paint-buying-guides';
UPDATE learn_categories SET sort_order = 5 WHERE slug = 'color-psychology';
UPDATE learn_categories SET sort_order = 6 WHERE slug = 'surface-preparation';
UPDATE learn_categories SET sort_order = 7 WHERE slug = 'painting-tips';
UPDATE learn_categories SET sort_order = 8 WHERE slug = 'faqs';
UPDATE learn_categories SET sort_order = 9 WHERE slug = 'product-reviews';
UPDATE learn_categories SET sort_order = 10 WHERE slug = 'videos';
UPDATE learn_categories SET sort_order = 11 WHERE slug = 'industry-news';
UPDATE learn_categories SET sort_order = 12 WHERE slug = 'case-studies';
UPDATE learn_categories SET sort_order = 13 WHERE slug = 'screeding-guides';
UPDATE learn_categories SET sort_order = 14 WHERE slug = 'pop-ceiling-guides';
UPDATE learn_categories SET sort_order = 15 WHERE slug = 'tile-guides';
UPDATE learn_categories SET sort_order = 16 WHERE slug = 'finishing-guides';
UPDATE learn_categories SET sort_order = 17 WHERE slug = 'construction-guides';

-- 5. Add index for parent_slug lookups
CREATE INDEX IF NOT EXISTS idx_learn_categories_parent_slug ON learn_categories(parent_slug);

-- 6. Update RLS policies (already public read, no changes needed)
