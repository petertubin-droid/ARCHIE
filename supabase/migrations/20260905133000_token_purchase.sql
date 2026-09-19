-- =========================================================
-- FRELUX Token Purchase System (Paystack)
-- Date: 2026-09-05
--
-- Lets users buy FRELUX tokens (credits) directly via Paystack,
-- e.g. the default 50 tokens for ₦1,500. Fully configurable from
-- the admin panel via token_purchase_config.
--
-- NEW TABLES:
-- 1. token_purchase_config — single-row admin config (tokens per pack, price)
-- 2. token_purchases — immutable purchase ledger (idempotency + revenue stats)
--
-- NEW FUNCTION:
-- 3. credit_token_purchase — atomic, idempotent crediting RPC
--    (called by edge functions with service role after Paystack
--    verifies a successful payment)
--
-- Builds on the existing credit_wallets / credit_transactions tables.
-- =========================================================

-- 1. Token Purchase Configuration (admin-managed, single row)
CREATE TABLE IF NOT EXISTS public.token_purchase_config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  token_amount  INTEGER NOT NULL DEFAULT 50 CHECK (token_amount > 0),
  price_kobo    INTEGER NOT NULL DEFAULT 150000 CHECK (price_kobo >= 10000),
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 2. Token Purchase Ledger (service-role writes only)
CREATE TABLE IF NOT EXISTS public.token_purchases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference        TEXT NOT NULL UNIQUE,
  amount_kobo      INTEGER NOT NULL CHECK (amount_kobo > 0),
  tokens_credited  INTEGER NOT NULL CHECK (tokens_credited > 0),
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  paystack_data    JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_purchases_user ON public.token_purchases(user_id, created_at DESC);

-- =========================================================
-- SEED DATA — default pack: 50 tokens for ₦1,500
-- =========================================================
INSERT INTO public.token_purchase_config (id, token_amount, price_kobo, is_enabled)
VALUES (1, 50, 150000, true)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
ALTER TABLE public.token_purchase_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_purchases ENABLE ROW LEVEL SECURITY;

-- token_purchase_config: public read (frontend shows the price), admin-only writes
DROP POLICY IF EXISTS "token_purchase_config_read_all" ON public.token_purchase_config;

CREATE POLICY "token_purchase_config_read_all" ON public.token_purchase_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "token_purchase_config_admin_write" ON public.token_purchase_config;

CREATE POLICY "token_purchase_config_admin_write" ON public.token_purchase_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- token_purchases: users read own purchases only; writes happen via
-- service role (edge functions) so no client insert/update policy
DROP POLICY IF EXISTS "token_purchases_read_own" ON public.token_purchases;

CREATE POLICY "token_purchases_read_own" ON public.token_purchases
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- FUNCTION: credit_token_purchase
-- Atomically credits a wallet after a verified Paystack payment.
-- Idempotent on the Paystack reference — the same transaction can
-- never be credited twice (webhook + manual verify can both fire).
-- =========================================================
CREATE OR REPLACE FUNCTION public.credit_token_purchase(
  p_user_id UUID,
  p_reference TEXT,
  p_tokens INTEGER,
  p_amount_kobo INTEGER,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_credited BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing RECORD;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Idempotency: if this Paystack reference was already credited, do nothing
  SELECT id, tokens_credited INTO v_existing
  FROM public.token_purchases
  WHERE reference = p_reference
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_balance IS NULL THEN v_new_balance := 0; END IF;
    RETURN QUERY SELECT true, v_new_balance, true, NULL::TEXT;
    RETURN;
  END IF;

  -- Validate inputs (defence in depth; edge functions pass server-side values)
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RETURN QUERY SELECT false, 0, false, 'invalid_token_amount'::TEXT;
    RETURN;
  END IF;
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RETURN QUERY SELECT false, 0, false, 'invalid_price'::TEXT;
    RETURN;
  END IF;

  -- Credit the wallet atomically (create wallet if this is the user's first credit)
  SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned)
    VALUES (p_user_id, p_tokens, p_tokens)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.credit_wallets.balance + EXCLUDED.balance,
          total_earned = public.credit_wallets.total_earned + EXCLUDED.total_earned,
          updated_at = now();
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  ELSE
    v_new_balance := v_balance + p_tokens;
    UPDATE public.credit_wallets
    SET balance = v_new_balance,
        total_earned = total_earned + p_tokens,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Record in the immutable ledger
  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (
    p_user_id,
    p_tokens,
    'earn',
    'Token Purchase',
    p_reference,
    v_new_balance,
    jsonb_build_object('source', 'paystack', 'amount_kobo', p_amount_kobo, 'tokens', p_tokens) || p_metadata
  );

  -- Record the purchase for revenue reporting
  INSERT INTO public.token_purchases (user_id, reference, amount_kobo, tokens_credited, status, paystack_data)
  VALUES (p_user_id, p_reference, p_amount_kobo, p_tokens, 'completed', p_metadata);

  RETURN QUERY SELECT true, v_new_balance, false, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_token_purchase TO service_role;

-- =========================================================
-- PRIVILEGES (anon/authenticated/service_role need table
-- grants when the migration is run outside the default
-- Supabase privilege path, e.g. via the Management API)
-- =========================================================
GRANT SELECT ON public.token_purchase_config TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.token_purchases TO authenticated, service_role;
