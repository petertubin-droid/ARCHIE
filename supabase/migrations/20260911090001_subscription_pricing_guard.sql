-- =========================================================
-- Subscription Pricing Guard (audit H1 fix, 2026-09-10)
--
-- Server-side canonical prices for self-serve subscription plans.
-- paystack-checkout / paystack-verify / paystack-webhook resolve
-- prices from this table and reject any transaction whose amount
-- does not match. The client-supplied amount is never trusted.
--
-- Self-serve plans only: pro and premium (free is $0; enterprise
-- is contact-sales — neither is seeded, so neither can be
-- self-serve activated).
-- =========================================================

CREATE TABLE IF NOT EXISTS public.subscription_plan_prices (
  id bigint generated always as identity primary key,
  plan text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan, billing_cycle)
);

-- Canonical prices (kobo): mirrors src/lib/pricing-plans.ts.
-- pro: NGN 5,000/mo, NGN 50,000/yr
-- premium: NGN 15,000/mo, NGN 150,000/yr
INSERT INTO public.subscription_plan_prices (plan, billing_cycle, price_kobo)
VALUES
  ('pro', 'monthly', 500000),
  ('pro', 'yearly', 5000000),
  ('premium', 'monthly', 1500000),
  ('premium', 'yearly', 15000000)
ON CONFLICT (plan, billing_cycle) DO NOTHING;

-- Server-side config only: no anon/authenticated access.
-- Service role bypasses RLS and is the only reader/writer.
ALTER TABLE public.subscription_plan_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_plan_prices FROM anon, authenticated;
