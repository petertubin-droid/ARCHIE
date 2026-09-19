-- =========================================================
-- Phase 43: Fix service_role grants + flatten AI costs to 10 credits
--
-- 1. Grant SELECT/INSERT/UPDATE/DELETE to service_role on all
--    credits/rewards tables. The original migrations (phase40/41)
--    only granted to authenticated/anon — edge functions using the
--    service-role admin client got "permission denied" errors.
--
-- 2. Set all AI feature costs to a flat 10 credits per use.
--    Remove tiered pricing — every AI tool use costs 10 credits.
--
-- 3. Raise daily usage limits so credits (not daily caps) are the
--    gate.
-- =========================================================

-- 1. Service-role grants
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.reward_catalogue,
     public.credit_wallets,
     public.credit_transactions,
     public.reward_redemptions,
     public.activity_streaks,
     public.weekly_missions,
     public.user_mission_progress,
     public.reward_settings,
     public.ai_feature_costs,
     public.ai_feature_usage,
     public.rewarded_ad_credit_config,
     public.rewarded_ad_credit_events
  TO service_role;

-- 2. Flatten AI feature costs to 10 credits each
UPDATE public.ai_feature_costs
  SET credit_cost = 10,
      daily_usage_limit = 100,
      updated_at = now()
  WHERE is_enabled = true;
