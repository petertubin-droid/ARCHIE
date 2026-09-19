/*
# Learn Section — Educational Content Hub

## Purpose
Creates the database layer for the Learn section, a dedicated educational hub
for FRELUX. Supports future content categories: Painting Guides, DIY Tutorials,
Paint Buying Guides, Color Psychology, Surface Preparation, Painting Tips,
FAQs, Product Reviews, Videos, Industry News, and Case Studies.

## Tables

1. **learn_categories** — Content categories with slug, name, description, icon,
   and sort order. Seeded with all planned categories.

2. **learn_articles** — Individual articles with title, slug, category, excerpt,
   full content (markdown), cover image, author, SEO fields, and publish status.
   Supports draft/published workflow with scheduled publishing.

## Security
- RLS enabled on all tables.
- Public (anon + authenticated) can read published articles and all categories.
- Only admins can create, update, delete articles and categories.
- Admin check via is_current_user_admin() SECURITY DEFINER function (already exists).
*/

-- =========================================================
-- 1. learn_categories
-- =========================================================
CREATE TABLE IF NOT EXISTS learn_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'BookOpen',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE learn_categories ENABLE ROW LEVEL SECURITY;

-- Public can read active categories
DROP POLICY IF EXISTS "public_read_learn_categories" ON learn_categories;
CREATE POLICY "public_read_learn_categories" ON learn_categories FOR SELECT
  TO anon, authenticated USING (true);

-- Admin can manage categories
DROP POLICY IF EXISTS "admin_insert_learn_categories" ON learn_categories;
CREATE POLICY "admin_insert_learn_categories" ON learn_categories FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_learn_categories" ON learn_categories;
CREATE POLICY "admin_update_learn_categories" ON learn_categories FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_learn_categories" ON learn_categories;
CREATE POLICY "admin_delete_learn_categories" ON learn_categories FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 2. learn_articles
-- =========================================================
CREATE TABLE IF NOT EXISTS learn_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  content text NOT NULL DEFAULT '',
  category_slug text NOT NULL REFERENCES learn_categories(slug) ON DELETE RESTRICT,
  cover_image_url text,
  author text,
  read_time_minutes integer,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  meta_title text,
  meta_description text,
  meta_keywords text,
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE learn_articles ENABLE ROW LEVEL SECURITY;

-- Public can read published articles (only if published_at is in the past or null)
DROP POLICY IF EXISTS "public_read_learn_articles" ON learn_articles;
CREATE POLICY "public_read_learn_articles" ON learn_articles FOR SELECT
  TO anon, authenticated USING (
    status = 'published' AND (published_at IS NULL OR published_at <= now())
  );

-- Admin can read all articles (including drafts)
DROP POLICY IF EXISTS "admin_select_learn_articles" ON learn_articles;
CREATE POLICY "admin_select_learn_articles" ON learn_articles FOR SELECT
  TO authenticated USING (is_current_user_admin());

-- Admin can insert articles
DROP POLICY IF EXISTS "admin_insert_learn_articles" ON learn_articles;
CREATE POLICY "admin_insert_learn_articles" ON learn_articles FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

-- Admin can update articles
DROP POLICY IF EXISTS "admin_update_learn_articles" ON learn_articles;
CREATE POLICY "admin_update_learn_articles" ON learn_articles FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- Admin can delete articles
DROP POLICY IF EXISTS "admin_delete_learn_articles" ON learn_articles;
CREATE POLICY "admin_delete_learn_articles" ON learn_articles FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_learn_articles_category ON learn_articles(category_slug);
CREATE INDEX IF NOT EXISTS idx_learn_articles_status ON learn_articles(status);
CREATE INDEX IF NOT EXISTS idx_learn_articles_published ON learn_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_learn_articles_featured ON learn_articles(is_featured) WHERE is_featured = true;

-- =========================================================
-- Seed: Content categories
-- =========================================================
INSERT INTO learn_categories (slug, name, description, icon, sort_order) VALUES
  ('painting-guides', 'Painting Guides', 'Step-by-step guides for painting different surfaces and rooms', 'Paintbrush', 1),
  ('diy-tutorials', 'DIY Tutorials', 'Hands-on tutorials for do-it-yourself painting projects', 'Hammer', 2),
  ('paint-buying-guides', 'Paint Buying Guides', 'How to choose the right paint type, finish, and quantity', 'ShoppingCart', 3),
  ('color-psychology', 'Color Psychology', 'How colors affect mood, perception, and space', 'Brain', 4),
  ('surface-preparation', 'Surface Preparation', 'Prepping walls, wood, and other surfaces before painting', 'Sparkles', 5),
  ('painting-tips', 'Painting Tips', 'Pro tips and techniques for better painting results', 'Lightbulb', 6),
  ('faqs', 'FAQs', 'Frequently asked questions about paint, colors, and calculators', 'HelpCircle', 7),
  ('product-reviews', 'Product Reviews', 'Reviews of paint brands, tools, and accessories', 'Star', 8),
  ('videos', 'Videos', 'Video tutorials and walkthroughs', 'PlayCircle', 9),
  ('industry-news', 'Industry News', 'Latest news and trends in the paint industry', 'Newspaper', 10),
  ('case-studies', 'Case Studies', 'Real-world painting projects and transformations', 'Briefcase', 11)
ON CONFLICT (slug) DO NOTHING;
