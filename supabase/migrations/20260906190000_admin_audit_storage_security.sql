-- Admin audit: storage security hardening
-- 1. brand-assets: previously ANY authenticated user could upload/overwrite/
--    delete site branding (logo, favicon). Now admin-only.
-- 2. room-images: previously ANONYMOUS users could upload and delete files
--    (malware/phishing hosting surface on the Supabase domain). Bucket is not
--    referenced by any frontend code; writes now require login + own folder.
-- 3. marketplace (legacy bucket, unreferenced by code): any authenticated user
--    could write anywhere; now scoped to the user's own uid folder.

-- =========================================================
-- brand-assets → admin-only writes
-- =========================================================
DROP POLICY IF EXISTS brand_assets_insert_own ON storage.objects;
CREATE POLICY brand_assets_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'brand-assets') AND is_admin());

DROP POLICY IF EXISTS brand_assets_update_own ON storage.objects;
CREATE POLICY brand_assets_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING ((bucket_id = 'brand-assets') AND is_admin())
  WITH CHECK ((bucket_id = 'brand-assets') AND is_admin());

DROP POLICY IF EXISTS brand_assets_delete_own ON storage.objects;
CREATE POLICY brand_assets_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'brand-assets') AND is_admin());

-- =========================================================
-- room-images → no more anonymous public write/delete
-- =========================================================
DROP POLICY IF EXISTS room_images_public_insert ON storage.objects;
CREATE POLICY room_images_public_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'room-images') AND ((storage.foldername(name))[1] = (auth.uid())::text));

DROP POLICY IF EXISTS room_images_public_delete ON storage.objects;
CREATE POLICY room_images_public_delete ON storage.objects
  FOR DELETE TO authenticated
  USING ((bucket_id = 'room-images') AND ((storage.foldername(name))[1] = (auth.uid())::text));

-- =========================================================
-- marketplace (legacy bucket) → uid-scoped writes
-- =========================================================
DROP POLICY IF EXISTS marketplace_auth_insert ON storage.objects;
CREATE POLICY marketplace_auth_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'marketplace') AND ((storage.foldername(name))[1] = (auth.uid())::text));
