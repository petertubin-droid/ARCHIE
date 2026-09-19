// =========================================================
// FRELUX AI FOUNDATION, Predictive Intelligence Foundation
//
// Prepares the DATA architecture for future predictions:
//   cost overruns, schedule delays, material price changes,
//   procurement risks, project risks, progress variance.
//
// HARD RULE: no fake predictions. A prediction may exist ONLY when
// `assessPredictionReadiness` says the required data is present.
// Until then every predictive surface reports readiness honestly.
//
// Reuses the existing market-intelligence freshness concepts
// (price_validator / provider-registry): every future market value
// keeps source, region, currency, timestamp, freshness, confidence.
// =========================================================

import type { PredictionReadiness, PredictionType } from './types';

/**
 * Data sets each prediction type requires before it may be generated.
 * These are honest minimums, fewer data means "not supported", never
 * a lower-confidence guess dressed up as a prediction.
 */
export const PREDICTION_REQUIREMENTS: Record<PredictionType, string[]> = {
  cost_overrun: [
    'project_budget',
    'committed_costs',
    'actual_spend_history', // ≥ 3 dated entries
    'current_estimate',
  ],
  schedule_delay: [
    'planned_schedule', // stage dates
    'actual_progress_history', // ≥ 2 dated entries
    'current_stage',
  ],
  material_price_change: [
    'verified_price_history', // ≥ 3 dated verified prices, same region + material
    'region',
  ],
  procurement_risk: [
    'shopping_list',
    'verified_market_prices', // current, non-stale
    'region',
  ],
  project_risk: [
    'current_estimate',
    'project_status_history',
    'verified_market_prices',
  ],
  progress_variance: [
    'planned_schedule',
    'actual_progress_history',
  ],
};

/**
 * Assess whether a prediction of `type` is currently supportable.
 * `availableData` lists the data-set ids that actually exist for the
 * project/session (verified to be non-empty, fresh and region-matched
 * by the callers that populate it).
 */
export function assessPredictionReadiness(
  type: PredictionType,
  availableData: readonly string[],
): PredictionReadiness {
  const available = new Set(availableData);
  const required = PREDICTION_REQUIREMENTS[type];
  const evidenceAvailable = required.filter((r) => available.has(r));
  const missing = required.filter((r) => !available.has(r));
  return {
    supported: missing.length === 0,
    missing,
    evidenceAvailable,
  };
}

/**
 * Guard for any future prediction generator. There is exactly ONE way
 * a PredictionRecord may be created: through this function, after a
 * readiness check passes. Fabricated predictions are impossible by
 * construction.
 */
export function assertPredictionAllowed(
  type: PredictionType,
  availableData: readonly string[],
): void {
  const readiness = assessPredictionReadiness(type, availableData);
  if (!readiness.supported) {
    throw new Error(
      `Prediction "${type}" is not supported yet, missing data: ${readiness.missing.join(', ')}. FRELUX does not fabricate predictions.`,
    );
  }
}

/** Human-readable readiness message for AI/chat surfaces. */
export function predictionReadinessMessage(type: PredictionType, availableData: readonly string[]): string {
  const readiness = assessPredictionReadiness(type, availableData);
  if (readiness.supported) {
    return `A ${type.replace(/_/g, ' ')} prediction can be generated from the current data.`;
  }
  return `FRELUX can't predict ${type.replace(/_/g, ' ')} yet, it needs more data first: ${readiness.missing.join(', ')}. No estimate will be invented without it.`;
}
