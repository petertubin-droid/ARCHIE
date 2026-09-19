-- ============================================================
-- Phase 59: Offerwall.ad HMAC Postback Signing & Event Handling
-- ============================================================
-- 1. Expands rewarded_ad_credit_events.status CHECK to support
--    held, released, reversed statuses from Offerwall.ad events.
-- 2. Rewrites award_offerwall_credits with atomic idempotency using
--    ON CONFLICT DO NOTHING (eliminates TOCTOU race condition).
-- 3. Adds reverse_offerwall_credits function for conversion.reversed
--    events — deducts previously awarded credits atomically.
-- 4. Adds offerwall_event_type column to rewarded_ad_credit_events
--    for tracking the Offerwall.ad event lifecycle.
-- No new tables, wallets, or currencies are created.
-- ============================================================

-- =========================================================
-- 1. Expand status CHECK on rewarded_ad_credit_events
-- =========================================================
ALTER TABLE public.rewarded_ad_credit_events
  DROP CONSTRAINT IF EXISTS rewarded_ad_credit_events_status_check;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rewarded_ad_credit_events_status_check'
                 AND conrelid = 'public.rewarded_ad_credit_events'::regclass) THEN
ALTER TABLE public.rewarded_ad_credit_events
  ADD CONSTRAINT rewarded_ad_credit_events_status_check
  CHECK (status IN ('completed', 'failed', 'rejected', 'held', 'released', 'reversed'));
  END IF;
END
$mig$;


-- =========================================================
-- 2. Add offerwall_event_type column for event lifecycle tracking
-- =========================================================
ALTER TABLE public.rewarded_ad_credit_events
  ADD COLUMN IF NOT EXISTS offerwall_event_type TEXT DEFAULT NULL;

-- =========================================================
-- 3. Add reversal_id column to link reversal events to originals
-- =========================================================
ALTER TABLE public.rewarded_ad_credit_events
  ADD COLUMN IF NOT EXISTS reversal_of UUID DEFAULT NULL;

-- =========================================================
-- 4. REWRITE: award_offerwall_credits with atomic idempotency
-- =========================================================
-- Uses INSERT ... ON CONFLICT DO NOTHING to eliminate the TOCTOU
-- race between the existence SELECT and the INSERT. Only one
-- concurrent caller will get FOUND=true from the INSERT; all
-- others get FOUND=false and return already_awarded.
-- =========================================================
CREATE OR REPLACE FUNCTION public.award_offerwall_credits(
  p_user_id       UUID,
  p_provider      TEXT,
  p_event_id      TEXT,
  p_amount        INTEGER,
  p_event_type    TEXT DEFAULT 'conversion.approved',
  p_metadata      JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_awarded BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_bal   INTEGER;
  v_new_bal       INTEGER;
  v_inserted      BOOLEAN;
BEGIN
  -- Validate amount
  IF p_amount <= 0 OR p_amount > 1000 THEN
    RETURN QUERY SELECT false, 0, false, 'invalid_amount'::TEXT;
    RETURN;
  END IF;

  -- Validate event type — only award for approved or released
  IF p_event_type NOT IN ('conversion.approved', 'conversion.released') THEN
    RETURN QUERY SELECT false, 0, false, 'event_not_awardable'::TEXT;
    RETURN;
  END IF;

  -- Atomic idempotency: INSERT with ON CONFLICT DO NOTHING
  -- Only the first caller wins; concurrent duplicates get FOUND=false
  INSERT INTO public.rewarded_ad_credit_events
    (user_id, ad_provider, ad_event_id, credits_awarded, status, offerwall_event_type, metadata)
  VALUES
    (p_user_id, p_provider, p_event_id, p_amount, 'completed', p_event_type,
     jsonb_build_object('source', 'offerwall', 'provider', p_provider, 'event_type', p_event_type) || p_metadata)
  ON CONFLICT (user_id, ad_provider, ad_event_id) DO NOTHING;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    -- Already exists — idempotent response
    SELECT balance INTO v_new_bal FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_bal IS NULL THEN v_new_bal := 0; END IF;
    RETURN QUERY SELECT false, v_new_bal, true, 'already_awarded'::TEXT;
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

  -- Record immutable transaction
  INSERT INTO public.credit_transactions
    (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES
    (p_user_id, p_amount, 'earn',
     'Offerwall: ' || p_provider,
     p_provider || '_' || p_event_id,
     v_new_bal,
     jsonb_build_object('source', 'offerwall', 'provider', p_provider, 'event_id', p_event_id, 'event_type', p_event_type) || p_metadata);

  RETURN QUERY SELECT true, v_new_bal, false, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_offerwall_credits(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role;

-- =========================================================
-- 5. NEW: reverse_offerwall_credits for conversion.reversed
-- =========================================================
-- When Offerwall.ad sends a conversion.reversed event, this
-- function deducts the previously awarded credits and marks
-- the original event as 'reversed'. Records a negative
-- transaction. Atomic — uses ON CONFLICT for the reversal
-- event record to prevent double-reversal.
-- =========================================================
CREATE OR REPLACE FUNCTION public.reverse_offerwall_credits(
  p_user_id       UUID,
  p_provider      TEXT,
  p_event_id      TEXT,            -- the REVERSAL event ID (new)
  p_original_tx_id TEXT,           -- the ORIGINAL transaction ID being reversed
  p_amount        INTEGER,
  p_metadata      JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_reversed BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_original_event  UUID;
  v_already_rev     BOOLEAN;
  v_current_bal     INTEGER;
  v_new_bal         INTEGER;
BEGIN
  -- Check if original event exists and was completed
  SELECT id INTO v_original_event FROM public.rewarded_ad_credit_events
  WHERE user_id = p_user_id
    AND ad_provider = p_provider
    AND ad_event_id = p_original_tx_id
    AND status = 'completed'
  LIMIT 1;

  IF v_original_event IS NULL THEN
    -- Original not found or already reversed — idempotent
    SELECT balance INTO v_new_bal FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_bal IS NULL THEN v_new_bal := 0; END IF;
    RETURN QUERY SELECT false, v_new_bal, true, 'original_not_found_or_already_reversed'::TEXT;
    RETURN;
  END IF;

  -- Check if this reversal event was already processed (idempotency)
  SELECT EXISTS(
    SELECT 1 FROM public.rewarded_ad_credit_events
    WHERE user_id = p_user_id
      AND ad_provider = p_provider
      AND ad_event_id = p_event_id
  ) INTO v_already_rev;

  IF v_already_rev THEN
    SELECT balance INTO v_new_bal FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_bal IS NULL THEN v_new_bal := 0; END IF;
    RETURN QUERY SELECT false, v_new_bal, true, 'already_reversed'::TEXT;
    RETURN;
  END IF;

  -- Record the reversal event (idempotent via ON CONFLICT)
  INSERT INTO public.rewarded_ad_credit_events
    (user_id, ad_provider, ad_event_id, credits_awarded, status, offerwall_event_type, reversal_of, metadata)
  VALUES
    (p_user_id, p_provider, p_event_id, 0, 'reversed', 'conversion.reversed', v_original_event,
     jsonb_build_object('source', 'offerwall', 'provider', p_provider, 'reversal_of', p_original_tx_id) || p_metadata)
  ON CONFLICT (user_id, ad_provider, ad_event_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT balance INTO v_new_bal FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_bal IS NULL THEN v_new_bal := 0; END IF;
    RETURN QUERY SELECT false, v_new_bal, true, 'already_reversed'::TEXT;
    RETURN;
  END IF;

  -- Mark original event as reversed
  UPDATE public.rewarded_ad_credit_events
  SET status = 'reversed', updated_at = now()
  WHERE id = v_original_event;

  -- Deduct credits from wallet (never go below 0)
  SELECT balance INTO v_current_bal FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_current_bal IS NULL THEN v_current_bal := 0; END IF;

  v_new_bal := GREATEST(0, v_current_bal - p_amount);

  UPDATE public.credit_wallets
  SET balance = v_new_bal,
      total_earned = GREATEST(0, total_earned - p_amount),
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Record negative transaction
  INSERT INTO public.credit_transactions
    (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES
    (p_user_id, -p_amount, 'admin_adjust',
     'Offerwall reversal: ' || p_provider,
     p_provider || '_rev_' || p_event_id,
     v_new_bal,
     jsonb_build_object('source', 'offerwall', 'provider', p_provider, 'event_id', p_event_id, 'reversal_of', p_original_tx_id) || p_metadata);

  RETURN QUERY SELECT true, v_new_bal, false, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_offerwall_credits(UUID, TEXT, TEXT, TEXT, INTEGER, JSONB) TO service_role;

-- =========================================================
-- 6. Update offerwall_ad provider settings to reflect HMAC
-- =========================================================
UPDATE public.ad_providers
SET settings = jsonb_build_object(
    'iframe_url', 'https://offerwall.ad/wall/1b50ede6cf94ed6dbeedb6274efc2b6d',
    'reward_type', 'variable',
    'hmac_verification', true,
    'hmac_algorithm', 'HMAC-SHA256',
    'hmac_header', 'X-Offerwall-Ad-Signature',
    'event_header', 'X-Offerwall-Ad-Event',
    'event_id_header', 'X-Offerwall-Ad-Event-Id',
    'secret_env_var', 'OFFERWALL_AD_SIGNING_SECRET'
  ),
  credentials = jsonb_build_object(
    'wall_id', '1b50ede6cf94ed6dbeedb6274efc2b6d',
    'postback_secret', ''
  )
WHERE slug = 'offerwall_ad';
