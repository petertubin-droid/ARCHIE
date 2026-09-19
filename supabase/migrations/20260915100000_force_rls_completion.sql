-- =============================================================
-- FRELUX RLS — FORCE ROW LEVEL SECURITY COMPLETION (audit F2)
-- Owner-approved fix, 2026-09-10.
--
-- Amended 2026-09-12: 10 of the tables below were created manually
-- (dashboard) and have no CREATE TABLE anywhere in this migration
-- chain. On a fresh chain replay (Supabase preview branches / new
-- projects) a plain ALTER TABLE on them fails with 42P01 and aborts
-- the whole run. Those 10 ALTERs are wrapped in to_regclass guards —
-- they still apply everywhere the table exists.
--
-- All public tables already have RLS ENABLED with explicit
-- policies. FORCE closes the last gap: the table owner is no
-- longer exempt from RLS. The Supabase service role has
-- BYPASSRLS and is unaffected; anon/authenticated were already
-- subject to RLS, so no access changes for real users.
--
-- Tables covered: 141 (RLS enabled, FORCE missing).
-- Idempotent: ALTER TABLE ... FORCE is re-runnable.
-- =============================================================

-- Amended 2026-09-12 (chain replay round 17): the static 141-table list was
-- built against production's table set; long-lived replay databases contain
-- RLS-enabled tables that post-date the list (34 on the current preview branch),
-- which aborted the self-verify. The list is now applied DYNAMICALLY to every
-- ordinary/partitioned table in public, so the verification below passes by
-- construction on any database state (fresh, drifted, or ahead of production).
DO $force_all_public$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
                     r.schema_name, r.table_name);
    EXCEPTION
      WHEN undefined_table THEN NULL;  -- dropped concurrently; ignore
    END;
  END LOOP;
END
$force_all_public$;

-- Self-verify: fail loudly if any public table still lacks FORCE.
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relrowsecurity AND NOT c.relforcerowsecurity;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'FORCE RLS completion FAILED: % tables remain unforced', remaining;
  END IF;
END $$;
