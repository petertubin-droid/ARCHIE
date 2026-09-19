-- =========================================================
-- Phase 24: Harden ad_providers_public view (non-destructive)
-- Date: 2026-08-20
--
-- Context: The Supabase dashboard flags ad_providers_public as a
-- SECURITY DEFINER view (PostgreSQL default for views). After a
-- full audit, SECURITY DEFINER is intentionally required because:
--
--   1. The view extracts safe sub-fields from the `credentials`
--      JSONB column, which also contains secrets (sdk_key, api_key).
--   2. The underlying ad_providers table has admin-only RLS after
--      phase2b hardening — no anon/authenticated SELECT policy.
--   3. SECURITY INVOKER would make the view return empty results
--      for all non-admin users, breaking ad rendering site-wide.
--   4. Adding a public SELECT policy on ad_providers to support
--      SECURITY INVOKER would expose the raw `credentials` column
--      (including sdk_key, api_key) to anyone querying the table
--      directly.
--
-- These two changes are non-destructive:
--   1. COMMENT documents the reasoning for future developers.
--   2. REVOKE removes any accidental table-level grants on the
--      raw ad_providers table so only the view is publicly
--      accessible.
-- =========================================================

-- 1. Document why SECURITY DEFINER is required
COMMENT ON VIEW public.ad_providers_public IS
  'SECURITY DEFINER is intentional. This view extracts safe credential '
  'sub-fields (publisher_id, network_code, ad_unit_id, etc.) from the '
  'credentials JSONB column, which also contains secrets like sdk_key '
  'and api_key. The underlying ad_providers table has admin-only RLS. '
  'Switching to SECURITY INVOKER would return empty results for non-admin '
  'users (breaking ad rendering) or require a public SELECT policy that '
  'would expose raw credentials. DO NOT change to SELECT * or add the '
  'raw credentials column.';

-- 2. Defensive: revoke any accidental grants on the raw table
--    Only the view should be publicly accessible.
REVOKE SELECT ON public.ad_providers FROM anon;
REVOKE SELECT ON public.ad_providers FROM authenticated;
