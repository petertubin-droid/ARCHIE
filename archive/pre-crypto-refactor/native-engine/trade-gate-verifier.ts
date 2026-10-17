// =========================================================
// GATE DECISION VERIFIER — the tamper seam between the trade
// gate and any execution surface (paper now, live later). The
// hash is recomputed from the decision's OWN contents via the
// gate's SINGLE canonical hasher (computeDecisionHash) — a
// modified proposal never validates. Deliberately separated
// from the gate so the verifier's failures are testable
// independently and the live adapter (when the owner configures
// one) uses the exact same seam.
// =========================================================

import { computeDecisionHash, type GateDecision } from "./trade-gate.ts";

export function fnv1aForDecision(
  d: Extract<GateDecision, { decision: "ELIGIBLE" }>,
): string {
  return computeDecisionHash({
    symbol: d.symbol,
    direction: d.direction,
    entry: d.entry,
    stop: d.stop,
    target: d.target,
    probability: d.probability,
    riskReward: d.riskReward,
    positionFraction: d.positionFraction,
    windowSize: d.evidence.indicators.windowSize,
    analyzedAt: d.evidence.analyzedAt,
  });
}

/** Verify a decision against its hash — the execution seam. */
export function verifyDecision(d: Extract<GateDecision, { decision: "ELIGIBLE" }>): boolean {
  return fnv1aForDecision(d) === d.decisionHash;
}
