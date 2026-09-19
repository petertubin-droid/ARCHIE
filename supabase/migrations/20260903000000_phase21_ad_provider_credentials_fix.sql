-- ─────────────────────────────────────────────────────────────────
-- Phase 21: Fix ad provider credential exposure and activate ad slots
--
-- Two problems fixed:
--
-- 1. SECURITY: the leftover "public_read_ad_providers" policy (phase 15)
--    made the RAW ad_providers table readable by anyone (anon). Admins
--    store ad-network credentials there — including secret API keys —
--    which would leak publicly. The hardened view (phase 2b) was meant
--    to replace this policy, but the policy was never dropped.
--
-- 2. FUNCTIONALITY: the ad_providers_public view whitelisted only seven
--    credential fields (publisher_id, client_id, network_code, ad_unit_code,
--    ad_unit_id, app_id, placement_id). Fields required for client-side
--    rendering — zone_id (Monetag), site_id (Ezoic), widget_id (RevContent),
--    sdk_url, cid, sub_id, and others — were stripped, so those providers
--    could never resolve in AdSlot. This is why no ad slots rendered even
--    though providers were active with credentials in the database.
--
--    The view now uses a DENYLIST instead: every credential field is
--    exposed (ad-network client credentials are public by nature — they
--    are printed into every visitor's page) EXCEPT the known secret
--    fields below. Adding a new provider or credential field requires
--    NO view change. If a provider definition ever adds a secret-sounding
--    credential key that is not listed in SECRET_CREDENTIAL_KEYS, add it
--    there (see src/lib/ad-providers.ts credential_fields).
-- ─────────────────────────────────────────────────────────────────

-- 1. Raw table: admin-only reads. The public goes through the view.
DROP POLICY IF EXISTS "public_read_ad_providers" ON public.ad_providers;

-- Self-sufficient: phase 2b hardened the write policies but its read
-- hardening appears not to have been applied to production (the public
-- read policy was still active there). Recreate the admin read policy
-- here so authenticated admins keep full access to the raw table.
DROP POLICY IF EXISTS "admin_read_ad_providers" ON public.ad_providers;
CREATE POLICY "admin_read_ad_providers" ON public.ad_providers FOR SELECT
  TO authenticated USING (public.is_admin());

-- 2. Rebuild the public view with the denylist.
CREATE OR REPLACE VIEW public.ad_providers_public AS
SELECT
  id,
  name,
  slug,
  provider_type,
  is_active,
  priority,
  settings,
  is_system,
  created_at,
  updated_at,
  -- All credentials EXCEPT secret fields. Secret keys are listed here so
  -- they are never shipped to the browser:
  (
    SELECT
      COALESCE(
        jsonb_object_agg(kv.key, kv.value),
        '{}'::jsonb
      )
    FROM
      jsonb_each(ad_providers.credentials) AS kv
    WHERE
      NOT (
        kv.key IN (
          -- True secrets only. Everything else is a public client-side
          -- ad-network credential (zone/site/app IDs are printed into
          -- every visitor's page by design). Adsterra "key" and BuySellAds
          -- "zone_keys"/"site_key" are PUBLIC script values — verified.
          'api_key',        -- generic API key (secret)
          'app_key',        -- ironSource (server-side)
          'app_signature',  -- ChartBoost (secret signature)
          'postback_url',   -- server-side S2S postback (no client need)
          'publisher_key',  -- Outbrain (secret)
          'sdk_key',        -- AppLovin (server-side)
          'secret',         -- generic secret (Bitcot)
          'secure_hash'     -- CPX Research (secret hash)
        )
        AND kv.value IS NOT NULL
        AND kv.value::text <> '""'
      )
  ) AS credentials
FROM
  public.ad_providers;

GRANT SELECT ON public.ad_providers_public TO anon, authenticated;
