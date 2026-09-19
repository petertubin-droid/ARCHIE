-- Phase 35: Activate the Adsterra display provider
--
-- Adsterra banner zones now render per-slot through the official
-- atOptions + invoke.js snippet (isolated per iframe in AdSlot.tsx).
-- The provider stays dormant — renders nothing, logs nothing — until an
-- Admin pastes a Banner zone key under Admin → Ads → Adsterra.
--
-- Idempotent: safe to re-run.

-- 1. Activate the provider row (empty credentials = no-op at runtime;
--    AdSlot's global-credential pass skips providers without a key).
UPDATE ad_providers
SET is_active = true,
    updated_at = now()
WHERE slug = 'adsterra';

-- 2. Remove Adsterra from every fallback chain (idempotency reset).
UPDATE ad_placements ap
SET provider_ids = COALESCE((
  SELECT jsonb_agg(e ORDER BY ord)
  FROM jsonb_array_elements(ap.provider_ids) WITH ORDINALITY AS t(e, ord)
  WHERE e #>> '{}' <> (SELECT id::text FROM ad_providers WHERE slug = 'adsterra')
), '[]'::jsonb)
WHERE ap.is_active = true;

-- 3. Re-insert Adsterra BEFORE Monetag in every active placement's chain
--    (Adsterra banners render in the slot; Monetag keeps its site-wide
--    tag for popunder/interstitial formats via Layout.tsx). Placements
--    without Monetag get Adsterra appended at the end.
UPDATE ad_placements ap
SET provider_ids = COALESCE((
  WITH elems AS (
    SELECT e, ord
    FROM jsonb_array_elements(ap.provider_ids) WITH ORDINALITY AS t(e, ord)
  ),
  mo_pos AS (
    SELECT MIN(ord)::numeric AS pos
    FROM elems
    WHERE e #>> '{}' = (SELECT id::text FROM ad_providers WHERE slug = 'monetag')
  )
  SELECT jsonb_agg(x ORDER BY o)
  FROM (
    SELECT e AS x, ord::numeric AS o FROM elems
    UNION ALL
    SELECT to_jsonb((SELECT id::text FROM ad_providers WHERE slug = 'adsterra')),
           COALESCE((SELECT pos - 0.5 FROM mo_pos), 1000000)
  ) u
), '[]'::jsonb)
WHERE ap.is_active = true
  AND EXISTS (SELECT 1 FROM ad_providers WHERE slug = 'adsterra');
