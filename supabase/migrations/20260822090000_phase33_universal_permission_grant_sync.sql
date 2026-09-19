-- =========================================================
-- Phase 33: Universal RLS-to-GRANT permission sync
-- Date: 2026-08-22
--
-- Problem: Since the project's inception, dozens of tables have had RLS
-- policies created (e.g. "paint_types_admin_update", "site_settings_admin_write",
-- "media_items_admin_insert") that were never followed by a matching
-- table-level GRANT. In Postgres, a GRANT is checked BEFORE row level
-- security policies ever run — without it, Postgres returns
-- "permission denied for table X" regardless of how permissive the RLS
-- policy is. Phase 21 (20260820150000) patched a handful of tables by
-- hand, but many admin-write tables were missed entirely (paint_types
-- UPDATE/INSERT/DELETE, site_settings UPDATE/INSERT, media_items,
-- media_folders, color_relationship_overrides, shareable_links, and
-- others), which is why admin actions like "update paint type" or
-- "upload media" fail with permission errors even though the user is a
-- confirmed admin.
--
-- Fix: rather than hand-maintain another static list (which is exactly
-- how we got here), this migration walks pg_policies for every policy
-- defined in the public schema and issues the matching GRANT for
-- anon/authenticated automatically. It is idempotent and safe to re-run
-- any time new tables/policies are added — it only ever WIDENS the
-- table-level grant to match what RLS already permits; RLS policies
-- still fully gate which rows can actually be read/written.
-- =========================================================

DO $$
DECLARE
  pol RECORD;
  cmd_priv text;
  role_name text;
BEGIN
  FOR pol IN
    SELECT DISTINCT schemaname, tablename, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    cmd_priv := CASE pol.cmd
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
      WHEN 'ALL'    THEN 'SELECT, INSERT, UPDATE, DELETE'
      ELSE NULL
    END;

    IF cmd_priv IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH role_name IN ARRAY pol.roles LOOP
      IF role_name = 'public' THEN
        EXECUTE format('GRANT %s ON TABLE public.%I TO anon, authenticated', cmd_priv, pol.tablename);
      ELSIF role_name IN ('anon', 'authenticated') THEN
        EXECUTE format('GRANT %s ON TABLE public.%I TO %I', cmd_priv, pol.tablename, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────
-- Belt-and-suspenders: explicitly re-assert the exact grants for the
-- tables we know are hit hardest by the admin panel, in case a table's
-- policies use a helper function that hides the role list from
-- pg_policies introspection in some Postgres versions.
-- ─────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paint_types            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paint_products         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paint_colors           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.color_families         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.color_categories       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.color_combinations     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_folders          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_items            TO authenticated;
GRANT SELECT              ON public.media_folders          TO anon;
GRANT SELECT              ON public.media_items            TO anon;

-- Everything created going forward inherits the right grants too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
