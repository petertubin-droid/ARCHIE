-- Learn Article FAQs table
CREATE TABLE IF NOT EXISTS learn_article_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES learn_articles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learn_article_faqs_article_id ON learn_article_faqs(article_id, sort_order);

ALTER TABLE learn_article_faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active article FAQs" ON learn_article_faqs;
CREATE POLICY "Public can read active article FAQs"
  ON learn_article_faqs FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage article FAQs" ON learn_article_faqs;
CREATE POLICY "Admins can manage article FAQs"
  ON learn_article_faqs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON learn_article_faqs TO anon, authenticated;
