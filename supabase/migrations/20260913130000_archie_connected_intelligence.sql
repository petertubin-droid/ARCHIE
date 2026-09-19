-- =========================================================
-- ARCHIE CONNECTED DEVICE, HOUSEHOLD & ACCOUNT INTELLIGENCE
-- Migration 20260913130000
--
-- Owner directive (2026-09-10, "ARCHIE — Trusted Device,
-- Household & Connected Account Intelligence"):
--   When the Owner or an authorized family member explicitly
--   connects a device or account, ARCHIE may use the
--   permissions granted for that connection.
--
-- REAL STRUCTURES, no metaphors:
--
-- 1. frelux_archie_connections — the identity→device chain:
--    one authorized connection between ARCHIE and real
--    hardware reachable over bluetooth / wifi / hotspot /
--    usb / local-network / internet / api transports.
--    Connectivity is NEVER authorization: transport probes
--    create nothing; only the explicit pairing lifecycle and
--    granted permissions do.
--
-- 2. frelux_archie_device_accounts — the ACCOUNT link: named
--    accounts/services bound to a connection with their own
--    permissions. Stores references and status only — NEVER
--    passwords, tokens or secrets.
--
-- 3. frelux_archie_connection_events — AUDIT HISTORY: every
--    action, success, failure AND denial, attributed to the
--    acting identity. Family members never inherit Owner
--    privileges: rows are owner-owned and family-visible
--    only through the identity chain.
--
-- 4. frelux_archie_device_health — MONITORING snapshots:
--    connectivity, battery, storage, health, capabilities and
--    firmware version/verification — real values read from
--    the device, never fabricated.
--
-- 5. The 23rd anatomical subsystem (connective-tissue) is
--    registered in archie_subsystems, bound to its REAL
--    implementation modules and data tables.
--
-- 6. Three permanent principles are seeded into
--    frelux_archie_core_principles (ON CONFLICT DO NOTHING —
--    never overwritten): connected_device_authority,
--    learning_authority, code_production_authority.
--
-- Core engine (deterministic, provider-free):
--   supabase/functions/_shared/archie-ai/native-engine/connections.ts
-- PWA runtime (real Web Bluetooth / WebUSB / network):
--   src/lib/archie/connections.ts
-- =========================================================

-- ---------------------------------------------------------
-- 1. CONNECTIONS (IDENTITY → DEVICE)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- IDENTITY: the person who authorized/uses this connection.
  -- NULL = the Owner. Family members are explicit people rows —
  -- they never inherit Owner privileges.
  person_id uuid REFERENCES public.frelux_archie_people (id) ON DELETE SET NULL,
  -- the trusted PWA device used to perform the pairing, if any
  trusted_device_id uuid REFERENCES public.frelux_archie_devices (id) ON DELETE SET NULL,
  transport text NOT NULL
    CHECK (transport IN (
      'bluetooth','wifi','hotspot','usb','local-network','internet','api'
    )),
  device_name text NOT NULL,
  device_kind text NOT NULL
    CHECK (device_kind IN (
      'tv','speaker','phone','computer','tablet','appliance','smarthome','other'
    )),
  manufacturer text,
  model text,
  status text NOT NULL DEFAULT 'DISCOVERED'
    CHECK (status IN (
      'DISCOVERED','PAIRING','PAIRED','CONNECTED','SUSPENDED','REVOKED'
    )),
  -- REAL transport-level address only (BLE deviceId, USB
  -- vendorId/productId, endpoint URL…). Never invented.
  transport_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- granted capabilities: subset of the canonical vocabulary
  -- enforced by the engine core
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- access scope: explicit action list + time windows
  access_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_connections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_archie_connections_owner
  ON public.frelux_archie_connections (owner_id, updated_date DESC);

DROP POLICY IF EXISTS "owner full access own connections" ON public.frelux_archie_connections;
CREATE POLICY "owner full access own connections"
  ON public.frelux_archie_connections FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Family members: SELECT only, only on connections bound to
-- their OWN active person row. No writes, no inheritance.
DROP POLICY IF EXISTS "family read own-person connections" ON public.frelux_archie_connections;
CREATE POLICY "family read own-person connections"
  ON public.frelux_archie_connections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_archie_people p
      WHERE p.id = frelux_archie_connections.person_id
        AND p.owner_id = frelux_archie_connections.owner_id
        AND p.user_id = auth.uid()
        AND p.status = 'ACTIVE'
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_connections TO authenticated;

-- ---------------------------------------------------------
-- 2. DEVICE ACCOUNTS (ACCOUNT)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_device_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.frelux_archie_connections (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  service_name text NOT NULL,
  -- honest reference/label ONLY — passwords, tokens and
  -- secrets are never stored here
  account_ref text,
  account_kind text NOT NULL DEFAULT 'other'
    CHECK (account_kind IN (
      'streaming','smart-home','cloud','manufacturer','other'
    )),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'LINKED'
    CHECK (status IN ('LINKED','UNLINKED')),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_device_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_archie_device_accounts_connection
  ON public.frelux_archie_device_accounts (connection_id);

DROP POLICY IF EXISTS "owner full access own device accounts" ON public.frelux_archie_device_accounts;
CREATE POLICY "owner full access own device accounts"
  ON public.frelux_archie_device_accounts FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "family read own-person device accounts" ON public.frelux_archie_device_accounts;
CREATE POLICY "family read own-person device accounts"
  ON public.frelux_archie_device_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.frelux_archie_connections c
      JOIN public.frelux_archie_people p ON p.id = c.person_id
      WHERE c.id = frelux_archie_device_accounts.connection_id
        AND p.user_id = auth.uid()
        AND p.status = 'ACTIVE'
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_device_accounts TO authenticated;

-- ---------------------------------------------------------
-- 3. CONNECTION EVENTS (AUDIT HISTORY)
--    Every action — success, failure AND denial — is
--    recorded with the acting identity. Never silent.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.frelux_archie_connections (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  actor_type text NOT NULL
    CHECK (actor_type IN ('owner','family','archie')),
  action text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text NOT NULL
    CHECK (result IN ('success','failure','denied')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- true ONLY when the outcome was actually verified
  verified boolean NOT NULL DEFAULT false,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_connection_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_archie_connection_events_connection
  ON public.frelux_archie_connection_events (connection_id, created_date DESC);

DROP POLICY IF EXISTS "owner full access own connection events" ON public.frelux_archie_connection_events;
CREATE POLICY "owner full access own connection events"
  ON public.frelux_archie_connection_events FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "family read own-person connection events" ON public.frelux_archie_connection_events;
CREATE POLICY "family read own-person connection events"
  ON public.frelux_archie_connection_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.frelux_archie_connections c
      JOIN public.frelux_archie_people p ON p.id = c.person_id
      WHERE c.id = frelux_archie_connection_events.connection_id
        AND p.user_id = auth.uid()
        AND p.status = 'ACTIVE'
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    )
  );

GRANT SELECT, INSERT ON public.frelux_archie_connection_events TO authenticated;

-- ---------------------------------------------------------
-- 4. DEVICE HEALTH (MONITORING)
--    Real snapshots read from the device — never fabricated.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_device_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.frelux_archie_connections (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  connectivity text NOT NULL DEFAULT 'unknown'
    CHECK (connectivity IN ('online','offline','degraded','unknown')),
  battery_pct int CHECK (battery_pct IS NULL OR (battery_pct >= 0 AND battery_pct <= 100)),
  storage jsonb,
  health text NOT NULL DEFAULT 'unknown'
    CHECK (health IN ('healthy','degraded','error','unknown')),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  firmware_version text,
  firmware_verified boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_device_health ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_archie_device_health_connection
  ON public.frelux_archie_device_health (connection_id, checked_at DESC);

DROP POLICY IF EXISTS "owner full access own device health" ON public.frelux_archie_device_health;
CREATE POLICY "owner full access own device health"
  ON public.frelux_archie_device_health FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "family read own-person device health" ON public.frelux_archie_device_health;
CREATE POLICY "family read own-person device health"
  ON public.frelux_archie_device_health FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.frelux_archie_connections c
      JOIN public.frelux_archie_people p ON p.id = c.person_id
      WHERE c.id = frelux_archie_device_health.connection_id
        AND p.user_id = auth.uid()
        AND p.status = 'ACTIVE'
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    )
  );

GRANT SELECT, INSERT ON public.frelux_archie_device_health TO authenticated;

-- ---------------------------------------------------------
-- 5. THE 23RD ANATOMICAL SUBSYSTEM (connective-tissue)
--    Bound to its REAL implementation. Idempotent seed.
-- ---------------------------------------------------------
INSERT INTO public.archie_subsystems (key, organ, name, purpose, code_bindings, data_bindings, operational, criticality, ordinal) VALUES ('connective-tissue','🔗','Connected Device & Household Intelligence','Connects authorized real hardware and accounts over bluetooth / wifi / hotspot / usb / local-network / internet / api transports. Connectivity alone is never authorization: every connection follows the explicit pairing lifecycle, holds only granted permissions and an explicit access scope, and every action — success, failure or denial — is audited to the identity chain (IDENTITY → DEVICE → ACCOUNT → PERMISSIONS → ACCESS SCOPE → AUDIT HISTORY). Family members never inherit Owner privileges. No fake integrations, no simulated control, no claimed access without a real connection.','["supabase/functions/_shared/archie-ai/native-engine/connections.ts","src/lib/archie/connections.ts","src/pages/archie/ArchieDevices.tsx"]'::jsonb,'["frelux_archie_connections","frelux_archie_device_accounts","frelux_archie_connection_events","frelux_archie_device_health"]'::jsonb,true,'HIGH',23) ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------
-- 6. PERMANENT PRINCIPLES (owner directive, immutable-by-seed)
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_core_principles (
  principle_id, title, content, origin, status
) VALUES (
  'connected_device_authority',
  'ARCHIE Connected Device, Household & Account Intelligence',
  jsonb_build_object(
    'rule',
      'When the Owner or an authorized family member explicitly connects a device or account, ARCHIE may use the permissions granted for that connection. Connectivity alone never constitutes authorization. ARCHIE never bypasses passwords, MFA, encryption, pairing requirements, operating-system security, manufacturer security, account permissions or access controls.',
    'chain', jsonb_build_array(
      'IDENTITY', 'DEVICE', 'ACCOUNT', 'PERMISSIONS',
      'ACCESS SCOPE', 'AUDIT HISTORY'
    ),
    'family_rule',
      'Family members never automatically inherit Owner privileges. Each connection is bound to the identity that authorized it and to the permissions and access scope granted for it.',
    'action_chain', jsonb_build_array(
      'CONNECTION', 'AUTHENTICATION/PAIRING', 'PERMISSION SCOPE',
      'ARCHIE COGNITION', 'AUTHORIZED ACTION', 'RESULT',
      'VERIFICATION', 'AUDIT', 'MEMORY'
    ),
    'honesty_rule',
      'No fake integrations, no simulated device control, no claims of access when a real connection does not exist.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;

INSERT INTO public.frelux_archie_core_principles (
  principle_id, title, content, origin, status
) VALUES (
  'learning_authority',
  'ARCHIE Learning & Knowledge Authority',
  jsonb_build_object(
    'rule',
      'ARCHIE has broad authorized access for learning and knowledge acquisition: it may independently research the web and authorized information sources, learn new subjects, technologies, programming languages and frameworks, study documentation and source code, analyze security and cybersecurity knowledge, learn from conversations, experiments, errors, corrections and verified results, organize and retain validated knowledge in persistent memory, and continuously expand its knowledge without requiring Owner approval for every learning activity.',
    'limit',
      'Learning does NOT grant permission to modify production code.',
    'architecture', jsonb_build_array(
      'ACCESS', 'OBSERVE', 'RESEARCH', 'ANALYZE', 'VERIFY',
      'LEARN', 'REMEMBER', 'APPLY'
    )
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;

INSERT INTO public.frelux_archie_core_principles (
  principle_id, title, content, origin, status
) VALUES (
  'code_production_authority',
  'ARCHIE Code & Production Authority',
  jsonb_build_object(
    'rule',
      'Owner approval is required before ARCHIE makes consequential changes to ARCHIE production code, FRELUX production code, calculators, estimators, calculation engines, ARCHIE production architecture, production databases or schemas, or production configuration and deployment. ARCHIE may independently inspect, analyze, learn from, propose, generate, test, debug and verify code in authorized development/sandbox environments.',
    'change_chain', jsonb_build_array(
      'DISCOVER', 'ANALYZE', 'PROPOSE', 'OWNER APPROVAL', 'STAGE',
      'TEST', 'VERIFY', 'OWNER APPROVAL', 'PRODUCTION'
    ),
    'final_authority', 'The Owner remains the final authority.'
  ),
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;

-- ---------------------------------------------------------
-- 7. AUDIT — the anatomy change itself is recorded
-- ---------------------------------------------------------
DO $mig$
BEGIN
  INSERT INTO public.frelux_archie_audit_events (
    owner_id, event_type, severity, detail
  )
  SELECT
    p.id,
    'archie.anatomy.subsystem.added',
    'INFO',
    jsonb_build_object(
      'subsystem', 'connective-tissue',
      'name', 'Connected Device & Household Intelligence',
      'principles', jsonb_build_array(
        'connected_device_authority',
        'learning_authority',
        'code_production_authority'
      ),
      'note',
        'Connected Device, Household & Account Intelligence layer added per owner directive: real transports only (bluetooth/wifi/hotspot/usb/local-network/internet/api), explicit pairing lifecycle, permission/scope gating, full audit history, family non-inheritance, no fake integrations.'
    )
  FROM public.profiles p
  WHERE p.role = 'admin'
  LIMIT 1;
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;

