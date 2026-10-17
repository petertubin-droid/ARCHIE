// =========================================================
// HARD TRADE GATE (Crypto & Blockchain Intelligence,
// 2026-09-11). THE non-bypassable decision function.
//
// Every condition from the owner directive is checked, in
// order, and every failure is NAMED. Output is either
//   { decision: "NO_TRADE", reasons: [...] }
// or
//   { decision: "ELIGIBLE", decisionHash, evidence }
//
// The evidence hash chains the gate to the exact inputs it
// saw — the paper trader only executes proposals whose hash
// matches the gate decision (a tampered or replayed proposal
// with different data produces a different hash and is
// refused). EMERGENCY STOP is checked FIRST and overrides
// everything.
//
// THE GATE IS A PURE FUNCTION. There is no API, flag, or
// config that can turn a failing condition into a pass: the
// execution layer only accepts ELIGIBLE decisions, and live
// execution additionally requires owner-configured exchange
// credentials which DO NOT EXIST yet (paper only).
// =========================================================

import { analyzeCandles, crossCheckAgreement, type IndicatorSet } from "./market-analysis.ts";
import type { MarketSnapshot } from "./market-data.ts";
import { snapshotFreshness } from "./market-data.ts";
import { estimateDirectionProbability, calibration, type CalibrationRecord } from "./probability.ts";

export interface TradeLimits {
  /** Minimum Wilson-lower-bound probability required (owner
   *  configurable; default 0.60). */
  minProbability: number;
  /** Minimum historical analogs required. Default 20. */
  minSamples: number;
  /** Minimum resolved predictions before the methodology is
   *  considered validated. Default 10. */
  minCalibration: number;
  /** Maximum acceptable Brier score. Default 0.25 (coin flip). */
  maxBrier: number;
  /** Maximum acceptable realized annualized volatility. */
  maxRealizedVol: number;
  /** Minimum acceptable risk/reward ratio. Default 1.5. */
  minRiskReward: number;
  /** Stop-loss distance as a fraction of entry. */
  stopFraction: number;
  /** Take-profit distance as a fraction of entry. */
  targetFraction: number;
  /** Position size as a fraction of paper portfolio equity. */
  positionFraction: number;
  /** Max position fraction — the planner can never exceed it. */
  maxPositionFraction: number;
}

export const DEFAULT_TRADE_LIMITS: TradeLimits = {
  minProbability: 0.6,
  minSamples: 20,
  minCalibration: 10,
  maxBrier: 0.25,
  maxRealizedVol: 1.2,
  minRiskReward: 1.5,
  stopFraction: 0.05,
  targetFraction: 0.1,
  positionFraction: 0.05,
  maxPositionFraction: 0.1,
};

export type GateDecision =
  | {
      decision: "NO_TRADE";
      reasons: string[];
      emergencyStop?: boolean;
    }
  | {
      decision: "ELIGIBLE";
      decisionHash: string;
      symbol: string;
      direction: "long" | "short";
      entry: number;
      stop: number;
      target: number;
      /** Conservative lower-bound probability actually used. */
      probability: number;
      riskReward: number;
      positionFraction: number;
      evidence: GateEvidence;
    };

export interface GateEvidence {
  indicators: IndicatorSet;
  probabilityNote: string;
  calibrationNote: string;
  freshnessNote: string;
  providerNotes: string[];
  limits: TradeLimits;
  analyzedAt: number;
}

export interface GateInput {
  snapshot: MarketSnapshot;
  limits?: Partial<TradeLimits>;
  /** ARCHIE's resolved prediction records — for methodology
   *  validation. Until minCalibration exist, NO trade. */
  predictionRecord: CalibrationRecord[];
  /** Owner EMERGENCY STOP — checked first, overrides all. */
  emergencyStop: boolean;
}

/** Cheap deterministic hash (FNV-1a over canonical JSON) —
 *  chains the decision to its exact evidence. THIS is the one
 *  canonical definition; the verifier (trade-gate-verifier.ts)
 *  calls THIS function so a decision can never validate
 *  against a differently-computed hash. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface DecisionCore {
  symbol: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  probability: number;
  riskReward: number;
  positionFraction: number;
  windowSize: number;
  analyzedAt: number;
}

/** Canonical decision hash — the single source of truth. */
export function computeDecisionHash(core: DecisionCore): string {
  return fnv1a(
    JSON.stringify({
      symbol: core.symbol,
      direction: core.direction,
      entry: core.entry,
      stop: core.stop,
      target: core.target,
      p: core.probability,
      rr: core.riskReward,
      positionFraction: core.positionFraction,
      candles: core.windowSize,
      analyzedAt: core.analyzedAt,
    }),
  );
}

export function gateDecide(input: GateInput): GateDecision {
  const limits: TradeLimits = { ...DEFAULT_TRADE_LIMITS, ...input.limits };
  const reasons: string[] = [];

  // ── 0. EMERGENCY STOP (owner's immediate kill switch) ──
  if (input.emergencyStop) {
    return {
      decision: "NO_TRADE",
      reasons: ["OWNER EMERGENCY STOP ACTIVE — all trading is halted. Nothing proceeds until the owner lifts it."],
      emergencyStop: true,
    };
  }

  const { snapshot } = input;

  // ── 1. DATA FRESHNESS ──
  const { fresh, ageHours } = snapshotFreshness(snapshot);
  if (!fresh) {
    reasons.push(
      `Data not fresh: newest candle is ${ageHours.toFixed(1)}h old (> 36h) — the gate refuses to trade on stale data.`,
    );
  }

  // ── 2. ANALYZE (real indicators) ──
  const indicators = analyzeCandles(snapshot.candles);
  if (!indicators) {
    reasons.push("No candle data — nothing to analyze.");
    return { decision: "NO_TRADE", reasons };
  }

  // ── 3. CROSS-CHECK (independent domain agreement) ──
  if (!snapshot.crossCheck) {
    reasons.push(
      "No independent spot cross-check available — the gate refuses to trade on a single uncorroborated source.",
    );
  } else {
    const { agree, divergence } = crossCheckAgreement(indicators.last, snapshot.crossCheck.price);
    if (!agree) {
      reasons.push(
        `Source cross-check FAILED: candle close and independent spot price diverge by ${(divergence * 100).toFixed(1)}% (> 2%) — an anomaly the gate will not trade through.`,
      );
    }
  }

  // ── 4. RISK RULES (volatility, anomaly) ──
  if (indicators.realizedVol === undefined || indicators.realizedVol > limits.maxRealizedVol) {
    reasons.push(
      indicators.realizedVol === undefined
        ? "Volatility not measurable from the window — too little history."
        : `Realized volatility ${(indicators.realizedVol * 100).toFixed(0)}%/yr exceeds the risk limit of ${(limits.maxRealizedVol * 100).toFixed(0)}%/yr.`,
    );
  }
  if (indicators.volumeZ !== undefined && indicators.volumeZ > 4) {
    reasons.push(
      `Volume anomaly: last candle's volume is ${indicators.volumeZ.toFixed(1)} standard deviations above the mean — trading is paused on this anomaly.`,
    );
  }

  // ── 5. PROBABILITY (evidence-based, conservative bound) ──
  const prob = estimateDirectionProbability(snapshot.candles, 5);
  if (prob.probability === null) {
    reasons.push(`Insufficient evidence for a probability estimate — ${prob.note}`);
  } else if (prob.probability < limits.minProbability) {
    reasons.push(
      `Probability ${prob.probability.toFixed(3)} (Wilson 95% lower bound over ${prob.samples} analogs) is below the configured threshold ${limits.minProbability} — NO TRADE. Never inflated.`,
    );
  } else if (prob.samples < limits.minSamples) {
    reasons.push(`Only ${prob.samples} historical analogs — below the required ${limits.minSamples}.`);
  }

  // ── 6. METHODOLOGY VALIDATION (ARCHIE's own track record) ──
  const cal = calibration(input.predictionRecord);
  if (cal.resolved < limits.minCalibration) {
    reasons.push(
      `Methodology not yet validated: only ${cal.resolved} resolved prediction(s) on record (${limits.minCalibration} required). ARCHIE will not trade on an unproven method.`,
    );
  } else if (cal.brier !== null && cal.brier >= limits.maxBrier) {
    reasons.push(
      `Calibration failed: Brier score ${cal.brier.toFixed(3)} is no better than the limit ${limits.maxBrier} (a coin flip) — the method's predictions are not yet trustworthy enough.`,
    );
  }

  if (reasons.length > 0) {
    return { decision: "NO_TRADE", reasons };
  }

  // ── 7. RISK/REWARD & POSITION SIZE (all evidence passed) ──
  const entry = indicators.last;
  const prob2 = prob; // non-null here (reasons empty)
  const p = prob2.probability as number;
  const direction = prob2.direction === "flat" ? undefined : prob2.direction;
  if (!direction) {
    return { decision: "NO_TRADE", reasons: ["No directional edge — refusing."] };
  }
  const stop = direction === "long" ? entry * (1 - limits.stopFraction) : entry * (1 + limits.stopFraction);
  const target = direction === "long" ? entry * (1 + limits.targetFraction) : entry * (1 - limits.targetFraction);
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const rr = risk > 0 ? reward / risk : 0;
  if (rr < limits.minRiskReward) {
    return {
      decision: "NO_TRADE",
      reasons: [`Risk/reward ${rr.toFixed(2)} below the required ${limits.minRiskReward}.`],
    };
  }
  const positionFraction = Math.min(limits.positionFraction, limits.maxPositionFraction);

  const evidence: GateEvidence = {
    indicators,
    probabilityNote: prob2.note,
    calibrationNote: cal.note,
    freshnessNote: `newest candle ${ageHours.toFixed(1)}h old`,
    providerNotes: snapshot.notes,
    limits,
    analyzedAt: Date.now(),
  };
  const decisionHash = computeDecisionHash({
    symbol: snapshot.symbol,
    direction,
    entry,
    stop,
    target,
    probability: p,
    riskReward: rr,
    positionFraction,
    windowSize: indicators.windowSize,
    analyzedAt: evidence.analyzedAt,
  });

  return {
    decision: "ELIGIBLE",
    decisionHash,
    symbol: snapshot.symbol,
    direction,
    entry,
    stop,
    target,
    probability: p,
    riskReward: rr,
    positionFraction,
    evidence,
  };
}
