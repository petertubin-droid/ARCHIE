-- =========================================================
-- Phase 21: Fix missing GRANT statements for anon/authenticated roles
-- Date: 2026-08-20
--
-- Problem: RLS policies define which rows anon/authenticated can see,
-- but the roles lack GRANT privileges on most tables. Without a GRANT,
-- PostgreSQL returns "permission denied for table X" before RLS even
-- runs. Only ad_providers_public had an explicit GRANT.
--
-- This migration grants the minimum privileges needed:
--   - SELECT on all public-read tables (calculators, catalogs)
--   - INSERT on anon-writable tables (contact, errors, analytics, AI chat)
--   - UPDATE/DELETE on user-owned tables (project_versions, profiles)
--   - USAGE on the public schema (safety net)
--   - ALTER DEFAULT PRIVILEGES so future tables get the right grants
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. Schema USAGE (safety net — usually already present)
-- ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 2. SELECT on all public-read tables (calculator data)
-- ─────────────────────────────────────────────────────────
GRANT SELECT ON public.paint_types TO anon, authenticated;
GRANT SELECT ON public.paint_products TO anon, authenticated;
GRANT SELECT ON public.paint_colors TO anon, authenticated;
GRANT SELECT ON public.material_prices TO anon, authenticated;
GRANT SELECT ON public.labor_rates TO anon, authenticated;
GRANT SELECT ON public.color_families TO anon, authenticated;
GRANT SELECT ON public.color_categories TO anon, authenticated;
GRANT SELECT ON public.color_combinations TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.legal_pages TO anon, authenticated;
GRANT SELECT ON public.quotation_settings TO anon, authenticated;
GRANT SELECT ON public.timeline_templates TO anon, authenticated;
GRANT SELECT ON public.weather_cache TO anon, authenticated;
GRANT SELECT ON public.screeding_materials TO anon, authenticated;
GRANT SELECT ON public.screeding_mix_config TO anon, authenticated;
GRANT SELECT ON public.pop_workflows TO anon, authenticated;
GRANT SELECT ON public.pop_materials TO anon, authenticated;
GRANT SELECT ON public.tile_sizes TO anon, authenticated;
GRANT SELECT ON public.tile_materials TO anon, authenticated;
GRANT SELECT ON public.learn_articles TO anon, authenticated;
GRANT SELECT ON public.learn_article_versions TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.project_versions TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 3. INSERT on anon-writable tables
-- ─────────────────────────────────────────────────────────
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT INSERT ON public.error_logs TO anon, authenticated;
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT INSERT ON public.ai_learn_chat TO anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 4. UPDATE/DELETE on user-owned tables (authenticated only)
-- ─────────────────────────────────────────────────────────
GRANT UPDATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.project_versions TO authenticated;
GRANT DELETE ON public.project_versions TO authenticated;
GRANT INSERT ON public.project_versions TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 5. SELECT on ai_learn_chat (anon reads by session_id via RLS)
-- ─────────────────────────────────────────────────────────
GRANT SELECT ON public.ai_learn_chat TO anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- 6. ALTER DEFAULT PRIVILEGES for future tables
--    Ensures tables created by postgres role automatically
--    get anon/authenticated grants
-- ─────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT INSERT ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE ON TABLES TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 7. Verify: quick check that grants are in place
-- ─────────────────────────────────────────────────────────
-- (Run manually in SQL editor to verify:
--   SELECT tablename, has_table_privilege('anon', schemaname||'.'||tablename, 'SELECT')
--   FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- )
