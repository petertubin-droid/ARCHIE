-- =========================================================
-- ARCHIE STUDIO — TABLE GRANTS (follow-up fix)
--
-- The original studio migration (20260912000000) created the
-- frelux_studio_* tables without Postgres-level GRANTs, so
-- the service_role used by the archie-studio edge function
-- could not read or write them ("permission denied for
-- table frelux_studio_projects").
--
-- This grants the same privileges the other ARCHIE tables
-- carry (see the frelux_archie_* migrations):
--   * service_role  — full access (edge functions, RLS
--     bypassed, writes scoped to studio tables only)
--   * authenticated — SELECT only; all row-level access is
--     governed by the existing RLS policies (owner-only)
-- =========================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_studio_projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_studio_files TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_studio_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_studio_reviews TO service_role;

GRANT SELECT ON public.frelux_studio_projects TO authenticated;
GRANT SELECT ON public.frelux_studio_files TO authenticated;
GRANT SELECT ON public.frelux_studio_versions TO authenticated;
GRANT SELECT ON public.frelux_studio_reviews TO authenticated;
