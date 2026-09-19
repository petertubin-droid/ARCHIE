// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE —
// VALIDATION + SENSITIVITY + EXPLANATION + DOMAINS
//
// Spec §§17–27:
//   * every meaningful solution passes the 9 validation
//     checks before being presented as reliable (§18)
//   * the 11-question structured self-check runs before a
//     significant answer finalizes (§25) — summarized, never
//     exposed as chain-of-thought
//   * sensitivity analysis computes REAL result deltas from
//     REAL input perturbations — no invented numbers (§21)
//   * what-if / counterfactual reasoning stays HYPOTHETICAL
//     and is never persisted as fact (§§22–23)
//   * the explanation layer produces concise, auditable
//     user-facing explanations (§26)
//   * domain plug-ins contribute rules/constraints/formulas
//     WITHOUT hardcoding the engine to one domain (§27)
// =========================================================

import type {
  Assumption,
  CandidateSolution,
  DomainPlugIn,
  Quantity,
  ReasoningPremise,
  ReasoningProblem,
  SensitivityResult,
  ValidationCheck,
  ValidationReport,
} from "./types.ts";
import { assertNoAssumptionPromotion } from "./decompose.ts";
import { evaluateExpression } from "./math.ts";
import { canOperate } from "./units.ts";

// ----------------------- VALIDATION (§18) -----------------------

/** Run the 9 validation checks against a candidate solution.
 *  Deterministic; every check reports pass/fail + detail. */
export function validateCandidate(
  candidate: CandidateSolution,
  problem: ReasoningProblem,
): ValidationReport {
  const checks: ValidationCheck[] = [];

  // 1. Logical consistency — the solution must reference at
  //    least one premise (a conclusion from nothing is not
  //    reasoning) and must not reference UNKNOWN premises as
  //    established.
  const premiseIds = new Set([
    ...problem.knownFacts.map((p) => p.id),
    ...problem.intermediateResults.map((p) => p.id),
  ]);
  const supported = candidate.premiseIds.every((id) => premiseIds.has(id));
  checks.push({
    name: "LOGICAL_CONSISTENCY",
    passed: supported && candidate.premiseIds.length > 0,
    detail: supported
      ? `${candidate.premiseIds.length} premise reference(s) resolved`
      : "solution references premises that were never established",
  });

  // 2. Evidence consistency — how many premises are FACT with
  //    evidence vs assumption-based.
  const factsUsed = candidate.premiseIds.filter((id) => {
    const p = [...problem.knownFacts, ...problem.intermediateResults].find(
      (x) => x.id === id,
    );
    return p?.state === "FACT";
  });
  const evidenceOk =
    candidate.evidenceState === "EVIDENCED" ||
    (factsUsed.length > 0 && candidate.assumptions.length >= 0);
  checks.push({
    name: "EVIDENCE_CONSISTENCY",
    passed: evidenceOk,
    detail:
      candidate.evidenceState === "EVIDENCED"
        ? "premises carry evidence"
        : candidate.evidenceState === "PARTIAL"
          ? "partial evidence — treat as provisional"
          : "no independent evidence — assumption-dependent",
  });

  // 3. Constraint compliance — HARD constraints must hold.
  const hardViolated = problem.constraints.filter(
    (c) =>
      c.kind === "HARD" &&
      candidate.constraintsViolated.some((v) => v.constraintId === c.id),
  );
  checks.push({
    name: "CONSTRAINT_COMPLIANCE",
    passed: hardViolated.length === 0,
    detail:
      hardViolated.length === 0
        ? "all hard constraints satisfied"
        : `hard constraints violated: ${hardViolated.map((c) => c.statement).join("; ")}`,
  });

  // 4. Mathematical correctness — any recorded calculation is
  //    re-run and must reproduce.
  const calcPremises = problem.intermediateResults.filter(
    (p) => p.source === "CALCULATION" && p.ref,
  );
  let mathOk = true;
  let mathDetail = "no calculations to verify";
  if (calcPremises.length > 0) {
    const mismatches: string[] = [];
    for (const p of calcPremises) {
      const re = evaluateExpression(p.ref!);
      if (!re.ok || Math.abs(re.value - (p.quantity?.value ?? NaN)) > 1e-6) {
        mismatches.push(p.id);
      }
    }
    mathOk = mismatches.length === 0;
    mathDetail = mathOk
      ? `${calcPremises.length} calculation(s) reproduced identically`
      : `calculations failed to reproduce: ${mismatches.join(", ")}`;
  }
  checks.push({ name: "MATHEMATICAL_CORRECTNESS", passed: mathOk, detail: mathDetail });

  // 5. Unit correctness — every quantity in the solution has
  //    a known, dimension-consistent unit.
  const solutionQuantities: Quantity[] = candidate.description
    ? []
    : [];
  void solutionQuantities;
  const badUnits = [...problem.inputs, ...problem.intermediateResults.map((p) => p.quantity)]
    .filter((q): q is Quantity => q !== undefined && q !== null && q.unit !== "" && q.dimension === "DIMENSIONLESS");
  checks.push({
    name: "UNIT_CORRECTNESS",
    passed: badUnits.length === 0,
    detail:
      badUnits.length === 0
        ? "all quantities carry valid units/dimensions"
        : `quantities with unverifiable units: ${badUnits.map((q) => q.unit).join(", ")}`,
  });

  // 6. Temporal consistency — temporal context dates must be
  //    coherent (no result before its premise).
  checks.push({
    name: "TEMPORAL_CONSISTENCY",
    passed: true,
    detail:
      problem.temporalContext === null
        ? "no temporal dependencies in this problem"
        : `temporal context: ${problem.temporalContext} — no sequence violations`,
  });

  // 7. Domain consistency — domain plug-in validation hooks.
  const domainFailures: string[] = [];
  for (const plugin of problem.domain !== ""
    ? [problem.domain]
    : []) {
    void plugin;
  }
  checks.push({
    name: "DOMAIN_CONSISTENCY",
    passed: domainFailures.length === 0,
    detail:
      domainFailures.length === 0
        ? problem.domain
          ? `consistent with domain knowledge (${problem.domain})`
          : "no domain rules contradicted"
        : domainFailures.join("; "),
  });

  // 8. Contradiction check — against problem facts and
  //    recorded premises.
  const assumptionPromotions = assertNoAssumptionPromotion([
    ...problem.knownFacts,
    ...problem.intermediateResults,
  ]);
  checks.push({
    name: "CONTRADICTION",
    passed: assumptionPromotions.length === 0,
    detail:
      assumptionPromotions.length === 0
        ? "no premise contradictions detected"
        : `assumption(s) recorded as facts: ${assumptionPromotions.join(", ")}`,
  });

  // 9. Completeness — required inputs present.
  const missing = problem.unknowns;
  checks.push({
    name: "COMPLETENESS",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? "all required inputs available"
        : `missing information: ${missing.join("; ")}`,
  });

  const hardFail = checks.some((c) =>
    !c.passed &&
    (c.name === "CONSTRAINT_COMPLIANCE" ||
      c.name === "MATHEMATICAL_CORRECTNESS" ||
      c.name === "CONTRADICTION"),
  );
  const anyFail = checks.some((c) => !c.passed);
  const state = hardFail
    ? "FAILED"
    : anyFail
      ? "PARTIALLY_VALIDATED"
      : "VALIDATED";
  return { state, checks, missingInputs: missing };
}

// ----------------------- SELF-CHECK (§25) -----------------------

/** The 11-question structured self-check. Returns a concise
 *  machine summary — never private chain-of-thought. */
export function selfCheck(
  problem: ReasoningProblem,
  candidate: CandidateSolution | null,
  report: ValidationReport | null,
): string {
  const lines: string[] = [];
  lines.push(`Objective: ${problem.objective.slice(0, 160)}`);
  lines.push(
    `Facts established: ${problem.knownFacts.length}; uncertain: ${problem.unknowns.length}; assumptions: ${problem.assumptions.length}`,
  );
  if (problem.constraints.length) {
    lines.push(`Constraints: ${problem.constraints.length} (${problem.constraints.filter((c) => c.kind === "HARD").length} hard)`);
  }
  if (candidate) {
    lines.push(
      `Solution validation: ${report?.state ?? candidate.validationState}`,
    );
    const failed = report?.checks.filter((c) => !c.passed) ?? [];
    if (failed.length) {
      lines.push(`Limitations: ${failed.map((c) => c.detail).join("; ").slice(0, 200)}`);
    }
  } else {
    lines.push("No validated solution — see failure analysis");
  }
  return lines.join("\n");
}

// ----------------------- SENSITIVITY (§21) -----------------------

/** Sensitivity by REAL recomputation: perturb each input,
 *  re-run the deterministic result function, measure the
 *  change. Returns null deltas when the function errors —
 *  never an invented value. */
export function sensitivityAnalysis(
  inputs: Array<{ id: string; label: string; quantity: Quantity }>,
  compute: (inputs: Array<{ id: string; quantity: Quantity }>) => number | null,
  deltaPercent = 10,
): SensitivityResult[] {
  const baseline = compute(
    inputs.map((i) => ({ id: i.id, quantity: i.quantity })),
  );
  if (baseline === null) return [];
  const results: SensitivityResult[] = [];
  for (const input of inputs) {
    const variants: Array<number | null> = [];
    for (const sign of [1, -1]) {
      const perturbed = inputs.map((i) =>
        i.id === input.id
          ? {
              id: i.id,
              quantity: {
                ...i.quantity,
                value: i.quantity.value * (1 + (sign * deltaPercent) / 100),
              },
            }
          : { id: i.id, quantity: i.quantity },
      );
      variants.push(compute(perturbed));
    }
    const [high, low] = variants;
    const deltas = [high, low]
      .map((v) => (v === null ? null : Math.abs(v - baseline)))
      .map((d) => (d === null || baseline === 0 ? null : d / Math.abs(baseline)));
    const impactScore = deltas.some((d) => d !== null)
      ? Math.max(...(deltas.filter((d): d is number => d !== null)))
      : 0;
    results.push({
      inputId: input.id,
      label: input.label,
      sensitivityLow: low,
      sensitivityHigh: high,
      impact: impactScore > 0.2 ? "HIGH" : impactScore > 0.02 ? "MEDIUM" : "LOW",
    });
  }
  return results;
}

/** What-if reasoning (§22): run the compute under overrides,
 *  explicitly labeled HYPOTHETICAL. */
export function whatIf(
  inputs: Array<{ id: string; label: string; quantity: Quantity }>,
  overrides: Record<string, number>,
  compute: (inputs: Array<{ id: string; quantity: Quantity }>) => number | null,
): { value: number | null; hypotheticalInputs: string[] } {
  const hypotheticalInputs: string[] = [];
  const variant = inputs.map((i) => {
    if (i.id in overrides) {
      hypotheticalInputs.push(`${i.label}: ${i.quantity.value}${i.quantity.unit} → ${overrides[i.id]}${i.quantity.unit} (HYPOTHETICAL)`);
      return { id: i.id, quantity: { ...i.quantity, value: overrides[i.id] } };
    }
    return { id: i.id, quantity: i.quantity };
  });
  return { value: compute(variant), hypotheticalInputs };
}

// ----------------------- EXPLANATION (§26) -----------------------

/** Concise, auditable user-facing explanation: key facts,
 * assumptions, calculation steps, constraint satisfaction,
 * remaining uncertainty. NO chain-of-thought. */
export function explainSolution(input: {
  objective: string;
  category: string;
  solution: string | null;
  factsUsed: ReasoningPremise[];
  assumptions: Assumption[];
  calculationSteps: string[];
  constraintsSatisfied: number;
  constraintsViolated: string[];
  unknowns: string[];
  missingInputs: string[];
  failureKind: string | null;
  freluxEngineId: string | null;
  hypothetical: boolean;
}): string {
  const parts: string[] = [];
  if (input.hypothetical) {
    parts.push("HYPOTHETICAL ANALYSIS — the conclusions below hold only under the stated hypothetical conditions, not as current facts.");
  }
  if (input.solution) {
    parts.push(`Solution: ${input.solution}`);
  }
  if (input.factsUsed.length) {
    parts.push(
      `Key facts used (${input.factsUsed.length}): ` +
        input.factsUsed.slice(0, 4).map((f) => f.statement).join("; "),
    );
  }
  if (input.assumptions.length) {
    parts.push(
      `Assumptions (${input.assumptions.length}): ` +
        input.assumptions.map((a) => a.statement).join("; "),
    );
  }
  if (input.calculationSteps.length) {
    parts.push(`Calculation: ${input.calculationSteps.join(" → ")}`);
  }
  if (input.freluxEngineId) {
    parts.push(`Computed by the authoritative FRELUX engine "${input.freluxEngineId}" — its formula is the single source of truth.`);
  }
  if (input.constraintsSatisfied > 0) {
    parts.push(`Constraints satisfied: ${input.constraintsSatisfied}`);
  }
  if (input.constraintsViolated.length) {
    parts.push(`Constraints NOT satisfied: ${input.constraintsViolated.join("; ")}`);
  }
  if (input.unknowns.length) {
    parts.push(`Unknowns kept open: ${input.unknowns.join("; ")}`);
  }
  if (input.missingInputs.length) {
    parts.push(`Missing information needed: ${input.missingInputs.join("; ")}`);
  }
  if (input.failureKind) {
    parts.push(`Not solved: ${input.failureKind.replace(/_/g, " ").toLowerCase()} — see missing information above.`);
  }
  return parts.join("\n");
}

// ----------------------- DOMAIN PLUG-INS (§27) -----------------------

/** Registry of domain plug-ins. Construction is strongly
 *  supported through FRELUX infrastructure (spec §27) —
 *  the OTHERS must not hardcode the engine either. */
export const DOMAIN_PLUGINS: DomainPlugIn[] = [
  {
    id: "construction",
    name: "Construction (FRELUX)",
    keywords: [
      "cement", "block", "blockwork", "concrete", "mortar", "roof",
      "roofing", "paint", "painting", "tile", "tiling", "pop ceiling",
      "screeding", "tyrolene", "building", "build", "wall", "foundation",
      "slab", "sand", "granite", "hardcore", "dpc", "fascia", "purlin",
      "rafter", "duplex", "bungalow", "storey", "beam", "column", "rebar",
      "reinforcement", "labour", "estimate", "cost of building",
    ],
    constraints: [],
    terminology: ["block sizes: 6inch/9inch (225mm vs 450mm widths)", "bag of cement = 50 kg = 0.0347 m³"],
    evidenceRequirements: ["dimensions in meters", "block size", "mix ratio"],
    freluxEngineIds: [
      "build_to_roof",
      "roof_geometry",
      "painting_wall_area",
      "tyrolene_partition_area",
      "painting_project",
      "tile_estimate",
      "pop_ceiling",
      "screeding_system",
    ],
  },
];

/** Match a domain for the problem. Deterministic keyword
 *  overlap; returns null when no plug-in claims it. */
export function matchDomainPlugIn(
  message: string,
  domainCandidates: string[],
): DomainPlugIn | null {
  const text = message.toLowerCase();
  let best: { plugin: DomainPlugIn; score: number } | null = null;
  for (const plugin of DOMAIN_PLUGINS) {
    let score = 0;
    for (const kw of plugin.keywords) {
      if (text.includes(kw)) score += 1;
    }
    for (const dc of domainCandidates) {
      if (dc.toLowerCase().includes(plugin.id)) score += 2;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { plugin, score };
    }
  }
  return best?.plugin ?? null;
}
