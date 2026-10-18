// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — CAUSAL REASONING
// Spec §3.E: Causal Reasoning
// =========================================================

import type {
  CausalIntervention,
  CausalRelationship,
  CausalResult,
} from "./types.ts";

export function evaluateCausalModel(
  targetOrSpec: any,
  linksOrInterventions?: any[],
  interventionsOrNone?: any[],
): any {
  let target = "";
  let links: Array<{ cause: string; effect: string; strength?: number; type?: string }> = [];

  if (typeof targetOrSpec === "string") {
    target = targetOrSpec;
    links = linksOrInterventions || [];
  } else if (targetOrSpec && targetOrSpec.relationships) {
    target = targetOrSpec.nodes?.[0] || "";
    links = targetOrSpec.relationships;
  }

  const directCauses: string[] = [];
  const indirectCauses: string[] = [];
  const feedbackCycles: any[] = [];

  for (const l of links) {
    if (l.effect.toLowerCase() === target.toLowerCase()) {
      directCauses.push(l.cause);
    }
  }

  for (const d of directCauses) {
    for (const l of links) {
      if (l.effect.toLowerCase() === d.toLowerCase() && !directCauses.includes(l.cause) && l.cause !== target) {
        indirectCauses.push(l.cause);
      }
    }
  }

  return {
    target,
    directCauses,
    indirectCauses,
    feedbackCycles,
    relationships: links,
  };
}

export function checkNecessaryAndSufficient(
  relationshipsOrOutcome: any,
  causeOrOutcome?: any,
  necessaryArg?: boolean,
  sufficientArg?: boolean,
): any {
  if (typeof necessaryArg === "boolean" && typeof sufficientArg === "boolean") {
    return {
      cause: causeOrOutcome,
      outcome: relationshipsOrOutcome,
      necessary: necessaryArg,
      sufficient: sufficientArg,
    };
  }

  const rels = Array.isArray(relationshipsOrOutcome) ? relationshipsOrOutcome : [];
  const outcome = String(causeOrOutcome || "").toLowerCase();

  const necessaryCauses: string[] = [];
  const sufficientCauses: string[] = [];
  const contributingOnly: string[] = [];

  for (const r of rels) {
    if (String(r.effect).toLowerCase() === outcome) {
      if (r.necessary) necessaryCauses.push(r.cause);
      if (r.sufficient) sufficientCauses.push(r.cause);
      if (!r.necessary && !r.sufficient) contributingOnly.push(r.cause);
    }
  }

  return { necessaryCauses, sufficientCauses, contributingOnly };
}
