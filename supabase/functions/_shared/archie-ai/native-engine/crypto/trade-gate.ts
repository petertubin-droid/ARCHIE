// =========================================================
// ARCHIE NATIVE ENGINE — HARD TRADE GATE
// supabase/functions/_shared/archie-ai/native-engine/crypto/trade-gate.ts
//
// The owner directive (2026-09-11) requires a HARD gate:
// a trade may only become ELIGIBLE when ALL of the following
// hold —
//   1. the configured probability threshold is satisfied
//   2. sufficient historical evidence exists
//   3. the prediction methodology has been validated
//   4. market conditions pass the risk rules
//   5. expected risk/reward is acceptable
//   6. required data is fresh and trustworthy
//   7. no critical anomaly or uncertainty is present
//   plus the system-level controls:
//   8. the owner emergency stop is NOT engaged
//   9. trading is enabled for this venue/symbol
//  10. the position fits owner-defined limits
//
// If ANY check fails: NO TRADE. There is no override, no
// bypass, and this module exposes no function that can force
// eligibility. ARCHIE cannot disable these checks: they are
// compiled into the gate itself, and the emergency stop is
// enforced FIRST, before any data work.
// =========================================================

import type { PredictionEvidence } from "./probability.ts";

// ---------------------------------------------------------
// 1. Owner trading configuration (persisted per-owner;
//    defaults shown, all tunable by the owner ONLY)
// ---------------------------------------------------------

export interface TradingLimits {
  /** Min calibrated probability for ELIGIBLE. */
  probabilityThreshold: number;
  /** Min walk-forward validation samples. */
  minValidationSamples: number;
  /** Max Brier score (0.25 = coin flip). */
  maxBrier: number;
  /** Min candle history for evidence. */
  minEvidenceCandles: number;
  /** Min risk/reward ratio. */
  minRiskReward: number;
  /** Max position size as fraction of portfolio value. */
  maxPositionPct: number;
  /** Max data age for decision data (ms). */
  maxDataAgeMs: number;
  /** Required live venues reporting for cross-check. */
  minVenuesReporting: number;
  /** Emergency stop — checked FIRST, always. */
  emergencyStop: boolean;
  /** Master enable — owner can disable all trading. */
  tradingEnabled: boolean;
}

export const DEFAULT_TRADING_LIMITS: TradingLimits = {
  probabilityThreshold: 0.62,
  minValidationSamples: 200,
  maxBrier: 0.25,
  minEvidenceCandles: 200,
  minRiskReward: 1.5,
  maxPositionPct: 0.02,
  maxDataAgeMs: 120_000,
  minVenuesReporting: 2,
  emergencyStop: false,
  tradingEnabled: true,
};

// ---------------------------------------------------------
// 2. Trade request & gate decision types
// ---------------------------------------------------------

export interface TradeRequest {
  symbol: string;
  direction: "long" | "short";
  /** Intended entry (market: current consensus price). */
  entryPrice: number;
  /** Stop-loss price (invalidation). */
  stopPrice: number;
  /** Take-profit price (target). */
  targetPrice: number;
  /** Position size in quote currency (e.g. USDT). */
  positionSizeQuote: number;
  /** Current portfolio value in quote currency. */
  portfolioValueQuote: number;
}

export type GateCheckId =
  | "emergency_stop"
  | "trading_enabled"
  | "data_fresh"
  | "cross_venue_agreement"
  | "no_critical_anomaly"
  | "evidence_sufficient"
  | "methodology_validated"
  | "probability_threshold"
  | "risk_reward"
  | "position_limit"
  | "direction_valid";

export interface GateCheck {
  id: GateCheckId;
  passed: boolean;
  /** Honest detail — what was measured, what failed. */
  detail: string;
}

export interface GateDecision {
  request: TradeRequest;
  eligible: boolean;
  checks: GateCheck[];
  /** The evidence-bearing prediction, verbatim. */
  prediction: PredictionEvidence | null;
  decidedAt: string;
}

/** Critical anomalies that ALWAYS fail the gate. */
const CRITICAL_ANOMALIES = [
  "cross-venue price disagreement",
  "stale/gapped candle series",
];

// ---------------------------------------------------------
// 3. The gate itself
// ---------------------------------------------------------

export function evaluateTradeGate(
  request: TradeRequest,
  prediction: PredictionEvidence,
  limits: TradingLimits,
  nowMs: number,
): GateDecision {
  const checks: GateCheck[] = [];

  // 1 — emergency stop FIRST: nothing else matters.
  checks.push({
    id: "emergency_stop",
    passed: !limits.emergencyStop,
    detail: limits.emergencyStop
      ? "OWNER EMERGENCY STOP IS ENGAGED — no trade may pass, regardless of any other condition."
      : "emergency stop not engaged",
  });

  // 2 — trading enabled
  checks.push({
    id: "trading_enabled",
    passed: limits.tradingEnabled,
    detail: limits.tradingEnabled
      ? "trading is enabled"
      : "trading is disabled in owner configuration",
  });

  // 3 — direction sanity
  const dirOk =
    (request.direction === "long" &&
      request.stopPrice < request.entryPrice &&
      request.targetPrice > request.entryPrice) ||
    (request.direction === "short" &&
      request.stopPrice > request.entryPrice &&
      request.targetPrice < request.entryPrice);
  checks.push({
    id: "direction_valid",
    passed: dirOk,
    detail: dirOk
      ? `${request.direction}: stop/target correctly sided`
      : `invalid ${request.direction} geometry: entry=${request.entryPrice}, stop=${request.stopPrice}, target=${request.targetPrice}`,
  });

  // 4 — data freshness
  const age = nowMs - Date.parse(prediction.createdAt);
  const fresh = Number.isFinite(age) && age >= 0 && age <= limits.maxDataAgeMs;
  checks.push({
    id: "data_fresh",
    passed:
      fresh && prediction.dataQuality.dataAgeMs !== null
        ? prediction.dataQuality.dataAgeMs <= limits.maxDataAgeMs
        : fresh,
    detail: `prediction created ${Number.isFinite(age) ? Math.round(age / 1000) : "?"}s ago; source data age ${prediction.dataQuality.dataAgeMs === null ? "unknown" : Math.round(prediction.dataQuality.dataAgeMs / 1000) + "s"}; limit ${Math.round(limits.maxDataAgeMs / 1000)}s`,
  });

  // 5 — cross-venue agreement
  const venuesOk =
    prediction.dataQuality.venuesReporting >= limits.minVenuesReporting &&
    !prediction.dataQuality.crossVenueAnomaly;
  checks.push({
    id: "cross_venue_agreement",
    passed: venuesOk,
    detail: `${prediction.dataQuality.venuesReporting} venues reporting (min ${limits.minVenuesReporting}); cross-venue anomaly: ${prediction.dataQuality.crossVenueAnomaly}`,
  });

  // 6 — no critical anomaly
  const critical = prediction.caveats.filter((c) =>
    CRITICAL_ANOMALIES.some((a) => c.includes(a)),
  );
  checks.push({
    id: "no_critical_anomaly",
    passed: critical.length === 0,
    detail:
      critical.length === 0
        ? prediction.caveats.length === 0
          ? "no anomalies"
          : `non-critical caveats: ${prediction.caveats.join("; ")}`
        : `critical anomalies: ${critical.join("; ")}`,
  });

  // 7 — sufficient historical evidence
  const evidenceOk =
    prediction.validation.samples >= limits.minValidationSamples &&
    prediction.features !== null;
  checks.push({
    id: "evidence_sufficient",
    passed: evidenceOk,
    detail: `walk-forward validation samples: ${prediction.validation.samples} (min ${limits.minValidationSamples})`,
  });

  // 8 — methodology validated (out-of-sample Brier)
  const brier = prediction.validation.brier;
  const methodOk = brier !== null && brier < limits.maxBrier && evidenceOk;
  checks.push({
    id: "methodology_validated",
    passed: methodOk,
    detail:
      brier === null
        ? "no walk-forward validation available"
        : `out-of-sample Brier ${brier.toFixed(4)} (must be < ${limits.maxBrier}); hit rate ${prediction.validation.hitRate === null ? "n/a" : (prediction.validation.hitRate * 100).toFixed(1) + "%"}`,
  });

  // 9 — probability threshold (calibrated probability, the
  //     honest number — never the raw inflated one)
  const prob = prediction.calibratedProbability;
  const probOk = prob >= limits.probabilityThreshold;
  checks.push({
    id: "probability_threshold",
    passed: probOk,
    detail: `calibrated probability ${(prob * 100).toFixed(1)}% vs threshold ${(limits.probabilityThreshold * 100).toFixed(1)}% (raw model: ${(prediction.probability * 100).toFixed(1)}%)`,
  });

  // 10 — risk/reward
  const risk =
    request.direction === "long"
      ? request.entryPrice - request.stopPrice
      : request.stopPrice - request.entryPrice;
  const reward =
    request.direction === "long"
      ? request.targetPrice - request.entryPrice
      : request.entryPrice - request.targetPrice;
  const rr = risk > 0 ? reward / risk : 0;
  checks.push({
    id: "risk_reward",
    passed: rr >= limits.minRiskReward && risk > 0,
    detail: `risk/reward ${rr.toFixed(2)} (min ${limits.minRiskReward}); risk ${risk.toFixed(4)}, reward ${reward.toFixed(4)}`,
  });

  // 11 — position limit
  const positionPct =
    request.portfolioValueQuote > 0
      ? request.positionSizeQuote / request.portfolioValueQuote
      : Infinity;
  checks.push({
    id: "position_limit",
    passed: positionPct <= limits.maxPositionPct,
    detail: `position ${(positionPct * 100).toFixed(2)}% of portfolio (max ${(limits.maxPositionPct * 100).toFixed(2)}%)`,
  });

  const eligible = checks.every((c) => c.passed);
  return {
    request,
    eligible,
    checks,
    prediction,
    decidedAt: new Date().toISOString(),
  };
}

/** Render the decision honestly for humans — a refused gate
 *  says exactly why, an eligible gate names every check. */
export function renderGateDecision(decision: GateDecision): string {
  if (decision.eligible) {
    const list = decision.checks
      .map((c) => `${c.id}: PASS (${c.detail})`)
      .join("; ");
    return `TRADE ELIGIBLE — all ${decision.checks.length} gate checks passed. ${list}`;
  }
  const failures = decision.checks.filter((c) => !c.passed);
  const failed = failures.map((c) => `${c.id}: FAIL — ${c.detail}`).join(" | ");
  return `NO TRADE — ${failures.length} of ${decision.checks.length} checks failed: ${failed}`;
}
