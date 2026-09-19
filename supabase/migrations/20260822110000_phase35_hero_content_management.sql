-- =========================================================
-- Phase 35: Hero Content Management
-- Add CMS-managed hero copy columns to site_settings so the
-- homepage headline, subheadline, and CTA labels can be edited
-- through the admin panel instead of being hardcoded in JSX.
-- All columns are nullable; the frontend falls back to hardcoded
-- defaults if any are NULL.
-- =========================================================

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS hero_headline text,
  ADD COLUMN IF NOT EXISTS hero_subheadline text,
  ADD COLUMN IF NOT EXISTS hero_cta_primary_label text,
  ADD COLUMN IF NOT EXISTS hero_cta_primary_href text,
  ADD COLUMN IF NOT EXISTS hero_cta_secondary_label text,
  ADD COLUMN IF NOT EXISTS hero_cta_secondary_href text;

-- Seed the approved permanent copy as the initial values
UPDATE site_settings
SET
  hero_headline = 'Know Exactly What Materials Your Project Needs.',
  hero_subheadline = 'Calculate materials and estimate project costs using FRELUX''s Nigerian-focused construction and finishing calculators.',
  hero_cta_primary_label = 'Start Calculating',
  hero_cta_primary_href = '/screeding-calculator',
  hero_cta_secondary_label = 'Explore Calculators',
  hero_cta_secondary_href = '/calculators'
WHERE id = '00000000-0000-0000-0000-000000000001';
