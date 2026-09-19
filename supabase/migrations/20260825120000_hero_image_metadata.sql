-- Add hero image metadata columns to site_branding
ALTER TABLE site_branding
  ADD COLUMN IF NOT EXISTS hero_image_alt text,
  ADD COLUMN IF NOT EXISTS hero_image_label text,
  ADD COLUMN IF NOT EXISTS hero_swatch_colors text[] DEFAULT ARRAY['#F5F1E8', '#D9D2C5', '#7B9EA8'],
  ADD COLUMN IF NOT EXISTS hero_swatch_name text DEFAULT 'Curated Palette',
  ADD COLUMN IF NOT EXISTS hero_chip_label text DEFAULT 'Plan & Estimate',
  ADD COLUMN IF NOT EXISTS hero_chip_value text DEFAULT 'Free',
  ADD COLUMN IF NOT EXISTS hero_chip_subtext text,
  ADD COLUMN IF NOT EXISTS hero_badge_label text DEFAULT 'Platform',
  ADD COLUMN IF NOT EXISTS hero_badge_value text DEFAULT 'FRELUX';
