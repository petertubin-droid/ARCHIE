// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — PROVENANCE CHAINS
//
// Spec §7: provenance must survive every transformation.
//
//   SOURCE → extracted fact → normalized fact → graph
//   relationship → inference
//
// A chain is an ORDERED list of steps. Every transformation
// APPENDS a step that records WHAT was done — the original
// source step is immutable and never lost. Deriving an
// inference from premises EMBEDS the premises' chains, so a
// conclusion remains traceable to its sources (spec §8).
// =========================================================

import type { ProvenanceStep } from "./types.ts";

/** Start a chain at the source — the ONLY way a chain may
 *  begin. There is never a fabricated origin. */
export function chainFromSource(step: {
  detail: string;
  subsystem: string;
  now: string;
}): ProvenanceStep[] {
  return [
    {
      stage: "SOURCE",
      detail: step.detail,
      subsystem: step.subsystem,
      at: step.now,
    },
  ];
}

/**
 * Append a transformation step to an existing chain. The
 * input chain is NEVER mutated — provenance is append-only
 * and the source step always stays at index 0.
 */
export function appendTransformation(
  chain: ProvenanceStep[],
  step: {
    stage: string;
    detail: string;
    subsystem: string;
    transformation: string;
    now: string;
  },
): ProvenanceStep[] {
  const next = [...chain];
  next.push({
    stage: step.stage,
    detail: step.detail,
    subsystem: step.subsystem,
    at: step.now,
    transformation: step.transformation,
  });
  return next;
}

/** The original source step of a chain (index 0), if any. */
export function rootSourceOf(chain: ProvenanceStep[]): ProvenanceStep | null {
  return chain.find((s) => s.stage === "SOURCE") ?? null;
}

/**
 * The chain for a DERIVED conclusion: the inference step is
 * appended ON TOP of the premises' chains so the conclusion
 * stays traceable to every premise's original source (spec
 * §8: CLAIM → INFERENCE → PREMISES → EVIDENCE → SOURCE).
 * Premise chains are deduplicated by their root source +
 * final stage detail to stay bounded.
 */
export function chainForInference(
  premiseChains: ProvenanceStep[][],
  step: {
    ruleId: string;
    explanation: string;
    subsystem: string;
    now: string;
  },
): ProvenanceStep[] {
  const merged: ProvenanceStep[] = [];
  const seen = new Set<string>();
  for (const chain of premiseChains) {
    for (const s of chain) {
      const sig = `${s.stage}|${s.subsystem}|${s.detail}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        merged.push(s);
      }
    }
  }
  merged.push({
    stage: "INFERENCE",
    detail: `derived by rule ${step.ruleId}: ${step.explanation}`,
    subsystem: step.subsystem,
    at: step.now,
    transformation: `inference:${step.ruleId}`,
  });
  return merged;
}

/** Bounded display form of a chain (admin surfaces). */
export function describeChain(chain: ProvenanceStep[]): string {
  return chain
    .slice(0, 12)
    .map((s) => `${s.stage}: ${s.detail} [${s.subsystem}]`)
    .join(" → ");
}
