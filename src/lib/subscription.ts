// =========================================================
// FRELUX Subscription Access, Client-side hook
// Phase 33
//
// Loads the current user's paid status from `user_paid_status`
// and provides helpers to check feature access based on
// subscription duration and plan.
//
// The `user_paid_status` table is RLS-protected:
//   - Users can only SELECT their own row
//   - Only the service role (edge function / admin) can write
//
// This hook is read-only, it never writes to the table.
// =========================================================

import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { DbUserPaidStatus } from "@/types/database";

export type SubscriptionPlan =
  "free" | "basic" | "pro" | "premium" | "enterprise";

export interface SubscriptionState {
  paidStatus: DbUserPaidStatus | null;
  isActive: boolean;
  plan: SubscriptionPlan;
  paidUntil: Date | null;
  daysRemaining: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Features that require a paid subscription
export const PAID_FEATURES = [
  "ai_photo_estimator",
  "structural_calculator",
  "foundation_calculator",
  "construction_sequence",
  "project_timeline",
  "build_to_roof_estimator",
  "painting_estimator",
  "screeding_estimator",
  "ai_color_consult",
  "ai_project_assistant",
  "pro_connect_messaging",
  "template_download",
  "brand_studio",
] as const;

export type PaidFeature = (typeof PAID_FEATURES)[number];

// Feature display names for UI
export const FEATURE_LABELS: Record<PaidFeature, string> = {
  ai_photo_estimator: "AI Photo Estimator",
  structural_calculator: "Structural Calculator",
  foundation_calculator: "Foundation Designer",
  construction_sequence: "Construction Sequence Planner",
  project_timeline: "Project Timeline Estimator",
  build_to_roof_estimator: "Build-to-Roof Cost Estimator",
  painting_estimator: "Painting Cost Estimator",
  screeding_estimator: "Screeding Cost Estimator",
  ai_color_consult: "AI Color Consultation",
  ai_project_assistant: "AI Project Assistant",
  pro_connect_messaging: "Pro Connect Messaging",
  template_download: "Template Downloads",
  brand_studio: "FRELUX Brand Studio",
};

// Plan hierarchy: higher index = more features
const PLAN_HIERARCHY: SubscriptionPlan[] = [
  "free",
  "basic",
  "pro",
  "premium",
  "enterprise",
];

// Which plan tier is required for each feature
const FEATURE_MIN_PLAN: Record<PaidFeature, SubscriptionPlan> = {
  ai_photo_estimator: "free", // free tier has limited uses, paid = unlimited
  painting_estimator: "pro",
  screeding_estimator: "pro",
  build_to_roof_estimator: "pro",
  construction_sequence: "premium",
  structural_calculator: "premium",
  foundation_calculator: "premium",
  project_timeline: "premium",
  ai_color_consult: "premium",
  ai_project_assistant: "premium",
  pro_connect_messaging: "premium",
  template_download: "premium",
  brand_studio: "pro",
};

/**
 * Check if the user's plan tier meets or exceeds the required tier for a feature.
 */
export function planHasFeature(
  userPlan: SubscriptionPlan,
  feature: PaidFeature,
): boolean {
  const requiredTier = FEATURE_MIN_PLAN[feature];
  const userIdx = PLAN_HIERARCHY.indexOf(userPlan);
  const requiredIdx = PLAN_HIERARCHY.indexOf(requiredTier);
  return userIdx >= requiredIdx;
}

/**
 * Get the minimum plan required for a feature.
 */
export function getFeatureMinPlan(feature: PaidFeature): SubscriptionPlan {
  return FEATURE_MIN_PLAN[feature];
}

/**
 * Check if a subscription is currently active (paid and not expired).
 */
export function isSubscriptionActive(
  paidStatus: DbUserPaidStatus | null,
): boolean {
  if (!paidStatus || !paidStatus.is_paid) return false;
  if (paidStatus.paid_until) {
    const expiry = new Date(paidStatus.paid_until).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

/**
 * Calculate days remaining in subscription.
 */
export function getDaysRemaining(paidStatus: DbUserPaidStatus | null): number {
  if (!paidStatus || !paidStatus.paid_until) return 0;
  const expiry = new Date(paidStatus.paid_until).getTime();
  const diff = expiry - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Get the normalized plan from paid_status.
 */
export function getPlan(paidStatus: DbUserPaidStatus | null): SubscriptionPlan {
  if (!paidStatus || !paidStatus.is_paid) return "free";
  const plan = (paidStatus.plan || "").toLowerCase();
  if (plan.includes("enterprise")) return "enterprise";
  if (plan.includes("premium")) return "premium";
  if (plan.includes("pro")) return "pro";
  if (plan.includes("basic") || plan.includes("starter")) return "basic";
  return "pro"; // default to pro if paid but plan name unrecognized
}

/**
 * Hook to load and track the current user's subscription status.
 * Automatically refreshes when the auth user changes.
 */
export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [paidStatus, setPaidStatus] = useState<DbUserPaidStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !isSupabaseConfigured) {
      setPaidStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from("user_paid_status")
      .select(
        "user_id, is_paid, plan, paid_until, payment_provider, provider_customer_id, updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (queryError) {
      if (import.meta.env.DEV)
        console.error(
          "[subscription] Failed to load paid status:",
          queryError.message,
        );
      setError(queryError.message);
      setPaidStatus(null);
    } else {
      setPaidStatus(data as DbUserPaidStatus | null);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = isSubscriptionActive(paidStatus);
  const plan = getPlan(paidStatus);
  const paidUntil = paidStatus?.paid_until
    ? new Date(paidStatus.paid_until)
    : null;
  const daysRemaining = getDaysRemaining(paidStatus);

  return {
    paidStatus,
    isActive: active,
    plan,
    paidUntil,
    daysRemaining,
    loading,
    error,
    refresh,
  };
}

/**
 * Check if a specific feature is accessible given the subscription state.
 *
 * Rules:
 * - Admins always have access (checked separately by the component)
 * - If subscription is active → all features are accessible
 * - If subscription is expired or free → feature is locked
 * - Rewarded ad unlocks are handled separately by RewardedFeatureGate
 */
export function hasFeatureAccess(
  subscription: SubscriptionState,
  feature: PaidFeature,
  isAdmin = false,
): { allowed: boolean; reason: string; minPlan?: SubscriptionPlan } {
  if (isAdmin) return { allowed: true, reason: "admin" };

  // Free features are always accessible (usage limits handled separately)
  const minPlan = getFeatureMinPlan(feature);
  if (minPlan === "free") return { allowed: true, reason: "free_tier" };

  // Check if subscription is active
  if (!subscription.isActive) {
    return { allowed: false, reason: "subscription_required", minPlan };
  }

  // Check if the user's plan tier covers this feature
  if (!planHasFeature(subscription.plan, feature)) {
    return { allowed: false, reason: "plan_upgrade_required", minPlan };
  }

  return { allowed: true, reason: "subscription_active" };
}

/**
 * Format the subscription status for display.
 */
export function formatSubscriptionStatus(
  subscription: SubscriptionState,
): string {
  if (!subscription.paidStatus) return "No subscription";
  if (!subscription.paidStatus.is_paid) return "Free plan";
  if (subscription.isActive) {
    if (subscription.daysRemaining > 0) {
      return `${subscription.plan.toUpperCase()} · ${subscription.daysRemaining} day${subscription.daysRemaining !== 1 ? "s" : ""} remaining`;
    }
    return `${subscription.plan.toUpperCase()} · Active`;
  }
  return `${subscription.plan.toUpperCase()} · Expired`;
}
