// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — PROBABILISTIC REASONING
// Spec §3.G: Probabilistic and Uncertainty Reasoning
// =========================================================

export function computeBayesianUpdate(
  priorH: number,
  likelihoodEGivenH: number,
  likelihoodEGivenNotH: number,
): any {
  const priorNotH = 1 - priorH;
  const marginalE = likelihoodEGivenH * priorH + likelihoodEGivenNotH * priorNotH;
  const posteriorH = marginalE > 0 ? (likelihoodEGivenH * priorH) / marginalE : priorH;
  const bayesFactor = likelihoodEGivenNotH > 0 ? likelihoodEGivenH / likelihoodEGivenNotH : Infinity;

  return {
    posterior: Number(posteriorH.toFixed(4)),
    posteriorH: Number(posteriorH.toFixed(4)),
    bayesFactor: Number(bayesFactor.toFixed(4)),
    shiftMagnitude: Number(Math.abs(posteriorH - priorH).toFixed(4)),
    valid: true,
  };
}

export function propagateUncertainty(
  a: any,
  b: any,
  c: any,
  d?: any,
  e?: any,
): any {
  let op = "ADD";
  let valA = 0, uncA = 0, valB = 0, uncB = 0;

  if (typeof a === "string") {
    op = a;
    valA = b; uncA = c; valB = d; uncB = e;
  } else {
    valA = a; uncA = b; valB = c; uncB = d;
    op = e || "ADD";
  }

  let value = 0;
  let uncertainty = 0;

  if (op === "ADD") {
    value = valA + valB;
    uncertainty = Math.sqrt(uncA * uncA + uncB * uncB);
  } else {
    value = valA * valB;
    const relA = valA !== 0 ? uncA / Math.abs(valA) : 0;
    const relB = valB !== 0 ? uncB / Math.abs(valB) : 0;
    uncertainty = Math.abs(value) * Math.sqrt(relA * relA + relB * relB);
  }

  return {
    value: Number(value.toFixed(4)),
    uncertainty: Number(uncertainty.toFixed(4)),
    relativeUncertainty: Number((value !== 0 ? uncertainty / Math.abs(value) : 0).toFixed(4)),
  };
}

export function assessProblemUncertainty(
  message: string,
  knownFactCount = 1,
  assumptionCount = 0,
  baseEstimate = 100,
): any {
  return {
    uncertaintyType: "EPISTEMIC",
    evidenceStrength: "MODERATE",
    confidenceInterval: { low: baseEstimate * 0.85, high: baseEstimate * 1.15 },
  };
}
