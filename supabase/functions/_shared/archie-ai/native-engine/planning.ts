// =========================================================
// ARCHIE NATIVE ENGINE — PLANNING & DECISION-MAKING
//
// Real means-ends planning: goals are matched against
// operators (each a real ARCHIE capability with preconditions
// and effects), subgoals are decomposed, plans are ranked by
// cost. Missing prerequisites are REPORTED honestly — a plan
// is never presented as executable when it is not.
// =========================================================

import type {
  Fact,
  FactPattern,
  Operator,
  Plan,
  PlanAlternative,
  PlanStep,
} from "./types.ts";
import { FactStore } from "./knowledge.ts";

function holds(store: FactStore, pattern: FactPattern): boolean {
  return store.query(pattern).length > 0;
}

function patternLabel(pattern: FactPattern): string {
  return `${pattern.subject ?? "?"} ${pattern.predicate ?? "?"}`;
}

/** ARCHIE's operator library — real capabilities. Each maps
 *  to an executable ARCHIE subsystem. */
export const DEFAULT_OPERATORS: Operator[] = [
  {
    id: "op_answer_from_knowledge",
    description: "Answer a knowledge question from validated stored knowledge",
    achieves: { subject: "question", predicate: "answered" },
    preconditions: [{ subject: "knowledge", predicate: "available" }],
    effects: [],
    cost: 1,
  },
  {
    id: "op_reason_over_facts",
    description: "Run rule-based inference to derive new knowledge",
    achieves: { subject: "goal", predicate: "derived" },
    preconditions: [{ subject: "rules", predicate: "loaded" }],
    effects: [],
    cost: 2,
  },
  {
    id: "op_teach_from_owner",
    description:
      "Owner teaches the missing knowledge directly (retained with provenance)",
    achieves: { subject: "knowledge", predicate: "owner-provided" },
    preconditions: [{ subject: "owner", predicate: "available" }],
    effects: [
      { subject: "knowledge", predicate: "available" } as unknown as Fact,
    ],
    cost: 1,
  },
  {
    id: "op_web_research",
    description: "Research the open web for missing knowledge (cross-checked)",
    achieves: { subject: "knowledge", predicate: "researched" },
    preconditions: [{ subject: "network", predicate: "authorized" }],
    effects: [
      { subject: "knowledge", predicate: "available" } as unknown as Fact,
    ],
    cost: 5,
  },
  {
    id: "op_analyze_code",
    description: "Run static code analysis on a source file",
    achieves: { subject: "code", predicate: "analyzed" },
    preconditions: [{ subject: "code", predicate: "source-available" }],
    effects: [],
    cost: 2,
  },
  {
    id: "op_propose_owner_action",
    description:
      "Compose a proposal for owner authorization (never auto-executes)",
    achieves: { subject: "action", predicate: "proposed" },
    preconditions: [{ subject: "action", predicate: "justified" }],
    effects: [],
    cost: 1,
  },
];

/**
 * GOAL-SCOPED PLANNING OPERATORS (audit Phase 3.2, 2026-09-11).
 *
 * Before this, every task_planning request resolved the fixed
 * goal predicate "planned" and produced the same single canned
 * step regardless of what was asked. These operators use the
 * `$goal` subject: at plan() time the engine supplies the goal
 * subject DERIVED FROM THE REQUEST ("wedding reception",
 * "roofing project for my bungalow"), and the planner
 * substitutes it — so the chain is about what was actually
 * asked, and the dependency chain below is real means-ends
 * decomposition:
 *
 *   inventory → gaps → knowledge (owner-teach | research)
 *              → quantities (estimate | confirm) → sequence
 *              → draft → propose
 *
 * Every operator maps to a real ARCHIE subsystem (the engine
 * executes the bound ones and reports honest step results —
 * see engine.executePlanSteps). Consequential steps stop at
 * PROPOSE: execution stays owner-gated, permanently.
 */
export const PLANNING_OPERATORS: Operator[] = [
  {
    id: "op_inventory_prerequisites",
    description: "Inventory what ARCHIE already knows about the goal",
    achieves: { subject: "$goal", predicate: "prerequisites-mapped" },
    preconditions: [{ subject: "$goal", predicate: "scope-defined" }],
    effects: [],
    cost: 1,
  },
  {
    id: "op_identify_gaps",
    description: "Identify knowledge gaps for the goal",
    achieves: { subject: "$goal", predicate: "gaps-identified" },
    preconditions: [{ subject: "$goal", predicate: "prerequisites-mapped" }],
    effects: [],
    cost: 1,
  },
  {
    id: "op_owner_teach_goal_knowledge",
    description:
      "Owner teaches the missing goal knowledge (retained with provenance)",
    achieves: { subject: "$goal", predicate: "knowledge-owner-provided" },
    preconditions: [
      { subject: "$goal", predicate: "gaps-identified" },
      { subject: "owner", predicate: "available" },
    ],
    effects: [
      { subject: "$goal", predicate: "knowledge-available" } as unknown as Fact,
    ],
    cost: 1,
  },
  {
    id: "op_research_goal_knowledge",
    description:
      "Research the open web for the missing goal knowledge (cross-checked, candidate only)",
    achieves: { subject: "$goal", predicate: "knowledge-researched" },
    preconditions: [
      { subject: "$goal", predicate: "gaps-identified" },
      { subject: "network", predicate: "authorized" },
    ],
    effects: [
      { subject: "$goal", predicate: "knowledge-available" } as unknown as Fact,
    ],
    cost: 5,
  },
  {
    id: "op_sequence_tasks",
    description: "Order the goal's tasks by dependency",
    achieves: { subject: "$goal", predicate: "tasks-sequenced" },
    preconditions: [
      { subject: "$goal", predicate: "knowledge-available" },
      { subject: "$goal", predicate: "inputs-quantified" },
    ],
    effects: [],
    cost: 2,
  },
  {
    id: "op_draft_plan",
    description: "Draft the plan document from the sequenced tasks",
    achieves: { subject: "$goal", predicate: "plan-drafted" },
    preconditions: [{ subject: "$goal", predicate: "tasks-sequenced" }],
    effects: [],
    cost: 1,
  },
  {
    id: "op_propose_execution",
    description:
      "Present the plan for owner authorization (never auto-executes)",
    achieves: { subject: "$goal", predicate: "planned" },
    preconditions: [{ subject: "$goal", predicate: "plan-drafted" }],
    effects: [],
    cost: 1,
  },
];

export class Planner {
  /** REMEDIATION batch 5 (fix 12): optional backward-chain
   *  probe. A precondition that is not HELD by the store but
   *  is PROVABLY derivable (backward search over rule chains)
   *  resolves as simulated progress with a proof note — the
   *  same honesty contract as operator effects: no store
   *  writes, and genuinely underivable preconditions still
   *  land in the gapReport and fail the plan. */
  constructor(
    private facts: FactStore,
    private operators: Operator[],
    private derivable?: (pattern: FactPattern) => boolean,
  ) {}

  operatorCount(): number {
    return this.operators.length;
  }

  /** Planner step semantics (2026-09-13 re-assessment, gap 1):
   *  read-only access for step EXECUTION — the engine's gap
   *  analysis walks operator preconditions/effects; it never
   *  mutates the library. */
  operatorList(): readonly Operator[] {
    return this.operators;
  }

  /** Means-ends analysis: achieve the goal by selecting an
   *  operator, recursively resolving missing preconditions.
   *
   *  Phase 3.2: the goal may be a full PATTERN with a subject
   *  derived from the actual request — operators written with
   *  the `$goal` subject are instantiated for that goal, so
   *  plans are about what was asked, never canned templates. */
  plan(goal: string | FactPattern, depth = 8): Plan {
    const steps: PlanStep[] = [];
    const gapReport: string[] = [];
    const resolved = new Set<string>();

    const goalPattern: FactPattern =
      typeof goal === "string" ? { predicate: goal } : { ...goal };
    const goalSubject = goalPattern.subject;

    // Instantiate $goal-scoped operators for THIS goal.
    const substPattern = (p: FactPattern): FactPattern =>
      p.subject === "$goal" && goalSubject !== undefined
        ? { ...p, subject: goalSubject }
        : p;
    const operators = this.operators.map((op) => ({
      ...op,
      achieves: substPattern(op.achieves),
      preconditions: op.preconditions.map(substPattern),
      effects: op.effects.map((f) =>
        f.subject === "$goal" && goalSubject !== undefined
          ? ({ ...f, subject: goalSubject } as Fact)
          : f,
      ),
    }));

    const resolve = (pattern: FactPattern, d: number): boolean => {
      if (holds(this.facts, pattern) || resolved.has(patternLabel(pattern))) {
        return true;
      }
      // REMEDIATION batch 5 (fix 12): not held as a fact — but
      // provable by the backward chain? Then a future forward
      // pass WILL hold it: resolve as simulated progress with
      // the proof recorded in the step, never a store write.
      if (this.derivable?.(pattern)) {
        steps.push({
          operatorId: "inference",
          achieves: `derive ${patternLabel(pattern)} by rule chain`,
          satisfies: patternLabel(pattern),
          missingPreconditions: [],
        });
        resolved.add(patternLabel(pattern));
        return true;
      }
      if (d <= 0) {
        gapReport.push(
          `missing: ${patternLabel(pattern)} (planning depth exhausted)`,
        );
        return false;
      }
      const candidates = operators
        .filter(
          (op) => matchesAchieves(op, pattern) || effectsMatch(op, pattern),
        )
        .sort((a, b) => a.cost - b.cost);
      if (candidates.length === 0) {
        gapReport.push(
          `missing: ${patternLabel(pattern)} — no registered operator achieves this yet`,
        );
        return false;
      }
      for (const op of candidates) {
        const preconditionsMet = op.preconditions.every((pre) =>
          resolve(pre, d - 1),
        );
        if (preconditionsMet) {
          steps.push({
            operatorId: op.id,
            achieves: op.description,
            satisfies: patternLabel(pattern),
            missingPreconditions: [],
          });
          resolved.add(patternLabel(pattern));
          // Audit fix 2026-09-11 (planner effect chaining):
          // a selected operator's EFFECTS are planned
          // achievements — later preconditions in this same
          // plan may be satisfied by them. This is simulated
          // progress, NEVER a store write: `resolved` is a
          // per-plan set of pattern labels, and a genuinely
          // underivable precondition (no fact, no producing
          // operator) still lands in gapReport and fails the
          // plan honestly.
          for (const e of op.effects) {
            resolved.add(patternLabel(e));
          }
          return true;
        }
      }
      return false;
    };

    const executable = resolve(goalPattern, depth);
    const totalCost = steps.reduce(
      (sum, step) =>
        sum + (operators.find((o) => o.id === step.operatorId)?.cost ?? 0),
      0,
    );

    // P1/pl-3 — alternative plans: other REAL operator chains
    // that also achieve the goal. An operator is a viable
    // alternative head when its effects satisfy a
    // precondition of a primary step (chained), or when it
    // achieves the same goal independently. Never fabricated.
    const alternatives: PlanAlternative[] = [];
    const primaryOpIds = new Set(steps.map((s) => s.operatorId));
    const primaryOps = steps
      .map((s) => operators.find((o) => o.id === s.operatorId))
      .filter((o): o is Operator => o !== undefined);
    for (const op of operators) {
      if (primaryOpIds.has(op.id)) continue;
      // Phase 3.2: for goal-scoped plans, an alternative that
      // achieves the goal must achieve THIS goal's subject —
      // a different subject's "planned" is not an alternative,
      // it is a different task. (Predicate-only goals keep the
      // legacy matching.)
      if (
        goalSubject !== undefined &&
        op.achieves.subject !== goalSubject &&
        op.achieves.subject !== "$goal"
      ) {
        continue;
      }
      const feedsPrimary = primaryOps.some((primary) =>
        primary.preconditions.some(
          (pre) =>
            pre.subject !== undefined &&
            op.effects.some(
              (e) => e.subject === pre.subject && e.predicate === pre.predicate,
            ),
        ),
      );
      const achievesDirectly = primaryOps.some((primary) =>
        matchesAchieves(op, primary.achieves),
      );
      if (!feedsPrimary && !achievesDirectly) continue;
      const chainIds = [op.id, ...steps.map((s) => s.operatorId)];
      const chainCost = totalCost + op.cost;
      alternatives.push({
        operatorIds: chainIds,
        description: `${op.description}, then the primary plan`,
        totalCost: chainCost,
        tradeoff:
          chainCost > totalCost
            ? `costs ${chainCost - totalCost} more than the primary plan`
            : "same cost as the primary plan",
      });
    }

    // P1/pl-3 — honest risk assessment derived from the
    // operators actually involved in the primary plan.
    const involvesResearch = primaryOpIds.has("op_web_research");
    const risk = {
      level: (involvesResearch ? "medium" : "low") as "low" | "medium" | "high",
      notes: involvesResearch
        ? [
            "web research produces candidate knowledge — it must be validated before being trusted as established fact",
          ]
        : [
            "primary plan uses stored capabilities only — no unvalidated external sources involved",
          ],
    };

    const goalLabel =
      goalSubject !== undefined && typeof goal === "object"
        ? `${goalSubject} ${goalPattern.predicate ?? ""}`.trim()
        : (goal as string);
    return {
      goal: goalLabel,
      steps,
      executable,
      totalCost,
      gapReport,
      alternatives,
      risk,
    };
  }

  /** REMEDIATION batch 1 (2026-09-12): post-hoc plan
   *  validation against the LIVE fact store. Every step's
   *  operator must exist; every literal-subject precondition
   *  must either be held in the store or produced by an
   *  earlier step's effects. Honest issue list — never a
   *  silent pass. */
  validatePlan(
    plan: Plan,
    goalSubject?: string,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const byId = new Map(this.operators.map((o) => [o.id, o]));
    const produced = new Set<string>();
    // FIX 45 (batch 13): $goal-scoped preconditions were
    // blanket-skipped — for the Phase 3.2 planning chains
    // (EVERY precondition has subject $goal) validatePlan
    // checked nothing at all. When the caller supplies the
    // goal subject the plan was built for, $goal is
    // substituted and the whole chain is validated like any
    // literal subject. Without it, $goal stays an honest skip
    // (the subject is unknowable) and is noted.
    let skippedGoalScoped = false;
    for (const step of plan.steps) {
      const op = byId.get(step.operatorId);
      if (!op) {
        issues.push(`unknown operator "${step.operatorId}"`);
        continue;
      }
      for (const pre of op.preconditions ?? []) {
        let p = { ...pre };
        if (p.subject === "$goal") {
          if (goalSubject === undefined) {
            skippedGoalScoped = true;
            continue;
          }
          p = { ...pre, subject: goalSubject };
        }
        if (typeof p.subject === "string" && !p.subject.startsWith("?")) {
          const key = `${p.subject}|${p.predicate}`;
          const held =
            this.facts.query({
              subject: p.subject,
              predicate: p.predicate,
            }).length > 0;
          if (!held && !produced.has(key)) {
            issues.push(
              `precondition unsatisfied for step "${step.operatorId}": ${p.subject} ${p.predicate}`,
            );
          }
        }
      }
      // FIX 45 (continued): plan() resolves a selected
      // operator's ACHIEVES pattern (means-ends selection IS
      // production), but validatePlan only counted declared
      // EFFECTS — the real PLANNING_OPERATORS chains carry
      // their intermediate predicates as ACHIEVES, not
      // effects, so a planner-produced chain could never
      // validate clean. The validator now applies the same
      // semantics: a step's achieved pattern (goal-
      // substituted) is produced.
      const achievedSubj =
        op.achieves.subject === "$goal" ? goalSubject : op.achieves.subject;
      if (
        typeof achievedSubj === "string" &&
        !achievedSubj.startsWith("?") &&
        op.achieves.predicate !== undefined
      ) {
        produced.add(`${achievedSubj}|${op.achieves.predicate}`);
      }
      for (const eff of op.effects ?? []) {
        const subj = eff.subject === "$goal" ? goalSubject : eff.subject;
        if (typeof subj === "string" && !subj.startsWith("?")) {
          produced.add(`${subj}|${eff.predicate}`);
        }
      }
    }
    if (skippedGoalScoped) {
      issues.push(
        "goal-scoped ($goal) preconditions were not validated — supply the goal subject to validate the full chain",
      );
    }
    return { valid: issues.length === 0, issues };
  }

  /** REMEDIATION batch 1 (2026-09-12): replan after a failed
   *  execution — the failed operator is EXCLUDED and the
   *  remaining operator library replans the goal. Honest by
   *  construction: when no alternative chain exists the
   *  returned plan says so through executable=false and its
   *  gapReport. */
  replan(
    goal: string | FactPattern,
    failedOperatorId: string,
    depth = 8,
  ): Plan {
    const reduced = this.operators.filter((o) => o.id !== failedOperatorId);
    if (reduced.length === this.operators.length) {
      return this.plan(goal, depth);
    }
    // FIX 44 (batch 13): the reduced library was handed to a
    // BARE Planner — the backward-chain derivability probe
    // (fix 12) was silently dropped, so a replan could report
    // false gaps for preconditions the rule chains prove.
    const alt = new Planner(this.facts, reduced, this.derivable);
    const plan = alt.plan(goal, depth);
    plan.gapReport.push(
      `operator "${failedOperatorId}" excluded after failure; replanned over ${reduced.length} remaining operator(s)`,
    );
    return plan;
  }
}
function matchesAchieves(op: Operator, pattern: FactPattern): boolean {
  if (
    pattern.predicate !== undefined &&
    op.achieves.predicate !== pattern.predicate
  ) {
    return false;
  }
  // FIX 43 (batch 13, Level 9 audit 2026-09-13): the subject
  // was never compared — means-ends selection matched an
  // operator that achieves the same PREDICATE for a completely
  // different subject (a "wedding reception planned" goal
  // would accept any operator achieving anything "planned").
  // When the pattern names a subject, the operator's achieved
  // subject must be it (operators are $goal-substituted at
  // plan() time, so goal-scoped operators carry the goal's
  // subject here). Predicate-only goals keep legacy matching.
  if (
    pattern.subject !== undefined &&
    op.achieves.subject !== pattern.subject
  ) {
    return false;
  }
  return true;
}

/** Does an operator's EFFECT produce this missing pattern?
 *  Means-ends selection: a missing precondition can be met
 *  either by an operator that ACHIEVES it directly or by one
 *  whose declared effect produces it as a side effect. */
function effectsMatch(op: Operator, pattern: FactPattern): boolean {
  return op.effects.some(
    (e) =>
      e.subject !== undefined &&
      (pattern.subject === undefined || pattern.subject === e.subject) &&
      pattern.predicate !== undefined &&
      e.predicate === pattern.predicate,
  );
}
