-- Add hero image URL to site_branding table
-- Allows admin to change the hero section image without code changes
ALTER TABLE site_branding ADD COLUMN IF NOT EXISTS hero_image_url text;
COMMENT ON COLUMN site_branding.hero_image_url IS 'URL of the hero section image on the homepage. Falls back to a default Pexels image if null.';
