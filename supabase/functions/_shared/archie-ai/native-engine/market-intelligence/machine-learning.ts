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
  DecisionStump,
  DecisionTreeEnsemble,
  HMMRegimeModel,
  VolatilityForecast,
  MarketRegimeType,
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


// ----------------------------------------------------------------------------
// Decision Tree / Stump Ensemble (Section 11 Model Family Diversity)
// ----------------------------------------------------------------------------

export function trainDecisionStumpEnsemble(
  samples: Array<{ features: FeatureVector; label: 0 | 1 }>,
  options: { numStumps?: number; learningRate?: number } = {},
): DecisionTreeEnsemble {
  const numStumps = options.numStumps ?? 5;
  const lr = options.learningRate ?? 0.2;
  const stumps: DecisionStump[] = [];

  const featureKeys: Array<keyof FeatureVector> = [
    "rsiNormalized",
    "returnLag1",
    "macdHistToAtr",
    "distFromEma21Atr",
    "bbPercentB",
    "adxNormalized",
  ];

  // Initialize sample weights uniformly
  const N = samples.length;
  if (N === 0) {
    return {
      modelId: "decision-stump-ensemble-v1",
      stumps: [],
      learningRate: lr,
      targetClass: "BULLISH_CONTINUATION",
    };
  }

  let sampleWeights = new Array(N).fill(1 / N);

  for (let s = 0; s < numStumps; s++) {
    let bestError = Infinity;
    let bestStump: DecisionStump = {
      featureIndex: 0,
      featureName: featureKeys[0],
      threshold: 0,
      leftValue: 0.5,
      rightValue: 0.5,
      weight: 1.0,
      error: 0.5,
    };

    for (let f = 0; f < featureKeys.length; f++) {
      const key = featureKeys[f];
      const values = samples.map((sample) => Number(sample.features[key]));
      const sortedValues = [...values].sort((a, b) => a - b);
      const step = Math.max(1, Math.floor(sortedValues.length / 5));

      for (let i = 0; i < sortedValues.length; i += step) {
        const threshold = sortedValues[i];

        // Evaluate predictions
        let weightedErr = 0;
        let leftSum = 0;
        let leftCount = 0;
        let rightSum = 0;
        let rightCount = 0;

        for (let j = 0; j < N; j++) {
          const val = Number(samples[j].features[key]);
          const lbl = samples[j].label;
          if (val <= threshold) {
            leftSum += lbl;
            leftCount++;
          } else {
            rightSum += lbl;
            rightCount++;
          }
        }

        const leftVal = leftCount > 0 ? leftSum / leftCount : 0.5;
        const rightVal = rightCount > 0 ? rightSum / rightCount : 0.5;

        for (let j = 0; j < N; j++) {
          const val = Number(samples[j].features[key]);
          const pred = val <= threshold ? (leftVal >= 0.5 ? 1 : 0) : (rightVal >= 0.5 ? 1 : 0);
          if (pred !== samples[j].label) {
            weightedErr += sampleWeights[j];
          }
        }

        if (weightedErr < bestError) {
          bestError = weightedErr;
          bestStump = {
            featureIndex: f,
            featureName: key,
            threshold,
            leftValue: leftVal,
            rightValue: rightVal,
            weight: 1.0,
            error: weightedErr,
          };
        }
      }
    }

    const clampedError = Math.max(0.001, Math.min(0.999, bestError));
    const alpha = 0.5 * Math.log((1 - clampedError) / clampedError);
    bestStump.weight = alpha;
    stumps.push(bestStump);

    // Update sample weights
    let weightSum = 0;
    for (let j = 0; j < N; j++) {
      const val = Number(samples[j].features[bestStump.featureName as keyof FeatureVector]);
      const pred = val <= bestStump.threshold ? bestStump.leftValue : bestStump.rightValue;
      const binPred = pred >= 0.5 ? 1 : 0;
      const factor = binPred === samples[j].label ? Math.exp(-alpha) : Math.exp(alpha);
      sampleWeights[j] *= factor;
      weightSum += sampleWeights[j];
    }
    if (weightSum > 0) {
      sampleWeights = sampleWeights.map((w) => w / weightSum);
    }
  }

  return {
    modelId: `decision-stump-ensemble-${Date.now()}`,
    stumps,
    learningRate: lr,
    targetClass: "BULLISH_CONTINUATION",
  };
}

export function predictDecisionStumpEnsemble(
  features: FeatureVector,
  ensemble: DecisionTreeEnsemble,
): number {
  if (ensemble.stumps.length === 0) return 0.5;

  let totalScore = 0;
  let totalWeight = 0;

  for (const stump of ensemble.stumps) {
    const val = Number(features[stump.featureName as keyof FeatureVector]);
    const pred = val <= stump.threshold ? stump.leftValue : stump.rightValue;
    totalScore += pred * stump.weight;
    totalWeight += Math.abs(stump.weight);
  }

  return totalWeight > 0 ? Math.max(0.01, Math.min(0.99, totalScore / totalWeight)) : 0.5;
}

// ----------------------------------------------------------------------------
// Hidden Markov Model (HMM) Market Regime Classifier (Section 11)
// ----------------------------------------------------------------------------

export function classifyMarketRegimeHMM(returns: number[], currentVolatility: number): HMMRegimeModel {
  // 3-state Gaussian emissions:
  // State 0: TRENDING_BULL (positive mean, low-medium vol)
  // State 1: TRENDING_BEAR (negative mean, elevated vol)
  // State 2: RANGING / CHOPPY (near-zero mean, low vol)

  if (returns.length < 5) {
    return {
      states: [
        { stateIndex: 0, name: "TRENDING_BULL", meanReturn: 0.002, varianceReturn: 0.0001, posteriorProbability: 0.33 },
        { stateIndex: 1, name: "TRENDING_BEAR", meanReturn: -0.002, varianceReturn: 0.0002, posteriorProbability: 0.33 },
        { stateIndex: 2, name: "RANGING", meanReturn: 0.0, varianceReturn: 0.00005, posteriorProbability: 0.34 },
      ],
      transitionMatrix: [
        [0.85, 0.05, 0.10],
        [0.05, 0.85, 0.10],
        [0.10, 0.10, 0.80],
      ],
      mostLikelyRegime: "RANGING",
      entropy: 1.09,
    };
  }

  const recentReturns = returns.slice(-30);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const variance = recentReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / recentReturns.length || 0.0001;

  // Gaussian densities
  const gBull = Math.exp(-((mean - 0.003) ** 2) / (2 * variance));
  const gBear = Math.exp(-((mean - (-0.003)) ** 2) / (2 * variance));
  const gRange = Math.exp(-((mean - 0.0) ** 2) / (2 * variance));

  const sumG = gBull + gBear + gRange || 1;
  const pBull = gBull / sumG;
  const pBear = gBear / sumG;
  const pRange = gRange / sumG;

  const states = [
    { stateIndex: 0, name: "TRENDING_BULL" as MarketRegimeType, meanReturn: 0.003, varianceReturn: variance, posteriorProbability: pBull },
    { stateIndex: 1, name: "TRENDING_BEAR" as MarketRegimeType, meanReturn: -0.003, varianceReturn: variance * 1.5, posteriorProbability: pBear },
    { stateIndex: 2, name: "RANGING" as MarketRegimeType, meanReturn: 0.0, varianceReturn: variance * 0.8, posteriorProbability: pRange },
  ];

  let bestState = states[0];
  for (const s of states) {
    if (s.posteriorProbability > bestState.posteriorProbability) {
      bestState = s;
    }
  }

  // Entropy H(X) = -sum(p * log(p))
  const entropy = -[pBull, pBear, pRange].reduce((acc, p) => (p > 0 ? acc + p * Math.log(p) : acc), 0);

  return {
    states,
    transitionMatrix: [
      [0.85, 0.05, 0.10],
      [0.05, 0.85, 0.10],
      [0.10, 0.10, 0.80],
    ],
    mostLikelyRegime: bestState.name,
    entropy: Math.round(entropy * 100) / 100,
  };
}

// ----------------------------------------------------------------------------
// GARCH(1,1) & Volatility Surface Forecaster (Section 12)
// ----------------------------------------------------------------------------

export function forecastVolatilityGarch(
  returns: number[],
  currentClose: number,
  atr14: number,
  horizonCandles = 10,
): VolatilityForecast {
  if (returns.length < 5) {
    const defaultVol = 0.18;
    const band = currentClose * (defaultVol / Math.sqrt(252)) * Math.sqrt(horizonCandles);
    return {
      currentAtr: atr14,
      annualizedHistoricalVolPct: defaultVol * 100,
      garchConditionalVolPct: defaultVol * 100,
      forecastHorizonCandles: horizonCandles,
      upperExpectedBand: currentClose + band,
      lowerExpectedBand: currentClose - band,
    };
  }

  // Standard GARCH(1,1) parameters: omega + alpha * eps^2 + beta * sigma^2
  const omega = 0.000002;
  const alpha = 0.10;
  const beta = 0.85;

  let sigmaSq = returns.slice(0, 10).reduce((acc, r) => acc + r * r, 0) / 10 || 0.0001;

  for (let i = 1; i < returns.length; i++) {
    const epsSq = returns[i - 1] * returns[i - 1];
    sigmaSq = omega + alpha * epsSq + beta * sigmaSq;
  }

  const dailyVol = Math.sqrt(sigmaSq);
  const annualizedVolPct = dailyVol * Math.sqrt(252) * 100;

  // Expected move over horizon H: sigma_H = dailyVol * sqrt(H)
  const expectedMove = currentClose * dailyVol * Math.sqrt(horizonCandles);

  return {
    currentAtr: Math.round(atr14 * 1000) / 1000,
    annualizedHistoricalVolPct: Math.round(annualizedVolPct * 10) / 10,
    garchConditionalVolPct: Math.round(annualizedVolPct * 10) / 10,
    forecastHorizonCandles: horizonCandles,
    upperExpectedBand: Math.round((currentClose + expectedMove) * 100) / 100,
    lowerExpectedBand: Math.round((currentClose - expectedMove) * 100) / 100,
  };
}

// ----------------------------------------------------------------------------
// Multi-Model Ensemble Predictor (Section 11 & 12)
// ----------------------------------------------------------------------------

export function predictUnifiedEnsembleProbabilities(
  features: FeatureVector,
  returnsHistory: number[],
  weights = DEFAULT_LOGISTIC_WEIGHTS,
  calibrator = UNCALIBRATED_PLATT,
  treeEnsemble?: DecisionTreeEnsemble,
): ModelPrediction {
  // 1. Logistic Regression Model with Platt Calibration
  const basePred = predictProbabilities(features, weights, calibrator);

  // 2. Decision Tree Ensemble Model
  let treeProb = 0.5;
  if (treeEnsemble && treeEnsemble.stumps.length > 0) {
    treeProb = predictDecisionStumpEnsemble(features, treeEnsemble);
  }

  // 3. HMM Regime Prior
  const hmm = classifyMarketRegimeHMM(returnsHistory, features.rangeToAtr);

  // Synthesize weighted probabilities (50% Calibrated Logistic, 30% Tree Ensemble, 20% HMM Prior)
  let probBullish = basePred.probBullish * 0.50 + treeProb * 0.30;
  let probBearish = basePred.probBearish * 0.50 + (1 - treeProb) * 0.30;

  if (hmm.mostLikelyRegime === "TRENDING_BULL") {
    probBullish += 0.20 * hmm.states[0].posteriorProbability;
  } else if (hmm.mostLikelyRegime === "TRENDING_BEAR") {
    probBearish += 0.20 * hmm.states[1].posteriorProbability;
  }

  let probNeutral = Math.max(0.05, 1.0 - probBullish - probBearish);
  const total = probBullish + probBearish + probNeutral;

  probBullish /= total;
  probBearish /= total;
  probNeutral /= total;

  return {
    ...basePred,
    modelVersion: "v1.3.0-archie-multi-model-ensemble",
    probBullish: Math.round(probBullish * 1000) / 1000,
    probBearish: Math.round(probBearish * 1000) / 1000,
    probNeutral: Math.round(probNeutral * 1000) / 1000,
  };
}
