/*
# Site Branding Configuration

1. New Tables
- `site_branding`
  - `id` (uuid, primary key)
  - `website_name` (text, default 'FRELUX PAINT CALC')
  - `website_tagline` (text, default 'Plan Your Perfect Paint Project')
  - `browser_title` (text, default 'FRELUX PAINT CALC — Plan Your Perfect Paint Project')
  - `light_logo_url` (text, nullable — URL in storage for light mode logo)
  - `dark_logo_url` (text, nullable — URL in storage for dark mode logo)
  - `favicon_url` (text, nullable — URL for favicon)
  - `pwa_icon_url` (text, nullable — URL for PWA app icon)
  - `primary_color` (text, default '#6B21A8' — brand purple)
  - `secondary_color` (text, default '#0F172A' — brand navy)
  - `accent_color` (text, default '#F97316' — accent orange)
  - `is_active` (boolean, default true — only one row should be active)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `site_branding`.
- Public SELECT: anyone (anon + authenticated) can read branding — needed for the public site.
- Admin-only INSERT/UPDATE/DELETE: only authenticated users can modify branding.
- Seed one default row with current site values.
*/

CREATE TABLE IF NOT EXISTS site_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_name text NOT NULL DEFAULT 'FRELUX PAINT CALC',
  website_tagline text NOT NULL DEFAULT 'Plan Your Perfect Paint Project',
  browser_title text NOT NULL DEFAULT 'FRELUX PAINT CALC — Plan Your Perfect Paint Project',
  light_logo_url text,
  dark_logo_url text,
  favicon_url text,
  pwa_icon_url text,
  primary_color text NOT NULL DEFAULT '#6B21A8',
  secondary_color text NOT NULL DEFAULT '#0F172A',
  accent_color text NOT NULL DEFAULT '#F97316',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_branding ENABLE ROW LEVEL SECURITY;

-- Public read: branding must be visible to all site visitors
DROP POLICY IF EXISTS "public_read_branding" ON site_branding;
CREATE POLICY "public_read_branding" ON site_branding FOR SELECT
  TO anon, authenticated USING (true);

-- Admin-only write: only authenticated users can insert/update/delete
DROP POLICY IF EXISTS "admin_insert_branding" ON site_branding;
CREATE POLICY "admin_insert_branding" ON site_branding FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_branding" ON site_branding;
CREATE POLICY "admin_update_branding" ON site_branding FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_branding" ON site_branding;
CREATE POLICY "admin_delete_branding" ON site_branding FOR DELETE
  TO authenticated USING (true);

-- Seed default row
DO $mig$
BEGIN
  INSERT INTO site_branding (website_name, website_tagline, browser_title, is_active)
  SELECT 'FRELUX PAINT CALC', 'Plan Your Perfect Paint Project', 'FRELUX PAINT CALC — Plan Your Perfect Paint Project', true
  WHERE NOT EXISTS (SELECT 1 FROM site_branding WHERE is_active = true);
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;
