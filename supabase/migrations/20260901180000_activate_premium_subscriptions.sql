-- =========================================================
-- FRELUX Premium Subscriptions — ACTIVATE
--
-- Flips premium_subscriptions_enabled to true so the
-- pricing page shows live plans instead of "Coming Soon".
-- =========================================================

UPDATE public.site_settings
  SET premium_subscriptions_enabled = true
  WHERE id = '00000000-0000-0000-0000-000000000001';

-- Safety: if no row exists, insert one with the flag enabled
INSERT INTO public.site_settings (
  id,
  site_name,
  short_name,
  tagline,
  description,
  contact_email,
  whatsapp_number,
  premium_subscriptions_enabled
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'FRELUX PAINT CALC',
  'FRELUX',
  'Plan Your Perfect Paint Project',
  'Calculate what you need, estimate what it may cost, and discover colors that can transform your space.',
  'hello@freluxpaintcalc.com',
  '2349063612439',
  true
)
ON CONFLICT (id) DO NOTHING;
