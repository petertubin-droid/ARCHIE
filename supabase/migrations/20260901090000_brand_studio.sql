-- =========================================================
-- FRELUX Brand Studio — Phase 60
--
-- Tables: brand_profiles, pdf_branding_templates,
--         pdf_export_unlocks, ai_logo_generations
--
-- Also extends site_settings with PDF default branding config.
-- Creates brand-assets storage bucket with RLS.
-- =========================================================

-- ───────────────────────────────────────────────────────
-- 1. PDF BRANDING TEMPLATES — admin-managed + system templates
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_branding_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description       TEXT,
  -- Template layout config as JSONB
  template_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  watermark_config  JSONB,
  is_premium       BOOLEAN NOT NULL DEFAULT FALSE,
  is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  rewarded_unlock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────
-- 2. BRAND PROFILES — user-saved branding identities
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  email           TEXT,
  address         TEXT,
  website         TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#7C3AED',
  secondary_color TEXT NOT NULL DEFAULT '#0B1120',
  accent_color    TEXT NOT NULL DEFAULT '#F97316',
  logo_url        TEXT,
  template_id     UUID REFERENCES pdf_branding_templates(id) ON DELETE SET NULL,
  watermark_config JSONB,
  logo_placement  TEXT NOT NULL DEFAULT 'top-right'
                  CHECK (logo_placement IN ('top-left','top-right','top-center','bottom-left','bottom-right','bottom-center')),
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────
-- 3. AI LOGO GENERATIONS — record each AI logo request
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_logo_generations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  prompt          TEXT NOT NULL,
  industry        TEXT,
  style           TEXT,
  color_prefs     TEXT,
  image_url       TEXT NOT NULL,
  is_selected     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────
-- 4. PDF EXPORT UNLOCKS — temporary branding access via rewarded ads
-- ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_export_unlocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_hash     TEXT,
  tool_key        TEXT NOT NULL DEFAULT 'brand_studio_pdf',
  unlock_type     TEXT NOT NULL DEFAULT 'single_export'
                  CHECK (unlock_type IN ('single_export','session','template_access')),
  template_id     UUID REFERENCES pdf_branding_templates(id) ON DELETE SET NULL,
  brand_profile_id UUID REFERENCES brand_profiles(id) ON DELETE SET NULL,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  is_consumed     BOOLEAN NOT NULL DEFAULT FALSE,
  consumed_at     TIMESTAMPTZ,
  ad_provider     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one default template at a time
CREATE UNIQUE INDEX IF NOT EXISTS pdf_branding_templates_single_default
  ON pdf_branding_templates (is_default) WHERE is_default = TRUE;

-- Ensure only one default brand profile per user
CREATE UNIQUE INDEX IF NOT EXISTS brand_profiles_single_default
  ON brand_profiles (user_id, is_default) WHERE is_default = TRUE;

-- ───────────────────────────────────────────────────────
-- 5. EXTEND site_settings WITH PDF BRANDING CONFIG
-- ───────────────────────────────────────────────────────
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS pdf_default_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_default_brand_name TEXT DEFAULT 'FRELUX PAINT CALC',
  ADD COLUMN IF NOT EXISTS pdf_default_tagline TEXT DEFAULT 'Smart Construction Estimation',
  ADD COLUMN IF NOT EXISTS pdf_default_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS pdf_default_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS pdf_default_address TEXT,
  ADD COLUMN IF NOT EXISTS pdf_default_primary_color TEXT DEFAULT '#7C3AED',
  ADD COLUMN IF NOT EXISTS pdf_default_secondary_color TEXT DEFAULT '#0B1120',
  ADD COLUMN IF NOT EXISTS pdf_template_id UUID REFERENCES pdf_branding_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_watermark_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pdf_watermark_opacity REAL DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS pdf_watermark_scale REAL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS pdf_watermark_position TEXT DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS pdf_watermark_diagonal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS brand_studio_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_logo_daily_limit INTEGER DEFAULT 3;

-- ───────────────────────────────────────────────────────
-- 6. SEED DEFAULT PDF TEMPLATE
-- ───────────────────────────────────────────────────────
INSERT INTO pdf_branding_templates (name, description, template_config, watermark_config, is_system, is_default, is_active, sort_order)
VALUES (
  'FRELUX Default',
  'Standard FRELUX-branded PDF template with watermark and purple accent bar.',
  '{"headerLayout":"logo-right","footerLayout":"default","contactPlacement":"header","accentBar":true,"accentBarColor":"#7C3AED"}'::jsonb,
  '{"enabled":true,"opacity":0.08,"scale":0.6,"position":"center","diagonal":false}'::jsonb,
  TRUE, TRUE, TRUE, 0
)
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ───────────────────────────────────────────────────────

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS brand_profiles_select_own ON brand_profiles;
CREATE POLICY brand_profiles_select_own ON brand_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS brand_profiles_insert_own ON brand_profiles;
CREATE POLICY brand_profiles_insert_own ON brand_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS brand_profiles_update_own ON brand_profiles;
CREATE POLICY brand_profiles_update_own ON brand_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS brand_profiles_delete_own ON brand_profiles;
CREATE POLICY brand_profiles_delete_own ON brand_profiles
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE pdf_branding_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_templates_select_all ON pdf_branding_templates;
CREATE POLICY pdf_templates_select_all ON pdf_branding_templates
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS pdf_templates_insert_admin ON pdf_branding_templates;
CREATE POLICY pdf_templates_insert_admin ON pdf_branding_templates
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS pdf_templates_update_admin ON pdf_branding_templates;
CREATE POLICY pdf_templates_update_admin ON pdf_branding_templates
  FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS pdf_templates_delete_admin ON pdf_branding_templates;
CREATE POLICY pdf_templates_delete_admin ON pdf_branding_templates
  FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') AND is_system = FALSE);

ALTER TABLE ai_logo_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_logo_select_own ON ai_logo_generations;
CREATE POLICY ai_logo_select_own ON ai_logo_generations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_logo_insert_own ON ai_logo_generations;
CREATE POLICY ai_logo_insert_own ON ai_logo_generations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_logo_update_own ON ai_logo_generations;
CREATE POLICY ai_logo_update_own ON ai_logo_generations FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_logo_delete_own ON ai_logo_generations;
CREATE POLICY ai_logo_delete_own ON ai_logo_generations FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE pdf_export_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_unlocks_select_own ON pdf_export_unlocks;
CREATE POLICY pdf_unlocks_select_own ON pdf_export_unlocks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pdf_unlocks_insert_service ON pdf_export_unlocks;
CREATE POLICY pdf_unlocks_insert_service ON pdf_export_unlocks
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS pdf_unlocks_update_service ON pdf_export_unlocks;
CREATE POLICY pdf_unlocks_update_service ON pdf_export_unlocks
  FOR UPDATE USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────
-- 8. STORAGE BUCKET FOR BRAND LOGOS
-- ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', TRUE)
ON CONFLICT (id) DO NOTHING;


DROP POLICY IF EXISTS brand_assets_read_all ON storage.objects;
CREATE POLICY brand_assets_read_all ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS brand_assets_insert_own ON storage.objects;
CREATE POLICY brand_assets_insert_own ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS brand_assets_update_own ON storage.objects;
CREATE POLICY brand_assets_update_own ON storage.objects
  FOR UPDATE USING (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS brand_assets_delete_own ON storage.objects;
CREATE POLICY brand_assets_delete_own ON storage.objects
  FOR DELETE USING (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

-- ───────────────────────────────────────────────────────
-- 9. SEED reward configs
-- ───────────────────────────────────────────────────────
INSERT INTO rewarded_tool_config (tool_key, tool_label, description, is_enabled, ad_provider, unlock_duration_hours, daily_usage_limit, cooldown_minutes, reward_rules)
VALUES (
  'brand_studio_pdf',
  'FRELUX Brand Studio PDF Export',
  'Unlock one branded PDF export by watching a rewarded ad.',
  FALSE, 'adsense', 0, 5, 0,
  '{"reward_type":"single_pdf_export","reward_amount":1}'::jsonb
)
ON CONFLICT (tool_key) DO NOTHING;

INSERT INTO ai_feature_costs (feature_key, feature_name, description, credit_cost, requires_credits, ad_unlock_enabled, ad_unlock_credits, daily_usage_limit, is_enabled, sort_order)
VALUES (
  'ai_logo_generation', 'AI Logo Generation', 'Generate custom business logos using AI.',
  2, TRUE, TRUE, 2, 3, FALSE, 100
)
ON CONFLICT (feature_key) DO NOTHING;

-- ───────────────────────────────────────────────────────
-- 10. TRIGGERS + INDEXES
-- ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_profiles_updated_at ON brand_profiles;
CREATE TRIGGER brand_profiles_updated_at BEFORE UPDATE ON brand_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS pdf_branding_templates_updated_at ON pdf_branding_templates;
CREATE TRIGGER pdf_branding_templates_updated_at BEFORE UPDATE ON pdf_branding_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS brand_profiles_user_idx ON brand_profiles (user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ai_logo_user_idx ON ai_logo_generations (user_id);
CREATE INDEX IF NOT EXISTS pdf_unlocks_lookup_idx ON pdf_export_unlocks (user_id, client_hash, tool_key, is_consumed, expires_at);
