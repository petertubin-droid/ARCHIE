-- =========================================================
-- FRELUX ARCHIE SELF-EVOLUTION LAYER (§1–§20)
--
-- Persistent storage for:
--   * Owner settings (Evolution Control Center)
--   * Change requests + IMMUTABLE append-only audit trail
--   * Language memory (profiles, entries, evidence)
--   * Evolution memory (lessons learned)
--
-- Security:
--   * Every table is OWNER-ONLY (profiles.role = 'admin').
--     Normal FRELUX users have no access (§20).
--   * archie_change_audit is immutable at the database level:
--     a trigger raises on UPDATE/DELETE for every role, so
--     ARCHIE can never modify or delete evidence of previous
--     changes (§5) — the owner's own corrections also appear
--     as NEW entries, never as rewrites.
--   * Authorizations are not stored here; they live with the
--     archie-owner-auth edge function (PBKDF2, server-side).
-- =========================================================

-- ---------------------------------------------------------
-- Owner settings (singleton)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS archie_evolution_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  language jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_modification jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_evolution_settings ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_evolution_settings_admin_all ON archie_evolution_settings;
CREATE POLICY archie_evolution_settings_admin_all
  ON archie_evolution_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_evolution_settings_service_all ON archie_evolution_settings;
CREATE POLICY archie_evolution_settings_service_all
  ON archie_evolution_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------
-- Change requests
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS archie_change_requests (
  id uuid PRIMARY KEY,
  cr_number text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  reason text NOT NULL,
  affected_files text[] NOT NULL DEFAULT '{}',
  affected_components text[] NOT NULL DEFAULT '{}',
  proposed_diff text NOT NULL,
  dependencies text[] NOT NULL DEFAULT '{}',
  security_impact text NOT NULL,
  data_impact text NOT NULL,
  regression_risk text NOT NULL CHECK (regression_risk IN ('low', 'medium', 'high')),
  test_plan text NOT NULL,
  test_results jsonb,
  rollback_plan text NOT NULL,
  requested_level text NOT NULL CHECK (requested_level IN ('staging', 'production')),
  owner_authorization_status text NOT NULL DEFAULT 'none'
    CHECK (owner_authorization_status IN ('none', 'staging_authorized', 'production_authorized', 'rejected')),
  staging_authorization_record_id text,
  production_authorization_record_id text,
  rollback_authorization_record_id text,
  resulting_commit text,
  requires_owner_intervention boolean NOT NULL DEFAULT false,
  flags text[] NOT NULL DEFAULT '{}',
  archie_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'PROPOSED' CHECK (state IN (
    'PROPOSED', 'AWAITING_OWNER', 'AUTHORIZED', 'STAGING', 'TESTING',
    'PASSED', 'FAILED', 'EXECUTED', 'REJECTED', 'ROLLED_BACK'
  ))
);

ALTER TABLE archie_change_requests ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_change_requests_admin_all ON archie_change_requests;
CREATE POLICY archie_change_requests_admin_all
  ON archie_change_requests FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_change_requests_service_all ON archie_change_requests;
CREATE POLICY archie_change_requests_service_all
  ON archie_change_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS archie_change_requests_state_idx ON archie_change_requests (state);
CREATE INDEX IF NOT EXISTS archie_change_requests_created_idx ON archie_change_requests (created_at DESC);

-- ---------------------------------------------------------
-- Immutable audit trail (§3, §5)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS archie_change_audit (
  id uuid PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES archie_change_requests(id) ON DELETE RESTRICT,
  cr_number text NOT NULL,
  actor text NOT NULL CHECK (actor IN ('ARCHIE', 'OWNER', 'SYSTEM')),
  action text NOT NULL,
  from_state text,
  to_state text,
  authorization_record_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_change_audit ENABLE ROW LEVEL SECURITY;

-- Append-only for the owner: INSERT and SELECT only.

DROP POLICY IF EXISTS archie_change_audit_admin_insert ON archie_change_audit;
CREATE POLICY archie_change_audit_admin_insert
  ON archie_change_audit FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_change_audit_admin_select ON archie_change_audit;
CREATE POLICY archie_change_audit_admin_select
  ON archie_change_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_change_audit_service_insert ON archie_change_audit;
CREATE POLICY archie_change_audit_service_insert
  ON archie_change_audit FOR INSERT
  TO service_role
  WITH CHECK (true);


DROP POLICY IF EXISTS archie_change_audit_service_select ON archie_change_audit;
CREATE POLICY archie_change_audit_service_select
  ON archie_change_audit FOR SELECT
  TO service_role
  USING (true);

-- No UPDATE/DELETE policies exist, and even the service role
-- cannot rewrite history: the trigger blocks it outright.
CREATE OR REPLACE FUNCTION archie_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'archie_change_audit is append-only: audit history cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS archie_change_audit_immutable_trigger ON archie_change_audit;
CREATE TRIGGER archie_change_audit_immutable_trigger
  BEFORE UPDATE OR DELETE ON archie_change_audit
  FOR EACH ROW
  EXECUTE FUNCTION archie_audit_immutable();

CREATE INDEX IF NOT EXISTS archie_change_audit_cr_idx ON archie_change_audit (change_request_id, created_at);

-- ---------------------------------------------------------
-- Language memory (§10–§13)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS archie_language_profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  native_name text NOT NULL,
  iso_code text,
  alt_names text[] NOT NULL DEFAULT '{}',
  family text,
  writing_system text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  dialects text[] NOT NULL DEFAULT '{}',
  registry_status text NOT NULL DEFAULT 'discovered' CHECK (registry_status IN (
    'frelux_registered', 'archie_learned', 'currently_learning', 'discovered'
  )),
  confidence numeric,
  verification_status text NOT NULL DEFAULT 'DISCOVERED' CHECK (verification_status IN (
    'DISCOVERED', 'LEARNING', 'VALIDATING', 'CONFIRMED', 'REJECTED', 'NEEDS_REVIEW'
  )),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_language_profiles ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_language_profiles_admin_all ON archie_language_profiles;
CREATE POLICY archie_language_profiles_admin_all
  ON archie_language_profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_language_profiles_service_all ON archie_language_profiles;
CREATE POLICY archie_language_profiles_service_all
  ON archie_language_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS archie_language_profiles_name_idx
  ON archie_language_profiles (lower(name));

CREATE TABLE IF NOT EXISTS archie_language_entries (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES archie_language_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('vocabulary', 'grammar', 'phrase')),
  key text NOT NULL,
  payload jsonb NOT NULL,
  region text,
  confidence numeric,
  validation_state text NOT NULL DEFAULT 'LEARNING' CHECK (validation_state IN (
    'DISCOVERED', 'LEARNING', 'VALIDATING', 'CONFIRMED', 'REJECTED', 'NEEDS_REVIEW'
  )),
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_language_entries ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_language_entries_admin_all ON archie_language_entries;
CREATE POLICY archie_language_entries_admin_all
  ON archie_language_entries FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_language_entries_service_all ON archie_language_entries;
CREATE POLICY archie_language_entries_service_all
  ON archie_language_entries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS archie_language_entries_profile_idx ON archie_language_entries (profile_id, kind);

CREATE TABLE IF NOT EXISTS archie_language_evidence (
  id uuid PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES archie_language_entries(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'owner_provided', 'frelux_dictionary', 'external_reference', 'ai_inference'
  )),
  reliability numeric NOT NULL CHECK (reliability >= 0 AND reliability <= 1),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_language_evidence ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_language_evidence_admin_all ON archie_language_evidence;
CREATE POLICY archie_language_evidence_admin_all
  ON archie_language_evidence FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_language_evidence_service_all ON archie_language_evidence;
CREATE POLICY archie_language_evidence_service_all
  ON archie_language_evidence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS archie_language_evidence_entry_idx ON archie_language_evidence (entry_id);

-- ---------------------------------------------------------
-- Evolution memory (§15)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS archie_evolution_memory (
  id uuid PRIMARY KEY,
  problem text NOT NULL,
  proposed_solution text NOT NULL,
  owner_decision text NOT NULL,
  implementation_result text,
  test_result text,
  production_result text,
  failure_information text,
  rollback_information text,
  lessons_learned text,
  related_cr_number text,
  affected_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE archie_evolution_memory ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS archie_evolution_memory_admin_all ON archie_evolution_memory;
CREATE POLICY archie_evolution_memory_admin_all
  ON archie_evolution_memory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );


DROP POLICY IF EXISTS archie_evolution_memory_service_all ON archie_evolution_memory;
CREATE POLICY archie_evolution_memory_service_all
  ON archie_evolution_memory FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS archie_evolution_memory_created_idx ON archie_evolution_memory (created_at DESC);
