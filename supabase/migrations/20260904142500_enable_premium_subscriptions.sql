-- Enable FRELUX Premium subscriptions (Paystack is configured).
-- Flips the master switch read by isPremiumEnabled() so the Pricing page
-- stops showing the "Coming Soon" banner and subscribe buttons go live.
UPDATE public.site_settings
SET premium_subscriptions_enabled = true
WHERE id IN (SELECT id FROM public.site_settings ORDER BY id LIMIT 1);

-- Guard: ensure a settings row exists (in case the table was empty).
DO $mig$
BEGIN
  INSERT INTO public.site_settings (premium_subscriptions_enabled)
  SELECT true
  WHERE NOT EXISTS (SELECT 1 FROM public.site_settings);
EXCEPTION WHEN unique_violation THEN NULL;
END
$mig$;

