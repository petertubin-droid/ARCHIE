-- =============================================================
-- FRELUX RLS — ADMIN GATES ON CONFIG TABLES (audit F1, F5, F6)
-- Owner-approved fix, 2026-09-10.
--
-- F1 CRITICAL: labour_settings, labour_categories,
--   screeding_materials, rewarded_feature_config, site_branding
--   carried write policies named "admin_*"/"auth_*" but with
--   qual/check = true — ANY authenticated user could rewrite
--   global labour rates, material prices, ad config and site
--   branding. Now gated by public.is_admin(), the exact
--   pattern already proven on estimation_prices.
-- F5 MEDIUM: ad_analytics_events UPDATE/DELETE gated to admins.
--   INSERT stays public (ads fire-and-report from all readers)
--   and admin_read stays as-is per audit scope.
-- F6 MEDIUM: contact_messages public INSERT now rate-limited at
--   the database layer: max 10 messages per email per 24h.
--   Closes the anonymous spam vector without an edge function.
--
-- Idempotent: ALTER POLICY re-runs safely; fresh installs replay
-- the original CREATEs first, then these gates — converging both
-- environments to the same state.
-- =============================================================

-- ---------- F1: labour_settings ----------
ALTER POLICY "admin_delete_labour_settings" ON public.labour_settings
  USING (public.is_admin());
ALTER POLICY "admin_insert_labour_settings" ON public.labour_settings
  WITH CHECK (public.is_admin());
ALTER POLICY "admin_update_labour_settings" ON public.labour_settings
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- F1: labour_categories ----------
ALTER POLICY "admin_delete_labour_categories" ON public.labour_categories
  USING (public.is_admin());
ALTER POLICY "admin_insert_labour_categories" ON public.labour_categories
  WITH CHECK (public.is_admin());
ALTER POLICY "admin_update_labour_categories" ON public.labour_categories
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- F1: screeding_materials ----------
ALTER POLICY "auth_delete_screeding_materials" ON public.screeding_materials
  USING (public.is_admin());
ALTER POLICY "auth_insert_screeding_materials" ON public.screeding_materials
  WITH CHECK (public.is_admin());
ALTER POLICY "auth_update_screeding_materials" ON public.screeding_materials
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- F1: rewarded_feature_config ----------
ALTER POLICY "admin_delete_rewarded_feature_config" ON public.rewarded_feature_config
  USING (public.is_admin());
ALTER POLICY "admin_insert_rewarded_feature_config" ON public.rewarded_feature_config
  WITH CHECK (public.is_admin());
ALTER POLICY "admin_update_rewarded_feature_config" ON public.rewarded_feature_config
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- F1: site_branding ----------
ALTER POLICY "admin_delete_branding" ON public.site_branding
  USING (public.is_admin());
ALTER POLICY "admin_insert_branding" ON public.site_branding
  WITH CHECK (public.is_admin());
ALTER POLICY "admin_update_branding" ON public.site_branding
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------- F5: ad_analytics_events ----------
ALTER POLICY "admin_update_ad_analytics" ON public.ad_analytics_events
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
ALTER POLICY "admin_delete_ad_analytics" ON public.ad_analytics_events
  USING (public.is_admin());

-- ---------- F6: contact_messages (spam rate limit) ----------
-- Policy expressions cannot reference NEW, and a direct
-- self-referencing subquery would collide with RLS recursion
-- and the anon role's lack of SELECT. A SECURITY DEFINER
-- helper encapsulates the count and returns only a boolean.
CREATE OR REPLACE FUNCTION public.contact_messages_rate_ok(
  p_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT count(*)
    FROM public.contact_messages
    WHERE email = p_email
      AND created_at > now() - interval '24 hours'
  ) < 10;
$$;

ALTER POLICY "contact_messages_public_insert" ON public.contact_messages
  WITH CHECK (public.contact_messages_rate_ok(email));
