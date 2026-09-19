-- =========================================================
-- Anon table-privilege cleanup — systemic fix
-- 2026-09-10
--
-- PROBLEM
--   The public schema's default ACL grants the anon role full
--   table rights (arwdDxt[+m]: SELECT/INSERT/UPDATE/DELETE/
--   TRUNCATE/REFERENCES/TRIGGER[/MAINTAIN]) on every new
--   relation, and ~302 existing tables currently carry anon
--   TRUNCATE. TRUNCATE bypasses RLS row policies entirely —
--   FORCE ROW LEVEL SECURITY does not stop it.
--
-- WHY THE SEPT-3 REVOKE DIDN'T STICK
--   Migration 20260903170000_phase23_rls_security_audit.sql ran:
--     ALTER DEFAULT PRIVILEGES ... REVOKE SELECT, INSERT,
--     UPDATE, DELETE ON TABLES FROM anon, authenticated;
--   It removed only the four data privileges. The default ACL
--   entries still carried TRUNCATE (D), REFERENCES (x) and
--   TRIGGER (t), so every relation created afterwards kept
--   inheriting them, and existing tables were never touched at
--   all. This migration revokes ALL privileges in the default
--   ACL and strips the dangerous privileges (TRUNCATE /
--   REFERENCES / TRIGGER / MAINTAIN) from every existing table.
--
-- WHAT ANON / AUTHENTICATED KEEP
--   Per-table SELECT / INSERT / UPDATE / DELETE grants made
--   explicitly by earlier migrations (e.g. phase 21, phase 33)
--   are untouched — the app's public reads and writes work
--   exactly as before. Everything is governed by RLS policies,
--   which phase 23/25 audited and FORCEd.
--   PostgREST never issues TRUNCATE / REFERENCES / TRIGGER /
--   MAINTAIN, so revoking them cannot affect any client.
--
-- service_role keeps its full table rights — it is server-only,
--   never exposed to clients, and is the intended RLS bypass.
--
-- PORTABILITY
--   Written to run on PostgreSQL 15, 16 and 17+: the default-
--   ACL verification discovers the pg_default_acl ACL column
--   name (defacl pre-16 / defaclacl 16+) instead of assuming
--   it, and the MAINTAIN statements (17+) are version-gated.
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- 1. Fix the default privileges for FUTURE relations
--    (both anon and authenticated: per phase 23's convention,
--    new tables get NO implicit privileges — every migration
--    must GRANT explicitly alongside its RLS policies)
-- ─────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;

-- Sequences: no-op if no default sequence ACL exists (REVOKE
-- on a privilege that was never granted does not error)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM authenticated;

-- Phase 23 only covered FOR ROLE postgres. Tables created via the
-- Supabase dashboard are created by other roles (e.g. supabase_admin),
-- whose default privileges were never fixed — the reason the Sept-3
-- revoke "didn't stick". Attempt REVOKE ALL for EVERY creator role that
-- holds default-privilege entries in public; guarded per role so a
-- permission denial is reported by the verification below rather than
-- aborting the cleanup.
-- Roles we cannot alter (e.g. supabase_admin: the postgres role
-- used by migrations is not a member, by platform design) are
-- recorded here so the verification below reports them honestly
-- instead of failing on a platform-managed residue that no app-
-- level migration can ever revoke. The residue only affects
-- objects created BY that platform role; all future app objects
-- are created by postgres (whose defaults are revoked above).
CREATE TEMP TABLE IF NOT EXISTS _defacl_unfixable (
  creator_role text PRIMARY KEY
);

DO $fix_other_creators$
DECLARE
  role_entry record;
  failures   text[] := '{}';
BEGIN
  FOR role_entry IN
    SELECT DISTINCT defaclrole
    FROM pg_catalog.pg_default_acl
    JOIN pg_namespace n ON n.oid = defaclnamespace
    WHERE n.nspname = 'public'
      AND defaclrole::regrole::text <> 'postgres'
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated',
        role_entry.defaclrole::regrole::text);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated',
        role_entry.defaclrole::regrole::text);
    EXCEPTION WHEN OTHERS THEN
      failures := failures || role_entry.defaclrole::regrole::text;
      INSERT INTO _defacl_unfixable (creator_role)
        VALUES (role_entry.defaclrole::regrole::text)
        ON CONFLICT (creator_role) DO NOTHING;
    END;
  END LOOP;

  IF array_length(failures, 1) > 0 THEN
    RAISE NOTICE 'Could not alter default privileges of role(s) % — verification will flag any residue',
      array_to_string(failures, ', ');
  END IF;
END
$fix_other_creators$;

-- ─────────────────────────────────────────────────────────
-- 2. Strip the dangerous privileges from EXISTING relations
--    TRUNCATE  — wipes all rows, ignores RLS row policies
--    REFERENCES — allows FK constraints that can lock a table
--    TRIGGER   — precondition for creating triggers on a table
--    (applies to every table in public, incl. the ~302 that
--    carry the accumulated default grants and the 9 phase-56
--    tables that got explicit GRANT ALL)
-- ─────────────────────────────────────────────────────────
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
-- Belt-and-braces: PUBLIC never needs these on tables either
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- PostgreSQL 17+ also grants MAINTAIN (VACUUM/ANALYZE/CLUSTER)
-- through "GRANT ALL" — strip it the same way when it exists
DO $revoke_maintain$
BEGIN
  IF current_setting('server_version_num')::int >= 170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC';
  END IF;
END
$revoke_maintain$;

-- ─────────────────────────────────────────────────────────
-- 3. PER-TABLE VERIFICATION
--    Walks every ordinary/partitioned table in public and
--    fails the whole migration (RAISE EXCEPTION rolls back
--    the transaction) if a single one still exposes TRUNCATE,
--    REFERENCES or TRIGGER to anon or authenticated. On
--    PostgreSQL 17+ MAINTAIN is verified as well.
-- ─────────────────────────────────────────────────────────
DO $verify_tables$
DECLARE
  r          record;
  offenders  text[] := '{}';
  total      int := 0;
BEGIN
  FOR r IN
    SELECT c.relname,
           has_table_privilege('anon', c.oid, 'TRUNCATE')   AS anon_trunc,
           has_table_privilege('anon', c.oid, 'REFERENCES') AS anon_refs,
           has_table_privilege('anon', c.oid, 'TRIGGER')     AS anon_trig,
           has_table_privilege('authenticated', c.oid, 'TRUNCATE')   AS auth_trunc,
           has_table_privilege('authenticated', c.oid, 'REFERENCES') AS auth_refs,
           has_table_privilege('authenticated', c.oid, 'TRIGGER')     AS auth_trig
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')          -- ordinary + partitioned tables
  LOOP
    total := total + 1;
    IF r.anon_trunc OR r.anon_refs OR r.anon_trig
       OR r.auth_trunc OR r.auth_refs OR r.auth_trig THEN
      offenders := offenders || format(
        '%s [anon T/R/G=%s/%s/%s authenticated T/R/G=%s/%s/%s]',
        r.relname,
        r.anon_trunc, r.anon_refs, r.anon_trig,
        r.auth_trunc, r.auth_refs, r.auth_trig
      );
    END IF;
  END LOOP;

  -- PostgreSQL 17+: MAINTAIN must be gone too
  IF current_setting('server_version_num')::int >= 170000 THEN
    FOR r IN
      EXECUTE $q$
        SELECT c.relname,
               has_table_privilege('anon', c.oid, 'MAINTAIN')          AS anon_m,
               has_table_privilege('authenticated', c.oid, 'MAINTAIN') AS auth_m
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND (has_table_privilege('anon', c.oid, 'MAINTAIN')
            OR has_table_privilege('authenticated', c.oid, 'MAINTAIN'))
      $q$
    LOOP
      offenders := offenders || format(
        '%s [MAINTAIN anon=%s authenticated=%s]', r.relname, r.anon_m, r.auth_m);
    END LOOP;
  END IF;

  IF array_length(offenders, 1) > 0 THEN
    RAISE EXCEPTION
      'ANON PRIVILEGE CLEANUP FAILED — % table(s) still exposed:%s  - %s',
      array_length(offenders, 1), E'\n',
      array_to_string(offenders, E'\n  - ');
  END IF;

  RAISE NOTICE 'VERIFIED % public tables: anon and authenticated hold no TRUNCATE / REFERENCES / TRIGGER privileges', total;
END
$verify_tables$;

-- ─────────────────────────────────────────────────────────
-- 4. DEFAULT-ACL VERIFICATION
--    Confirms no default-privilege entry in the public schema
--    still grants anon or authenticated anything on future
--    tables (r) or sequences (S). Works on PG 15–17+: the ACL
--    column is named defacl before PG 16 and defaclacl from
--    PG 16 on — discovered dynamically below.
-- ─────────────────────────────────────────────────────────
DO $verify_default_acl$
DECLARE
  acl_col   text;
  leftover  text;
  res       record;
BEGIN
  SELECT attname INTO acl_col
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'pg_catalog.pg_default_acl'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname IN ('defacl', 'defaclacl');

  IF acl_col IS NULL THEN
    RAISE EXCEPTION 'DEFAULT-ACL VERIFICATION could not locate the ACL column of pg_default_acl';
  END IF;

  EXECUTE format(
    $q$
      SELECT string_agg(
               format('creator role %%s, objtype %%s, acl %%s',
                      d.defaclrole::regrole::text,
                      d.defaclobjtype,
                      array_to_string(d.%s, ', ')),
               E'\n  - ')
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      WHERE n.nspname = 'public'
        AND d.defaclobjtype IN ('r', 'S')
        AND NOT EXISTS (
          SELECT 1 FROM _defacl_unfixable u
          WHERE u.creator_role = d.defaclrole::regrole::text
        )
        AND (
          array_to_string(d.%s, ',') LIKE '%%anon=%%'
          OR array_to_string(d.%s, ',') LIKE '%%authenticated=%%'
        )
    $q$,
    acl_col, acl_col, acl_col)
  INTO leftover;

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'DEFAULT-ACL CLEANUP FAILED — anon/authenticated still in default privileges:%s  - %s',
      E'\n', leftover;
  END IF;

  RAISE NOTICE 'VERIFIED default ACL: no anon/authenticated grants remain for alterable default privileges in public';

  FOR res IN
    EXECUTE format(
      $q2$
        SELECT format('creator role %%s, objtype %%s',
                      d.defaclrole::regrole::text, d.defaclobjtype)
        FROM pg_default_acl d
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        JOIN _defacl_unfixable u ON u.creator_role = d.defaclrole::regrole::text
        WHERE n.nspname = 'public'
          AND d.defaclobjtype IN ('r', 'S')
          AND (
            array_to_string(d.%s, ',') LIKE '%%anon=%%'
            OR array_to_string(d.%s, ',') LIKE '%%authenticated=%%'
          )
      $q2$,
      acl_col, acl_col)
  LOOP
    RAISE NOTICE 'PLATFORM-OWNED DEFAULT-ACL RESIDUE (not alterable from the postgres migration role, affects only platform-created objects): %', res.format;
  END LOOP;
END
$verify_default_acl$;

-- ─────────────────────────────────────────────────────────
-- 5. Manual re-verification (paste in SQL editor any time)
--
--    Tables still exposed?  (must return 0 rows)
--    SELECT c.relname,
--           has_table_privilege('anon', c.oid, 'TRUNCATE')          AS anon_truncate,
--           has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth_truncate
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relkind IN ('r', 'p')
--      AND (has_table_privilege('anon', c.oid, 'TRUNCATE')
--        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
--
--    Default ACL clean?  (must return 0 rows; use defaclacl on PG16+)
--    SELECT d.defaclrole::regrole, d.defaclobjtype
--    FROM pg_default_acl d
--    JOIN pg_namespace n ON n.oid = d.defaclnamespace
--    WHERE n.nspname = 'public'
--      AND d.defaclobjtype IN ('r', 'S')
--      AND (array_to_string(d.defaclacl, ',') LIKE '%anon=%'   -- PG15: d.defacl
--        OR array_to_string(d.defaclacl, ',') LIKE '%authenticated=%');
-- ─────────────────────────────────────────────────────────
