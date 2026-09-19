-- =========================================================
-- FRELUX PHASE 7 — STAGE 4: MONETIZATION & ENTITLEMENTS
--
-- §17 Subscriptions & Payments: API plan purchases integrate
-- with the existing FRELUX monetization architecture (Paystack).
-- Entitlements are granted ONLY by the signed payment webhook —
-- never by a client-side payment-success message.
--
-- Idempotency: every webhook grant/revoke is keyed by the unique
-- provider payment reference. A replayed webhook is a no-op.
--
-- §23 Observability: frelux_api_usage.api_key_id becomes nullable
-- so the gateway can meter invalid/forged-key authentication
-- failures WITHOUT storing any key material. Denial rows are
-- metered with usage_units = 0 and never count against quotas.
-- =========================================================

-- ---------------------------------------------------------
-- API PLAN TRANSACTIONS (idempotency ledger)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_api_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE payment reference = replay protection. A repeated
  -- webhook delivery conflicts here and is ignored.
  provider_reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'PURCHASED'
    CHECK (status IN ('PURCHASED','REFUNDED','FAILED')),
  provider text NOT NULL DEFAULT 'paystack',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_api_transactions ENABLE ROW LEVEL SECURITY;

-- Owner and admin may read their transaction history. No client
-- writes of any kind — only the webhook (service role) writes.
DROP POLICY IF EXISTS frelux_api_transactions_owner_read ON public.frelux_api_transactions;
CREATE POLICY frelux_api_transactions_owner_read ON public.frelux_api_transactions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS frelux_api_transactions_admin_read ON public.frelux_api_transactions;
CREATE POLICY frelux_api_transactions_admin_read ON public.frelux_api_transactions
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.frelux_api_transactions IS
  'Phase 7: API plan purchase ledger — provider-abstracted, reference-unique (webhook idempotency).';

-- ---------------------------------------------------------
-- API PLAN ENTITLEMENTS (current active plan per user)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_api_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  purchased_at timestamptz,
  paid_until timestamptz,
  provider text,
  provider_reference text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_api_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frelux_api_entitlements_owner_read ON public.frelux_api_entitlements;
CREATE POLICY frelux_api_entitlements_owner_read ON public.frelux_api_entitlements
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS frelux_api_entitlements_admin_read ON public.frelux_api_entitlements;
CREATE POLICY frelux_api_entitlements_admin_read ON public.frelux_api_entitlements
  FOR SELECT USING (public.is_admin());

COMMENT ON TABLE public.frelux_api_entitlements IS
  'Phase 7: current API plan entitlement per user — granted only via webhook RPC, never client claims.';

-- ---------------------------------------------------------
-- Meter invalid-key auth failures (no key material stored)
-- ---------------------------------------------------------
ALTER TABLE public.frelux_api_usage ALTER COLUMN api_key_id DROP NOT NULL;

COMMENT ON COLUMN public.frelux_api_usage.api_key_id IS
  'Nullable since Phase 7 stage 4: NULL rows meter auth failures for unknown/invalid keys. No key material is ever stored.';

-- ---------------------------------------------------------
-- RPC: apply a paid API plan purchase (webhook only)
--
-- Idempotent: INSERT .. ON CONFLICT (provider_reference) DO
-- NOTHING — a replayed webhook grant changes nothing.
-- On first insert: upsert the user entitlement and apply the
-- plan (and its configured quotas) to all of the user's ACTIVE
-- API keys. Key status/expiry are untouched.
-- SECURITY: SECURITY DEFINER, no PUBLIC/anon/authenticated grant —
-- callable only by the service role (payment webhook).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frelux_api_apply_plan_purchase(
  p_user_id uuid,
  p_plan_key text,
  p_provider_reference text,
  p_amount numeric,
  p_currency text DEFAULT 'USD',
  p_paid_until timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
  v_days int;
BEGIN
  IF p_user_id IS NULL OR p_plan_key IS NULL OR p_provider_reference IS NULL THEN
    RAISE EXCEPTION 'frelux_api_apply_plan_purchase: user, plan and reference are required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.frelux_api_plans WHERE key = p_plan_key AND active) THEN
    RAISE EXCEPTION 'frelux_api_apply_plan_purchase: unknown or inactive plan %', p_plan_key;
  END IF;

  INSERT INTO public.frelux_api_transactions
    (provider_reference, user_id, plan_key, amount, currency, status, provider, metadata)
  VALUES
    (p_provider_reference, p_user_id, p_plan_key, COALESCE(p_amount, 0),
     COALESCE(p_currency, 'USD'), 'PURCHASED', 'paystack', p_metadata)
  ON CONFLICT (provider_reference) DO NOTHING;

  v_inserted := (FOUND = TRUE);

  IF v_inserted THEN
    INSERT INTO public.frelux_api_entitlements
      (user_id, plan_key, status, purchased_at, paid_until, provider, provider_reference)
    VALUES
      (p_user_id, p_plan_key, 'ACTIVE', now(), COALESCE(p_paid_until, now() + interval '30 days'),
       'paystack', p_provider_reference)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_key = EXCLUDED.plan_key,
      status = 'ACTIVE',
      purchased_at = EXCLUDED.purchased_at,
      paid_until = EXCLUDED.paid_until,
      provider = EXCLUDED.provider,
      provider_reference = EXCLUDED.provider_reference,
      updated_date = now();

    -- Apply the plan + its configured quotas to the user's ACTIVE
    -- keys immediately. Quotas come from the plan config in the DB
    -- (frelux_api_plans), never from the caller.
    UPDATE public.frelux_api_keys k
    SET plan_key = p.key,
        rate_limit_per_minute = COALESCE((p.config->>'rateLimitPerMinute')::int, k.rate_limit_per_minute),
        daily_quota = COALESCE((p.config->>'dailyQuota')::int, k.daily_quota),
        monthly_quota = COALESCE((p.config->>'monthlyQuota')::int, k.monthly_quota),
        updated_at = now()
    FROM public.frelux_api_plans p
    WHERE p.key = p_plan_key
      AND k.created_by = p_user_id
      AND k.status = 'active';
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.frelux_api_apply_plan_purchase FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.frelux_api_apply_plan_purchase IS
  'Phase 7 webhook-only: idempotently grant an API plan purchase and apply plan quotas to the buyer''s active keys.';

-- ---------------------------------------------------------
-- RPC: record a refund (webhook only)
--
-- Idempotent: only transitions PURCHASED -> REFUNDED once, then
-- revokes the entitlement and returns the user's active keys to
-- the 'free' plan (quotas from the free plan config in the DB).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frelux_api_record_refund(
  p_provider_reference text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn public.frelux_api_transactions;
  v_applied boolean := false;
BEGIN
  SELECT * INTO v_txn
  FROM public.frelux_api_transactions
  WHERE provider_reference = p_provider_reference
  FOR UPDATE;

  IF v_txn.id IS NULL THEN
    RETURN false; -- unknown reference: nothing to refund
  END IF;

  IF v_txn.status = 'PURCHASED' THEN
    UPDATE public.frelux_api_transactions
    SET status = 'REFUNDED', updated_date = now()
    WHERE id = v_txn.id;

    UPDATE public.frelux_api_entitlements
    SET status = 'REVOKED', updated_date = now()
    WHERE user_id = v_txn.user_id AND provider_reference = p_provider_reference;

    UPDATE public.frelux_api_keys k
    SET plan_key = p.key,
        rate_limit_per_minute = COALESCE((p.config->>'rateLimitPerMinute')::int, k.rate_limit_per_minute),
        daily_quota = COALESCE((p.config->>'dailyQuota')::int, k.daily_quota),
        monthly_quota = COALESCE((p.config->>'monthlyQuota')::int, k.monthly_quota),
        updated_at = now()
    FROM public.frelux_api_plans p
    WHERE p.key = 'free'
      AND k.created_by = v_txn.user_id
      AND k.status = 'active';

    v_applied := true;
  END IF;

  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.frelux_api_record_refund FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.frelux_api_record_refund IS
  'Phase 7 webhook-only: idempotently record a refund and downgrade the buyer''s active keys to the free plan.';

-- ---------------------------------------------------------
-- Migration-runner grants (service role uses these tables/RPCs)
-- ---------------------------------------------------------
GRANT SELECT ON public.frelux_api_transactions TO service_role;
GRANT SELECT ON public.frelux_api_entitlements TO service_role;
-- The payment webhook runs as service_role and is the ONLY caller.
GRANT EXECUTE ON FUNCTION public.frelux_api_apply_plan_purchase TO service_role;
GRANT EXECUTE ON FUNCTION public.frelux_api_record_refund TO service_role;

-- Invalid-key auth-failure rows have no attributable user either.
ALTER TABLE public.frelux_api_usage ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.frelux_api_usage.user_id IS
  'Nullable since Phase 7 stage 4: NULL rows meter auth failures for unknown/invalid keys (§23 abuse detection).';
