-- =========================================================
-- ARCHIE API CREDENTIAL SYSTEM (owner directive 2026-09-12)
--
-- Production credential management for explicitly authorized
-- applications (FRELUX first, future applications after).
--
-- SECURITY MODEL (mirrors archie-owner-auth, no new authority
-- architecture):
--   * Only the OWNER (is_admin) can create/list/revoke/rotate
--     credentials — enforced in the archie-credentials edge
--     function, exactly like archie-owner-auth.
--   * Raw API keys are NEVER stored. Only a SHA-256/HMAC-SHA256
--     verifier hash is persisted. The full secret is shown once
--     at creation and never again.
--   * Least privilege by default: a credential grants ONLY the
--     explicitly listed scopes. No wildcard scopes exist.
--   * Emergency global revocation: a single-row killswitch
--     table flips ALL credentials off instantly.
--   * RLS is ENABLED + FORCED with NO policies: direct client
--     access (anon, authenticated, even admins) is impossible;
--     only the service role inside edge functions can touch
--     these tables.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Credential registry
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-readable label, e.g. "Frelux web app"
  name text NOT NULL,
  -- Authorized application identity, e.g. 'frelux'
  application text NOT NULL,
  -- Deployment environment of the credential use
  environment text NOT NULL
    CHECK (environment IN ('production', 'staging', 'development')),
  -- Non-secret identification prefix of the key
  -- (e.g. 'archie_ak_live_frelux_AbC12345') — safe to display.
  key_prefix text NOT NULL,
  -- Verifier: SHA-256 (or HMAC-SHA256 with server pepper) of
  -- the FULL key, base64. Unique — authentication is a single
  -- indexed lookup. NEVER the raw key.
  key_hash text NOT NULL UNIQUE,
  -- Granular permission scopes, least privilege. Validated in
  -- code against a fixed registry; '*' can never appear here.
  scopes text[] NOT NULL DEFAULT '{}',
  -- Per-credential rate limit (requests/minute)
  rate_limit_per_minute integer NOT NULL DEFAULT 60
    CHECK (rate_limit_per_minute BETWEEN 1 AND 600),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'expired', 'rotated')),
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  -- Rotation linkage: old credential points at its successor.
  rotated_to uuid,
  rotated_at timestamptz,
  -- Rotation provenance: new credential points at predecessor.
  rotated_from uuid
);

CREATE INDEX IF NOT EXISTS idx_archie_api_credentials_hash
  ON public.frelux_archie_api_credentials (key_hash);
CREATE INDEX IF NOT EXISTS idx_archie_api_credentials_status
  ON public.frelux_archie_api_credentials (status, application);
-- Prevent duplicate active credentials for the same app+env
-- with the same name (rotation creates a new name-suffixed row).
CREATE UNIQUE INDEX IF NOT EXISTS uq_archie_api_credentials_prefix
  ON public.frelux_archie_api_credentials (key_prefix);

ALTER TABLE public.frelux_archie_api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_api_credentials FORCE ROW LEVEL SECURITY;
-- DELIBERATELY NO POLICIES: no client (anon/authenticated/
-- admin JWT) may read, create or mutate credentials directly.
-- All access is service-role-only from inside ARCHIE edge
-- functions, which apply the owner gate themselves.

-- ---------------------------------------------------------
-- 2. Emergency global killswitch (single row)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_api_global_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- TRUE  = every API credential is rejected immediately,
  --         regardless of status or scope.
  -- FALSE  = normal credential evaluation.
  global_killswitch boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

INSERT INTO public.frelux_archie_api_global_state (id)
VALUES (1) ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------
-- Explicit grants: edge functions use the service_role via REST.
-- Tables created outside the standard migration runner can miss
-- the DEFAULT PRIVILEGES hook, so grants are explicit here.
-- anon/authenticated get NOTHING — RLS (forced, no policies)
-- already denies them; the REVOKEs are belt-and-braces.
-- ---------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.frelux_archie_api_credentials TO service_role;
GRANT SELECT, UPDATE ON public.frelux_archie_api_global_state TO service_role;
REVOKE ALL ON public.frelux_archie_api_credentials FROM anon, authenticated;
REVOKE ALL ON public.frelux_archie_api_global_state FROM anon, authenticated;

ALTER TABLE public.frelux_archie_api_global_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_api_global_state FORCE ROW LEVEL SECURITY;
-- Same no-policy convention: service-role-only.

COMMENT ON TABLE public.frelux_archie_api_credentials IS
  'ARCHIE API credentials — hashed verifiers only, never raw keys. Owner-managed via archie-credentials edge function; all client access denied by RLS.';
COMMENT ON TABLE public.frelux_archie_api_global_state IS
  'ARCHIE API emergency killswitch — one row, flipped by the owner, rejects every credential immediately.';
