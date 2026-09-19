-- =========================================================
-- FRELUX Rewarded Ads & AI Credits System
-- Date: 2026-08-25
--
-- Builds ON TOP of the existing Phase 40 credit_wallets,
-- credit_transactions, and reward_events tables.
--
-- NEW TABLES:
-- 1. ai_feature_costs — admin-configurable credit costs per AI feature
-- 2. rewarded_ad_credit_config — rewarded ad earning configuration
-- 3. rewarded_ad_credit_events — idempotency log for ad-credit awards
-- 4. ai_feature_usage — tracks AI feature usage for daily limits
--
-- SEPARATE from Achievement Points. These tables only deal with
-- FRELUX Credits (consumable access currency).
-- =========================================================

-- 1. AI Feature Cost Configuration (admin-managed)
CREATE TABLE IF NOT EXISTS public.ai_feature_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key     TEXT NOT NULL UNIQUE,
  feature_name    TEXT NOT NULL,
  description     TEXT,
  credit_cost     INTEGER NOT NULL DEFAULT 1 CHECK (credit_cost >= 0),
  requires_credits BOOLEAN NOT NULL DEFAULT true,
  ad_unlock_enabled BOOLEAN NOT NULL DEFAULT false,
  ad_unlock_credits INTEGER NOT NULL DEFAULT 0,
  daily_usage_limit INTEGER NOT NULL DEFAULT 0,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Rewarded Ad Credit Earning Configuration
CREATE TABLE IF NOT EXISTS public.rewarded_ad_credit_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  credits_per_ad        INTEGER NOT NULL DEFAULT 5 CHECK (credits_per_ad > 0),
  daily_earn_limit      INTEGER NOT NULL DEFAULT 10 CHECK (daily_earn_limit > 0),
  cooldown_seconds      INTEGER NOT NULL DEFAULT 0,
  min_interval_seconds  INTEGER NOT NULL DEFAULT 30,
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 3. Rewarded Ad Credit Events (idempotency log)
CREATE TABLE IF NOT EXISTS public.rewarded_ad_credit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_provider       TEXT NOT NULL,
  ad_event_id       TEXT NOT NULL,
  credits_awarded   INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'rejected')),
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_provider, ad_event_id)
);

-- 4. AI Feature Usage Tracking (for daily limits)
CREATE TABLE IF NOT EXISTS public.ai_feature_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key     TEXT NOT NULL,
  credits_spent   INTEGER NOT NULL,
  unlocked_via_ad BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_ai_feature_costs_key ON public.ai_feature_costs(feature_key);
CREATE INDEX IF NOT EXISTS idx_rewarded_ad_credit_events_user ON public.rewarded_ad_credit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feature_usage_user_date ON public.ai_feature_usage(user_id, feature_key, created_at DESC);

-- =========================================================
-- SEED DATA
-- =========================================================
INSERT INTO public.ai_feature_costs (feature_key, feature_name, description, credit_cost, requires_credits, ad_unlock_enabled, ad_unlock_credits, daily_usage_limit, sort_order)
VALUES
  ('ai_color_consult', 'AI Color Consultant', 'AI-powered color palette recommendations', 5, true, true, 0, 20, 1),
  ('ai_color_preview', 'AI Color Preview', 'AI visualization of colors on surfaces', 3, true, true, 0, 30, 2),
  ('ai_building_estimation', 'AI Building Estimation', 'AI-assisted project estimation', 10, true, true, 0, 5, 3),
  ('ai_learn_assistant', 'AI Learning Assistant', 'AI tutoring for construction topics', 2, true, false, 0, 50, 4),
  ('ai_project_assistant', 'AI Project Assistant', 'AI project planning and advice', 8, true, true, 0, 10, 5),
  ('ai_livechat', 'AI Live Chat', 'AI chatbot for instant help', 1, true, false, 0, 100, 6)
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO public.rewarded_ad_credit_config (id, credits_per_ad, daily_earn_limit, cooldown_seconds, min_interval_seconds, is_enabled)
VALUES (1, 5, 10, 0, 30, true)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
ALTER TABLE public.ai_feature_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_credit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewarded_ad_credit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feature_usage ENABLE ROW LEVEL SECURITY;

-- ai_feature_costs: public read (frontend needs costs), admin-only writes
DROP POLICY IF EXISTS "ai_feature_costs_read_all" ON public.ai_feature_costs;
CREATE POLICY "ai_feature_costs_read_all" ON public.ai_feature_costs
  FOR SELECT TO anon, authenticated USING (true);

-- rewarded_ad_credit_config: public read, admin-only writes
DROP POLICY IF EXISTS "rewarded_ad_credit_config_read_all" ON public.rewarded_ad_credit_config;
CREATE POLICY "rewarded_ad_credit_config_read_all" ON public.rewarded_ad_credit_config
  FOR SELECT TO anon, authenticated USING (true);

-- rewarded_ad_credit_events: users read own only
DROP POLICY IF EXISTS "rewarded_ad_credit_events_read_own" ON public.rewarded_ad_credit_events;
CREATE POLICY "rewarded_ad_credit_events_read_own" ON public.rewarded_ad_credit_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ai_feature_usage: users read own only
DROP POLICY IF EXISTS "ai_feature_usage_read_own" ON public.ai_feature_usage;
CREATE POLICY "ai_feature_usage_read_own" ON public.ai_feature_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- FUNCTION: spend_credits (atomic credit deduction for AI features)
-- Called via edge function with service role
-- =========================================================
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
  -- Idempotency check
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

  -- Check balance
  SELECT balance INTO v_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < v_feature.credit_cost THEN
    RETURN QUERY SELECT false, v_balance, 'insufficient_credits'::TEXT;
    RETURN;
  END IF;

  -- Deduct atomically
  v_new_balance := v_balance - v_feature.credit_cost;

  UPDATE public.credit_wallets
  SET balance = v_new_balance,
      total_spent = total_spent + v_feature.credit_cost,
      updated_at = now()
  WHERE user_id = p_user_id;

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
END;
$$;

-- =========================================================
-- FUNCTION: award_ad_credits (award credits from watching rewarded ads)
-- Called via edge function with service role after ad verification
-- =========================================================
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

  -- Get or create wallet
  SELECT balance INTO v_current_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_current_balance IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned, total_spent)
    VALUES (p_user_id, 0, 0, 0);
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update wallet
  UPDATE public.credit_wallets
  SET balance = v_new_balance,
      total_earned = total_earned + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

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

-- =========================================================
-- FUNCTION: unlock_ai_feature_via_ad
-- Records an ad-unlock for an AI feature without spending credits
-- =========================================================
CREATE OR REPLACE FUNCTION public.unlock_ai_feature_via_ad(
  p_user_id UUID,
  p_feature_key TEXT,
  p_ad_provider TEXT,
  p_ad_event_id TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_feature RECORD;
  v_existing UUID;
  v_daily_count INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Verify feature exists and ad unlock is enabled
  SELECT * INTO v_feature FROM public.ai_feature_costs
  WHERE feature_key = p_feature_key AND is_enabled = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'feature_not_found'::TEXT;
    RETURN;
  END IF;

  IF NOT v_feature.ad_unlock_enabled THEN
    RETURN QUERY SELECT false, 'ad_unlock_disabled'::TEXT;
    RETURN;
  END IF;

  -- Idempotency: prevent re-unlock from same ad event
  SELECT id INTO v_existing FROM public.rewarded_ad_credit_events
  WHERE user_id = p_user_id AND ad_provider = p_ad_provider AND ad_event_id = p_ad_event_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT true, 'already_unlocked'::TEXT;
    RETURN;
  END IF;

  -- Check daily usage limit
  IF v_feature.daily_usage_limit > 0 THEN
    SELECT COUNT(*) INTO v_daily_count
    FROM public.ai_feature_usage
    WHERE user_id = p_user_id AND feature_key = p_feature_key
      AND created_at >= v_today::TIMESTAMPTZ;

    IF v_daily_count >= v_feature.daily_usage_limit THEN
      RETURN QUERY SELECT false, 'daily_limit_reached'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Record the ad event (for idempotency)
  INSERT INTO public.rewarded_ad_credit_events (user_id, ad_provider, ad_event_id, credits_awarded, status, metadata)
  VALUES (p_user_id, p_ad_provider, p_ad_event_id, 0, 'completed',
    jsonb_build_object('type', 'feature_unlock', 'feature_key', p_feature_key) || p_metadata);

  -- Record usage (unlocked via ad, no credits spent)
  INSERT INTO public.ai_feature_usage (user_id, feature_key, credits_spent, unlocked_via_ad)
  VALUES (p_user_id, p_feature_key, 0, true);

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- =========================================================
-- FUNCTION: admin_adjust_credits_v2 (enhanced with audit)
-- =========================================================
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

  v_new_balance := GREATEST(0, v_balance + p_amount);

  UPDATE public.credit_wallets
  SET balance = v_new_balance,
      total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
      total_spent = CASE WHEN p_amount < 0 THEN total_spent + ABS(p_amount) ELSE total_spent END,
      updated_at = now()
  WHERE user_id = p_target_user_id;

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

-- =========================================================
-- GRANTS
-- =========================================================
GRANT SELECT ON public.ai_feature_costs TO anon, authenticated;
GRANT SELECT ON public.rewarded_ad_credit_config TO anon, authenticated;
GRANT SELECT ON public.rewarded_ad_credit_events TO authenticated;
GRANT SELECT ON public.ai_feature_usage TO authenticated;

-- Admin-only writes via service role (RLS bypasses for writes)
-- Admins get full access via is_admin() — add admin write policies
DROP POLICY IF EXISTS "ai_feature_costs_admin_write" ON public.ai_feature_costs;
CREATE POLICY "ai_feature_costs_admin_write" ON public.ai_feature_costs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "rewarded_ad_credit_config_admin_write" ON public.rewarded_ad_credit_config;
CREATE POLICY "rewarded_ad_credit_config_admin_write" ON public.rewarded_ad_credit_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER trg_ai_feature_costs_updated_at
  BEFORE UPDATE ON public.ai_feature_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_rewarded_ad_credit_config_updated_at
  BEFORE UPDATE ON public.rewarded_ad_credit_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
