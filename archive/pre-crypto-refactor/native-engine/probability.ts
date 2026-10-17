// =========================================================
// PROBABILITY & CALIBRATION (Crypto & Blockchain
// Intelligence, 2026-09-11).
//
// THE HARD PERFORMANCE GATE (owner directive): ARCHIE must
// NEVER represent a trade as having a guaranteed 70-80% chance
// of success. Probability is MEASURED from historical evidence
// and expressed honestly:
//
//   P(historical analogs with the same signal were followed by
//     the predicted move within horizon) — as a WILSON LOWER
//     BOUND over the observed sample, reported with the sample
//     size and the methodology's live Brier calibration.
//
// No inflation. No clamping to a pleasing number. When the
// evidence is insufficient the estimate is NULL and the trade
// gate returns NO_TRADE. Every estimate is recorded so real
// performance is measurable over time.
// =========================================================

import type { MarketCandle } from "./market-data.ts";
import { classifyRegime } from "./market-analysis.ts";

export interface ProbabilityEstimate {
  /** Wilson 95% LOWER-bound hit rate of the signal over the
   *  observed analogs. This is the ONLY number the gate uses —
   *  deliberately conservative. null when evidence is
   *  insufficient. */
  probability: number | null;
  /** Raw hit rate (upper-bound story lives in calibration). */
  observedRate: number;
  /** Number of historical analogs found. */
  samples: number;
  /** Direction the evidence supports. */
  direction: "long" | "short" | "flat";
  horizonDays: number;
  signalDescription: string;
  /** Honest bound statement, user-facing. */
  note: string;
}

/** Wilson 95% lower bound — deliberately conservative so ARCHIE
 *  undersells rather than oversells its evidence. */
export function wilsonLowerBound(
  hits: number,
  n: number,
  z = 1.96,
): number {
  if (n === 0) return 0;
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin =
    z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

/**
 * Historical-analog backtest over REAL fetched candles: walk
 * the window; every bar whose regime classification matches
 * the CURRENT regime is an analog. The "hit" is whether the
 * close `horizonDays` bars later moved in the regime's
 * favorable direction. This is the same signal that will be
 * traded, measured on real history — not a simulation of
 * results, but a measurement of the past.
 */
export function estimateDirectionProbability(
  candles: MarketCandle[],
  horizonDays = 5,
): ProbabilityEstimate {
  const currentRegime = classifyRegime(candles.map((c) => c.close));
  const closes = candles.map((c) => c.close);
  if (currentRegime === "insufficient-data" || currentRegime === "range") {
    return {
      probability: null,
      observedRate: 0,
      samples: 0,
      direction: "flat",
      horizonDays,
      signalDescription: `regime: ${currentRegime}`,
      note:
        currentRegime === "range"
          ? "Range regime: no directional edge is claimed from range conditions — NO probability estimate (evidence-first)."
          : "Insufficient candle history for regime classification — NO probability estimate.",
    };
  }
  const direction: "long" | "short" =
    currentRegime === "trending-up" ? "long" : "short";
  let hits = 0;
  let samples = 0;
  // Walk every bar that can be classified AND has a horizon
  // outcome inside the window. The LAST bar (the live one) is
  // the live signal, not an analog.
  for (let i = 21; i < closes.length - horizonDays; i++) {
    const pastWindow = closes.slice(Math.max(0, i - 34), i + 1);
    const regime = classifyRegime(pastWindow);
    if (regime !== currentRegime) continue;
    samples++;
    const outcome = closes[i + horizonDays] - closes[i];
    if ((direction === "long" && outcome > 0) || (direction === "short" && outcome < 0)) {
      hits++;
    }
  }
  if (samples < 20) {
    return {
      probability: null,
      observedRate: samples ? hits / samples : 0,
      samples,
      direction,
      horizonDays,
      signalDescription: `regime: ${currentRegime}`,
      note: `Only ${samples} historical analogs found (minimum 20 for a defensible estimate) — NO probability estimate. ARCHIE does not extrapolate from a thin sample.`,
    };
  }
  const lower = wilsonLowerBound(hits, samples);
  const rate = hits / samples;
  return {
    probability: lower,
    observedRate: rate,
    samples,
    direction,
    horizonDays,
    signalDescription: `regime: ${currentRegime} (last above/below SMA20 with >1% 14-day momentum)`,
    note:
      `Measured over ${samples} historical analogs of the same regime: ${hits} were followed by the favorable move within ${horizonDays} days. ` +
      `Observed rate ${(rate * 100).toFixed(1)}%; reported probability is the conservative Wilson 95% LOWER bound ${(lower * 100).toFixed(1)}%. ` +
      `This is a measured historical frequency, NOT a guarantee — markets change regime.`,
  };
}

// ── Calibration: ARCHIE's own recorded prediction record ──

export interface CalibrationRecord {
  /** The recorded outcome of a resolved prediction:
   *  probability as REPORTED (the lower bound actually shown),
   *  and whether the predicted move happened. */
  reportedProbability: number;
  outcomeFavorable: boolean;
}

export interface CalibrationSummary {
  /** Mean Brier score over resolved predictions (0 = perfect,
   *  0.25 = coin flip). null until at least 10 resolved. */
  brier: number | null;
  resolved: number;
  /** Hit rate of predictions at the reported probability. */
  hitRate: number;
  note: string;
}

export function calibration(records: CalibrationRecord[]): CalibrationSummary {
  const resolved = records.length;
  if (resolved === 0) {
    return {
      brier: null,
      resolved: 0,
      hitRate: 0,
      note: "No resolved predictions yet — ARCHIE's own calibration is unproven (honest: methodology validation requires live track record).",
    };
  }
  const hits = records.filter((r) => r.outcomeFavorable).length;
  const brierMean =
    records.reduce(
      (a, r) => a + (r.reportedProbability - (r.outcomeFavorable ? 1 : 0)) ** 2,
      0,
    ) / resolved;
  return {
    brier: resolved >= 10 ? brierMean : null,
    resolved,
    hitRate: hits / resolved,
    note:
      resolved >= 10
        ? `Calibration from ${resolved} resolved predictions: Brier ${brierMean.toFixed(3)} (0 = perfect, 0.25 = coin flip).`
        : `${resolved} resolved prediction(s) — at least 10 required before the gate trusts ARCHIE's own calibration.`,
  };
}
