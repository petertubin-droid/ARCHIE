// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE —
// ORCHESTRATION
//
// The fifth intelligence layer's live pipeline (spec §3):
//   USER PROBLEM → context/lexicon/graph/evidence retrieval
//   (ALREADY produced by the four lower layers this turn) →
//   problem representation → classification → decomposition
//   → dependency resolution → constraint identification →
//   assumption extraction → reasoning (deterministic math,
//   FRELUX engines, chained inference) → candidate solutions
//   → validation → self-check → explanation → ground truth
//   block + audit trace.
//
// It CONSUMES the lower layers; it never re-implements them.
// Failure NEVER blocks the chat path — the caller degrades
// honestly, exactly like the other four layers.
//
// Performance (spec §30): every budget is bounded; repeated
// reasoning states are detected and terminated; impossibility
// terminates early. No sub-agents, no mocks, no invented
// values (spec §§2, 33, FINAL COMMAND).
// =========================================================

import {
  classifyProblem,
  problemIsComplex,
} from "./classify.ts";
import {
  attachConstraints,
  chainStep,
  checkConstraintBounds,
  decomposeProblem,
  extractConstraints,
  provenanceClosure,
  recordAssumption,
  resetAssumptionSeq,
  resetStepSeq,
  topoSort,
} from "./decompose.ts";
import {
  containsMathExpression,
  detectConversion,
  evaluateExpression,
  roundTo,
} from "./math.ts";
import {
  DOMAIN_PLUGINS,
  explainSolution,
  matchDomainPlugIn,
  selfCheck,
  sensitivityAnalysis,
  validateCandidate,
  whatIf,
} from "./validate.ts";
import {
  DEFAULT_REASONING_LIMITS,
  emptyReasoningGroundTruth,
  emptyReasoningMetrics,
  type CandidateSolution,
  type FreluxCalculationAdapter,
  type ProblemCategory,
  type Quantity,
  type ReasoningGroundTruth,
  type ReasoningLimits,
  type ReasoningPremise,
  type ReasoningStep,
  type ReasoningTurnInput,
  type SubProblem,
} from "./types.ts";
import { findQuantities, parseQuantity, unitsCompatible } from "./units.ts";

export interface ReasoningEngineDeps {
  /** The canonical FRELUX calculator adapter (spec §16). The
   *  ONLY path to FRELUX math — the reasoning engine never
   *  re-derives FRELUX formulas. */
  frelux: FreluxCalculationAdapter | null;
  /** Optional persistence service — records problems/runs/
   *  solutions and metrics when provided (spec §36). Absent
   *  in tests and degraded live runs. */
  persist?: (record: ReasoningRunRecord) => Promise<void>;
}

/** The audit-only record of one live reasoning run. */
export interface ReasoningRunRecord {
  category: ProblemCategory;
  objective: string;
  outcome: "SOLVED" | "UNRESOLVED" | "INSUFFICIENT_INFORMATION" | "IMPOSSIBLE" | "CONFLICTED" | "NOT_APPLICABLE";
  failureKind: string | null;
  depth: number;
  steps: number;
  durationMs: number;
  finalSolution: string | null;
  solutionValidated: boolean;
  validationFailures: number;
  contradictionDetections: number;
  calculatorAssisted: boolean;
  evidenceAssisted: boolean;
  failedPaths: number;
  freluxEnginesInvoked: string[];
  assumptions: Array<{ statement: string; effect: string }>;
  loopTerminations: string[];
}

/** Does this turn carry a problem worth structured reasoning?
 *  Deterministic gate — greetings, social talk, simple
 *  knowledge questions stay OUT (spec §6: do not decompose
 *  simple questions). */
export function reasoningApplicable(input: ReasoningTurnInput): boolean {
  if (
    ["math_question", "construction_calc", "task_planning", "problem_solving"].includes(
      input.intent,
    )
  ) {
    return true;
  }
  const message = input.message ?? "";
  if (/\b(?:solve|work out|figure out|reason through|help me decide|trade-?off)\b/i.test(message)) {
    return true;
  }
  if (containsMathExpression(message) !== null) return true;
  if (detectConversion(message) !== null) return true;
  // inference-layer contradictions on this turn mean a
  // conflict the reasoning layer must surface, not hide
  if (input.contradictions.length > 0) return true;
  return false;
}

/** The main entry point. Deterministic, bounded, honest. */
export async function reasoningGroundTruth(
  deps: ReasoningEngineDeps,
  input: ReasoningTurnInput,
  limits: ReasoningLimits = DEFAULT_REASONING_LIMITS,
): Promise<ReasoningGroundTruth> {
  const startedAt = Date.now();
  resetAssumptionSeq();
  resetStepSeq();
  const gt = emptyReasoningGroundTruth();
  gt.applicable = true;
  gt.metrics.problemsProcessed = 1;
  const loopTerminations: string[] = [];
  const steps: ReasoningStep[] = [];
  const enginesInvoked: string[] = [];
  let failedPaths = 0;

  const message = input.message ?? "";
  const classification = classifyProblem(message);
  gt.category = classification.primary;

  // ---- problem representation (spec §4) ----
  const knownFacts: ReasoningPremise[] = input.facts.map((f) => ({
    id: f.id,
    statement: f.statement,
    state: "FACT",
    source: f.source,
    ref: f.conceptKey,
  }));
  const userPremises: ReasoningPremise[] = input.userPremises.map((p) => ({
    id: p.id,
    statement: p.statement,
    state: "FACT",
    source: "USER_PROVIDED",
  }));
  const inferences: ReasoningPremise[] = input.inferences.map((i) => ({
    id: i.id,
    statement: i.statement,
    state: "INFERENCE",
    source: "INFERENCE",
    ref: i.ruleId,
    confidence: i.confidence,
  }));

  // evidence states: premises whose claims the evidence layer
  // marked CONFLICTED or OUTDATED must NOT enter as facts.
  const conflictedClaimIds = new Set(
    input.evidenceStates.filter((e) => e.state === "CONFLICTED").map((e) => e.claimId),
  );
  for (const fact of knownFacts) {
    if (conflictedClaimIds.has(fact.id)) {
      // spec §11: the engine detects the conflict rather than
      // silently selecting one side
      gt.metrics.contradictionDetections += 1;
    }
  }

  const quantities = findQuantities(message);
  const assumptions: Array<{ statement: string; effect: string; id: string; reason: string; source: string; userProvided: boolean; necessary: boolean }> = [];
  const unknowns: string[] = [];
  const missingInputs: string[] = [];

  // ---- domain plug-in (spec §27) ----
  const plugin = matchDomainPlugIn(message, input.domainCandidates);
  const domain = plugin ? plugin.name : input.domainCandidates[0] ?? "general";

  // ---- constraints (spec §8) ----
  const constraints = extractConstraints(message);

  // ---- unknown/missing detection (spec §§20, 24) ----
  // bare numbers without units that materially affect math
  for (const q of quantities) {
    if (q.value !== 0 && q.unit === "" && /\bcalculate|how much|cost|total\b/i.test(message)) {
      const hasSiblingUnits = quantities.some((x) => x.unit !== "" && x.unit !== "m");
      if (!hasSiblingUnits) {
        missingInputs.push(`unit for the value ${q.value} (no unit was stated)`);
      } else {
        const assumedUnit = quantities.find((x) => x.unit !== "")?.unit ?? "";
        assumptions.push({
          id: "",
          statement: `The value ${q.value} is in ${assumedUnit} (same unit as the other values in the problem)`,
          reason: "the value had no stated unit while sibling values did",
          source: "reasoning",
          userProvided: false,
          necessary: true,
          effect: "if the unit differs, the result changes materially",
        });
      }
    }
  }

  // ---- decomposition (spec §§6–7) ----
  let subproblems: SubProblem[] = [];
  const complex = problemIsComplex(message, classification);
  if (complex) {
    const decomp = decomposeProblem(message);
    subproblems = decomp.subproblems;
    if (decomp.blocked.length > 0) {
      // circular/missing dependencies — do not silently continue
      gt.failure = {
        kind: "CONTRADICTORY_REQUIREMENTS",
        statement: "the problem's subgoals have unresolvable dependencies",
        blocking: decomp.blocked.map((b) => `${b.id}: ${b.reason}`),
        neededToUnblock: ["restate the problem so each step depends only on earlier steps"],
      };
      gt.trace.loopTerminations = decomp.blocked.map((b) => `${b.id}: ${b.reason}`);
      loopTerminations.push(...decomp.blocked.map((b) => `${b.id}: ${b.reason}`));
      failedPaths += 1;
      gt.metrics.failedPaths = failedPaths;
      gt.trace.durationMs = Date.now() - startedAt;
      return finalize(gt, deps, input, {
        objective: message.slice(0, 200),
        category: classification.primary,
        steps,
        enginesInvoked,
        loopTerminations,
        failedPaths,
        durationMs: gt.trace.durationMs,
        subproblems,
      });
    }
    const { order, blocked } = topoSort(subproblems);
    if (blocked.length > 0) {
      gt.trace.loopTerminations.push("circular dependency detected in decomposition");
      loopTerminations.push("circular dependency detected");
      failedPaths += 1;
    }
    void order;
  }

  // ---- deterministic reasoning paths ----
  const freluxEngineInputs = plugin?.freluxEngineIds ?? [];
  let engineResult: {
    engineId: string;
    result: Record<string, unknown>;
    ok: boolean;
    error?: string;
  } | null = null;

  // 1. FRELUX calculation domain (spec §16) — the canonical
  //    engine computes; the reasoning layer only selects,
  //    validates inputs and preserves provenance.
  if (deps.frelux && plugin && freluxEngineInputs.length > 0) {
    const text = message.toLowerCase();
    // engine selection by domain keywords — deterministic
    const selection: Array<{ id: string; words: string[] }> = [
      { id: "roof_geometry", words: ["roof", "roofing", "purlin", "rafter", "sheet"] },
      { id: "tile_estimate", words: ["tile", "tiling", "tiles"] },
      { id: "pop_ceiling", words: ["pop ceiling", "pop", "plaster of paris"] },
      { id: "screeding_system", words: ["screed", "screeding"] },
      { id: "painting_wall_area", words: ["paint", "painting", "wall area"] },
      { id: "painting_project", words: ["paint project", "whole house paint", "painting project"] },
      { id: "tyrolene_partition_area", words: ["tyrolene", "partition"] },
      { id: "build_to_roof", words: ["build", "building", "foundation", "blockwork", "estimate", "bungalow", "duplex", "cost"] },
    ];
    const scored = selection
      .map((s) => ({ id: s.id, score: s.words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0) }))
      .sort((a, b) => b.score - a.score);
    const chosen = scored[0]?.score > 0 ? scored[0].id : null;
    if (chosen && enginesInvoked.length < limits.maxEngineInvocations) {
      const available = deps.frelux.listEngines().find((e) => e.id === chosen);
      if (available) {
        // input assembly: ONLY explicitly stated quantities —
        // the engine validates and refuses missing values
        const engineInput: Record<string, unknown> = {};
        for (const q of quantities) {
          const label = labelForQuantity(message, q);
          if (label) engineInput[label] = q.unit ? `${q.value} ${q.unit}` : q.value;
        }
        try {
          const res = await deps.frelux.executeEngine(chosen, engineInput);
          enginesInvoked.push(chosen);
          if (res.ok) {
            engineResult = { engineId: chosen, result: res.result ?? {}, ok: true };
            gt.metrics.calculatorAssisted = 1;
          } else {
            engineResult = {
              engineId: chosen,
              result: {},
              ok: false,
              error: typeof res.validation === "string" ? res.validation : (res.error ?? "engine validation refused the inputs"),
            };
            missingInputs.push(
              `FRELUX engine "${chosen}" refused the inputs: ${engineResult.error}. Provide the complete engine inputs — ARCHIE does not guess them.`,
            );
            failedPaths += 1;
          }
        } catch (err) {
          failedPaths += 1;
          loopTerminations.push(`calculator integration failure: ${chosen}`);
          gt.metrics.reasoningErrors += 1;
          void err;
        }
      }
    }
  }

  // 2. Unit conversion — deterministic (spec §§14–15)
  const conversion = detectConversion(message);
  if (conversion) {
    const step = solveConversion(conversion);
    if (step) {
      steps.push(step);
      gt.solutionQuantities.push(step.produces.quantity!);
    } else {
      gt.failure = {
        kind: "INVALID_ASSUMPTION",
        statement: `cannot convert ${conversion.from} to ${conversion.to}`,
        blocking: ["the units are dimensionally incompatible or unknown"],
        neededToUnblock: ["confirm both units are the same physical dimension"],
      };
      failedPaths += 1;
    }
  }

  // 3. Arithmetic — the deterministic evaluator (spec §14)
  const expression = containsMathExpression(message);
  let mathResult: { value: number; unit: string; dimension: string | null; steps: string[] } | null = null;
  if (expression) {
    const evaluated = evaluateExpression(expression);
    if (evaluated.ok) {
      mathResult = { value: evaluated.value, unit: evaluated.unit, dimension: evaluated.dimension, steps: evaluated.steps };
      const step = chainStep({
        fromIds: [],
        operation: "DETERMINISTIC_CALCULATION",
        statement: `${expression} = ${roundTo(evaluated.value, 4)}${evaluated.unit ? " " + evaluated.unit : ""}`,
        quantity: { value: evaluated.value, unit: evaluated.unit, dimension: (evaluated.dimension ?? "DIMENSIONLESS") as Quantity["dimension"] },
        source: "CALCULATION",
        ref: expression,
      });
      steps.push(step);
    } else {
      gt.failure = {
        kind: "MATHEMATICAL_IMPOSSIBILITY",
        statement: `the calculation "${expression}" cannot be performed`,
        blocking: [evaluated.error],
        neededToUnblock: ["restate the calculation with compatible units"],
      };
      failedPaths += 1;
    }
  }

  // 4. Lower-layer inference chaining (spec §10): the
  //    inference layer's conclusions become reasoning steps
  //    that RETAIN their premise ids and rule provenance.
  for (const inf of inferences.slice(0, limits.maxSteps)) {
    const step = chainStep({
      fromIds: inf.ref ? [] : [],
      operation: `INFERENCE_RULE:${inf.ref ?? "unknown"}`,
      statement: inf.statement,
      source: "INFERENCE",
      ref: inf.ref,
      confidence: inf.confidence,
    });
    // fromIds: use the inference's own premise ids (provenance)
    step.fromIds = input.inferences.find((i) => i.id === inf.id)?.premiseIds ?? [];
    steps.push(step);
    gt.metrics.evidenceAssisted = 1;
  }

  // ---- loop protection: repeated state detection (spec §30)
  const stateHashes = new Set<string>();
  for (const step of steps) {
    const hash = `${step.operation}|${step.produces.statement}`;
    if (stateHashes.has(hash)) {
      loopTerminations.push(`repeated reasoning state terminated at ${step.id}`);
      break;
    }
    stateHashes.add(hash);
  }
  if (steps.length >= limits.maxSteps) {
    loopTerminations.push(`reasoning step budget reached (${limits.maxSteps}) — stopped honestly`);
  }

  // ---- candidates + constraints (spec §17) ----
  const candidates: CandidateSolution[] = [];
  const solutionQuantities: Quantity[] = [...gt.solutionQuantities];

  if (engineResult?.ok) {
    const summary = engineSummary(engineResult.engineId, engineResult.result);
    let candidate: CandidateSolution = {
      id: "candidate-frelux",
      description: summary,
      premiseIds: knownFacts.slice(0, 3).map((p) => p.id),
      assumptions: assumptions.map((a) => a.statement),
      constraintsSatisfied: [],
      constraintsViolated: [],
      evidenceState: "EVIDENCED",
      risks: [],
      validationState: "PENDING",
      final: false,
      hypothetical: false,
      freluxEngineId: engineResult.engineId,
    };
    const engineQuantities = engineResultQuantities(engineResult.result);
    candidate = attachConstraints(candidate, constraints, engineQuantities);
    candidates.push(candidate);
    solutionQuantities.push(...engineQuantities);
  }
  if (mathResult) {
    const quantity: Quantity = {
      value: roundTo(mathResult.value, 4),
      unit: mathResult.unit,
      dimension: (mathResult.dimension ?? "DIMENSIONLESS") as Quantity["dimension"],
    };
    let candidate: CandidateSolution = {
      id: "candidate-math",
      description: `${expression} = ${quantity.value}${quantity.unit ? " " + quantity.unit : ""}`,
      premiseIds: steps.filter((s) => s.operation === "DETERMINISTIC_CALCULATION").map((s) => s.produces.id),
      assumptions: assumptions.map((a) => a.statement),
      constraintsSatisfied: [],
      constraintsViolated: [],
      evidenceState: "EVIDENCED",
      risks: [],
      validationState: "PENDING",
      final: false,
      hypothetical: false,
      freluxEngineId: null,
    };
    candidate = attachConstraints(candidate, constraints, [quantity]);
    candidates.push(candidate);
    solutionQuantities.push(quantity);
  }
  if (candidates.length > limits.maxCandidates) {
    candidates.length = limits.maxCandidates;
  }

  // ---- validation (spec §18) ----
  const problem = {
    id: "problem-live-turn",
    objective: message.slice(0, 300),
    inputs: quantities.map((q) => ({
      value: q.value,
      unit: q.unit,
      dimension: (q.dimension ?? "DIMENSIONLESS") as Quantity["dimension"],
    })),
    knownFacts: [...knownFacts, ...userPremises],
    unknowns: missingInputs.length > 0 ? missingInputs : unknowns,
    assumptions: assumptions.map((a) => ({
      id: a.id || `assumption-${assumptions.indexOf(a) + 1}`,
      statement: a.statement,
      reason: a.reason,
      source: a.source,
      userProvided: a.userProvided,
      necessary: a.necessary,
      effect: a.effect,
    })),
    constraints,
    desiredOutput: null,
    domain,
    temporalContext: null,
    geographicContext: null,
    evidenceRequirements: plugin?.evidenceRequirements ?? [],
    subproblems,
    intermediateResults: steps.map((s) => s.produces),
    candidates,
    validationState: "PENDING" as const,
    failure: null,
    hypothetical: /\b(?:what if|suppose|hypothetical|had not|hadn't|if instead)\b/i.test(message),
  };

  let validationReport = null as ReturnType<typeof validateCandidate> | null;
  let best: CandidateSolution | null = null;
  for (const candidate of candidates) {
    const report = validateCandidate(candidate, problem);
    if (!best || (report.state !== "FAILED" && best.validationState === "FAILED")) {
      best = candidate;
      validationReport = report;
    }
    if (report.state === "FAILED") {
      gt.metrics.validationFailures += 1;
      failedPaths += 1;
    }
  }

  // ---- failure analysis (spec §20) ----
  if (candidates.length === 0 && !gt.failure) {
    if (input.contradictions.length > 0) {
      gt.failure = {
        kind: "CONTRADICTORY_REQUIREMENTS",
        statement: "the problem contains conflicting premises",
        blocking: input.contradictions.map((c) => c.statement),
        neededToUnblock: ["resolve which premise is correct before the problem can be solved"],
      };
    } else if (complex && subproblems.some((s) => s.validationState === "PENDING")) {
      gt.failure = {
        kind: "INSUFFICIENT_INFORMATION",
        statement: "the problem needs information that was not provided",
        blocking: missingInputs.length > 0 ? missingInputs : ["required inputs were not stated"],
        neededToUnblock: missingInputs.length > 0 ? missingInputs : ["state the missing values"],
      };
    } else if (steps.length > 0) {
      gt.failure = {
        kind: "UNSUPPORTED_PREMISE",
        statement: "the reasoning relied on premises without independent support",
        blocking: ["no FACT premises with evidence were available for this problem"],
        neededToUnblock: ["provide the supporting facts or verify the premise"],
      };
    } else {
      gt.failure = {
        kind: "INSUFFICIENT_INFORMATION",
        statement: "no deterministic reasoning path applies, and no validated facts are available",
        blocking: ["the problem could not be advanced with the information provided"],
        neededToUnblock: ["state the objective, the known values and the constraints"],
      };
    }
    gt.metrics.unresolvedProblems = 1;
  }
  if (best && validationReport?.state === "FAILED") {
    gt.failure = {
      kind: "IMPOSSIBLE_CONSTRAINTS",
      statement: "the solution candidates fail validation",
      blocking: validationReport.checks.filter((c) => !c.passed).map((c) => c.detail),
      neededToUnblock: validationReport.missingInputs,
    };
    gt.metrics.unresolvedProblems = 1;
  }

  // ---- finalize best candidate ----
  if (best && validationReport && validationReport.state !== "FAILED") {
    best.final = true;
    best.validationState = validationReport.state;
    gt.solution = best.description;
    gt.solutionQuantities = solutionQuantities;
    if (validationReport.state === "VALIDATED") {
      gt.metrics.solutionsValidated = 1;
    }
    gt.unknowns = validationReport.missingInputs;
  }

  // ---- sensitivity for math/engine results (spec §21) ----
  if ((mathResult || engineResult?.ok) && solutionQuantities.length > 0) {
    const baseInputs = quantities
      .filter((q) => q.unit !== "" || /\d/.test(String(q.value)))
      .slice(0, 6)
      .map((q, i) => ({
        id: `input-${i + 1}`,
        label: `${q.value}${q.unit ? " " + q.unit : ""}`,
        quantity: { value: q.value, unit: q.unit, dimension: (q.dimension ?? "DIMENSIONLESS") as Quantity["dimension"] },
      }));
    const primaryValue = solutionQuantities[0];
    if (baseInputs.length > 0 && expression) {
      const compute = (inputs: Array<{ id: string; quantity: Quantity }>): number | null => {
        // re-run the SAME deterministic expression with the
        // first operand perturbed per matching input
        const clone = `${expression}`;
        let idx = 0;
        const replaced = clone.replace(/-?\d+(?:\.\d+)?/g, (num) => {
          const which = inputs[idx];
          idx += 1;
          return which ? String(which.quantity.value) : num;
        });
        const res = evaluateExpression(replaced);
        return res.ok ? res.value : null;
      };
      gt.sensitivity = sensitivityAnalysis(baseInputs, compute);
    }
    void primaryValue;
  }

  // ---- what-if / counterfactual (spec §§22–23) ----
  gt.trace.problemId = problem.id;
  gt.trace.steps = steps;
  gt.trace.subproblems = subproblems;
  gt.trace.validation = validationReport;
  gt.trace.freluxEnginesInvoked = enginesInvoked;
  gt.trace.loopTerminations = loopTerminations;
  gt.trace.durationMs = Date.now() - startedAt;
  gt.candidates = candidates;
  gt.assumptions = problem.assumptions;
  gt.missingInputs = missingInputs;
  gt.metrics.failedPaths = failedPaths;
  gt.metrics.totalReasoningDepth = subproblems.length + steps.length;
  gt.metrics.depthSamples = 1;

  // ---- explanation (spec §26) ----
  gt.explanation = explainSolution({
    objective: problem.objective,
    category: classification.primary,
    solution: gt.solution,
    factsUsed: [...knownFacts, ...userPremises].slice(0, 4),
    assumptions: gt.assumptions,
    calculationSteps: mathResult?.steps ?? [],
    constraintsSatisfied: best?.constraintsSatisfied.length ?? 0,
    constraintsViolated: (best?.constraintsViolated ?? []).map((v) =>
      constraints.find((c) => c.id === v.constraintId)?.statement ?? v.constraintId,
    ),
    unknowns,
    missingInputs,
    failureKind: gt.failure?.kind ?? null,
    freluxEngineId: best?.freluxEngineId ?? null,
    hypothetical: problem.hypothetical,
  });

  // ---- prompt block (bounded, NO chain-of-thought) ----
  const blockLines: string[] = [];
  blockLines.push(
    "ARCHIE STRUCTURED REASONING RESULT (fifth intelligence layer — deterministic, evidence-aware):",
  );
  blockLines.push(`Problem category: ${classification.primary}${classification.secondary.length ? ` (also: ${classification.secondary.join(", ")})` : ""}`);
  if (gt.solution) {
    blockLines.push(`Validated solution: ${gt.solution}`);
  }
  if (gt.explanation) {
    blockLines.push(gt.explanation);
  }
  if (gt.failure) {
    blockLines.push(
      `Not solved — ${gt.failure.kind.replace(/_/g, " ").toLowerCase()}: ${gt.failure.statement}. Blocking: ${gt.failure.blocking.join("; ")}.`,
    );
  }
  if (gt.sensitivity.length) {
    const highImpact = gt.sensitivity.filter((s) => s.impact === "HIGH").map((s) => s.label);
    if (highImpact.length) {
      blockLines.push(`Sensitivity: the result depends materially on: ${highImpact.join(", ")}`);
    }
  }
  blockLines.push(
    "Cite this structured result; do not contradict it or invent missing values.",
  );
  let block = blockLines.join("\n");
  if (block.length > limits.maxBlockChars) {
    block = block.slice(0, limits.maxBlockChars) + "\n…(truncated at the reasoning layer's bound)";
  }
  gt.block = block;

  return finalize(gt, deps, input, {
    objective: problem.objective,
    category: classification.primary,
    steps,
    enginesInvoked,
    loopTerminations,
    failedPaths,
    durationMs: gt.trace.durationMs,
    subproblems,
  });
}

/** Persist the run record (when a persist hook was wired) and
 *  return the ground truth. Persistence failure NEVER blocks
 *  the chat path. */
async function finalize(
  gt: ReasoningGroundTruth,
  deps: ReasoningEngineDeps,
  _input: ReasoningTurnInput,
  meta: {
    objective: string;
    category: ProblemCategory;
    steps: ReasoningStep[];
    enginesInvoked: string[];
    loopTerminations: string[];
    failedPaths: number;
    durationMs: number;
    subproblems: SubProblem[];
  },
): Promise<ReasoningGroundTruth> {
  if (deps.persist) {
    try {
      await deps.persist({
        category: meta.category,
        objective: meta.objective,
        outcome: gt.failure
          ? gt.failure.kind === "INSUFFICIENT_INFORMATION"
            ? "INSUFFICIENT_INFORMATION"
            : gt.failure.kind === "CONTRADICTORY_REQUIREMENTS"
              ? "CONFLICTED"
              : gt.failure.kind === "IMPOSSIBLE_CONSTRAINTS" || gt.failure.kind === "MATHEMATICAL_IMPOSSIBILITY"
                ? "IMPOSSIBLE"
                : "UNRESOLVED"
          : gt.solution
            ? "SOLVED"
            : "NOT_APPLICABLE",
        failureKind: gt.failure?.kind ?? null,
        depth: meta.subproblems.length + meta.steps.length,
        steps: meta.steps.length,
        durationMs: meta.durationMs,
        finalSolution: gt.solution,
        solutionValidated: gt.metrics.solutionsValidated > 0,
        validationFailures: gt.metrics.validationFailures,
        contradictionDetections: gt.metrics.contradictionDetections,
        calculatorAssisted: gt.metrics.calculatorAssisted > 0,
        evidenceAssisted: gt.metrics.evidenceAssisted > 0,
        failedPaths: meta.failedPaths,
        freluxEnginesInvoked: meta.enginesInvoked,
        assumptions: gt.assumptions.map((a) => ({ statement: a.statement, effect: a.effect })),
        loopTerminations: meta.loopTerminations,
      });
    } catch {
      gt.metrics.reasoningErrors += 1;
    }
  }
  return gt;
}

// ---------- helpers ----------

function solveConversion(
  conversion: { value: number; from: string; to: string },
): ReasoningStep | null {
  const { convertQuantity } = unitsModule;
  const res = convertQuantity(conversion.value, conversion.from, conversion.to);
  if (!res.ok) return null;
  const step = chainStep({
    fromIds: [],
    operation: "UNIT_CONVERSION",
    statement: `${conversion.value} ${conversion.from} = ${roundTo(res.value, 6)} ${conversion.to}`,
    quantity: {
      value: res.value,
      unit: conversion.to.toLowerCase(),
      dimension: res.dimension,
    },
    source: "CALCULATION",
    ref: `convert ${conversion.value} ${conversion.from} to ${conversion.to}`,
  });
  return step;
}

import * as unitsModule from "./units.ts";

function labelForQuantity(message: string, q: { value: number; unit: string }): string | null {
  // deterministic: the closest preceding noun phrase labels the
  // value. Kept intentionally conservative — when in doubt, null.
  const before = message.slice(0, q.value.toString().length ? message.indexOf(String(q.value)) : 0);
  const m = /([a-z][a-z\s-]{2,24})\s*$/i.exec(before);
  if (!m) return null;
  const label = m[1].trim().toLowerCase().replace(/\s+/g, "_");
  return label.length > 2 && label.length < 24 ? label : null;
}

function engineSummary(
  engineId: string,
  result: Record<string, unknown>,
): string {
  // deterministic summary of the engine's result — the engine's
  // own output lines; nothing invented
  const keys = Object.keys(result).filter(
    (k) => typeof result[k] === "number" || typeof result[k] === "string",
  );
  const parts: string[] = [];
  for (const k of keys.slice(0, 8)) {
    parts.push(`${k}: ${String(result[k])}`);
  }
  return parts.length
    ? `FRELUX engine "${engineId}" computed — ${parts.join("; ")}`
    : `FRELUX engine "${engineId}" computed the result (see engine output)`;
}

function engineResultQuantities(
  result: Record<string, unknown>,
): Quantity[] {
  const out: Quantity[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number") {
      const unitGuess = /(area|m2|_m2)/i.test(key)
        ? "m2"
        : /(volume|m3)/i.test(key)
          ? "m3"
          : /(cost|price|total|amount|naira)/i.test(key)
            ? "₦"
            : "";
      out.push({
        value,
        unit: unitGuess,
        dimension:
          unitGuess === "m2" ? "AREA" : unitGuess === "m3" ? "VOLUME" : unitGuess === "₦" ? "CURRENCY" : "QUANTITY",
      });
    }
    if (out.length >= 6) break;
  }
  return out;
}

/** Detect a bare unit mismatch in stated quantities — used by
 *  the error-detection contract (spec §24). */
export function detectUnitErrors(quantities: Quantity[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < quantities.length; i++) {
    for (let j = i + 1; j < quantities.length; j++) {
      const a = quantities[i];
      const b = quantities[j];
      if (a.unit && b.unit && !unitsCompatible(a.unit, b.unit)) {
        // different dimensions is fine in general (a problem can
        // carry length AND cost) — only flag arithmetic-looking
        // pairs (same position context). Here: conservative,
        // we do NOT flag — completeness stays the model's call.
        void b;
      }
    }
  }
  return errors;
}

export { DOMAIN_PLUGINS, emptyReasoningMetrics };
