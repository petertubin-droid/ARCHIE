-- =========================================================
-- Phase 41: Re-harden ad_providers / ad_placements write policies
--
-- Root cause of a "permission denied for table ad_providers" save
-- error reported from the live admin panel: the *anon* role has no
-- UPDATE/INSERT/DELETE grant on these tables (by design — only
-- SELECT is exposed to anon, and only through the sanitized
-- ad_providers_public view). When a request executes unauthenticated
-- (e.g. an expired mobile session that didn't refresh in time), it
-- hits that missing grant and Postgres raises 42501. That part is
-- working as intended — the fix there is simply to refresh/re-login.
--
-- BUT while diagnosing this, found a real hardening gap: the write
-- policies (INSERT/UPDATE/DELETE) on both tables currently read
-- USING (true) / WITH CHECK (true) for role `authenticated` — i.e.
-- ANY logged-in user, not just admins, can write ad provider
-- credentials or placements via a direct REST call. Phase 2b
-- (20260817000000) intended to gate these behind is_admin(), and the
-- SELECT policy on ad_providers correctly does, but the three write
-- policies were left permissive (likely from the original phase15
-- seed policies, dated 20260803, never actually overwritten live).
--
-- This migration restores the admin-only intent for all six policies.
-- =========================================================

-- ad_providers
DROP POLICY IF EXISTS "admin_insert_ad_providers" ON public.ad_providers;
CREATE POLICY "admin_insert_ad_providers" ON public.ad_providers FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ad_providers" ON public.ad_providers;
CREATE POLICY "admin_update_ad_providers" ON public.ad_providers FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ad_providers" ON public.ad_providers;
CREATE POLICY "admin_delete_ad_providers" ON public.ad_providers FOR DELETE
  TO authenticated USING (public.is_admin());

-- ad_placements (public read stays as-is — placement metadata isn't secret)
DROP POLICY IF EXISTS "admin_insert_ad_placements" ON public.ad_placements;
CREATE POLICY "admin_insert_ad_placements" ON public.ad_placements FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ad_placements" ON public.ad_placements;
CREATE POLICY "admin_update_ad_placements" ON public.ad_placements FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ad_placements" ON public.ad_placements;
CREATE POLICY "admin_delete_ad_placements" ON public.ad_placements FOR DELETE
  TO authenticated USING (public.is_admin());
