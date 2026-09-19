-- =========================================================
-- ARCHIE ADMIN CONSOLE TABLE GRANTS (owner report
-- 2026-09-14: "coding is giving permission denied for table
-- archie_calculation_traces" and much of ARCHIE's console —
-- trading/market observations, offensive security, patch
-- proposals, subsystems, constitution — appeared missing).
--
-- ROOT CAUSE: 14 archie_* tables were migrated with RLS
-- policies but WITHOUT the role grants the admin console's
-- client (authenticated) needs. RLS without a table grant is
-- a hard "permission denied for table" — the console can
-- never even reach the policy.
--
-- This restores the standard grant pattern (identical to
-- archie_change_requests etc.): SELECT, INSERT, UPDATE,
-- DELETE for anon + authenticated. Row security stays ON
-- with force-row-security; the existing admin policies
-- (is_current_user_admin()) still gate every row, so this
-- grants table ACCESS, never data. GRANT is idempotent.
-- =========================================================

-- Verified before writing: every table below has relrowsecurity
-- = true and admin policies in place.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_calculation_traces TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_code_findings TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_constitution TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_global_authorizations TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_global_market_observations TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_inspection_reports TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_installation_identity TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_migration_environments TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_offensive_engagements TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_offensive_findings TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_offensive_targets TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_patch_proposals TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_subsystem_status TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.archie_subsystems TO authenticated, anon;
