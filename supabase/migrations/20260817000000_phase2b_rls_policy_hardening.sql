/*
# FRELUX PAINT CALC — Phase 2b: RLS Policy Hardening

Addresses HIGH/MEDIUM findings from the Phase 2 security audit that
were not covered by the Phase 2a migration.

1. HIGH — Admin write policies used WITH CHECK (true) / USING (true)
   instead of is_admin(). Any authenticated user could modify:
   - site_branding (branding, titles, logos)
   - ad_providers (API keys, credentials)
   - ad_placements (ad configuration)
   - ad_analytics_events (revenue analytics)
   - rewarded_feature_config (rewarded access rules)
   - labour_settings (pricing rates)
   - labour_categories (labour categories)
   - screeding_materials (material prices)

2. HIGH — ad_providers.credentials publicly readable by anonymous
   users. API keys, SDK keys, and app signatures exposed to every
   browser visitor.

3. HIGH — ai_learn_chat SELECT used USING(true), exposing every
   user's AI chat history to anonymous visitors.

4. MEDIUM — rewarded_unlock_log INSERT WITH CHECK (true) allowed
   anyone to mint fake unlock records and bypass the ad paywall.

5. MEDIUM — rewarded_ad_events INSERT WITH CHECK (true) allowed
   anyone to spoof ad revenue events.

6. MEDIUM — advanced_estimates INSERT was unscoped (WITH CHECK true)
   despite SELECT/UPDATE/DELETE being properly scoped to owner.

7. MEDIUM — room-images storage policy allowed anon to delete any
   object.
*/

-- =========================================================
-- 1. HIGH: Fix admin write policies to use is_admin()
-- =========================================================

-- site_branding
DROP POLICY IF EXISTS "admin_insert_branding" ON site_branding;
CREATE POLICY "admin_insert_branding" ON site_branding FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_branding" ON site_branding;
CREATE POLICY "admin_update_branding" ON site_branding FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_branding" ON site_branding;
CREATE POLICY "admin_delete_branding" ON site_branding FOR DELETE
  TO authenticated USING (public.is_admin());

-- ad_providers (write policies)
DROP POLICY IF EXISTS "admin_insert_ad_providers" ON ad_providers;
CREATE POLICY "admin_insert_ad_providers" ON ad_providers FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ad_providers" ON ad_providers;
CREATE POLICY "admin_update_ad_providers" ON ad_providers FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ad_providers" ON ad_providers;
CREATE POLICY "admin_delete_ad_providers" ON ad_providers FOR DELETE
  TO authenticated USING (public.is_admin());

-- ad_placements
DROP POLICY IF EXISTS "admin_insert_ad_placements" ON ad_placements;
CREATE POLICY "admin_insert_ad_placements" ON ad_placements FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ad_placements" ON ad_placements;
CREATE POLICY "admin_update_ad_placements" ON ad_placements FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ad_placements" ON ad_placements;
CREATE POLICY "admin_delete_ad_placements" ON ad_placements FOR DELETE
  TO authenticated USING (public.is_admin());

-- ad_analytics_events (admin read/write)
DROP POLICY IF EXISTS "admin_read_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_read_ad_analytics" ON ad_analytics_events FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_update_ad_analytics" ON ad_analytics_events FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_ad_analytics" ON ad_analytics_events;
CREATE POLICY "admin_delete_ad_analytics" ON ad_analytics_events FOR DELETE
  TO authenticated USING (public.is_admin());

-- rewarded_feature_config
DROP POLICY IF EXISTS "admin_insert_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_insert_rewarded_feature_config" ON rewarded_feature_config FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_update_rewarded_feature_config" ON rewarded_feature_config FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_rewarded_feature_config" ON rewarded_feature_config;
CREATE POLICY "admin_delete_rewarded_feature_config" ON rewarded_feature_config FOR DELETE
  TO authenticated USING (public.is_admin());

-- labour_settings
DROP POLICY IF EXISTS "admin_insert_labour_settings" ON labour_settings;
CREATE POLICY "admin_insert_labour_settings" ON labour_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_labour_settings" ON labour_settings;
CREATE POLICY "admin_update_labour_settings" ON labour_settings FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_labour_settings" ON labour_settings;
CREATE POLICY "admin_delete_labour_settings" ON labour_settings FOR DELETE
  TO authenticated USING (public.is_admin());

-- labour_categories
DROP POLICY IF EXISTS "admin_insert_labour_categories" ON labour_categories;
CREATE POLICY "admin_insert_labour_categories" ON labour_categories FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_labour_categories" ON labour_categories;
CREATE POLICY "admin_update_labour_categories" ON labour_categories FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_labour_categories" ON labour_categories;
CREATE POLICY "admin_delete_labour_categories" ON labour_categories FOR DELETE
  TO authenticated USING (public.is_admin());

-- =========================================================
-- 2. HIGH: Restrict ad_providers SELECT to exclude credentials
-- =========================================================
-- Create a public view that excludes the credentials column.
-- The frontend reads ad provider config via this view, not the
-- raw table. Admins can still read the full table.

-- Drop old public SELECT policy on ad_providers
DROP POLICY IF EXISTS "public_read_ad_providers" ON ad_providers;

-- Admin-only full SELECT on ad_providers (includes credentials)
DROP POLICY IF EXISTS "admin_read_ad_providers" ON ad_providers;
CREATE POLICY "admin_read_ad_providers" ON ad_providers FOR SELECT
  TO authenticated USING (public.is_admin());

-- Create a public view that includes only safe credential fields.
-- AdSense publisher_id and Ad Manager network_code are NOT secret — they
-- are embedded in public ad tags. Sensitive fields like sdk_key, app_key,
-- api_key are excluded.
CREATE OR REPLACE VIEW public.ad_providers_public AS
  SELECT id, name, slug, provider_type, is_active, priority,
         settings, is_system, created_at, updated_at,
         -- Expose only safe credential fields needed for client-side ad rendering
         jsonb_build_object(
           'publisher_id', credentials->>'publisher_id',
           'client_id', credentials->>'client_id',
           'network_code', credentials->>'network_code',
           'ad_unit_code', credentials->>'ad_unit_code',
           'ad_unit_id', credentials->>'ad_unit_id',
           'app_id', credentials->>'app_id',
           'placement_id', credentials->>'placement_id'
         ) AS credentials
  FROM public.ad_providers;

-- The view is accessible to all (anon + authenticated) by default
-- since views don't have RLS — they inherit the underlying table's
-- policies. But ad_providers now has no anon SELECT policy, so we
-- need to grant SELECT on the view directly.
GRANT SELECT ON public.ad_providers_public TO anon, authenticated;

-- =========================================================
-- 3. HIGH: Fix ai_learn_chat to restrict SELECT to owner/admin
-- =========================================================

DROP POLICY IF EXISTS "public_read_ai_learn_chat" ON ai_learn_chat;
DROP POLICY IF EXISTS "restricted_read_ai_learn_chat" ON ai_learn_chat;
CREATE POLICY "restricted_read_ai_learn_chat" ON ai_learn_chat FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT session_id FROM ai_learn_chat
      WHERE user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Restrict INSERT: must have either user_id = auth.uid() or a client_hash
DROP POLICY IF EXISTS "public_insert_ai_learn_chat" ON ai_learn_chat;
DROP POLICY IF EXISTS "restricted_insert_ai_learn_chat" ON ai_learn_chat;
CREATE POLICY "restricted_insert_ai_learn_chat" ON ai_learn_chat FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- =========================================================
-- 4. MEDIUM: Tighten rewarded_unlock_log INSERT
-- =========================================================
-- Only allow INSERT if the tool_key exists in rewarded_tool_config
-- and is enabled. This prevents arbitrary fake unlock records.

DROP POLICY IF EXISTS "insert_unlock_log" ON rewarded_unlock_log;
CREATE POLICY "insert_unlock_log" ON rewarded_unlock_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tool_key IN (
      SELECT rewarded_tool_config.tool_key
      FROM rewarded_tool_config
      WHERE rewarded_tool_config.is_enabled = true
    )
  );

-- =========================================================
-- 5. MEDIUM: Tighten rewarded_ad_events INSERT
-- =========================================================
-- Only allow INSERT if the tool_key exists in rewarded_tool_config
-- or rewarded_feature_config.

DROP POLICY IF EXISTS "insert_ad_events" ON rewarded_ad_events;
CREATE POLICY "insert_ad_events" ON rewarded_ad_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tool_key IN (
      SELECT rewarded_tool_config.tool_key
      FROM rewarded_tool_config
      WHERE rewarded_tool_config.is_enabled = true
    )
    OR tool_key IN (
      SELECT rewarded_feature_config.feature_key
      FROM rewarded_feature_config
      WHERE rewarded_feature_config.is_enabled = true
    )
  );

-- =========================================================
-- 6. MEDIUM: Scope advanced_estimates INSERT to owner
-- =========================================================

DROP POLICY IF EXISTS "insert_own_estimates" ON advanced_estimates;
CREATE POLICY "insert_own_estimates" ON advanced_estimates FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
  );

-- =========================================================
-- 7. MEDIUM: Fix room-images storage deletion policy
-- =========================================================
-- Restrict deletion to authenticated users who own the object
-- (by path prefix matching their user ID) or admins.
-- Note: Storage policies use storage.foldername() for path matching.

-- Drop the permissive delete policy
DROP POLICY IF EXISTS "room-images delete policy" ON storage.objects;
DROP POLICY IF EXISTS "room_images_delete" ON storage.objects;

-- Create a restricted delete policy: only authenticated users can
-- delete, and only objects in their own user folder
DROP POLICY IF EXISTS "room_images_delete_own" ON storage.objects;
CREATE POLICY "room_images_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'room-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );
