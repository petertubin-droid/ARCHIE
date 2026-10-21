-- =========================================================
-- REPAIR: standard Supabase role grants on public schema
-- (forensic audit 2026-10-20, batch 38)
--
-- ROOT CAUSE: migrations applied through the Supabase
-- Management API SQL endpoint (the Manual Apply Rule path)
-- run as the table owner WITHOUT the CLI's automatic
-- grants. Measured at 2026-10-20 05:45Z:
--   * service_role missing SELECT on 70 public tables
--   * authenticated missing SELECT on 89
--   * anon missing SELECT on 100
-- including the lexicon (lexicon_words/lexicon_senses/...),
-- trading, treasury, long-term memory, episodic events,
-- telegram, email, scheduler, strategy, market and reasoning
-- tables. Every edge-function read on those tables failed
-- with permission denied and degraded SILENTLY:
-- DB-backed lexicon lookups returned null (definitions fell
-- to web research), frelux_status lexicon counts returned
-- -1, memory hydration ran empty, strategy stats never
-- loaded.
--
-- SAFETY: RLS is enabled on EVERY public table (verified
-- 2026-10-20: zero tables with rowsecurity=false), so
-- table-level grants are safe — policies still gate all row
-- access for anon/authenticated. This restores the standard
-- Supabase grant template.
--
-- IDEMPOTENT and re-runnable; the deploy workflow re-applies
-- this file's GRANT block after every migration reconcile.
-- =========================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO
  postgres, anon, authenticated, service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO
  postgres, anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO
  postgres, anon, authenticated, service_role;

-- NOTE (2026-10-20): ALTER DEFAULT PRIVILEGES is NOT included:
-- the Management API SQL endpoint (and CI's reconciler) run as a
-- role without permission to alter default privileges. Instead
-- the deploy workflow re-runs this file's idempotent GRANT block
-- after every migration reconcile, so tables created by any
-- future Management-API-applied migration are re-granted
-- automatically on the next deploy.
