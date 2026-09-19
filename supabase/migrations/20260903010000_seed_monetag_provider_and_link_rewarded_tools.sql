-- ─────────────────────────────────────────────────────────────────
-- Seed Monetag provider and link rewarded tools to it as primary
--
-- The Monetag provider was previously inserted via the admin panel only.
-- This migration makes it reproducible from migrations alone, so a
-- fresh database rebuild includes Monetag with the correct credentials.
--
-- After the phase21 view fix, ad_providers_public exposes zone_id and
-- sdk_url (they are public client-side values, not secrets). AdSlot's
-- two-pass resolution requires Monetag to have non-empty credentials
-- to resolve via hasCreds — this migration ensures they exist.
--
-- The rewarded tools (advanced_calculator, ai_color_assistant,
-- ai_learning_assistant, premium_reports) are linked to Monetag as
-- their primary rewarded ad provider, replacing the old 'adsense'
-- string-based ad_provider column which pointed at mobile-only SDKs.
-- ─────────────────────────────────────────────────────────────────

-- 1. Insert Monetag provider if it doesn't exist
INSERT INTO public.ad_providers (name, slug, provider_type, is_active, priority, credentials, settings, is_system)
VALUES (
  'Monetag',
  'monetag',
  'mixed',
  true,
  9,
  jsonb_build_object(
    'zone_id', '275352',
    'sdk_url', 'https://omg10.com/4/11712895',
    'format', 'interstitial,push,native,banner'
  ),
  jsonb_build_object(
    'display_ads_enabled', true,
    'sub_id', 'frelux'
  ),
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  is_active = true,
  credentials = EXCLUDED.credentials,
  settings = EXCLUDED.settings,
  is_system = true,
  updated_at = now();

-- 2. Link rewarded_feature_config entries to Monetag as primary provider
UPDATE public.rewarded_feature_config
SET
  primary_provider_id = (
    SELECT id FROM public.ad_providers WHERE slug = 'monetag' LIMIT 1
  ),
  updated_at = now()
WHERE feature_key IN (
  'advanced_calculator',
  'ai_color_assistant',
  'ai_learning_assistant',
  'premium_reports'
)
  AND primary_provider_id IS NULL;

-- 3. Link rewarded_tool_config entries to Monetag as primary provider
UPDATE public.rewarded_tool_config
SET
  primary_provider_id = (
    SELECT id FROM public.ad_providers WHERE slug = 'monetag' LIMIT 1
  ),
  ad_provider = 'monetag',
  updated_at = now()
WHERE tool_key IN (
  'advanced_calculator',
  'ai_color_assistant',
  'ai_learning_assistant',
  'premium_reports',
  'brand_studio_pdf'
)
  AND primary_provider_id IS NULL;

-- 4. Ensure the rewarded_feature_config entries are enabled
UPDATE public.rewarded_feature_config
SET is_enabled = true, updated_at = now()
WHERE feature_key IN (
  'advanced_calculator',
  'ai_color_assistant',
  'ai_learning_assistant',
  'premium_reports'
);

-- 5. Ensure the rewarded_tool_config entries are enabled
UPDATE public.rewarded_tool_config
SET is_enabled = true, updated_at = now()
WHERE tool_key IN (
  'advanced_calculator',
  'ai_color_assistant',
  'ai_learning_assistant',
  'premium_reports'
);
