-- =========================================================
-- Phase 34: Commercial Readiness Fixes
-- 1. Update contact email in site_settings
-- 2. Add Meta Pixel integration_settings row
-- =========================================================

-- Update contact email to owner's email
UPDATE site_settings
SET contact_email = 'frenzyanthony39@gmail.com'
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Add Meta Pixel integration row (missing from original seed)
INSERT INTO integration_settings (integration_key, display_name, category, is_enabled, config)
VALUES
  ('meta_pixel', 'Meta Pixel', 'advertising', false, '{"pixel_id":""}'::jsonb)
ON CONFLICT (integration_key) DO NOTHING;

-- Update the sync function reference: add meta_pixel to the sync logic
-- (This is handled in the frontend AnalyticsScripts component which reads
--  directly from integration_settings, so no DB function change needed)
