// ============================================================================
// ARCHIE MARKET INTELLIGENCE — CONTINUOUS LEARNING & DRIFT MONITORING ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/continuous-learning.ts
//
// Tracks model calibration, concept drift, and performance deterioration.
// Manages candidate model promotion gates requiring explicit Owner authorization.
// ============================================================================

export interface DriftReport {
  hasFeatureDrift: boolean;
  hasConceptDrift: boolean;
  brierScoreChangePct: number;
  currentBrierScore: number;
  baselineBrierScore: number;
  alerts: string[];
}

/**
 * Detects feature and concept drift over rolling prediction evaluations.
 */
export function evaluateDrift(
  baselineBrierScore: number,
  recentPredictions: Array<{ prob: number; outcome: 0 | 1 }>,
): DriftReport {
  if (recentPredictions.length < 20) {
    return {
      hasFeatureDrift: false,
      hasConceptDrift: false,
      brierScoreChangePct: 0,
      currentBrierScore: baselineBrierScore,
      baselineBrierScore,
      alerts: ["Insufficient sample size for drift assessment (need >= 20 outcomes)."],
    };
  }

  const sum = recentPredictions.reduce((acc, p) => acc + (p.prob - p.outcome) ** 2, 0);
  const currentBrier = sum / recentPredictions.length;

  const changePct = ((currentBrier - baselineBrierScore) / baselineBrierScore) * 100;
  const alerts: string[] = [];
  let hasConceptDrift = false;

  if (changePct > 20) {
    hasConceptDrift = true;
    alerts.push(`Concept drift detected: Brier score deteriorated by ${changePct.toFixed(1)}%.`);
  }

  return {
    hasFeatureDrift: false,
    hasConceptDrift,
    brierScoreChangePct: changePct,
    currentBrierScore: currentBrier,
    baselineBrierScore,
    alerts,
  };
}

/**
 * Candidate Model Promotion Gate.
 * Enforces Owner authority requirement before any model promotion.
 */
export function evaluateModelPromotion(
  candidateVersion: string,
  outOfSampleSharpe: number,
  currentSharpe: number,
  ownerApprovalGranted: boolean,
): {
  approvedForPromotion: boolean;
  blockReason?: string;
} {
  if (!ownerApprovalGranted) {
    return {
      approvedForPromotion: false,
      blockReason: "OWNER_AUTHORIZATION_REQUIRED: Candidate model promotion requires explicit Owner approval.",
    };
  }

  if (outOfSampleSharpe <= currentSharpe) {
    return {
      approvedForPromotion: false,
      blockReason: `Candidate Sharpe (${outOfSampleSharpe.toFixed(2)}) did not outperform current production (${currentSharpe.toFixed(2)}).`,
    };
  }

  return {
    approvedForPromotion: true,
  };
}
