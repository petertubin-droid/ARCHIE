-- =========================================================
-- Restore tiered AI credit pricing: 5 / 8 / 12 credits
--
-- Tier 1 (5 credits):  Basic AI features — live chat, learning, color consult, color preview
-- Tier 2 (8 credits):  Mid-tier AI features — project assistant
-- Tier 3 (12 credits): Premium AI features — building estimation
--
-- Each rewarded video ad grants 5 credits (unchanged).
-- =========================================================

-- Tier 1: Basic features (5 credits)
UPDATE public.ai_feature_costs
  SET credit_cost = 5,
      daily_usage_limit = 100,
      updated_at = now()
  WHERE feature_key IN ('ai_livechat', 'ai_learn_assistant', 'ai_color_consult', 'ai_color_preview')
  AND is_enabled = true;

-- Tier 2: Mid-tier features (8 credits)
UPDATE public.ai_feature_costs
  SET credit_cost = 8,
      daily_usage_limit = 50,
      updated_at = now()
  WHERE feature_key = 'ai_project_assistant'
  AND is_enabled = true;

-- Tier 3: Premium features (12 credits)
UPDATE public.ai_feature_costs
  SET credit_cost = 12,
      daily_usage_limit = 20,
      updated_at = now()
  WHERE feature_key = 'ai_building_estimation'
  AND is_enabled = true;
