-- Phase 37: Additive material slot (e.g. Bond) for the Screeding Mix system
-- + In-Article Insert blocks (Summary / Key Takeaways / What to Watch / etc.)
--
-- Both features are purely additive and dormant by default:
--  - The new screeding "extra material" slot is disabled (extra_enabled=false)
--    until an admin turns it on in Admin -> Screeding Materials.
--  - learn_article_inserts starts empty — no article changes appearance
--    until an admin adds inserts in Admin -> Learn -> Inserts.
-- Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────
-- 1. Screeding: generic third material slot on the mix system.
--    Mirrors paint_*/cement_* exactly (name/quantity/unit/price_per_unit),
--    so it can represent Bond today and any other material later without
--    another migration. Existing putty/paint/cement rows are untouched.
-- ─────────────────────────────────────────────────────────
ALTER TABLE screeding_system_config
  ADD COLUMN IF NOT EXISTS extra_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_name text,
  ADD COLUMN IF NOT EXISTS extra_quantity numeric,
  ADD COLUMN IF NOT EXISTS extra_unit text,
  ADD COLUMN IF NOT EXISTS extra_price_per_unit numeric;

-- Pre-fill sensible Bond defaults on the white_cement_paint row so the
-- admin only has to flip the toggle and set a price — nothing renders
-- until extra_enabled is set true.
UPDATE screeding_system_config
SET extra_name = COALESCE(extra_name, 'Bond'),
    extra_quantity = COALESCE(extra_quantity, 1),
    extra_unit = COALESCE(extra_unit, 'bucket'),
    extra_price_per_unit = COALESCE(extra_price_per_unit, 0)
WHERE system_type = 'white_cement_paint';

-- ─────────────────────────────────────────────────────────
-- 2. In-Article Insert blocks — admin-managed content cards rendered
--    inline within Learn articles (Summary, Key Takeaways, What to Watch,
--    Pro Tip, Stat Highlight, Quote). Mirrors learn_article_faqs' shape
--    and RLS exactly.
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_article_inserts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES learn_articles(id) ON DELETE CASCADE,
  insert_type TEXT NOT NULL DEFAULT 'summary'
    CHECK (insert_type IN ('summary', 'key_takeaways', 'what_to_watch', 'pro_tip', 'stat_highlight', 'quote')),
  title TEXT NOT NULL,
  -- Newline-separated bullet items for list-style inserts (summary,
  -- key_takeaways, what_to_watch); a single paragraph for pro_tip/quote.
  body TEXT NOT NULL,
  -- 'top' = right after the intro/cover image, 'bottom' = right before
  -- the FAQ section, 'after_heading' = right after the H2/H3 whose
  -- slugified id matches position_heading_id.
  position_type TEXT NOT NULL DEFAULT 'top'
    CHECK (position_type IN ('top', 'after_heading', 'bottom')),
  position_heading_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learn_article_inserts_article_id
  ON learn_article_inserts(article_id, sort_order);

ALTER TABLE learn_article_inserts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active article inserts" ON learn_article_inserts;
CREATE POLICY "Public can read active article inserts"
  ON learn_article_inserts FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage article inserts" ON learn_article_inserts;
CREATE POLICY "Admins can manage article inserts"
  ON learn_article_inserts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON learn_article_inserts TO anon, authenticated;
