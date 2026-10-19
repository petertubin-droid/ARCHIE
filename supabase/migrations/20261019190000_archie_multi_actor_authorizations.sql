-- ============================================================================
-- ARCHIE MULTI-ACTOR AUTHORIZATIONS (2026-10-19)
--
-- Deliberate implementation of the multi-actor grant design that
-- arrived misdirected in the FRELUX repo (commit 074638d8's
-- migration loosened RLS so ANY authenticated user could write
-- authorization rows — a privilege-escalation hole, since the
-- runtime honors minted records). This is the correct version:
--
--   * granted_by widens to OWNER | ADMIN | SYSTEM | AUTO.
--   * The WRITE path stays strictly admin-gated
--     (is_current_user_admin()) plus service role. No
--     authenticated-open writes.
--   * The runtime honors all four grantor types; trust lives in
--     the write path, not the read path.
-- ============================================================================

-- 1. Widen the granted_by contract to the four legitimate grantors
DO $$
BEGIN
  ALTER TABLE public.archie_global_authorizations
    DROP CONSTRAINT IF EXISTS archie_global_authorizations_granted_by_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.archie_global_authorizations
  ADD CONSTRAINT archie_global_authorizations_granted_by_check
  CHECK (granted_by IN ('OWNER', 'ADMIN', 'SYSTEM', 'AUTO'));

-- 2. Re-assert the admin-gated RLS posture explicitly
--    (unchanged from the current production policies; documented
--    here because the write path is the trust boundary)
DROP POLICY IF EXISTS "owner_read_authorizations" ON public.archie_global_authorizations;
DROP POLICY IF EXISTS "owner_write_authorizations" ON public.archie_global_authorizations;
DROP POLICY IF EXISTS "owner_revoke_authorizations" ON public.archie_global_authorizations;

CREATE POLICY "owner_read_authorizations"
  ON public.archie_global_authorizations FOR SELECT
  TO authenticated USING (is_current_user_admin());

CREATE POLICY "owner_write_authorizations"
  ON public.archie_global_authorizations FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

CREATE POLICY "owner_revoke_authorizations"
  ON public.archie_global_authorizations FOR UPDATE
  TO authenticated USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());
