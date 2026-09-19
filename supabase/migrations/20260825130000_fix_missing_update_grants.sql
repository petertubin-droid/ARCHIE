-- =========================================================
-- Fix: Missing UPDATE grants on 14 tables with RLS write policies
-- Date: 2026-08-25
--
-- The universal GRANT sync in phase 33 (20260822090000) walked
-- pg_policies and issued matching grants, but several tables added
-- in later phases (AI studio, analytics, estimation audit, learn
-- articles, user collections/favorites, rewarded ads, weather cache)
-- had RLS INSERT/UPDATE/DELETE policies created but the table-level
-- GRANT was never issued — causing "permission denied for table X"
-- errors when admin/users tried to update records.
-- =========================================================

-- AI tables
GRANT UPDATE ON public.ai_learn_chat TO authenticated;
GRANT UPDATE ON public.ai_request_log TO authenticated;
GRANT UPDATE ON public.ai_studio_chat TO authenticated;
GRANT UPDATE ON public.ai_studio_metrics TO authenticated;
GRANT UPDATE ON public.ai_studio_versions TO authenticated;

-- Analytics
GRANT UPDATE, INSERT ON public.analytics_events TO authenticated;

-- Estimation
GRANT UPDATE ON public.estimation_adjustments TO authenticated;
GRANT UPDATE, INSERT ON public.estimation_audit_log TO authenticated;

-- Learn
GRANT UPDATE, INSERT ON public.learn_article_versions TO authenticated;

-- User data
GRANT UPDATE, INSERT ON public.recently_viewed_colors TO authenticated;
GRANT UPDATE, INSERT ON public.user_collection_items TO authenticated;
GRANT UPDATE, INSERT ON public.user_favorites TO authenticated;

-- Ads / rewards
GRANT UPDATE ON public.rewarded_ad_events TO authenticated;
GRANT UPDATE, INSERT ON public.weather_cache TO authenticated;
