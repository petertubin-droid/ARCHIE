-- =========================================================
-- FRELUX Roof View — Provider Configuration Table
-- Feature 2: Roof View
--
-- Stores admin-configured imagery provider settings.
-- API keys are stored as secrets (Supabase vault), NOT in this table.
-- This table only records WHICH provider is active and non-secret settings.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.roof_view_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type TEXT NOT NULL DEFAULT 'google_maps'
    CHECK (provider_type IN ('google_maps', 'mapbox', 'nearmap', 'custom')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  api_key_configured BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT NOT NULL DEFAULT 'No Provider Configured',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active config row (unique constraint on enabled=true)
CREATE UNIQUE INDEX IF NOT EXISTS roof_view_config_single_active
  ON public.roof_view_config ((1)) WHERE enabled = true;

-- Row Level Security
ALTER TABLE public.roof_view_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (to check if a provider is configured)
-- This only exposes non-secret metadata, NOT API keys
DROP POLICY IF EXISTS "roof_view_config_read_all" ON public.roof_view_config;
CREATE POLICY "roof_view_config_read_all"
  ON public.roof_view_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can modify
DROP POLICY IF EXISTS "roof_view_config_write_admin" ON public.roof_view_config;
CREATE POLICY "roof_view_config_write_admin"
  ON public.roof_view_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_roof_view_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roof_view_config_updated_at ON public.roof_view_config;
CREATE TRIGGER roof_view_config_updated_at
  BEFORE UPDATE ON public.roof_view_config
  FOR EACH ROW
  EXECUTE FUNCTION update_roof_view_config_timestamp();
