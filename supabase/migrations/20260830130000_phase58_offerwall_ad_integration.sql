-- ============================================================
-- Phase 58: Offerwall.ad Integration with FRELUX Credits System
-- ============================================================
-- Adds the award_offerwall_credits RPC function for processing
-- provider-confirmed Offerwall.ad conversions with variable reward
-- amounts. Reuses the existing credit_wallets and credit_transactions
-- tables — no new wallet or currency is created.
--
-- Key differences from award_ad_credits:
--   1. Variable amounts (Offerwall offers have different payouts)
--   2. No daily limit / min-interval enforcement (offerwall offers
--      are completed at the provider's pace, not the user's)
--   3. Separate idempotency via the rewarded_ad_credit_events table
--      with provider = 'offerwall_ad'
-- ============================================================

-- =========================================================
-- FUNCTION: award_offerwall_credits
-- Awards variable-amount credits from Offerwall.ad completions.
-- Called from the rewarded-postback edge function with service role
-- after validating the provider postback.
-- SECURITY DEFINER — bypasses RLS, but only callable from edge
-- functions using the service role key.
-- =========================================================

CREATE OR REPLACE FUNCTION public.award_offerwall_credits(
  p_user_id       UUID,
  p_provider      TEXT,
  p_event_id      TEXT,
  p_amount        INTEGER,
  p_metadata      JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_awarded BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing      UUID;
  v_current_bal   INTEGER;
  v_new_bal       INTEGER;
BEGIN
  -- Idempotency: reject duplicate event
  SELECT id INTO v_existing FROM public.rewarded_ad_credit_events
  WHERE user_id = p_user_id
    AND ad_provider = p_provider
    AND ad_event_id = p_event_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT balance INTO v_new_bal FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_bal IS NULL THEN v_new_bal := 0; END IF;
    RETURN QUERY SELECT false, v_new_bal, true, 'already_awarded'::TEXT;
    RETURN;
  END IF;

  -- Validate amount
  IF p_amount <= 0 OR p_amount > 1000 THEN
    RETURN QUERY SELECT false, 0, false, 'invalid_amount'::TEXT;
    RETURN;
  END IF;

  -- Get or create wallet
  SELECT balance INTO v_current_bal FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_current_bal IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned, total_spent)
    VALUES (p_user_id, 0, 0, 0);
    v_current_bal := 0;
  END IF;

  v_new_bal := v_current_bal + p_amount;

  -- Update wallet
  UPDATE public.credit_wallets
  SET balance = v_new_bal,
      total_earned = total_earned + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Record ad credit event (idempotency key)
  INSERT INTO public.rewarded_ad_credit_events
    (user_id, ad_provider, ad_event_id, credits_awarded, status, metadata)
  VALUES
    (p_user_id, p_provider, p_event_id, p_amount, 'completed',
     jsonb_build_object('source', 'offerwall', 'provider', p_provider) || p_metadata);

  -- Record immutable transaction
  INSERT INTO public.credit_transactions
    (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES
    (p_user_id, p_amount, 'earn',
     'Offerwall: ' || p_provider,
     p_provider || '_' || p_event_id,
     v_new_bal,
     jsonb_build_object('source', 'offerwall', 'provider', p_provider, 'event_id', p_event_id) || p_metadata);

  RETURN QUERY SELECT true, v_new_bal, false, NULL::TEXT;
END;
$$;

-- Grant execute to service_role (edge functions use service role)
GRANT EXECUTE ON FUNCTION public.award_offerwall_credits(UUID, TEXT, TEXT, INTEGER, JSONB) TO service_role;

-- =========================================================
-- Insert offerwall_ad as a recognized ad provider if missing
-- =========================================================
INSERT INTO public.ad_providers (name, slug, provider_type, is_active, priority, credentials, settings, is_system)
VALUES (
  'Offerwall Ad',
  'offerwall_ad',
  'offerwall',
  true,
  100,
  jsonb_build_object(
    'wall_id', '1b50ede6cf94ed6dbeedb6274efc2b6d',
    'postback_secret', ''
  ),
  jsonb_build_object(
    'iframe_url', 'https://offerwall.ad/wall/1b50ede6cf94ed6dbeedb6274efc2b6d',
    'reward_type', 'variable'
  ),
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  provider_type = EXCLUDED.provider_type,
  is_active = EXCLUDED.is_active,
  settings = EXCLUDED.settings,
  is_system = EXCLUDED.is_system;
