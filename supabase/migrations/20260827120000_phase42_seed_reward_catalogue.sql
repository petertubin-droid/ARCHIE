-- =========================================================
-- Phase 42: Seed reward catalogue + admin seed function
-- Ensures the 4 core rewards exist in the database.
-- Also creates an admin-callable function to seed/reseed rewards.
-- =========================================================

-- Insert the 4 core rewards if they don't exist
INSERT INTO public.reward_catalogue (reward_key, name, description, credit_cost, reward_type, sort_order, is_enabled)
VALUES
  ('ai_estimate_token', 'AI Estimate Token', 'Unlock one additional eligible AI estimate beyond your daily limit.', 100, 'ai_token', 1, true),
  ('premium_pdf_export', 'Premium PDF Export', 'Unlock one premium estimate PDF export with branded formatting.', 200, 'pdf_export', 2, true),
  ('advanced_calc_unlock', 'Advanced Calculator Unlock', 'Unlock one eligible advanced calculator usage for 24 hours.', 300, 'calc_unlock', 3, true),
  ('premium_week', 'FRELUX Premium Week', 'Unlock eligible premium features for 7 days, including advanced calculators and PDF exports.', 500, 'premium_week', 4, true)
ON CONFLICT (reward_key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  credit_cost = EXCLUDED.credit_cost,
  reward_type = EXCLUDED.reward_type,
  sort_order = EXCLUDED.sort_order,
  is_enabled = EXCLUDED.is_enabled,
  updated_at = now();

-- Admin function to seed/reseed the reward catalogue
CREATE OR REPLACE FUNCTION public.seed_reward_catalogue()
RETURNS TABLE(reward_key TEXT, name TEXT, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.reward_catalogue (reward_key, name, description, credit_cost, reward_type, sort_order, is_enabled)
  VALUES
    ('ai_estimate_token', 'AI Estimate Token', 'Unlock one additional eligible AI estimate beyond your daily limit.', 100, 'ai_token', 1, true),
    ('premium_pdf_export', 'Premium PDF Export', 'Unlock one premium estimate PDF export with branded formatting.', 200, 'pdf_export', 2, true),
    ('advanced_calc_unlock', 'Advanced Calculator Unlock', 'Unlock one eligible advanced calculator usage for 24 hours.', 300, 'calc_unlock', 3, true),
    ('premium_week', 'FRELUX Premium Week', 'Unlock eligible premium features for 7 days, including advanced calculators and PDF exports.', 500, 'premium_week', 4, true)
  ON CONFLICT (reward_key) DO UPDATE
  SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    credit_cost = EXCLUDED.credit_cost,
    reward_type = EXCLUDED.reward_type,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now();

  RETURN QUERY
  SELECT reward_key, name, 'seeded'::TEXT FROM public.reward_catalogue ORDER BY sort_order;
END;
$$;

-- Grant execute to authenticated users (admin calls it via Edge Function with service role)
GRANT EXECUTE ON FUNCTION public.seed_reward_catalogue() TO authenticated, anon, service_role;
