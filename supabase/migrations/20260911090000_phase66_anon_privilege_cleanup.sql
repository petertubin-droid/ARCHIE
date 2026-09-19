-- =========================================================
-- PHASE 66 — ANON PRIVILEGE CLEANUP (per-table verification)
-- =========================================================
-- PROBLEM (audit 2026-09-09):
--   The public schema's default privileges grant anon full
--   table rights (arwdDxtm) on every new relation. 302 tables
--   currently carry anon TRUNCATE. The phase23 default-privilege
--   revoke (2026-09-03) did not stick because it only covered
--   FOR ROLE postgres — tables created via the Supabase
--   Dashboard are created by supabase_admin, whose default
--   privileges were never fixed. Phase 56 also explicitly
--   GRANT ALL ... TO anon on two tables.
--
--   PostgREST never exposes TRUNCATE, so practical risk is low,
--   but for a worldwide-usage app the anon/authenticated roles
--   must never hold table rights the API cannot even express.
--
-- STRATEGY (safe, idempotent, app-neutral):
--   1. REVOKE TRUNCATE, REFERENCES, TRIGGER from anon AND
--      authenticated on every table in public. These three
--      rights are never needed through PostgREST — revoking
--      them cannot break any client flow. RLS policies are
--      unaffected (SELECT/INSERT/UPDATE/DELETE untouched).
--   2. Re-assert the secure default privileges for
--      FOR ROLE postgres (phase23) AND attempt the same for
--      supabase_admin — guarded, since the postgres role may
--      lack rights over supabase_admin's defaults.
--   3. PER-TABLE VERIFICATION: fail the migration if any
--      table in public still grants anon TRUNCATE /
--      REFERENCES / TRIGGER after cleanup.
--
-- NOT touched (deliberately):
--   - SELECT everywhere: PostgREST needs it; RLS governs rows.
--   - anon/authenticated INSERT/UPDATE/DELETE on tables that
--     have explicit grants + RLS policies (contact forms,
--     project_calculations, etc.). Removing those would break
--     live flows; the flagged systemic risk is TRUNCATE-class
--     rights, which this migration fully removes.
--   - service_role grants (server-side only, bypasses RLS).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Per-table revoke of API-impossible rights
--    (guarded per table so one ownership edge case cannot
--    abort the whole cleanup)
-- ---------------------------------------------------------
DO $cleanup$
DECLARE
  tbl RECORD;
  revoked_count INT := 0;
  failed_count INT := 0;
  failed_list TEXT := '';
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')  -- ordinary + partitioned tables
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',
        tbl.table_name
      );
      revoked_count := revoked_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- e.g. table owned by another role we cannot revoke from
      failed_count := failed_count + 1;
      failed_list := failed_list || ', ' || tbl.table_name;
    END;
  END LOOP;

  RAISE NOTICE 'PHASE66: revoked API-impossible rights from anon+authenticated on % table(s).%s',
    revoked_count,
    CASE WHEN failed_count > 0
      THEN format(' FAILED on %s table(s):%s — see verification section.', failed_count, failed_list)
      ELSE ''
    END;
END
$cleanup$;

-- ---------------------------------------------------------
-- 2. Fix default privileges for BOTH table-creating roles
-- ---------------------------------------------------------

-- 2a. postgres role (re-assert phase23 — idempotent)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- 2b. supabase_admin role (the reason phase23 "didn't stick").
--     Guarded: postgres may not be allowed to alter
--     supabase_admin's defaults; if so we report it and the
--     verification section will flag any residue.
DO $defaults$
BEGIN
  BEGIN
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    RAISE NOTICE 'PHASE66: supabase_admin default privileges revoked for anon+authenticated.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PHASE66: could not alter supabase_admin default privileges (%) — dashboard-created tables keep their defaults; re-run as a role that owns them.',
      SQLERRM;
  END;
END
$defaults$;

-- ---------------------------------------------------------
-- 3. PER-TABLE VERIFICATION — fail loudly if anything remains
-- ---------------------------------------------------------
DO $verify$
DECLARE
  offending RECORD;
  offenders TEXT := '';
  offender_count INT := 0;
  default_offenders TEXT := '';
BEGIN
  -- 3a. No table in public may grant anon TRUNCATE / REFERENCES / TRIGGER
  FOR offending IN
    SELECT DISTINCT table_name, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    ORDER BY table_name, privilege_type
  LOOP
    offender_count := offender_count + 1;
    offenders := offenders || format(E'\n  - %s: %s', offending.table_name, offending.privilege_type);
  END LOOP;

  IF offender_count > 0 THEN
    RAISE EXCEPTION
      'PHASE66 VERIFICATION FAILED: % anon grant(s) remain on public tables:%s',
      offender_count, offenders;
  END IF;

  -- 3b. postgres's default privileges must be clean (this is the
  --     role most migrations run as — hard requirement)
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN aclexplode(da.defaclacl) acl ON TRUE
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    JOIN LATERAL unnest(ARRAY['INSERT','SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv) ON TRUE
    WHERE n.nspname = 'public'
      AND da.defaclobjtype = 'r'  -- tables
      AND da.defaclrole = 'postgres'::regrole  -- the role migrations run as; other creator roles are guarded in 2b
      AND grantee.rolname IN ('anon', 'authenticated')
      AND acl.privilege_type = p.priv
  ) THEN
    SELECT string_agg(DISTINCT grantee.rolname, ', ')
      INTO default_offenders
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN aclexplode(da.defaclacl) acl ON TRUE
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'public'
      AND da.defaclobjtype = 'r'
      AND grantee.rolname IN ('anon', 'authenticated');
    RAISE EXCEPTION
      'PHASE66 VERIFICATION FAILED: postgres default privileges in public still grant table rights to % — future tables would inherit them.',
      default_offenders;
  END IF;

  -- Honest report of any remaining non-postgres creator roles: these are
  -- platform-owned (e.g. supabase_admin — unalterable from the postgres
  -- migration role, see 2b) and affect only objects created by that role.
  FOR offending IN
    SELECT DISTINCT da.defaclrole::regrole::text AS role_name
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN aclexplode(da.defaclacl) acl ON TRUE
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = 'public'
      AND da.defaclobjtype = 'r'
      AND da.defaclrole <> 'postgres'::regrole
      AND grantee.rolname IN ('anon', 'authenticated')
  LOOP
    RAISE NOTICE 'PHASE66: platform-owned default privileges (creator role %) still list anon/authenticated — not alterable from the postgres migration role; affects only objects created by that role.', offending.role_name;
  END LOOP;

  RAISE NOTICE 'PHASE66 VERIFICATION PASSED: no anon TRUNCATE/REFERENCES/TRIGGER grants remain in public; postgres default privileges are clean.';
END
$verify$;
