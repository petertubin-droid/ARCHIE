-- =========================================================
-- Fix: screeding_system_config missing table-level GRANTs
-- 2026-09-03
--
-- Migration 20260903120000_screeding_material_systems.sql created
-- the table and a public-read RLS policy (qual = true), but never
-- issued a GRANT SELECT to anon/authenticated. Postgres checks base
-- table privileges before RLS policies apply, so with no grant the
-- RLS policy was unreachable and every anon/authenticated request
-- returned zero rows — surfaced on the live site as "No active Putty
-- configuration was found in the database".
-- =========================================================

GRANT SELECT ON public.screeding_system_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.screeding_system_config TO authenticated;
GRANT ALL ON public.screeding_system_config TO service_role;
