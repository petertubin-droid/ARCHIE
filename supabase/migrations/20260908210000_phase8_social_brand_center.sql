-- =========================================================
-- FRELUX ARCHIE EXTENSION, SOCIAL INTELLIGENCE & BRAND
-- CENTER + API SUBSCRIBER LIMIT GOVERNANCE
--
-- Three governance surfaces:
--  1. frelux_social_accounts, Owner brand-account metadata
--     (admin-only RLS; no secrets stored here).
--  2. frelux_social_tokens, encrypted token vault. NO
--     client policies: service-role (edge function) only.
--     Tokens are pgp_sym_encrypt'ed at rest; the key lives as
--     an edge secret, never in the database.
--  3. frelux_social_analyses, ARCHIE insight reports with
--     observed data / recommendations / assumptions kept as
--     DISTINCT labeled kinds (admin-only).
--
-- Plus the API governance fix: the frelux_api_keys owner
-- FOR-ALL write policy let subscribers raise their own
-- rate limits, quotas and permissions. It is replaced with
-- SELECT-only for owners; ALL writes are admin/service-role.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Social accounts (metadata only, no secrets)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  account_handle text NOT NULL,
  status text NOT NULL DEFAULT 'CONNECTED'
    CHECK (status IN ('DISCONNECTED','CONNECT_PENDING','CONNECTED','SYNCED')),
  connection_kind text NOT NULL DEFAULT 'OWNER_BRAND_ACCOUNT'
    CHECK (connection_kind = 'OWNER_BRAND_ACCOUNT'),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_explicitly_authorized boolean NOT NULL DEFAULT false,
  token_rotation_due boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  -- one connection row per platform+handle
  CONSTRAINT social_accounts_unique UNIQUE (platform, account_handle)
);

ALTER TABLE public.frelux_social_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage social accounts" ON public.frelux_social_accounts;
CREATE POLICY "admins manage social accounts"
  ON public.frelux_social_accounts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 2. Token vault, service-role only. NO authenticated
--    policies exist for this table: no browser client and no
--    ARCHIE client context can read or write tokens.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_social_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.frelux_social_accounts (id) ON DELETE CASCADE,
  -- pgp_sym_encrypt output, ciphertext only.
  token_ciphertext bytea NOT NULL,
  key_version int NOT NULL DEFAULT 1,
  rotated_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_tokens_account
  ON public.frelux_social_tokens (account_id);

ALTER TABLE public.frelux_social_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: access is service-role only
-- (archie-social-connect edge function). pgcrypto required.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Server-side token storage: the vault key arrives as a
-- function argument from the edge secret and is never
-- persisted. The ciphertext is stored; the plaintext token
-- never touches a client or a log.
CREATE OR REPLACE FUNCTION public.store_social_token(
  p_account_id uuid,
  p_token_json text,
  p_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgcrypto
AS $$
BEGIN
  -- one live entry per account: replace any previous token
  DELETE FROM public.frelux_social_tokens WHERE account_id = p_account_id;
  INSERT INTO public.frelux_social_tokens (account_id, token_ciphertext)
  VALUES (p_account_id, pgp_sym_encrypt(p_token_json, p_key));
END;
$$;

-- ---------------------------------------------------------
-- 3. Social intelligence analyses (labeled, auditable)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_social_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.frelux_social_accounts (id) ON DELETE CASCADE,
  platform text NOT NULL,
  -- Insights are stored PRE-LABELED: observed platform data,
  -- ARCHIE recommendations and ARCHIE assumptions are separate
  -- arrays and are never merged.
  observed_platform_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  archie_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  archie_assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_analyses_account
  ON public.frelux_social_analyses (account_id, created_date DESC);

ALTER TABLE public.frelux_social_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage social analyses" ON public.frelux_social_analyses;
CREATE POLICY "admins manage social analyses"
  ON public.frelux_social_analyses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 4. API KEYS GOVERNANCE FIX
--
-- The old owner_all FOR-ALL policy allowed a subscriber to
-- UPDATE their own key row, including rate_limit_per_minute,
-- daily_quota, monthly_quota and permissions. Subscribers must
-- never increase, alter or bypass their own limits.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS frelux_api_keys_owner_all ON public.frelux_api_keys;

DROP POLICY IF EXISTS frelux_api_keys_owner_read ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_owner_read ON public.frelux_api_keys
  FOR SELECT USING (created_by = auth.uid() OR public.is_admin());

-- Admins retain metadata view + status/quota/permission
-- configuration (already the case). INSERT/DELETE for
-- subscribers is intentionally NOT granted: keys are issued
-- only through the official frelix-api issuance path
-- (service role) or by admins.
DROP POLICY IF EXISTS frelux_api_keys_admin_configure ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_admin_configure ON public.frelux_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS frelux_api_keys_admin_insert ON public.frelux_api_keys;
CREATE POLICY frelux_api_keys_admin_insert ON public.frelux_api_keys
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- Guard the quotas against escalation: a non-admin session
-- can never raise limits above the plan maximums.
-- Idempotent guard (ADD CONSTRAINT has no IF NOT EXISTS form in
-- Postgres) so this migration can be safely re-run to completion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_limit_ceiling'
  ) THEN
    ALTER TABLE public.frelux_api_keys
      ADD CONSTRAINT api_keys_limit_ceiling
      CHECK (
        rate_limit_per_minute <= 10000
        AND daily_quota <= 1000000
        AND monthly_quota <= 10000000
      );
  END IF;
END $$;
