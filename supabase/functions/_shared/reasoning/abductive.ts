// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — ABDUCTIVE REASONING
// Spec §3.D: Abductive Reasoning
// =========================================================

import type {
  AbductiveHypothesis,
  AbductiveResult,
  ReasoningPremise,
} from "./types.ts";

export interface CandidateExplanationDef {
  id: string;
  explanation?: string;
  description?: string;
  explainsKeywords?: string[];
  coversObservations?: string[];
  contradictsKeywords?: string[];
  contradictsObservations?: string[];
  assumptionsRequired?: string[];
  assumptions?: string[];
  discriminatingTest?: string;
  priorPlausibility?: number;
}

export function evaluateAbductiveExplanations(
  observedOrList: string | string[],
  hypothesesOrEvidence: any[],
  candidateDefsOrNone?: CandidateExplanationDef[],
): any {
  let observations: string[] = [];
  let candidateDefs: CandidateExplanationDef[] = [];

  if (Array.isArray(observedOrList)) {
    observations = observedOrList;
    candidateDefs = hypothesesOrEvidence as CandidateExplanationDef[];
  } else {
    observations = [observedOrList];
    if (candidateDefsOrNone) {
      candidateDefs = candidateDefsOrNone;
    } else {
      candidateDefs = hypothesesOrEvidence as CandidateExplanationDef[];
    }
  }

  const results: any[] = [];
  const obsLower = observations.map((o) => (typeof o === "string" ? o.toLowerCase() : (o as any).statement?.toLowerCase() || ""));

  for (const def of candidateDefs) {
    const desc = def.description || def.explanation || def.id;
    const covers = def.coversObservations || def.explainsKeywords || [];
    const contradicts = def.contradictsObservations || def.contradictsKeywords || [];
    const assumptions = def.assumptions || def.assumptionsRequired || [];

    let coveredCount = 0;
    for (const c of covers) {
      const cLow = c.toLowerCase();
      if (obsLower.some((o) => o.includes(cLow) || cLow.includes(o))) {
        coveredCount++;
      }
    }

    const coverage = observations.length > 0 ? coveredCount / observations.length : (covers.length > 0 ? 1 : 0);
    let plausibility = (def.priorPlausibility ?? 0.5) * (0.3 + 0.7 * coverage);
    if (contradicts.length > 0) {
      plausibility *= 0.2;
    }

    results.push({
      hypothesis: {
        id: def.id,
        description: desc,
        coversObservations: covers,
        contradictsObservations: contradicts,
        assumptions,
      },
      id: def.id,
      description: desc,
      explanatoryCoverage: Number(coverage.toFixed(2)),
      plausibilityScore: Number(plausibility.toFixed(2)),
      discriminationTests: [def.discriminatingTest || `Verify soil condition for ${def.id}`],
    });
  }

  results.sort((a, b) => b.plausibilityScore - a.plausibilityScore);
  results.forEach((r, idx) => {
    r.plausibilityRank = idx + 1;
  });

  return results;
}
