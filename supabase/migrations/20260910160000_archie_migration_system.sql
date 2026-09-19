-- =========================================================
-- ARCHIE Portable Continuity & Migration System (2026-09-09)
--
-- Two owner-only tables (spec §9, §23):
--
--   archie_installations      — ARCHIE's logical identity and
--                               every environment registered
--                               to it (phone browsers, PCs,
--                               servers). Identity survives
--                               device/host changes.
--   archie_migration_history  — append-only audit record of
--                               every migration operation.
--
-- Security model (consistent with the ARCHIE evolution layer):
--   * owner-only RLS (profiles.role = 'admin'), FORCED
--   * anon gets NOTHING (these are privileged owner tables)
--   * authenticated gets SELECT/INSERT/UPDATE only on the
--     history table (UPDATE is allowed so an in-flight record
--     can move to its final status; rows remain owner-scoped)
--   * installations: INSERT + UPDATE by owner (status changes
--     for owner approval flow), SELECT owner-only
--
-- Also: allow authenticated to READ the migration tracking
-- table (supabase_migrations.schema_migrations) so exports
-- can record the schema version — metadata only, no secrets.
-- =========================================================

-- ---------------------------------------------------------
-- archie_installations
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_installations (
  id UUID PRIMARY KEY,
  logical_id UUID NOT NULL,
  environment_label TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PENDING_OWNER_APPROVAL', 'REVOKED')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_installations_logical
  ON public.archie_installations (logical_id);

ALTER TABLE public.archie_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_installations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS installations_owner_all ON public.archie_installations;
CREATE POLICY installations_owner_all ON public.archie_installations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.archie_installations TO authenticated;
-- NOTE: no grants to anon — owner-privileged data.

-- ---------------------------------------------------------
-- archie_migration_history
--
-- NOTE: this table may already exist on databases that were
-- prepared outside the repo. The DDL below is CONVERGENT:
-- CREATE IF NOT EXISTS with the union schema, then
-- ALTER ... ADD COLUMN IF NOT EXISTS for the delta columns.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_migration_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('BACKUP', 'MIGRATE', 'RESTORE')),
  source_environment TEXT NOT NULL DEFAULT '',
  destination_environment TEXT NOT NULL DEFAULT '',
  archie_version TEXT NOT NULL,
  owner_authorization_record_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('CREATED', 'VERIFIED', 'EXPORTED', 'TRANSFERRED',
               'IMPORTING', 'RESTORED', 'FAILED', 'CANCELLED', 'ROLLED_BACK')
  ),
  events TEXT[] NOT NULL DEFAULT '{}',
  components_included TEXT[] NOT NULL DEFAULT '{}',
  components_excluded TEXT[] NOT NULL DEFAULT '{}',
  verification_result TEXT,
  restoration_result TEXT,
  errors TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.archie_migration_history
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_archie_migration_history_created
  ON public.archie_migration_history (created_at DESC);

ALTER TABLE public.archie_migration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_migration_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS migration_history_owner_all ON public.archie_migration_history;
DROP POLICY IF EXISTS archie_migration_history_admin_all ON public.archie_migration_history;
CREATE POLICY archie_migration_history_admin_all ON public.archie_migration_history
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.archie_migration_history TO authenticated;
-- NOTE: no grants to anon — audit records are owner-only.

-- ---------------------------------------------------------
-- Migration tracking metadata readable by the owner PWA
-- (schema version exports — metadata only, non-secret)
-- ---------------------------------------------------------
GRANT USAGE ON SCHEMA supabase_migrations TO authenticated;
GRANT SELECT ON supabase_migrations.schema_migrations TO authenticated;

-- ---------------------------------------------------------
-- Belt-and-braces: strip every privilege from anon and
-- service_role on these owner-only tables. (The public-schema
-- DEFAULT ACL currently grants anon table-level rights incl.
-- TRUNCATE, which bypasses RLS — revoked here explicitly.)
-- ---------------------------------------------------------
REVOKE ALL ON public.archie_installations FROM anon;
REVOKE ALL ON public.archie_migration_history FROM anon;
REVOKE ALL ON public.archie_installations FROM service_role;
REVOKE ALL ON public.archie_migration_history FROM service_role;
