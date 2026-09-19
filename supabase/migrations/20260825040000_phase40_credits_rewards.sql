-- =========================================================
-- Phase 40: FRELUX Credits & Engagement Rewards System
-- =========================================================
-- Tables: credit_wallets, credit_transactions, reward_catalogue,
--         reward_redemptions, weekly_missions, user_mission_progress,
--         activity_streaks, reward_events (idempotency log)
-- All tables have RLS. Users can READ their own data but NOT write
-- credit balances directly — only server-side (service role) can.
-- =========================================================

-- 1. Credit wallets (user balance)
CREATE TABLE IF NOT EXISTS public.credit_wallets (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance      INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Credit transactions (immutable ledger)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,  -- positive = earned, negative = spent
  type            TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'admin_adjust')),
  reason          TEXT NOT NULL,
  reference_id    TEXT,               -- idempotency key: user_id + reward_event + reference_id
  balance_after   INTEGER NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Reward catalogue (admin-managed)
CREATE TABLE IF NOT EXISTS public.reward_catalogue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_key      TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  credit_cost     INTEGER NOT NULL CHECK (credit_cost > 0),
  reward_type     TEXT NOT NULL CHECK (reward_type IN ('ai_token', 'pdf_export', 'calc_unlock', 'premium_week')),
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Reward redemptions
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id       UUID NOT NULL REFERENCES public.reward_catalogue(id),
  reward_key      TEXT NOT NULL,
  credits_spent    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'
);

-- 5. Reward events (idempotency log — prevents double-awarding)
CREATE TABLE IF NOT EXISTS public.reward_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,  -- e.g. 'first_calc', 'save_estimate', 'build_to_roof'
  reference_id    TEXT NOT NULL,  -- unique reference per event instance
  credits_awarded INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_type, reference_id)
);

-- 6. Weekly missions (auto-generated per week)
CREATE TABLE IF NOT EXISTS public.weekly_missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      DATE NOT NULL,
  week_end        DATE NOT NULL,
  mission_config  JSONB NOT NULL,  -- { tasks: [{ key, label, target, type }], reward_credits }
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. User mission progress
CREATE TABLE IF NOT EXISTS public.user_mission_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id      UUID NOT NULL REFERENCES public.weekly_missions(id) ON DELETE CASCADE,
  task_key        TEXT NOT NULL,
  progress        INTEGER NOT NULL DEFAULT 0,
  completed       BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mission_id, task_key)
);

-- 8. Activity streaks
CREATE TABLE IF NOT EXISTS public.activity_streaks (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  streak_7_day_awarded_at DATE,  -- tracks last 7-day streak reward
  total_active_days INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Reward settings (admin configurable)
CREATE TABLE IF NOT EXISTS public.reward_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  rewards_enabled BOOLEAN NOT NULL DEFAULT true,
  weekly_mission_credits INTEGER NOT NULL DEFAULT 75,
  streak_7_day_credits   INTEGER NOT NULL DEFAULT 50,
  streak_grace_days      INTEGER NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- =========================================================
-- INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_credit_tx_user_date ON public.credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference ON public.credit_transactions(user_id, reference_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user ON public.reward_redemptions(user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_events_user_type ON public.reward_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_mission_progress_user ON public.user_mission_progress(user_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_weekly_missions_week ON public.weekly_missions(week_start DESC);

-- =========================================================
-- SEED DATA
-- =========================================================
INSERT INTO public.reward_catalogue (reward_key, name, description, credit_cost, reward_type, sort_order)
VALUES
  ('ai_estimate_token', 'AI Estimate Token', 'Unlock one additional eligible AI estimate.', 100, 'ai_token', 1),
  ('premium_pdf_export', 'Premium PDF Export', 'Unlock one premium estimate PDF export.', 200, 'pdf_export', 2),
  ('advanced_calc_unlock', 'Advanced Calculator Unlock', 'Unlock one eligible advanced calculator usage.', 300, 'calc_unlock', 3),
  ('premium_week', 'FRELUX Premium Week', 'Unlock eligible premium features for 7 days.', 500, 'premium_week', 4)
ON CONFLICT (reward_key) DO NOTHING;

INSERT INTO public.reward_settings (id, rewards_enabled, weekly_mission_credits, streak_7_day_credits, streak_grace_days)
VALUES (1, true, 75, 50, 1)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_settings ENABLE ROW LEVEL SECURITY;

-- credit_wallets: users can READ own, cannot INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "wallet_read_own" ON public.credit_wallets;
CREATE POLICY "wallet_read_own" ON public.credit_wallets
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies — only service role can modify

-- credit_transactions: users can READ own, cannot INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "tx_read_own" ON public.credit_transactions;
CREATE POLICY "tx_read_own" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- reward_catalogue: everyone can read (it's the catalogue)
DROP POLICY IF EXISTS "catalogue_read_all" ON public.reward_catalogue;
CREATE POLICY "catalogue_read_all" ON public.reward_catalogue
  FOR SELECT USING (true);
-- Admin can manage via service role (no RLS policy for writes — service role bypasses RLS)

-- reward_redemptions: users can READ own, cannot INSERT (only edge function)
DROP POLICY IF EXISTS "redemptions_read_own" ON public.reward_redemptions;
CREATE POLICY "redemptions_read_own" ON public.reward_redemptions
  FOR SELECT USING (auth.uid() = user_id);

-- reward_events: users can READ own (for transparency), cannot INSERT
DROP POLICY IF EXISTS "reward_events_read_own" ON public.reward_events;
CREATE POLICY "reward_events_read_own" ON public.reward_events
  FOR SELECT USING (auth.uid() = user_id);

-- weekly_missions: everyone can read active missions
DROP POLICY IF EXISTS "missions_read_all" ON public.weekly_missions;
CREATE POLICY "missions_read_all" ON public.weekly_missions
  FOR SELECT USING (is_active = true);

-- user_mission_progress: users can READ own
DROP POLICY IF EXISTS "mission_progress_read_own" ON public.user_mission_progress;
CREATE POLICY "mission_progress_read_own" ON public.user_mission_progress
  FOR SELECT USING (auth.uid() = user_id);

-- activity_streaks: users can READ own
DROP POLICY IF EXISTS "streaks_read_own" ON public.activity_streaks;
CREATE POLICY "streaks_read_own" ON public.activity_streaks
  FOR SELECT USING (auth.uid() = user_id);

-- reward_settings: everyone can read
DROP POLICY IF EXISTS "reward_settings_read_all" ON public.reward_settings;
CREATE POLICY "reward_settings_read_all" ON public.reward_settings
  FOR SELECT USING (true);

-- =========================================================
-- FUNCTION: award_credits (server-side, called via service role RPC)
-- Atomic credit award with idempotency protection
-- =========================================================
CREATE OR REPLACE FUNCTION public.award_credits(
  p_user_id UUID,
  p_event_type TEXT,
  p_reference_id TEXT,
  p_amount INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, already_awarded BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing TEXT;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Check idempotency: if this exact event already awarded credits, skip
  SELECT reference_id INTO v_existing
  FROM public.reward_events
  WHERE user_id = p_user_id AND event_type = p_event_type AND reference_id = p_reference_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Already awarded — return current balance
    SELECT balance INTO v_new_balance FROM public.credit_wallets WHERE user_id = p_user_id;
    IF v_new_balance IS NULL THEN v_new_balance := 0; END IF;
    RETURN QUERY SELECT false, v_new_balance, true;
    RETURN;
  END IF;

  -- Get or create wallet
  SELECT balance INTO v_current_balance FROM public.credit_wallets WHERE user_id = p_user_id;
  IF v_current_balance IS NULL THEN
    INSERT INTO public.credit_wallets (user_id, balance, total_earned, total_spent)
    VALUES (p_user_id, 0, 0, 0);
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update wallet atomically
  UPDATE public.credit_wallets
  SET balance = v_new_balance,
      total_earned = total_earned + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log the reward event (idempotency)
  INSERT INTO public.reward_events (user_id, event_type, reference_id, credits_awarded)
  VALUES (p_user_id, p_event_type, p_reference_id, p_amount);

  -- Create immutable transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, reason, reference_id, balance_after, metadata)
  VALUES (p_user_id, p_amount, 'earn', p_reason, p_reference_id, v_new_balance, p_metadata);

  RETURN QUERY SELECT true, v_new_balance, false;
END;
$$;

-- =========================================================
-- FUNCTION: redeem_reward (server-side, atomic deduction)
-- =========================================================
CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_user_id UUID,
  p_reward_key TEXT,
  p_idempotency_key TEXT
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward RECORD;
  v_balance INTEGER;
  v_new_balance INTEGER;
  v_existing_key TEXT;
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

  -- Record redemption
  INSERT INTO public.reward_redemptions (user_id, reward_id, reward_key, credits_spent, status, metadata)
  VALUES (p_user_id, v_reward.id, p_reward_key, v_reward.credit_cost, 'completed', jsonb_build_object('idempotency_key', p_idempotency_key));

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

-- =========================================================
-- FUNCTION: record_activity (updates streak + mission progress)
-- =========================================================
CREATE OR REPLACE FUNCTION public.record_activity(
  p_user_id UUID,
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT '{}'
) RETURNS TABLE(success BOOLEAN, streak_awarded INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_streak RECORD;
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
  v_grace_days INTEGER;
  v_new_streak INTEGER;
  v_should_award BOOLEAN := false;
  v_credits_to_award INTEGER := 0;
BEGIN
  -- Get grace days from settings
  SELECT streak_grace_days INTO v_grace_days FROM public.reward_settings WHERE id = 1;
  IF v_grace_days IS NULL THEN v_grace_days := 1; END IF;

  -- Get or create streak record
  SELECT * INTO v_streak FROM public.activity_streaks WHERE user_id = p_user_id;
  IF v_streak IS NULL THEN
    INSERT INTO public.activity_streaks (user_id, current_streak, longest_streak, last_active_date, total_active_days)
    VALUES (p_user_id, 0, 0, NULL, 0);
    SELECT * INTO v_streak FROM public.activity_streaks WHERE user_id = p_user_id;
  END IF;

  -- Only count one activity per day
  IF v_streak.last_active_date = v_today THEN
    RETURN QUERY SELECT true, 0, NULL::TEXT;
    RETURN;
  END IF;

  -- Calculate streak
  IF v_streak.last_active_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_streak.last_active_date = v_yesterday THEN
    v_new_streak := v_streak.current_streak + 1;
  ELSIF v_streak.last_active_date >= v_today - v_grace_days AND v_streak.last_active_date < v_yesterday THEN
    -- Grace period: keep streak but don't increment (gap within grace)
    v_new_streak := v_streak.current_streak + 1;
  ELSE
    v_new_streak := 1;  -- streak broken
  END IF;

  -- Update streak
  UPDATE public.activity_streaks
  SET current_streak = v_new_streak,
      longest_streak = GREATEST(longest_streak, v_new_streak),
      last_active_date = v_today,
      total_active_days = total_active_days + 1,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Check for 7-day streak award (not already awarded for this cycle)
  IF v_new_streak >= 7 AND (v_streak.streak_7_day_awarded_at IS NULL OR v_streak.streak_7_day_awarded_at < v_today - 6) THEN
    -- Only award if we've completed a full 7-day cycle since last award
    IF v_streak.streak_7_day_awarded_at IS NULL OR v_new_streak - (SELECT COALESCE(
      (SELECT EXTRACT(DAY FROM (v_today - streak_7_day_awarded_at))::INTEGER FROM activity_streaks WHERE user_id = p_user_id), 0)
    ) >= 7 THEN
      v_should_award := true;
    END IF;
  END IF;

  IF v_should_award THEN
    SELECT streak_7_day_credits INTO v_credits_to_award FROM public.reward_settings WHERE id = 1;
    IF v_credits_to_award IS NULL THEN v_credits_to_award := 50; END IF;

    -- Award credits via the award function
    PERFORM FROM public.award_credits(
      p_user_id,
      'streak_7_day',
      'streak_7_day_' || v_today::TEXT,
      v_credits_to_award,
      '7-Day Activity Streak Reward',
      jsonb_build_object('streak', v_new_streak)
    );

    UPDATE public.activity_streaks
    SET streak_7_day_awarded_at = v_today
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT true, v_credits_to_award, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 0, NULL::TEXT;
END;
$$;

-- =========================================================
-- FUNCTION: update_mission_progress
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_mission_progress(
  p_user_id UUID,
  p_task_type TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mission RECORD;
  v_task JSONB;
  v_existing RECORD;
  v_new_progress INTEGER;
  v_mission_completed BOOLEAN;
  v_reward_credits INTEGER;
BEGIN
  -- Find current active weekly mission
  SELECT * INTO v_mission FROM public.weekly_missions
  WHERE is_active = true AND week_start <= CURRENT_DATE AND week_end >= CURRENT_DATE
  ORDER BY week_start DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 'no_active_mission'::TEXT;
    RETURN;
  END IF;

  -- Find matching task in mission config
  v_task := NULL;
  FOR v_task IN SELECT jsonb_array_elements(mission_config->'tasks') AS task FROM public.weekly_missions WHERE id = v_mission.id LOOP
    IF v_task->>'type' = p_task_type THEN
      -- Found matching task
      EXIT;
    END IF;
  END LOOP;

  IF v_task IS NULL THEN
    RETURN QUERY SELECT true, 'no_matching_task'::TEXT;
    RETURN;
  END IF;

  -- Get or create progress record
  SELECT * INTO v_existing FROM public.user_mission_progress
  WHERE user_id = p_user_id AND mission_id = v_mission.id AND task_key = v_task->>'key';

  IF v_existing IS NULL THEN
    INSERT INTO public.user_mission_progress (user_id, mission_id, task_key, progress, completed)
    VALUES (p_user_id, v_mission.id, v_task->>'key', 0, false);
    SELECT * INTO v_existing FROM public.user_mission_progress
    WHERE user_id = p_user_id AND mission_id = v_mission.id AND task_key = v_task->>'key';
  END IF;

  -- Don't update if already completed
  IF v_existing.completed THEN
    RETURN QUERY SELECT true, NULL::TEXT;
    RETURN;
  END IF;

  v_new_progress := LEAST(v_existing.progress + p_increment, (v_task->>'target')::INTEGER);
  v_mission_completed := v_new_progress >= (v_task->>'target')::INTEGER;

  UPDATE public.user_mission_progress
  SET progress = v_new_progress,
      completed = v_mission_completed,
      updated_at = now()
  WHERE user_id = p_user_id AND mission_id = v_mission.id AND task_key = v_task->>'key';

  -- Check if ALL tasks are completed → award mission credits
  SELECT NOT EXISTS(
    SELECT 1 FROM public.user_mission_progress
    WHERE user_id = p_user_id AND mission_id = v_mission.id AND completed = false
  ) INTO v_mission_completed;

  IF v_mission_completed THEN
    -- Check if we already awarded mission credits (idempotency)
    PERFORM 1 FROM public.reward_events
    WHERE user_id = p_user_id AND event_type = 'weekly_mission' AND reference_id = v_mission.id::TEXT;

    IF NOT FOUND THEN
      SELECT weekly_mission_credits INTO v_reward_credits FROM public.reward_settings WHERE id = 1;
      IF v_reward_credits IS NULL THEN v_reward_credits := 75; END IF;

      PERFORM FROM public.award_credits(
        p_user_id,
        'weekly_mission',
        v_mission.id::TEXT,
        v_reward_credits,
        'Weekly Mission Completed',
        jsonb_build_object('mission_id', v_mission.id, 'week_start', v_mission.week_start)
      );
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- =========================================================
-- FUNCTION: generate_weekly_mission (auto-creates weekly period)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_weekly_mission_if_needed()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_exists BOOLEAN;
BEGIN
  -- Calculate current week (Monday to Sunday)
  v_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  v_week_end := v_week_start + 6;

  -- Check if mission already exists for this week
  SELECT EXISTS(
    SELECT 1 FROM public.weekly_missions WHERE week_start = v_week_start
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO public.weekly_missions (week_start, week_end, mission_config, is_active)
    VALUES (
      v_week_start,
      v_week_end,
      jsonb_build_object(
        'tasks', jsonb_build_array(
          jsonb_build_object('key', 'complete_estimates', 'label', 'Complete 3 estimates', 'target', 3, 'type', 'estimate_complete'),
          jsonb_build_object('key', 'save_project', 'label', 'Save 1 project', 'target', 1, 'type', 'project_save'),
          jsonb_build_object('key', 'use_categories', 'label', 'Use 2 different calculator categories', 'target', 2, 'type', 'category_use')
        ),
        'reward_credits', 75
      ),
      true
    );
  END IF;
END;
$$;

-- =========================================================
-- FUNCTION: admin_adjust_credits (admin-only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT
) RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_role TEXT;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Verify admin
  SELECT role INTO v_admin_role FROM public.profiles WHERE id = p_admin_id;
  IF v_admin_role != 'admin' THEN
    RETURN QUERY SELECT false, 0, 'not_admin';
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
    jsonb_build_object('admin_id', p_admin_id)
  );

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.award_credits(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_activity(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mission_progress(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_weekly_mission_if_needed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(UUID, UUID, INTEGER, TEXT) TO authenticated;
