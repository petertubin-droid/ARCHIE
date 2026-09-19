-- =========================================================
-- Phase 29: Fix "permission denied for table screeding_mix_config"
-- Date: 2026-08-22
--
-- Problem: screeding_mix_config was created before the phase21 grants
-- migration, so it only ever received a public SELECT grant + policy.
-- The admin page (AdminScreedingMaterials.tsx) calls .update() on this
-- table, which fails with "permission denied for table
-- screeding_mix_config" because:
--   1. There is no GRANT UPDATE for the authenticated role.
--   2. There is no RLS policy allowing admins to write to it.
--
-- Fix: grant UPDATE to authenticated, and add an RLS policy that only
-- allows writes when the current user is an admin (same pattern used
-- by other admin-managed config tables via is_current_user_admin()).
-- =========================================================

GRANT UPDATE ON public.screeding_mix_config TO authenticated;

DROP POLICY IF EXISTS "admin_write_screeding_mix_config" ON public.screeding_mix_config;
CREATE POLICY "admin_write_screeding_mix_config" ON public.screeding_mix_config
  FOR UPDATE TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_screeding_mix_config" ON public.screeding_mix_config;
CREATE POLICY "admin_insert_screeding_mix_config" ON public.screeding_mix_config
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

GRANT INSERT ON public.screeding_mix_config TO authenticated;
