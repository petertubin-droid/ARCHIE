-- ─────────────────────────────────────────────────────────
-- Phase 34: Activate the rewarded ad system end to end
--
-- 1. Monetag gets a dedicated REWARDED zone (11712895, from the
--    Monetag SDK tag) separate from the display zone (275352).
--    getMonetagZone() prefers credentials.rewarded_zone_id.
--
-- 2. Monetag's provider_type is aligned to the code catalog
--    ('mixed' — display + rewarded). Google AdMob (mobile-only,
--    empty credentials, unusable on web) is deactivated so the
--    active rewarded provider list reflects reality.
--
-- 3. The AI Building Photo Estimator (ImageEstimator) joins the
--    standard rewarded unlock flow: tool + feature config rows
--    pointing at Monetag. The ai-building-estimation edge
--    function now honors active rewarded_unlock_log entries.
-- ─────────────────────────────────────────────────────────

-- 1. Monetag: rewarded zone + correct provider type
UPDATE public.ad_providers
SET provider_type = 'mixed',
    credentials = credentials
      || jsonb_build_object('rewarded_zone_id', '11712895'),
    updated_at = now()
WHERE slug = 'monetag';

-- 2. Deactivate Google AdMob (mobile SDK, empty credentials —
--    cannot serve on the web site)
UPDATE public.ad_providers
SET is_active = false,
    updated_at = now()
WHERE slug = 'google_admob'
  AND is_active = true;

-- 3a. Rewarded tool config for the AI image estimator
DO $mig$
BEGIN
  INSERT INTO public.rewarded_tool_config (
    tool_key, tool_label, description, is_enabled, ad_provider,
    unlock_duration_hours, daily_usage_limit, cooldown_minutes,
    reward_rules, primary_provider_id, fallback_provider_id
  )
  SELECT
    'image_estimator',
    'AI Building Photo Estimation',
    'Unlock the AI building photo estimator by watching a rewarded ad.',
    true,
    'monetag',
    24,
    0,
    0,
    '{"reward_type": "feature_unlock", "reward_amount": 1}'::jsonb,
    p.id,
    p.id
  FROM public.ad_providers p
  WHERE p.slug = 'monetag'
    AND NOT EXISTS (
      SELECT 1 FROM public.rewarded_tool_config t
      WHERE t.tool_key = 'image_estimator'
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- 3b. Rewarded feature config (richer settings consulted by
--     useRewardedAccess and grant-rewarded-unlock)
DO $mig$
BEGIN
  INSERT INTO public.rewarded_feature_config (
    feature_key, feature_name, description, is_enabled,
    primary_provider_id, fallback_provider_id,
    unlock_duration_minutes, daily_usage_limit, cooldown_minutes,
    reward_rules, revenue_per_unlock
  )
  SELECT
    'image_estimator',
    'AI Building Photo Estimation',
    'Unlock the AI building photo estimator — one photo in, a full material and cost breakdown out.',
    true,
    p.id,
    p.id,
    1440,
    0,
    0,
    '{"reward_type": "feature_unlock", "reward_amount": 1, "failure_message": "Unable to load ad. Please try again.", "success_message": "Feature unlocked! Enjoy your premium access."}'::jsonb,
    0
  FROM public.ad_providers p
  WHERE p.slug = 'monetag'
    AND NOT EXISTS (
      SELECT 1 FROM public.rewarded_feature_config f
      WHERE f.feature_key = 'image_estimator'
    );
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;


-- 3c. If an earlier run inserted the rows with placeholder
--     provider ids (e.g. AdMob), repoint them at Monetag.
UPDATE public.rewarded_tool_config
SET primary_provider_id = (SELECT id FROM public.ad_providers WHERE slug = 'monetag'),
    fallback_provider_id = (SELECT id FROM public.ad_providers WHERE slug = 'monetag')
WHERE tool_key = 'image_estimator'
  AND primary_provider_id IS DISTINCT FROM (SELECT id FROM public.ad_providers WHERE slug = 'monetag');

UPDATE public.rewarded_feature_config
SET primary_provider_id = (SELECT id FROM public.ad_providers WHERE slug = 'monetag'),
    fallback_provider_id = (SELECT id FROM public.ad_providers WHERE slug = 'monetag')
WHERE feature_key = 'image_estimator'
  AND primary_provider_id IS DISTINCT FROM (SELECT id FROM public.ad_providers WHERE slug = 'monetag');
