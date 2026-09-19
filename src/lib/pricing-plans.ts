// =========================================================
// FRELUX Pricing Plans, Configuration
//
// Defines subscription tiers with feature lists and Naira pricing.
// Paystack handles the actual payment, this is the plan config.
// =========================================================

import type { SubscriptionPlan } from '@/lib/subscription';

export interface PricingPlan {
  id: SubscriptionPlan;
  name: string;
  tagline: string;
  monthlyPrice: number; // in NGN
  yearlyPrice: number; // in NGN (discounted)
  badge?: string;
  highlight?: boolean;
  features: string[];
  cta: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Essential tools for planning your build',
    monthlyPrice: 0,
    yearlyPrice: 0,
    cta: 'Get Started',
    features: [
      'Paint Calculator',
      'Screeding Calculator',
      'POP Ceiling Calculator',
      'Tile Calculator',
      'Community marketplace access',
      'Pro Connect profile',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For contractors and serious builders',
    monthlyPrice: 5000, // ₦5,000/month
    yearlyPrice: 50000, // ₦50,000/year (2 months free)
    badge: 'Most Popular',
    highlight: true,
    cta: 'Start Pro',
    features: [
      'Everything in Free',
      'Unlimited AI Photo Estimations',
      'Build-to-Roof Cost Estimator',
      'Painting Cost Estimator',
      'Screeding Cost Estimator',
      'Project management dashboard',
      'Saved projects (up to 25)',
      'Priority support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Full engineering toolkit for professionals',
    monthlyPrice: 15000, // ₦15,000/month
    yearlyPrice: 150000, // ₦150,000/year
    badge: 'Best Value',
    cta: 'Start Premium',
    features: [
      'Everything in Pro',
      'Structural Load Calculator',
      'Foundation Designer',
      'Construction Sequence Planner',
      'Project Timeline Estimator',
      'AI Color Consultation',
      'AI Project Assistant',
      'Unlimited saved projects',
      'Template downloads',
      'Pro Connect messaging',
      'Dedicated support line',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For firms managing multiple projects',
    monthlyPrice: 50000, // ₦50,000/month
    yearlyPrice: 500000, // ₦500,000/year
    cta: 'Contact Sales',
    features: [
      'Everything in Premium',
      'Multi-seat team accounts',
      'Centralized billing',
      'Custom material pricing',
      'White-label reports',
      'API access',
      'Dedicated account manager',
      'Custom integrations',
    ],
  },
];

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getPlanById(id: SubscriptionPlan): PricingPlan | undefined {
  return PRICING_PLANS.find((p) => p.id === id);
}
