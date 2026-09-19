-- =========================================================
-- Phase 33: Admin can manage user_paid_status (grant/revoke subscriptions)
--
-- The admin needs INSERT/UPDATE access to user_paid_status so they
-- can grant, extend, or revoke premium subscriptions from the admin panel.
-- Users (non-admin) still cannot write — only read their own row.
-- =========================================================

-- Admin can INSERT (for granting new subscriptions)
DROP POLICY IF EXISTS "user_paid_status_admin_insert" ON user_paid_status;
CREATE POLICY "user_paid_status_admin_insert"
ON user_paid_status FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Admin can UPDATE (for extending/revoke)
DROP POLICY IF EXISTS "user_paid_status_admin_update" ON user_paid_status;
CREATE POLICY "user_paid_status_admin_update"
ON user_paid_status FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Admin can DELETE (if needed)
DROP POLICY IF EXISTS "user_paid_status_admin_delete" ON user_paid_status;
CREATE POLICY "user_paid_status_admin_delete"
ON user_paid_status FOR DELETE
TO authenticated
USING (public.is_admin());

-- Ensure the admin SELECT policy covers all rows (re-create to be safe)
DROP POLICY IF EXISTS "user_paid_status_select_own" ON user_paid_status;
CREATE POLICY "user_paid_status_select_own"
ON user_paid_status FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());
