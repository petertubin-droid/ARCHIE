/*
# Typography / Font Display Manager

Adds typography configuration columns to site_settings.
Stores font assignments for 7 site areas as a JSONB column.

Font families are referenced by Google Fonts family name.
The frontend dynamically loads only the active fonts via the
Google Fonts CSS API — no 50-font bundle is shipped.
*/

-- Add typography_config JSONB column to site_settings
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS typography_config jsonb NOT NULL DEFAULT '{
    "body": "Inter",
    "headings": "Plus Jakarta Sans",
    "navigation": "Inter",
    "buttons": "Inter",
    "calculatorTitles": "Plus Jakarta Sans",
    "calculatorResults": "Plus Jakarta Sans",
    "admin": "Inter"
  }'::jsonb;

COMMENT ON COLUMN site_settings.typography_config IS
  'JSON map of site areas to Google Font family names. Keys: body, headings, navigation, buttons, calculatorTitles, calculatorResults, admin.';
