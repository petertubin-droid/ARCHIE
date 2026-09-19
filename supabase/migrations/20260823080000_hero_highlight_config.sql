-- Phase: Hero Text Highlighting
-- Adds hero_highlight_config JSONB column to site_branding
-- Allows admins to configure which words in the hero headline get a custom color.

ALTER TABLE site_branding
  ADD COLUMN IF NOT EXISTS hero_highlight_config JSONB DEFAULT NULL;

COMMENT ON COLUMN site_branding.hero_highlight_config IS
  'JSON: { highlights: [{ wordIndex: number, word: string, color: string }] } — which words in the hero headline to color.';
