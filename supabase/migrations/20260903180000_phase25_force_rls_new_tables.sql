-- =========================================================
-- Phase 25 follow-up: FORCE RLS on post-Aug-26 tables
-- 2026-09-03
--
-- Migration 20260826000000_force_rls_remaining_tables forced RLS
-- on all tables existing at that time. Seven tables created after
-- it were enabled for RLS but never FORCEd — leaving the table
-- owner able to bypass policies. Close the gap:
--   admin_ai_actions, brand_profiles, pdf_branding_templates,
--   ai_logo_generations, pdf_export_unlocks, learn_article_faqs,
--   screeding_system_config
-- =========================================================

ALTER TABLE public.admin_ai_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.brand_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_branding_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logo_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_export_unlocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.learn_article_faqs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.screeding_system_config FORCE ROW LEVEL SECURITY;
