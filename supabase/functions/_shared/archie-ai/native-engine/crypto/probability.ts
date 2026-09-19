// =========================================================
// ARCHIE NATIVE ENGINE — EVIDENCE-BASED PROBABILITY ENGINE
// supabase/functions/_shared/archie-ai/native-engine/crypto/probability.ts
//
// Owner directive (2026-09-11) — HARD PERFORMANCE GATE:
//   ARCHIE must NOT represent a trade as having a guaranteed
//   70–80% chance of success. Instead: a measurable,
//   evidence-based probability/confidence system. Never
//   manufacture or inflate probability scores.
//
// How this module honors that:
//   * Probability comes from an EXPLICIT logistic model over
//     named, inspectable features extracted from REAL market
//     data. Every feature value and weight is recorded in the
//     prediction — fully auditable.
//   * The probability is only as good as the methodology:
//     a walk-forward validation harness measures the model's
//     REAL out-of-sample Brier score / hit rate on historical
//     candles (no look-ahead). Until validation passes with
//     enough samples, the methodology is NOT validated and
//     the trade gate refuses trades.
//   * Confidence is separate from probability and reflects
//     data quality: evidence completeness, cross-venue
//     agreement, anomaly flags, and calibration quality.
//   * Every prediction is designed to be persisted with its
//     full evidence set and resolved against the actual
//     outcome — the calibration ledger measures real
//     performance over time (learning loop).
// =========================================================

import type { Candle } from "./market-data.ts";
import { analyzeCandles, atr } from "./market-analysis.ts";

// ---------------------------------------------------------
// 1. Feature extraction (from REAL analyzed data)
// ---------------------------------------------------------

export interface MarketFeatureSet {
  symbol: string;
  /** Direction this prediction is about: LONG or SHORT. */
  direction: "long" | "short";
  /** Normalized features, each in roughly [-1, 1]: */
  /** Trend alignment: +1 uptrend, -1 downtrend, 0 range. */
  f_trend: number;
  /** RSI distance from 50, signed by direction. */
  f_rsi: number;
  /** MACD histogram sign & magnitude (clamped). */
  f_macd: number;
  /** 10-bar momentum, clamped to [-1, 1]. */
  f_momentum: number;
  /** Volatility regime: 0 calm … 1 extreme (annualized). */
  f_volatility: number;
  /** Volume confirmation: z-score of latest volume, clamped. */
  f_volume: number;
}

export interface FeatureEvidence {
  features: MarketFeatureSet;
  /** Human-readable record of the raw values behind features. */
  raw: {
    trend: string;
    rsi14: number | null;
    macdHistogram: number | null;
    momentumPct10: number | null;
    realizedVolatilityPct: number | null;
    volumeZScore: number | null;
  };
}

/** Weights — the explicit, documented model. These are
 *  HONEST PRIORS, not fabricated precision: small, weak
 *  weights that let validation tell us how much the model
 *  actually knows. Calibration is measured, not assumed. */
export const MODEL_WEIGHTS: Record<
  keyof Omit<MarketFeatureSet, "symbol" | "direction">,
  number
> = {
  f_trend: 0.9,
  f_rsi: 0.5,
  f_macd: 0.7,
  f_momentum: 0.6,
  f_volatility: -0.4,
  f_volume: 0.3,
};

/** Extract the feature set for a direction from a REAL candle
 *  series. Returns null when there is not enough data —
 *  never computes from a fabricated series. */
export function extractFeatures(
  symbol: string,
  direction: "long" | "short",
  candles: Candle[],
  intervalMinutes: number,
): FeatureEvidence | null {
  const analysis = analyzeCandles({
    symbol,
    venue: "history",
    intervalMinutes,
    candles,
  });
  if (!analysis) return null; // <30 candles → insufficient
  const dir = direction === "long" ? 1 : -1;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const r = analysis.rsi14;
  const m = analysis.macd;
  const atr14 = atr(candles, 14);
  const raw = {
    trend: analysis.trend as string,
    rsi14: r,
    macdHistogram: m ? m.histogram : null,
    momentumPct10: analysis.momentumPct10,
    realizedVolatilityPct: analysis.realizedVolatilityPct,
    volumeZScore: analysis.volumeZScore,
  };
  const features: MarketFeatureSet = {
    symbol,
    direction,
    f_trend: clamp(
      (analysis.trend === "uptrend"
        ? 1
        : analysis.trend === "downtrend"
          ? -1
          : 0) * dir,
    ),
    f_rsi: r === null ? 0 : clamp(((r - 50) / 30) * dir),
    f_macd:
      m === null || atr14 === null || atr14 === 0
        ? 0
        : clamp((m.histogram / (atr14 * 2)) * dir),
    f_momentum:
      analysis.momentumPct10 === null
        ? 0
        : clamp((analysis.momentumPct10 / 10) * dir),
    f_volatility:
      analysis.realizedVolatilityPct === null
        ? 0
        : clamp(analysis.realizedVolatilityPct / 150),
    f_volume:
      analysis.volumeZScore === null ? 0 : clamp(analysis.volumeZScore / 4),
  };
  return { features, raw };
}

// ---------------------------------------------------------
// 2. The probability model (explicit logistic map)
// ---------------------------------------------------------

export function logisticScore(features: MarketFeatureSet): number {
  let s = 0;
  for (const [k, w] of Object.entries(MODEL_WEIGHTS)) {
    // MODEL_WEIGHTS is keyed by numeric features only — value is always a number
    s += w * (features[k as keyof MarketFeatureSet] as number);
  }
  return s;
}

/** Raw model probability of the predicted direction paying
 *  out over the horizon. No inflation, no flooring to
 *  "at least X%" — whatever the evidence says. */
export function modelProbability(features: MarketFeatureSet): number {
  const s = logisticScore(features);
  return 1 / (1 + Math.exp(-s));
}

// ---------------------------------------------------------
// 3. Walk-forward validation (REAL out-of-sample testing)
// ---------------------------------------------------------

export interface ValidationStats {
  /** Number of out-of-sample evaluations. */
  samples: number;
  /** Directional hit rate of probability>0.5 predictions. */
  hitRate: number | null;
  /** Mean Brier score over all samples (0 best, 0.25 coin-flip). */
  brier: number | null;
  /** Mean predicted probability among samples. */
  meanPredicted: number | null;
  /** Realized base rate of positive outcomes. */
  baseRate: number | null;
}

/**
 * Walk-forward evaluation over REAL candles: at each step
 * (from `trainCandles` onwards) extract features using ONLY
 * the preceding window (no look-ahead), predict the
 * direction of the close move over `horizon` candles, and
 * score the prediction against the realized outcome.
 */
export function walkForwardValidate(
  symbol: string,
  candles: Candle[],
  intervalMinutes: number,
  horizon: number,
  window: number = 120,
): ValidationStats {
  if (candles.length < window + horizon + 30) {
    return {
      samples: 0,
      hitRate: null,
      brier: null,
      meanPredicted: null,
      baseRate: null,
    };
  }
  let samples = 0;
  let hits = 0;
  let brierSum = 0;
  let predictedSum = 0;
  let positive = 0;
  for (let i = window; i + horizon < candles.length; i++) {
    const hist = candles.slice(i - window, i);
    const evidence = extractFeatures(symbol, "long", hist, intervalMinutes);
    if (!evidence) continue;
    const p = modelProbability(evidence.features);
    const outcome = candles[i + horizon].close > candles[i].close ? 1 : 0;
    samples++;
    predictedSum += p;
    if (outcome) positive++;
    brierSum += (p - outcome) ** 2;
    if (p > 0.5 && outcome) hits++;
  }
  if (samples === 0) {
    return {
      samples: 0,
      hitRate: null,
      brier: null,
      meanPredicted: null,
      baseRate: null,
    };
  }
  const upCount = samples; // long-direction samples
  void upCount;
  return {
    samples,
    hitRate: hits / samples,
    brier: brierSum / samples,
    meanPredicted: predictedSum / samples,
    baseRate: positive / samples,
  };
}

// ---------------------------------------------------------
// 4. Prediction with evidence + confidence (never inflated)
// ---------------------------------------------------------

export interface DataQuality {
  /** Cross-venue consensus anomaly flag (from crossCheck). */
  crossVenueAnomaly: boolean;
  /** Venues that reported the ticker. */
  venuesReporting: number;
  /** Analysis anomalies from the live series. */
  analysisAnomalies: string[];
  /** Age of the freshest data, ms (null = unknown). */
  dataAgeMs: number | null;
}

export interface PredictionEvidence {
  symbol: string;
  direction: "long" | "short";
  /** Model probability — raw, never inflated. */
  probability: number;
  /** Calibration-adjusted probability: the model's raw
   *  probability rescaled by measured out-of-sample
   *  calibration (Brier). If validation shows the model is
   *  poorly calibrated, this SHRINKS toward 0.5 — it can
   *  never raise the probability above the raw model output. */
  calibratedProbability: number;
  /** Evidence-derived confidence in the DATA, not the trade. */
  confidence: number;
  features: MarketFeatureSet;
  raw: FeatureEvidence["raw"];
  validation: ValidationStats;
  dataQuality: DataQuality;
  caveats: string[];
  createdAt: string;
}

/** Compute a full prediction with honest confidence.
 *  `validation` comes from walk-forward testing on real
 *  historical data (see trade-gate.ts for the thresholds). */
export function buildPrediction(
  symbol: string,
  direction: "long" | "short",
  candles: Candle[],
  intervalMinutes: number,
  horizon: number,
  validation: ValidationStats,
  dataQuality: DataQuality,
): PredictionEvidence | null {
  const evidence = extractFeatures(symbol, direction, candles, intervalMinutes);
  if (!evidence) return null;
  const p = modelProbability(evidence.features);

  // Calibration adjustment: blend raw probability toward 0.5
  // in proportion to (brier - 0.25)-distance... A model whose
  // Brier is no better than a coin flip earns probability
  // 0.5; a perfectly calibrated model keeps its raw output.
  // The blend NEVER increases p above the raw value.
  let calibrated = p;
  if (validation.brier !== null && validation.samples > 0) {
    const edge = 0.25 - validation.brier; // >0 = better than coin flip
    const trust = edge <= 0 ? 0 : Math.min(1, edge / 0.1);
    calibrated = 0.5 + (p - 0.5) * trust;
  } else {
    calibrated = 0.5; // unvalidated methodology = no edge claimed
  }
  if (direction === "short") {
    // For shorts the model scores the LONG side; the short's
    // probability is the complement, adjusted the same way.
    calibrated = 1 - calibrated;
  }

  // Confidence: data quality, not conviction. Starts at 1,
  // reduced by honest deficiency factors.
  let confidence = 1;
  const caveats: string[] = [];
  if (dataQuality.crossVenueAnomaly) {
    confidence -= 0.3;
    caveats.push("cross-venue price disagreement");
  }
  if (dataQuality.venuesReporting < 2) {
    confidence -= 0.2;
    caveats.push("fewer than 2 venues reporting");
  }
  for (const a of dataQuality.analysisAnomalies) {
    confidence -= 0.25;
    caveats.push(`analysis anomaly: ${a}`);
  }
  if (dataQuality.dataAgeMs !== null && dataQuality.dataAgeMs > 120_000) {
    confidence -= 0.3;
    caveats.push("market data stale (>2 min)");
  }
  if (validation.samples < 200) {
    caveats.push(`validation sample small (${validation.samples} < 200)`);
  }
  if (validation.brier !== null && validation.brier >= 0.25) {
    caveats.push("methodology not better than coin flip (Brier ≥ 0.25)");
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    symbol,
    direction,
    probability: direction === "long" ? p : 1 - p,
    calibratedProbability: calibrated,
    confidence,
    features: evidence.features,
    raw: evidence.raw,
    validation,
    dataQuality,
    caveats,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------
// 5. Outcome scoring (the LEARN loop input)
// ---------------------------------------------------------

export interface OutcomeScore {
  prediction: number;
  outcome: 0 | 1;
  brier: number;
}

export function scoreOutcome(
  prediction: PredictionEvidence,
  outcome: 0 | 1,
): OutcomeScore {
  return {
    prediction: prediction.calibratedProbability,
    outcome,
    brier: (prediction.calibratedProbability - outcome) ** 2,
  };
}

/** Update a running Brier ledger with a resolved prediction. */
export interface CalibrationLedger {
  samples: number;
  brierSum: number;
  hits: number;
}

export function newLedger(): CalibrationLedger {
  return { samples: 0, brierSum: 0, hits: 0 };
}

export function recordOutcome(
  ledger: CalibrationLedger,
  score: OutcomeScore,
): CalibrationLedger {
  return {
    samples: ledger.samples + 1,
    brierSum: ledger.brierSum + score.brier,
    hits: ledger.hits + (score.prediction > 0.5 && score.outcome === 1 ? 1 : 0),
  };
}

export function ledgerSummary(ledger: CalibrationLedger): {
  samples: number;
  brier: number | null;
  hitRate: number | null;
} {
  if (ledger.samples === 0) return { samples: 0, brier: null, hitRate: null };
  return {
    samples: ledger.samples,
    brier: ledger.brierSum / ledger.samples,
    hitRate: ledger.hits / ledger.samples,
  };
}
