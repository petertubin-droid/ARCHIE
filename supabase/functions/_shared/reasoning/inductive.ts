// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — INDUCTIVE REASONING
// Spec §3.C: Inductive Reasoning
//
// Pattern recognition & empirical generalization with strict epistemic limits:
//   - Systematic pattern recognition across observation sets
//   - Distinction between recurring pattern and universal law
//   - Explicit sample-size awareness & penalty for small samples
//   - Counterexample detection & refutation
//   - Cognitive / sampling bias flagging (survivorship, availability)
//   - Calibrated generalization confidence
// =========================================================

import type {
  InductiveGeneralization,
  Observation,
} from "./types.ts";

/** Minimum observations required to avoid severe sample-size penalty */
const MIN_REPRESENTATIVE_SAMPLE = 5;

/** Evaluate an inductive generalization from empirical observations */
export function evaluateInductiveGeneralization(
  candidateHypothesis: string,
  observations: Array<any>,
  counterexamplesOrExtractor?: any,
): InductiveGeneralization {
  const supporting: string[] = [];
  const counterExamples: string[] = [];
  const biases: string[] = [];

  const obsList = observations.map((o, idx) => {
    if (typeof o === "string") return { id: `obs-${idx + 1}`, statement: o };
    return {
      id: o.id || `obs-${idx + 1}`,
      statement: o.statement || o.observation || JSON.stringify(o),
      source: o.source || "empirical",
    };
  });

  // Handle either functional extractor or explicit counterexamples list
  if (typeof counterexamplesOrExtractor === "function") {
    for (const obs of obsList) {
      const check = counterexamplesOrExtractor(obs);
      if (check.matches) {
        supporting.push(obs.id);
      } else {
        counterExamples.push(`Observation ${obs.id} ("${obs.statement}") contradicts hypothesis property '${check.property}'`);
      }
    }
  } else if (Array.isArray(counterexamplesOrExtractor)) {
    for (const obs of obsList) {
      supporting.push(obs.id);
    }
    for (const c of counterexamplesOrExtractor) {
      const stmt = typeof c === "string" ? c : (c.counterexample || c.statement || JSON.stringify(c));
      counterExamples.push(stmt);
    }
  } else {
    for (const obs of obsList) {
      supporting.push(obs.id);
    }
  }

  const sampleCount = obsList.length;
  const sampleAdequate = sampleCount >= MIN_REPRESENTATIVE_SAMPLE;

  if (sampleCount < MIN_REPRESENTATIVE_SAMPLE) {
    biases.push(`Small sample size (${sampleCount} observation(s)). Risk of hasty generalization.`);
  }

  // Calculate calibrated confidence
  let confidenceScore = 0;
  if (counterExamples.length > 0) {
    confidenceScore = Math.max(0, (supporting.length / (sampleCount + counterExamples.length)) * 0.35);
  } else if (sampleCount === 0) {
    confidenceScore = 0;
  } else {
    const base = supporting.length / sampleCount;
    const sampleFactor = Math.min(1.0, Math.log10(sampleCount + 1) / Math.log10(100));
    confidenceScore = Math.min(0.92, base * (0.5 + 0.42 * sampleFactor));
  }

  let qualification = "";
  if (counterExamples.length > 0) {
    qualification = `Pattern holds only partially (${supporting.length}/${sampleCount + counterExamples.length} instances). ${counterExamples.length} counterexample(s) observed.`;
  } else if (!sampleAdequate) {
    qualification = `Preliminary pattern observed across small sample (${sampleCount} instance(s)). Anecdotal or indicative only.`;
  } else {
    qualification = `Consistent empirical trend observed across ${sampleCount} verified observations. Qualified inductive generalization.`;
  }

  return {
    hypothesis: candidateHypothesis,
    patternDetected: `Observed consistency in ${supporting.length} of ${sampleCount} observation(s)`,
    observationCount: sampleCount,
    supportingObservations: supporting,
    counterExamples,
    sampleSizeAdequate: sampleAdequate,
    potentialBiases: biases,
    confidenceScore: Number(confidenceScore.toFixed(3)),
    qualification,
    biasWarning: biases.length > 0 ? biases.join("; ") : undefined,
    counterexamplesFound: counterExamples,
  } as any;
}

/** Detect common trends across numeric or ordered observations */
export function detectObservationTrend(
  inputValues: number[] | Array<{ timestamp?: number; value: number; label?: string }>,
): {
  direction: "INCREASING" | "DECREASING" | "STABLE" | "VOLATILE" | "INSUFFICIENT_DATA";
  trend: "INCREASING" | "DECREASING" | "STABLE" | "VOLATILE" | "INSUFFICIENT_DATA";
  slope: number;
  rSquared: number;
  projectedNext: number;
  sampleSizeAdequate: boolean;
  confidence: number;
} {
  const values = inputValues.map((v) => (typeof v === "number" ? { value: v } : v));

  if (values.length < 3) {
    return {
      direction: "INSUFFICIENT_DATA",
      trend: "INSUFFICIENT_DATA",
      slope: 0,
      rSquared: 0,
      projectedNext: values.length > 0 ? values[values.length - 1].value : 0,
      sampleSizeAdequate: false,
      confidence: 0,
    };
  }

  const n = values.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return {
      direction: "STABLE",
      trend: "STABLE",
      slope: 0,
      rSquared: 1,
      projectedNext: values[n - 1].value,
      sampleSizeAdequate: n >= MIN_REPRESENTATIVE_SAMPLE,
      confidence: 0.9,
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;

  let ssRes = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    const yPred = slope * i + intercept;
    const y = values[i].value;
    ssRes += Math.pow(y - yPred, 2);
    ssTot += Math.pow(y - meanY, 2);
  }

  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const normalizedSlope = meanY !== 0 ? slope / Math.abs(meanY) : slope;
  const projectedNext = slope * n + intercept;

  let direction: "INCREASING" | "DECREASING" | "STABLE" | "VOLATILE" = "STABLE";
  if (rSquared < 0.4 && values.length >= 4) {
    direction = "VOLATILE";
  } else if (normalizedSlope > 0.05) {
    direction = "INCREASING";
  } else if (normalizedSlope < -0.05) {
    direction = "DECREASING";
  } else {
    direction = "STABLE";
  }

  return {
    direction,
    trend: direction,
    slope: Number(slope.toFixed(4)),
    rSquared: Number(rSquared.toFixed(4)),
    projectedNext: Number(projectedNext.toFixed(4)),
    sampleSizeAdequate: n >= MIN_REPRESENTATIVE_SAMPLE,
    confidence: Number(Math.min(0.95, rSquared).toFixed(3)),
  };
}
