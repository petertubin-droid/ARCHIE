// ============================================================================
// ARCHIE MARKET INTELLIGENCE — STATISTICAL MACHINE LEARNING ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/machine-learning.ts
//
// Interpretable statistical and machine learning models:
// - Logistic regression with L2 regularization (Ridge) and Gradient Descent
// - True Platt Scaling probability calibration with parameter optimization
// - Expected Calibration Error (ECE) and reliability binning (Section 12)
// - Brier score, Log-Loss, ROC-AUC, and Brier Skill Score (BSS) benchmarks
// - Out-of-Distribution (OOD) detection
// - Chronological validation without random shuffling
// ============================================================================

import type {
  FeatureVector,
  ModelPrediction,
  CalibrationEvaluation,
  ReliabilityBin,
} from "./types.ts";

export const MODEL_ARTIFACT_VERSION = "v1.2.0-archie-logistic-calibrated";

export interface LogisticWeights {
  bias: number;
  w_returnLag1: number;
  w_rsiNormalized: number;
  w_macdHistToAtr: number;
  w_distFromEma21Atr: number;
  w_bbPercentB: number;
  w_regimeEncoding: number;
}

export const DEFAULT_LOGISTIC_WEIGHTS: LogisticWeights = {
  bias: 0.02,
  w_returnLag1: 1.25,
  w_rsiNormalized: -0.45,
  w_macdHistToAtr: 0.85,
  w_distFromEma21Atr: 0.40,
  w_bbPercentB: -0.30,
  w_regimeEncoding: 0.75,
};

export interface PlattCalibrator {
  scaleA: number;
  biasB: number;
  isFitted: boolean;
  trainingSamplesCount: number;
}

export const UNCALIBRATED_PLATT: PlattCalibrator = {
  scaleA: -1.0,
  biasB: 0.0,
  isFitted: false,
  trainingSamplesCount: 0,
};

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, z))));
}

export function computeRawLogit(features: FeatureVector, weights: LogisticWeights): number {
  return (
    weights.bias +
    features.returnLag1 * weights.w_returnLag1 +
    features.rsiNormalized * weights.w_rsiNormalized +
    features.macdHistToAtr * weights.w_macdHistToAtr +
    features.distFromEma21Atr * weights.w_distFromEma21Atr +
    (features.bbPercentB - 0.5) * weights.w_bbPercentB +
    features.regimeEncoding * weights.w_regimeEncoding
  );
}

/**
 * Fits Platt scaling parameters (A, B) via Gradient Descent with Bayesian target smoothing
 * P(y=1 | z) = 1 / (1 + exp(A*z + B))
 * Platt (1999) target smoothing: y_pos = (N_pos + 1) / (N_pos + 2), y_neg = 1 / (N_neg + 2)
 */
export function fitPlattCalibration(
  validationSamples: Array<{ logit: number; label: 0 | 1 }>,
  options: { epochs?: number; lr?: number } = {},
): PlattCalibrator {
  if (validationSamples.length < 5) {
    return { ...UNCALIBRATED_PLATT };
  }

  const epochs = options.epochs ?? 250;
  const lr = options.lr ?? 0.05;

  const nPos = validationSamples.filter((s) => s.label === 1).length;
  const nNeg = validationSamples.length - nPos;
  const tPos = (nPos + 1) / (nPos + 2);
  const tNeg = 1 / (nNeg + 2);

  let A = 0.0;
  let B = Math.log((nNeg + 1) / (nPos + 1));

  const N = validationSamples.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;

    for (const sample of validationSamples) {
      const target = sample.label === 1 ? tPos : tNeg;
      const fApB = sample.logit * A + B;
      const p = sigmoid(fApB);
      const err = p - target;

      gradA += err * sample.logit;
      gradB += err;
    }

    A -= lr * (gradA / N);
    B -= lr * (gradB / N);
  }

  return {
    scaleA: A,
    biasB: B,
    isFitted: true,
    trainingSamplesCount: validationSamples.length,
  };
}

/**
 * Detects whether a feature vector is Out-of-Distribution (OOD).
 */
export function detectOutOfDistribution(
  features: FeatureVector,
  bounds: {
    maxAbsReturnLag1?: number;
    maxAbsDistAtr?: number;
  } = {},
): {
  isOod: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const maxReturn = bounds.maxAbsReturnLag1 ?? 0.15; // 15% 1-candle jump
  const maxDistAtr = bounds.maxAbsDistAtr ?? 6.0; // 6 ATR distance from EMA

  if (Math.abs(features.returnLag1) > maxReturn) {
    reasons.push(`Return lag 1 (${(features.returnLag1 * 100).toFixed(2)}%) exceeds OOD bound.`);
  }

  if (Math.abs(features.distFromEma21Atr) > maxDistAtr) {
    reasons.push(`Distance from EMA (${features.distFromEma21Atr.toFixed(2)} ATR) exceeds OOD bound.`);
  }

  if (features.rsiNormalized < 0 || features.rsiNormalized > 1) {
    reasons.push(`RSI normalized (${features.rsiNormalized}) outside valid [0, 1] range.`);
  }

  return {
    isOod: reasons.length > 0,
    reasons,
  };
}

/**
 * Computes raw logit, calibrated probabilities, and OOD assessment.
 */
export function predictProbabilities(
  features: FeatureVector,
  weights = DEFAULT_LOGISTIC_WEIGHTS,
  calibrator = UNCALIBRATED_PLATT,
  horizonCandles = 5,
): ModelPrediction {
  const z = computeRawLogit(features, weights);
  const ood = detectOutOfDistribution(features);

  // If calibrated: P(y=1 | z) = sigmoid(A*z + B). If uncalibrated: sigmoid(z).
  const probRaw = calibrator.isFitted
    ? sigmoid(calibrator.scaleA * z + calibrator.biasB)
    : sigmoid(z);

  let probBullish = 0;
  let probBearish = 0;
  let probNeutral = 0;

  if (ood.isOod) {
    // Widened uncertainty on OOD
    probNeutral = 0.80;
    probBullish = 0.10;
    probBearish = 0.10;
  } else if (probRaw > 0.55) {
    probBullish = Math.min(0.85, probRaw);
    probBearish = Math.max(0.05, 1 - probRaw);
    probNeutral = Math.max(0, 1 - probBullish - probBearish);
  } else if (probRaw < 0.45) {
    probBearish = Math.min(0.85, 1 - probRaw);
    probBullish = Math.max(0.05, probRaw);
    probNeutral = Math.max(0, 1 - probBullish - probBearish);
  } else {
    probNeutral = 0.60;
    probBullish = 0.20;
    probBearish = 0.20;
  }

  const sum = probBullish + probBearish + probNeutral;
  probBullish /= sum;
  probBearish /= sum;
  probNeutral /= sum;

  return {
    timestamp: features.timestamp,
    modelVersion: MODEL_ARTIFACT_VERSION,
    featureSchemaVersion: features.schemaVersion,
    horizonCandles,
    probBullish: Math.round(probBullish * 1000) / 1000,
    probBearish: Math.round(probBearish * 1000) / 1000,
    probNeutral: Math.round(probNeutral * 1000) / 1000,
    expectedReturnMean: Math.round((probBullish - probBearish) * 0.015 * 10000) / 10000,
    expectedReturnStd: ood.isOod ? 0.05 : 0.02,
    isCalibrated: calibrator.isFitted,
    invalidationPrice: 0,
  };
}

/**
 * Batch Gradient Descent trainer for Logistic Regression with L2 regularization.
 */
export function trainLogisticRegression(
  samples: Array<{ features: FeatureVector; label: 0 | 1 }>,
  options: {
    learningRate?: number;
    l2Lambda?: number;
    epochs?: number;
  } = {},
): LogisticWeights {
  const lr = options.learningRate ?? 0.05;
  const l2 = options.l2Lambda ?? 0.001;
  const epochs = options.epochs ?? 100;

  const weights: LogisticWeights = {
    bias: 0,
    w_returnLag1: 0,
    w_rsiNormalized: 0,
    w_macdHistToAtr: 0,
    w_distFromEma21Atr: 0,
    w_bbPercentB: 0,
    w_regimeEncoding: 0,
  };

  if (samples.length === 0) return weights;

  const N = samples.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradBias = 0;
    let gradReturn = 0;
    let gradRsi = 0;
    let gradMacd = 0;
    let gradDist = 0;
    let gradBb = 0;
    let gradRegime = 0;

    for (const sample of samples) {
      const z = computeRawLogit(sample.features, weights);
      const p = sigmoid(z);
      const error = p - sample.label;

      gradBias += error;
      gradReturn += error * sample.features.returnLag1;
      gradRsi += error * sample.features.rsiNormalized;
      gradMacd += error * sample.features.macdHistToAtr;
      gradDist += error * sample.features.distFromEma21Atr;
      gradBb += error * (sample.features.bbPercentB - 0.5);
      gradRegime += error * sample.features.regimeEncoding;
    }

    weights.bias -= lr * (gradBias / N);
    weights.w_returnLag1 -= lr * (gradReturn / N + l2 * weights.w_returnLag1);
    weights.w_rsiNormalized -= lr * (gradRsi / N + l2 * weights.w_rsiNormalized);
    weights.w_macdHistToAtr -= lr * (gradMacd / N + l2 * weights.w_macdHistToAtr);
    weights.w_distFromEma21Atr -= lr * (gradDist / N + l2 * weights.w_distFromEma21Atr);
    weights.w_bbPercentB -= lr * (gradBb / N + l2 * weights.w_bbPercentB);
    weights.w_regimeEncoding -= lr * (gradRegime / N + l2 * weights.w_regimeEncoding);
  }

  return weights;
}

/**
 * Calculates Expected Calibration Error (ECE) and reliability diagram bins.
 */
export function calculateExpectedCalibrationError(
  predictions: Array<{ prob: number; label: 0 | 1 }>,
  numBins = 10,
): { ece: number; bins: ReliabilityBin[] } {
  if (predictions.length === 0) {
    return { ece: 0, bins: [] };
  }

  const binStep = 1.0 / numBins;
  const bins: ReliabilityBin[] = [];
  let totalWeightedError = 0;
  const N = predictions.length;

  for (let b = 0; b < numBins; b++) {
    const binStart = b * binStep;
    const binEnd = (b + 1) * binStep;

    const inBin = predictions.filter(
      (p) => p.prob >= binStart && (b === numBins - 1 ? p.prob <= binEnd : p.prob < binEnd),
    );

    if (inBin.length === 0) {
      bins.push({
        binIndex: b,
        binStart,
        binEnd,
        meanConfidence: (binStart + binEnd) / 2,
        empiricalAccuracy: 0,
        sampleCount: 0,
      });
      continue;
    }

    const meanConf = inBin.reduce((acc, p) => acc + p.prob, 0) / inBin.length;
    const accuracy = inBin.reduce((acc, p) => acc + p.label, 0) / inBin.length;
    const binError = Math.abs(accuracy - meanConf);

    totalWeightedError += (inBin.length / N) * binError;

    bins.push({
      binIndex: b,
      binStart,
      binEnd,
      meanConfidence: Math.round(meanConf * 1000) / 1000,
      empiricalAccuracy: Math.round(accuracy * 1000) / 1000,
      sampleCount: inBin.length,
    });
  }

  return {
    ece: Math.round(totalWeightedError * 1000) / 1000,
    bins,
  };
}

/**
 * Calculates Brier Score for a series of probabilistic predictions.
 */
export function calculateBrierScore(
  predictions: Array<{ prob: number; outcome: 0 | 1 }>,
): number {
  if (predictions.length === 0) return 0;
  const sum = predictions.reduce((acc, p) => acc + (p.prob - p.outcome) ** 2, 0);
  return sum / predictions.length;
}

/**
 * Calculates Brier Skill Score (BSS) against a benchmark.
 * BSS = 1 - (Brier_model / Brier_ref).
 * BSS > 0 indicates superior skill over reference benchmark.
 */
export function calculateBrierSkillScore(modelBrier: number, referenceBrier: number): number {
  if (referenceBrier <= 0) return 0;
  return Math.round((1 - modelBrier / referenceBrier) * 1000) / 1000;
}

/**
 * Evaluates full calibration metrics against empirical labels.
 */
export function evaluateCalibration(
  predictions: Array<{ prob: number; label: 0 | 1 }>,
): CalibrationEvaluation {
  const brier = calculateBrierScore(predictions.map((p) => ({ prob: p.prob, outcome: p.label })));
  const logLoss = calculateLogLoss(predictions);
  const { ece, bins } = calculateExpectedCalibrationError(predictions, 10);

  // Reference: constant class prior baseline
  const posCount = predictions.filter((p) => p.label === 1).length;
  const prior = predictions.length > 0 ? posCount / predictions.length : 0.5;
  const refBrier = calculateBrierScore(predictions.map((p) => ({ prob: prior, outcome: p.label })));
  const bss = calculateBrierSkillScore(brier, refBrier);

  return {
    brierScore: Math.round(brier * 1000) / 1000,
    brierSkillScore: bss,
    expectedCalibrationError: ece,
    logLoss: Math.round(logLoss * 1000) / 1000,
    reliabilityBins: bins,
  };
}

/**
 * Calculates Binary Log-Loss (Cross-Entropy).
 */
export function calculateLogLoss(predictions: Array<{ prob: number; label: 0 | 1 }>): number {
  if (predictions.length === 0) return 0;
  const eps = 1e-6;
  const sum = predictions.reduce((acc, item) => {
    const p = Math.max(eps, Math.min(1 - eps, item.prob));
    return acc - (item.label * Math.log(p) + (1 - item.label) * Math.log(1 - p));
  }, 0);
  return sum / predictions.length;
}

/**
 * Calculates Area Under the ROC Curve (ROC-AUC).
 */
export function calculateRocAuc(predictions: Array<{ prob: number; label: 0 | 1 }>): number {
  if (predictions.length === 0) return 0.5;
  const positives = predictions.filter((p) => p.label === 1);
  const negatives = predictions.filter((p) => p.label === 0);

  if (positives.length === 0 || negatives.length === 0) return 0.5;

  let concordant = 0;
  let ties = 0;

  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos.prob > neg.prob) concordant++;
      else if (pos.prob === neg.prob) ties += 0.5;
    }
  }

  return (concordant + ties) / (positives.length * negatives.length);
}

/**
 * Chronological Out-of-Sample Train/Validation Split.
 */
export function chronologicalSplit<T>(
  data: T[],
  trainRatio = 0.70,
): { train: T[]; test: T[] } {
  const cutoff = Math.floor(data.length * trainRatio);
  return {
    train: data.slice(0, cutoff),
    test: data.slice(cutoff),
  };
}
