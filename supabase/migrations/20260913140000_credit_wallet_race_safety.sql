-- =========================================================
-- Migration: credit wallet race safety (audit H-1 fix, 2026-09-10)
--
-- Problem (found in end-to-end audit):
--   spend_credits / award_ad_credits / admin_adjust_credits_v2
--   all used READ-balance → COMPUTE → WRITE absolute balance.
--   No row lock and no guarded conditional update, so two
--   concurrent calls for the same user could both read the
--   same balance and both write their own absolute result —
--   double-spend, double-award, lost updates, or negative
--   balances. The idempotency SELECT in spend_credits was
--   also outside any lock, so duplicate concurrent requests
--   with the same idempotency key could both pass.
--
-- Fix (both layers, no schema change):
--   1. pg_advisory_xact_lock keyed on the user serializes all
--      wallet mutations per user for the duration of the
--      transaction (lock auto-releases at commit/rollback).
--      Idempotency checks now run under the lock.
--   2. Absolute `SET balance = v_new_balance` is replaced by
--      guarded RELATIVE updates (`balance = balance ± amount`),
--      with a `WHERE balance >= cost` guard on the spend path,
--      so even a future call-site that skips the lock can never
--      drive a wallet negative or overwrite a concurrent write.
--
-- Idempotent: CREATE OR REPLACE only; no data changes.
-- Self-verifying: the trailing DO block fails loudly if any
-- of the three functions is missing the lock (repo convention).
-- =========================================================

-- ---------------------------------------------------------
-- 1. spend_credits
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_credits(
  p_user_id UUID,
  p_feature_key TEXT,
  p_amount INTEGER,
  p_idempotency_key TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_existing TEXT;
  v_feature RECORD;
  v_daily_count INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Serialize wallet mutations for this user (audit H-1).
  -- The xact lock is held until the function's transaction
  -- commits or rolls back, then auto-releases.
  PERFORM pg_advisory_xact_lock(hashtext('frelux_credit_wallet:' || p_user_id::text));

  -- Idempotency check (now under the lock: a duplicate
  -- concurrent request cannot slip past this anymore)
  SELECT reference_id INTO v_existing
  FROM public.credit_transactions
  WHERE user_id = p_user_id AND reference_id = p_idempotency_key
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_balance IS NULL THEN v_new_balance := 0; END IF;
    RETURN QUERY SELECT true, v_new_balance, 'already_spent'::TEXT;
    RETURN;
  END IF;

  -- Validate feature config
  SELECT * INTO v_feature FROM public.ai_feature_costs
  WHERE feature_key = p_feature_key AND is_enabled = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'feature_not_found'::TEXT;
    RETURN;
  END IF;

  IF NOT v_feature.requires_credits THEN
    -- Feature doesn't require credits — allow free access
    RETURN QUERY SELECT true, 0, NULL::TEXT;
    RETURN;
  END IF;

  -- Use server-side cost, NEVER client-supplied cost
  -- (p_amount is validated against v_feature.credit_cost)
  IF p_amount != v_feature.credit_cost THEN
    RETURN QUERY SELECT false, 0, 'cost_mismatch'::TEXT;
    RETURN;
  END IF;

  -- Check daily usage limit
  IF v_feature.daily_usage_limit > 0 THEN
    SELECT COUNT(*) INTO v_daily_count
    FROM public.ai_feature_usage
    WHERE user_id = p_user_id AND feature_key = p_feature_key
      AND created_at >= v_today::TIMESTAMPTZ;

    IF v_daily_count >= v_feature.daily_usage_limit THEN
      RETURN QUERY SELECT false, 0, 'daily_limit_reached'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Current balance (for the error payload only; the guarded
  -- UPDATE below is the authority)
  SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  -- Deduct atomically: RELATIVE guarded update. If another
  -- transaction already spent the balance below the cost,
  -- this UPDATE matches zero rows and we report insufficient
  -- WITHOUT any write (audit H-1).
  UPDATE public.credit_wallets
  SET balance = balance - v_feature.credit_cost,
      total_spent = total_spent + v_feature.credit_cost,
      updated_at = now()
  WHERE user_id = p_user_id AND balance >= v_feature.credit_cost
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_balance IS NULL THEN v_balance := 0; END IF;
    RETURN QUERY SELECT false, v_balance, 'insufficient_credits'::TEXT;
    RETURN;
  END IF;

  -- Record transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (
    p_user_id,
    -v_feature.credit_cost,
    'spend',
    'AI Feature: ' || v_feature.feature_name,
    p_idempotency_key,
    v_new_balance,
    jsonb_build_object('feature_key', p_feature_key, 'feature_name', v_feature.feature_name) || p_metadata
  );

  -- Record usage
  INSERT INTO public.ai_feature_usage (user_id, feature_key, credits_spent, unlocked_via_ad)
  VALUES (p_user_id, p_feature_key, v_feature.credit_cost, false);

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
  RETURN;
END;
$$;

-- ---------------------------------------------------------
-- 2. award_ad_credits
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_ad_credits(
  p_user_id UUID,
  p_ad_provider TEXT,
  p_ad_event_id TEXT,
  p_amount INTEGER,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_awarded BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_config RECORD;
  v_daily_count INTEGER;
  v_today DATE := CURRENT_DATE;
  v_recent_event TIMESTAMPTZ;
  v_min_interval INTEGER;
BEGIN
  -- Serialize wallet mutations for this user (audit H-1).
  PERFORM pg_advisory_xact_lock(hashtext('frelux_credit_wallet:' || p_user_id::text));

  -- Idempotency: check if this exact ad event already awarded credits
  SELECT id INTO v_existing FROM public.rewarded_ad_credit_events
  WHERE user_id = p_user_id AND ad_provider = p_ad_provider AND ad_event_id = p_ad_event_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_balance IS NULL THEN v_new_balance := 0; END IF;
    RETURN QUERY SELECT false, v_new_balance, true, 'already_awarded'::TEXT;
    RETURN;
  END IF;

  -- Load config
  SELECT * INTO v_config FROM public.rewarded_ad_credit_config WHERE id = 1;
  IF v_config IS NULL THEN
    RETURN QUERY SELECT false, 0, false, 'config_not_found'::TEXT;
    RETURN;
  END IF;

  IF NOT v_config.is_enabled THEN
    RETURN QUERY SELECT false, 0, false, 'rewarded_ads_disabled'::TEXT;
    RETURN;
  END IF;

  -- Verify amount matches config (never trust client)
  IF p_amount != v_config.credits_per_ad THEN
    RETURN QUERY SELECT false, 0, false, 'amount_mismatch'::TEXT;
    RETURN;
  END IF;

  -- Check daily earn limit
  SELECT COUNT(*) INTO v_daily_count
  FROM public.rewarded_ad_credit_events
  WHERE user_id = p_user_id AND status = 'completed'
    AND created_at >= v_today::TIMESTAMPTZ;

  IF v_daily_count >= v_config.daily_earn_limit THEN
    RETURN QUERY SELECT false, 0, false, 'daily_earn_limit'::TEXT;
    RETURN;
  END IF;

  -- Check minimum interval between ad rewards
  v_min_interval := v_config.min_interval_seconds;
  IF v_min_interval > 0 THEN
    SELECT created_at INTO v_recent_event
    FROM public.rewarded_ad_credit_events
    WHERE user_id = p_user_id AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_recent_event IS NOT NULL THEN
      IF EXTRACT(EPOCH FROM (now() - v_recent_event)) < v_min_interval THEN
        RETURN QUERY SELECT false, 0, false, 'min_interval_not_met'::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  -- Get or create wallet (safe under the advisory lock)
  SELECT balance INTO v_current_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_current_balance IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned, total_spent)
    VALUES (p_user_id, 0, 0, 0);
    v_current_balance := 0;
  END IF;

  -- Update wallet: RELATIVE update (audit H-1) — a concurrent
  -- mutation can never be overwritten by a stale absolute value.
  UPDATE public.credit_wallets
  SET balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Record ad credit event (idempotency)
  INSERT INTO public.rewarded_ad_credit_events (user_id, ad_provider, ad_event_id, credits_awarded, status, metadata)
  VALUES (p_user_id, p_ad_provider, p_ad_event_id, p_amount, 'completed', p_metadata);

  -- Record transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (
    p_user_id,
    p_amount,
    'earn',
    'Rewarded Ad: ' || p_ad_provider,
    p_ad_provider || '_' || p_ad_event_id,
    v_new_balance,
    jsonb_build_object('source', 'rewarded_ad', 'ad_provider', p_ad_provider, 'ad_event_id', p_ad_event_id) || p_metadata
  );

  RETURN QUERY SELECT true, v_new_balance, false, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------
-- 3. admin_adjust_credits_v2
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_credits_v2(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role TEXT;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Serialize wallet mutations for the target user (audit H-1).
  PERFORM pg_advisory_xact_lock(hashtext('frelux_credit_wallet:' || p_target_user_id::text));

  SELECT role INTO v_admin_role FROM public.profiles WHERE id = p_admin_id;
  IF v_admin_role != 'admin' THEN
    RETURN QUERY SELECT false, 0, 'not_admin'::TEXT;
    RETURN;
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN QUERY SELECT false, 0, 'reason_required'::TEXT;
    RETURN;
  END IF;

  SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_target_user_id;
  IF v_balance IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned, total_spent)
    VALUES (p_target_user_id, 0, 0, 0);
    v_balance := 0;
  END IF;

  -- RELATIVE guarded update (audit H-1): clamping semantics
  -- preserved via GREATEST(0, balance + amount); the recorded
  -- balance_after now comes from the row itself (RETURNING),
  -- never from a stale pre-read.
  UPDATE public.credit_wallets
  SET balance = GREATEST(0, balance + p_amount),
      total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
      total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
      updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (
    p_target_user_id,
    p_amount,
    'admin_adjust',
    p_reason,
    'admin_adjust_' || gen_random_uuid()::TEXT,
    v_new_balance,
    jsonb_build_object('admin_id', p_admin_id, 'admin_reason', p_reason) || p_metadata
  );

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

-- ---------------------------------------------------------
-- Self-verification (repo convention: fail loudly, name offenders)
-- ---------------------------------------------------------
DO $$
DECLARE
  f TEXT;
  v_def TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['spend_credits', 'award_ad_credits', 'admin_adjust_credits_v2'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'credit wallet race safety: function public.% is missing — migration incomplete', f;
    END IF;
    IF v_def NOT LIKE '%pg_advisory_xact_lock%' THEN
      RAISE EXCEPTION 'credit wallet race safety: public.% does not take the per-user advisory lock', f;
    END IF;
    IF f = 'spend_credits' AND v_def NOT LIKE '%balance >= v_feature.credit_cost%' THEN
      RAISE EXCEPTION 'credit wallet race safety: spend_credits is missing the guarded relative deduction';
    END IF;
  END LOOP;
END;
$$;
