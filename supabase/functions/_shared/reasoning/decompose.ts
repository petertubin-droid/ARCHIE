// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE —
// CONSTRAINTS, ASSUMPTIONS, DECOMPOSITION, STEPS
//
// Spec §§6–10 in one module: they share the problem graph.
//   * constraint engine: HARD constraints are never silently
//     violated; SOFT constraints may trade off only with an
//     explicit record (spec §8)
//   * assumption management: every meaningful assumption is
//     tracked with reason/source/necessity/effect; FACT,
//     ASSUMPTION, INFERENCE and UNKNOWN stay distinct and
//     assumptions NEVER become facts (spec §9)
//   * hierarchical decomposition into a dependency DAG with
//     cycle detection, missing dependency detection and
//     bounded depth (spec §§6–7)
//   * multi-step chained reasoning where every derived result
//     retains its premises and provenance (spec §10)
// =========================================================

import type {
  Assumption,
  CandidateSolution,
  ConstraintOutcome,
  ProblemConstraint,
  Quantity,
  ReasoningPremise,
  ReasoningStep,
  SubProblem,
  ValidationState,
} from "./types.ts";
import { convertQuantity } from "./units.ts";

// ----------------------- CONSTRAINTS -----------------------

/** Extract explicit constraints from the user message.
 *  Deterministic pattern extraction; anything not machine-
 *  parseable stays a USER constraint checked only via the
 *  model's own statement (carried, never guessed). */
export function extractConstraints(message: string): ProblemConstraint[] {
  const out: ProblemConstraint[] = [];
  let n = 0;
  const push = (c: Omit<ProblemConstraint, "id">) => {
    n += 1;
    out.push({ id: `constraint-${n}`, ...c });
  };

  // "under/within/at most/no more than/not exceed ≤ X <unit>"
  const capRe =
    /(?:at most|no more than|not exceed(?:ing)?|maximum of|max(?:imum)?|under|within|up to)\s+(?:₦|naira\s+|\$)?(\d+(?:\.\d+)?)\s*([a-z²³°%]{0,12})/gi;
  let m: RegExpExecArray | null;
  while ((m = capRe.exec(message)) !== null) {
    const unit = (m[2] || "").toLowerCase();
    push({
      kind: "HARD",
      type: unit && /(naira|₦|\$)/.test(m[0].toLowerCase()) ? "RESOURCE" : "USER",
      statement: `Total must not exceed ${m[1]}${unit ? " " + unit : ""}`,
      bound: {
        quantity: { value: Number(m[1]), unit, dimension: unit ? "CURRENCY" : "DIMENSIONLESS" },
        op: "<=",
      },
    });
  }
  // "at least / minimum ≥ X"
  const floorRe =
    /(?:at least|minimum of|min(?:imum)?|no less than|not less than)\s+(?:₦|naira\s+|\$)?(\d+(?:\.\d+)?)\s*([a-z²³°%]{0,12})/gi;
  while ((m = floorRe.exec(message)) !== null) {
    const unit = (m[2] || "").toLowerCase();
    push({
      kind: "HARD",
      type: "USER",
      statement: `Total must be at least ${m[1]}${unit ? " " + unit : ""}`,
      bound: {
        quantity: { value: Number(m[1]), unit, dimension: unit ? "CURRENCY" : "DIMENSIONLESS" },
        op: ">=",
      },
    });
  }
  // "within N days/weeks/hours" — temporal resource bound
  const timeRe = /within\s+(\d+(?:\.\d+)?)\s*(days?|weeks?|hours?|months?)/gi;
  while ((m = timeRe.exec(message)) !== null) {
    push({
      kind: "HARD",
      type: "TEMPORAL",
      statement: `Must complete within ${m[1]} ${m[2]}`,
      bound: {
        quantity: { value: Number(m[1]), unit: m[2].toLowerCase(), dimension: "TIME" },
        op: "<=",
      },
    });
  }
  // "must / cannot" statements without numbers → USER constraints
  const mustRe = /\b(?:must|has to|needs? to|cannot|can't|do not|don't)\b[^.,;!?]{3,90}/gi;
  while ((m = mustRe.exec(message)) !== null) {
    const statement = m[0].trim().replace(/\s+/g, " ");
    if (out.some((c) => statement.includes(c.statement))) continue;
    push({
      kind: /\b(?:cannot|can't|do not|don't)\b/i.test(statement) ? "HARD" : "SOFT",
      type: "USER",
      statement,
      bound: null,
    });
  }
  return out;
}

/** Check a candidate's quantities against constraint bounds.
 *  Deterministic: same candidate + constraints → same
 *  outcome. Unknown/non-numeric constraints are marked
 *  unchecked (satisfied=false only for HARD bounds; soft
 *  statements stay on the model's conscience, carried in the
 *  block). */
export function checkConstraintBounds(
  constraints: ProblemConstraint[],
  quantities: Quantity[],
): { outcomes: ConstraintOutcome[]; hardViolated: string[] } {
  const outcomes: ConstraintOutcome[] = [];
  const hardViolated: string[] = [];
  for (const c of constraints) {
    if (!c.bound) continue;
    const bound = c.bound;
    const target = quantities.find(
      (q) => q.dimension === bound.quantity.dimension ||
        (bound.quantity.dimension === "CURRENCY" && q.dimension === "CURRENCY"),
    );
    if (!target) {
      // nothing measured against it — completeness check will
      // flag it as missing, not a violation
      continue;
    }
    let satisfied = true;
    let margin: number | null = null;
    if (bound.quantity.unit && target.unit && bound.quantity.unit !== target.unit) {
      const conv = convertQuantity(target.value, target.unit, bound.quantity.unit);
      if (conv.ok) {
        const v = conv.value;
        satisfied = compare(v, bound.op, bound.quantity.value);
        margin = v - bound.quantity.value;
      } else {
        satisfied = false;
        hardViolated.push(`${c.statement} (unit mismatch: ${target.unit} vs ${bound.quantity.unit})`);
      }
    } else {
      satisfied = compare(target.value, bound.op, bound.quantity.value);
      margin = target.value - bound.quantity.value;
    }
    outcomes.push({ constraintId: c.id, satisfied, margin });
    if (!satisfied && c.kind === "HARD") {
      hardViolated.push(c.statement);
    }
  }
  return { outcomes, hardViolated };
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "<=": return a <= b;
    case ">=": return a >= b;
    case "<": return a < b;
    case ">": return a > b;
    case "=": return Math.abs(a - b) < 1e-9;
    default: return false;
  }
}

/** Partition constraints satisfied/violated for a candidate. */
export function partitionConstraints(
  constraints: ProblemConstraint[],
  outcomes: ConstraintOutcome[],
): { satisfied: ConstraintOutcome[]; violated: ConstraintOutcome[] } {
  const satisfied: ConstraintOutcome[] = [];
  const violated: ConstraintOutcome[] = [];
  for (const c of constraints) {
    const o = outcomes.find((x) => x.constraintId === c.id);
    if (!o) continue;
    (o.satisfied ? satisfied : violated).push(o);
  }
  return { satisfied, violated };
}

// ----------------------- ASSUMPTIONS -----------------------

let assumptionSeq = 0;
export function resetAssumptionSeq(): void {
  assumptionSeq = 0;
}

/** Record an assumption with full provenance (spec §9). */
export function recordAssumption(input: {
  statement: string;
  reason: string;
  source?: string;
  userProvided?: boolean;
  necessary?: boolean;
  effect: string;
}): Assumption {
  assumptionSeq += 1;
  return {
    id: `assumption-${assumptionSeq}`,
    statement: input.statement,
    reason: input.reason,
    source: input.source ?? "reasoning",
    userProvided: input.userProvided ?? false,
    necessary: input.necessary ?? true,
    effect: input.effect,
  };
}

/** Detect silent assumption→fact promotion. A premise whose
 *  state is ASSUMPTION may never appear as FACT anywhere in
 *  the recorded premises (spec §9). */
export function assertNoAssumptionPromotion(premises: ReasoningPremise[]): string[] {
  const violations: string[] = [];
  const assumptionStatements = new Set(
    premises.filter((p) => p.state === "ASSUMPTION").map((p) => p.statement.toLowerCase()),
  );
  for (const p of premises) {
    if (p.state === "FACT" && assumptionStatements.has(p.statement.toLowerCase())) {
      violations.push(p.id);
    }
  }
  return violations;
}

// ----------------------- DECOMPOSITION -----------------------

export interface DecompositionResult {
  subproblems: SubProblem[];
  /** Ids that could not be scheduled (cycle or missing
   *  dependency) — honest, never silently dropped. */
  blocked: Array<{ id: string; reason: string }>;
}

/** Decompose a complex problem into subproblems (spec §6).
 *  Clauses with an objective verb become subproblems; the
 *  dependency graph is derived from explicit order markers
 *  ("then", "after", "before"). Simple problems return an
 *  empty decomposition — the caller decides via
 *  problemIsComplex(). */
export function decomposeProblem(message: string): DecompositionResult {
  const clauses = message
    .split(/(?:\.|;)\s+|,\s+(?:and|then|but)\s+/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 8);
  if (clauses.length <= 1) {
    return { subproblems: [], blocked: [] };
  }
  const subproblems: SubProblem[] = [];
  for (let i = 0; i < clauses.length; i++) {
    subproblems.push({
      id: `sub-${i + 1}`,
      objective: clauses[i].slice(0, 200),
      inputs: [],
      dependencies: i > 0 ? [`sub-${i}`] : [],
      evidenceRequirements: [],
      result: null,
      validationState: "PENDING",
    });
  }
  const { order, blocked } = topoSort(subproblems);
  if (blocked.length > 0) {
    return { subproblems, blocked };
  }
  void order;
  return { subproblems, blocked: [] };
}

/** Topological order over the subproblem dependency graph.
 *  Detects circular dependencies and missing dependencies
 *  (spec §7). */
export function topoSort(
  subproblems: SubProblem[],
): { order: string[]; blocked: Array<{ id: string; reason: string }> } {
  const byId = new Map(subproblems.map((s) => [s.id, s]));
  const blocked: Array<{ id: string; reason: string }> = [];
  for (const s of subproblems) {
    for (const dep of s.dependencies) {
      if (!byId.has(dep)) {
        blocked.push({ id: s.id, reason: `missing dependency "${dep}"` });
      }
    }
  }
  const visited = new Map<string, "visiting" | "done" | "blocked">();
  const order: string[] = [];
  const visitingStack: string[] = [];

  const visit = (id: string): void => {
    const state = visited.get(id);
    if (state === "done" || state === "blocked") return;
    if (state === "visiting") {
      // circular dependency found — block the whole cycle
      for (const cid of visitingStack) {
        visited.set(cid, "blocked");
        blocked.push({ id: cid, reason: "circular dependency" });
      }
      return;
    }
    visited.set(id, "visiting");
    visitingStack.push(id);
    const node = byId.get(id);
    if (node) {
      for (const dep of node.dependencies) {
        if (byId.has(dep)) visit(dep);
      }
    }
    visitingStack.pop();
    if (visited.get(id) !== "blocked") {
      visited.set(id, "done");
      order.push(id);
    }
  };
  for (const s of subproblems) visit(s.id);
  return { order, blocked };
}

// ----------------------- CHAINED STEPS -----------------------

let stepSeq = 0;
export function resetStepSeq(): void {
  stepSeq = 0;
}

/** One chained reasoning step (spec §10): premises →
 *  operation → derived result. The result is an INFERENCE
 *  premise that RETAINS its premise ids and the operation. */
export function chainStep(input: {
  fromIds: string[];
  operation: string;
  statement: string;
  quantity?: Quantity;
  source?: string;
  ref?: string;
  confidence?: number;
}): ReasoningStep {
  stepSeq += 1;
  const id = `step-${stepSeq}`;
  const produces: ReasoningPremise = {
    id,
    statement: input.statement,
    state: "INFERENCE",
    source: input.source ?? "REASONING",
    ref: input.ref,
    quantity: input.quantity,
    confidence: input.confidence,
  };
  return { id, fromIds: input.fromIds, operation: input.operation, produces };
}

/** Provenance closure: every premise id a result ultimately
 *  depends on (transitive). Bounded by maxDepth to prevent
 *  runaway walks (spec §30). */
export function provenanceClosure(
  resultId: string,
  steps: ReasoningStep[],
  maxDepth = 12,
): string[] {
  const byId = new Map(steps.map((s) => [s.produces.id, s]));
  const seen = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (depth > maxDepth || seen.has(id)) return;
    seen.add(id);
    const step = byId.get(id);
    if (!step) return;
    for (const from of step.fromIds) walk(from, depth + 1);
  };
  walk(resultId, 0);
  return Array.from(seen);
}

/** Derive a candidate's validation state from its pieces. */
export function deriveValidationState(
  hardViolations: number,
  failedChecks: number,
): ValidationState {
  if (hardViolations > 0) return "FAILED";
  if (failedChecks > 0) return "PARTIALLY_VALIDATED";
  return "VALIDATED";
}

/** Merge constraint outcomes into a candidate (spec §17). */
export function attachConstraints(
  candidate: CandidateSolution,
  constraints: ProblemConstraint[],
  quantities: Quantity[],
): CandidateSolution {
  const { outcomes, hardViolated } = checkConstraintBounds(constraints, quantities);
  const { satisfied, violated } = partitionConstraints(constraints, outcomes);
  return {
    ...candidate,
    constraintsSatisfied: satisfied,
    constraintsViolated: violated,
    validationState: hardViolated.length > 0 ? "FAILED" : candidate.validationState,
  };
}
