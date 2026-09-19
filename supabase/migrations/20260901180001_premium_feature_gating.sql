-- =========================================================
-- Premium Feature Gating: Standardize AI credit costs + PDF export
-- All AI features cost 10 credits per one-time use unlock.
-- Chat assistant (ai_livechat) is excluded — remains free.
-- PDF export is now a premium feature gated at 10 credits.
-- Ad unlock is enabled for all gated features.
-- =========================================================

-- Update all AI feature costs to 10 credits per unlock
-- except ai_livechat (chat assistant stays free)
UPDATE public.ai_feature_costs
SET
  credit_cost = 10,
  ad_unlock_enabled = true,
  requires_credits = true,
  is_enabled = true,
  updated_at = now()
WHERE feature_key NOT IN ('ai_livechat');

-- Ensure ai_livechat remains free (no credits required, no ad unlock)
UPDATE public.ai_feature_costs
SET
  requires_credits = false,
  ad_unlock_enabled = false,
  credit_cost = 0,
  updated_at = now()
WHERE feature_key = 'ai_livechat';

-- Add pdf_export as a premium feature if it doesn't exist
INSERT INTO public.ai_feature_costs (feature_key, feature_name, description, credit_cost, requires_credits, ad_unlock_enabled, ad_unlock_credits, daily_usage_limit, is_enabled, sort_order)
VALUES
  ('pdf_export', 'PDF Export', 'Export professional PDF quotations and reports. One-time use per export.', 10, true, true, 0, 20, true, 200)
ON CONFLICT (feature_key) DO UPDATE
SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  credit_cost = EXCLUDED.credit_cost,
  requires_credits = EXCLUDED.requires_credits,
  ad_unlock_enabled = EXCLUDED.ad_unlock_enabled,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

-- Update reward catalogue descriptions to reflect one-time use
UPDATE public.reward_catalogue
SET
  description = 'Unlock one additional eligible AI estimate. One-time use — once you leave the feature, you''ll need to unlock again.',
  updated_at = now()
WHERE reward_key = 'ai_estimate_token';

UPDATE public.reward_catalogue
SET
  description = 'Unlock one premium estimate PDF export with branded formatting. One-time use — once you leave the feature, you''ll need to unlock again.',
  updated_at = now()
WHERE reward_key = 'premium_pdf_export';

UPDATE public.reward_catalogue
SET
  description = 'Unlock one eligible advanced calculator usage. One-time use — once you leave the feature, you''ll need to unlock again.',
  updated_at = now()
WHERE reward_key = 'advanced_calc_unlock';

UPDATE public.reward_catalogue
SET
  description = 'Unlock eligible premium features for one session. One-time use — once you leave the feature, you''ll need to unlock again.',
  updated_at = now()
WHERE reward_key = 'premium_week';
