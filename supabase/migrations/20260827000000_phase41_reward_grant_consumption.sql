-- =========================================================
-- Phase 41: Make redeemed rewards actually do something
-- =========================================================
-- Bug: redeem-reward correctly deducted credits and logged a
-- reward_redemptions row, but NOTHING in the app ever checked that row
-- to grant the promised benefit. Redeeming "AI Estimate Token" or
-- "Advanced Calculator Unlock" spent credits for zero effect.
--
-- Fix:
-- 1. Track which redemptions are still "unused" (consumed_at IS NULL)
--    and denormalize reward_type onto reward_redemptions for fast lookup.
-- 2. ai_token redemptions are consumed on-demand: an atomic RPC
--    (consume_reward_grant) is called by the AI edge function the next
--    time the user would otherwise hit their daily free limit.
-- 3. calc_unlock redemptions are granted immediately at redeem time —
--    they insert a real row into rewarded_unlock_log (the same table
--    the existing ad-based RewardedFeatureGate already checks), so the
--    Advanced Calculator unlocks the instant credits are spent.
-- =========================================================

-- 1. Track consumption + denormalize reward_type
ALTER TABLE public.reward_redemptions
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_context JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reward_type TEXT;

-- Backfill reward_type for any existing rows
UPDATE public.reward_redemptions rr
SET reward_type = rc.reward_type
FROM public.reward_catalogue rc
WHERE rr.reward_id = rc.id AND rr.reward_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_unconsumed
  ON public.reward_redemptions(user_id, reward_type)
  WHERE consumed_at IS NULL;

-- 2. Redefine redeem_reward to also set reward_type, and to immediately
--    grant calc_unlock rewards into rewarded_unlock_log.
CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_user_id UUID,
  p_reward_key TEXT,
  p_idempotency_key TEXT,
  p_client_hash TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward RECORD;
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_key TEXT;
  v_redemption_id UUID;
BEGIN
  -- Check idempotency: prevent double-redeem
  SELECT reference_id INTO v_existing_key
  FROM public.credit_transactions
  WHERE user_id = p_user_id AND reference_id = p_idempotency_key
  LIMIT 1;

  IF v_existing_key IS NOT NULL THEN
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_balance IS NULL THEN v_new_balance := 0; END IF;
    RETURN QUERY SELECT true, v_new_balance, 'already_redeemed';
    RETURN;
  END IF;

  -- Get reward
  SELECT * INTO v_reward FROM public.reward_catalogue
  WHERE reward_key = p_reward_key AND is_enabled = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'reward_not_found';
    RETURN;
  END IF;

  -- Check balance
  SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < v_reward.credit_cost THEN
    RETURN QUERY SELECT false, v_balance, 'insufficient_credits';
    RETURN;
  END IF;

  -- Deduct atomically
  v_new_balance := v_balance - v_reward.credit_cost;

  UPDATE public.credit_wallets
  SET balance = v_new_balance,
      total_spent = total_spent + v_reward.credit_cost,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (
    p_user_id,
    -v_reward.credit_cost,
    'spend',
    'Redeemed: ' || v_reward.name,
    p_idempotency_key,
    v_new_balance,
    jsonb_build_object('reward_key', p_reward_key, 'reward_id', v_reward.id)
  );

  -- Record redemption (now tagged with reward_type so it can be found later)
  INSERT INTO public.reward_redemptions (user_id, reward_id, reward_key, reward_type, credits_spent, status, metadata)
  VALUES (p_user_id, v_reward.id, p_reward_key, v_reward.reward_type, v_reward.credit_cost, 'completed', jsonb_build_object('idempotency_key', p_idempotency_key))
  RETURNING id INTO v_redemption_id;

  -- calc_unlock: grant real, immediate access via the existing ad-unlock
  -- table so RewardedFeatureGate (Advanced Calculator) picks it up right away.
  IF v_reward.reward_type = 'calc_unlock' AND p_client_hash IS NOT NULL THEN
    INSERT INTO public.rewarded_unlock_log (tool_key, user_id, client_hash, expires_at, ad_provider)
    VALUES ('advanced_calculator', p_user_id, p_client_hash, now() + interval '24 hours', 'frelux_credits');

    UPDATE public.reward_redemptions
    SET consumed_at = now(), consumed_context = jsonb_build_object('granted_via', 'rewarded_unlock_log')
    WHERE id = v_redemption_id;
  END IF;

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_reward(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 3. Atomic, race-safe consumption of a still-unused reward grant.
--    Used by AI edge functions to spend a pre-paid ai_token instead of
--    charging the daily free-use counter.
CREATE OR REPLACE FUNCTION public.consume_reward_grant(
  p_user_id UUID,
  p_reward_type TEXT
) RETURNS TABLE(success BOOLEAN, reward_key TEXT, redemption_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_key TEXT;
BEGIN
  UPDATE public.reward_redemptions rr
  SET consumed_at = now()
  WHERE rr.id = (
    SELECT rr2.id FROM public.reward_redemptions rr2
    WHERE rr2.user_id = p_user_id
      AND rr2.reward_type = p_reward_type
      AND rr2.status = 'completed'
      AND rr2.consumed_at IS NULL
    ORDER BY rr2.granted_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING rr.id, rr.reward_key INTO v_id, v_key;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID;
  ELSE
    RETURN QUERY SELECT true, v_key, v_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_reward_grant(UUID, TEXT) TO service_role;

-- 4. Users can already SELECT their own reward_redemptions rows via the
--    existing "redemptions_read_own" policy — no policy change needed,
--    we only added columns to a table they could already read.

COMMENT ON COLUMN public.reward_redemptions.consumed_at IS
  'When this redeemed reward''s benefit was actually granted/used. NULL = still pending/unused.';
COMMENT ON COLUMN public.reward_redemptions.reward_type IS
  'Denormalized from reward_catalogue at redemption time for fast unconsumed-grant lookups.';
