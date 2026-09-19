-- =========================================================
-- FRELUX PHASE 8b — ARCHIE MOBILE & SECURE DATA PROTECTION
--
-- Tables for the ARCHIE Mobile Assistant (Free tier) and the
-- Mobile Security & Secure Data Protection Layer:
--   * per-user mobile capability consents (explicit permission
--     grants — ARCHIE never assumes device access)
--   * paid-capability activation (modular, optional, DISABLED
--     BY DEFAULT — ARCHIE never silently consumes paid services)
--   * device sessions with revocation (stolen-phone defense)
--   * protected data vault (user-selected FRELUX data, AES-GCM
--     encrypted client-side, backed up to a private bucket,
--     with version history and authenticated recovery)
--   * security events (notifications: new device, revocation,
--     recovery, failed authorization attempts)
--   * owner authorization records (audit: before/after state,
--     versions, tests, rollback ref)
--   * owner credential (salted PBKDF2 hash ONLY — the secret is
--     never stored, echoed or logged anywhere)
--
-- Android's normal permission/security model is complemented,
-- never bypassed. The phone is never the only copy of protected
-- information.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Mobile capability consents — explicit, per capability
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_mobile_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  capability text NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_archie_mobile_consents_user
  ON public.frelux_archie_mobile_consents (user_id);

ALTER TABLE public.frelux_archie_mobile_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own mobile consents" ON public.frelux_archie_mobile_consents;
CREATE POLICY "users manage own mobile consents" ON public.frelux_archie_mobile_consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 2. Paid-capability activations — DISABLED BY DEFAULT
--    (rows only exist after explicit user activation)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_paid_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  capability text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_archie_paid_caps_user
  ON public.frelux_archie_paid_capabilities (user_id);

ALTER TABLE public.frelux_archie_paid_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own paid activations" ON public.frelux_archie_paid_capabilities;
CREATE POLICY "users manage own paid activations" ON public.frelux_archie_paid_capabilities
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 3. Device sessions — registration + revocation
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_security_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_label text NOT NULL,
  fingerprint text NOT NULL,
  current boolean NOT NULL DEFAULT false,
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_sessions_user
  ON public.frelux_security_sessions (user_id, revoked);

ALTER TABLE public.frelux_security_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own security sessions" ON public.frelux_security_sessions;
CREATE POLICY "users manage own security sessions" ON public.frelux_security_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 4. Protected-data vault (user-selected FRELUX data)
--    Plaintext NEVER reaches the server: the client encrypts
--    with AES-256-GCM (PBKDF2 key) and uploads only ciphertext.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_protected_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL,
  item_type text NOT NULL,
  source_ref text,
  storage_path text NOT NULL,
  cipher text NOT NULL DEFAULT 'AES-256-GCM',
  kdf_salt text NOT NULL,
  kdf_iterations integer NOT NULL DEFAULT 310000,
  latest_version integer NOT NULL DEFAULT 1,
  size_bytes integer NOT NULL DEFAULT 0,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protected_items_user
  ON public.frelux_protected_items (user_id);

ALTER TABLE public.frelux_protected_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own protected items" ON public.frelux_protected_items;
CREATE POLICY "users manage own protected items" ON public.frelux_protected_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.frelux_protected_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.frelux_protected_items (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  version integer NOT NULL,
  storage_path text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  checksum text NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, version)
);

CREATE INDEX IF NOT EXISTS idx_protected_versions_item
  ON public.frelux_protected_item_versions (item_id, version DESC);

ALTER TABLE public.frelux_protected_item_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own protected versions" ON public.frelux_protected_item_versions;
CREATE POLICY "users manage own protected versions" ON public.frelux_protected_item_versions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 5. Security events (notifications shown in the app)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user
  ON public.frelux_security_events (user_id, created_date DESC);

ALTER TABLE public.frelux_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own security events" ON public.frelux_security_events;
CREATE POLICY "users read own security events" ON public.frelux_security_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users may record their own events (new device, backup, recovery…);
-- cross-user writes are impossible (RLS), and failed owner-auth
-- events are additionally written by the service role from the
-- archie-owner-auth edge function.
DROP POLICY IF EXISTS "users insert own security events" ON public.frelux_security_events;
CREATE POLICY "users insert own security events" ON public.frelux_security_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own security events" ON public.frelux_security_events;
CREATE POLICY "users update own security events" ON public.frelux_security_events
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 6. Owner authorization records (audit trail)
--    Owner identity is verified server-side; the owner secret
--    is never stored here.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_owner_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  change_kind text NOT NULL,
  target text NOT NULL,
  current_version text,
  proposed_version text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  tests_passed boolean NOT NULL DEFAULT false,
  rollback_ref text,
  status text NOT NULL DEFAULT 'AUTHORIZED'
    CHECK (status IN ('AUTHORIZED', 'ROLLED_BACK')),
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_auth_user
  ON public.frelux_owner_authorizations (user_id, created_date DESC);

ALTER TABLE public.frelux_owner_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own owner authorizations" ON public.frelux_owner_authorizations;
CREATE POLICY "users read own owner authorizations" ON public.frelux_owner_authorizations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Written ONLY by the service role (archie-owner-auth).

-- ---------------------------------------------------------
-- 7. Owner credential — salted PBKDF2 hash ONLY.
--    NO client policies at all: only the service role (edge
--    function) can read/write. The secret never touches this
--    table — only hash + salt + iterations.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_owner_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  secret_hash text NOT NULL,
  salt text NOT NULL,
  iterations integer NOT NULL DEFAULT 310000,
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_owner_credentials ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies → users cannot read or write their
-- own credential row; only the service role reaches it.

-- ---------------------------------------------------------
-- 8. Private storage bucket for protected-data backups
--    (ciphertext only, per-user folders)
-- ---------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('archie-protected', 'archie-protected', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "users upload own protected backups" ON storage.objects;
CREATE POLICY "users upload own protected backups" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'archie-protected'
              AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users read own protected backups" ON storage.objects;
CREATE POLICY "users read own protected backups" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'archie-protected'
         AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users delete own protected backups" ON storage.objects;
CREATE POLICY "users delete own protected backups" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'archie-protected'
         AND (storage.foldername(name))[1] = auth.uid()::text);
