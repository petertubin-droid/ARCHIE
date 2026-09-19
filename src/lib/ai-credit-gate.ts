/**
 * AI Credit Gate, server-side credit verification for AI features.
 *
 * Before any AI edge function is called, the client should:
 * 1. Check if the feature requires credits (via ai_feature_costs)
 * 2. If so, call spendAiCredits() to atomically deduct credits server-side
 * 3. Only if deduction succeeds, proceed with the AI request
 * 4. If insufficient credits, show the AiFeatureGate UI
 *
 * This module provides a convenience function that handles the flow.
 */

import {
  getAiFeatureCost,
  spendAiCredits,
  unlockFeatureViaAd,
  generateReferenceId,
  type AiFeatureCost,
  type SpendResult,
} from '@/lib/credits';

export interface CreditGateResult {
  /** true = proceed with AI call, false = show gate/insufficient credits UI */
  allowed: boolean;
  /** Feature cost config (null if not found) */
  feature: AiFeatureCost | null;
  /** Result of the spend operation */
  spend: SpendResult | null;
  /** Error message if not allowed */
  error: string | null;
  /** Remaining balance after spend (if spend succeeded) */
  newBalance: number | null;
  /** Whether ad unlock is available as an alternative */
  adUnlockAvailable: boolean;
}

/**
 * Attempt to spend credits for an AI feature.
 * Returns a CreditGateResult telling the caller whether to proceed.
 *
 * This is a NO-OP if the feature doesn't require credits or doesn't exist.
 * The server-side spend function validates the cost, the client never
 * determines the cost.
 */
export async function checkAndSpendCredits(featureKey: string): Promise<CreditGateResult> {
  const feature = await getAiFeatureCost(featureKey);

  if (!feature) {
    // Feature not configured, allow by default (backward compat)
    return { allowed: true, feature: null, spend: null, error: null, newBalance: null, adUnlockAvailable: false };
  }

  if (!feature.is_enabled) {
    return { allowed: false, feature, spend: null, error: 'This feature is currently disabled.', newBalance: null, adUnlockAvailable: false };
  }

  if (!feature.requires_credits) {
    return { allowed: true, feature, spend: null, error: null, newBalance: null, adUnlockAvailable: feature.ad_unlock_enabled };
  }

  // Spend credits via edge function (server-side atomic deduction)
  const idempotencyKey = generateReferenceId(featureKey);
  const spend = await spendAiCredits(featureKey, idempotencyKey);

  if (spend.success) {
    return {
      allowed: true,
      feature,
      spend,
      error: null,
      newBalance: spend.newBalance ?? null,
      adUnlockAvailable: feature.ad_unlock_enabled,
    };
  }

  // Not enough credits or other error
  let errorMsg = spend.error ?? 'Failed to spend credits.';
  if (spend.code === 'INSUFFICIENT_CREDITS') {
    errorMsg = `Not enough FRELUX Credits. You need ${spend.requiredCredits ?? feature.credit_cost} but have ${spend.currentBalance ?? 0}.`;
  } else if (spend.code === 'DAILY_LIMIT') {
    errorMsg = 'Daily usage limit reached for this feature.';
  }

  return {
    allowed: false,
    feature,
    spend,
    error: errorMsg,
    newBalance: spend.currentBalance ?? null,
    adUnlockAvailable: spend.adUnlockEnabled ?? feature.ad_unlock_enabled,
  };
}

/**
 * Unlock an AI feature via rewarded ad (no credit spend).
 * The ad must be verified server-side before this returns success.
 */
export async function unlockViaAd(
  featureKey: string,
  adProvider: string,
  adEventId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  return unlockFeatureViaAd(featureKey, adProvider, adEventId);
}
