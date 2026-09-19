// =========================================================
// ARCHIE NATIVE ENGINE — SELF-EVALUATION & VERIFICATION
//
// Real verification passes:
//   * contradiction scan over the knowledge store
//   * inference re-derivation and comparison
//   * plan precondition validation
//   * response self-check (does the response cite only real
//     facts and answer the classified intent?)
//   * calibration statistics over recorded outcomes
// Every check is measurable and surfaced in diagnostics.
// =========================================================

import type { Fact, FactConflict, LearningOutcome, Plan } from "./types.ts";
import { FactStore } from "./knowledge.ts";
import { ReasoningEngine, type InferenceResult } from "./reasoning.ts";

export interface SelfCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export class SelfEvaluator {
  private checksRun = 0;
  private contradictionsCaught = 0;

  /** Scan the store for same-SPO-different-object pairs. */
  scanContradictions(facts: FactStore): {
    conflicts: FactConflict[];
    checked: number;
  } {
    this.checksRun += 1;
    const all = facts.list();
    const bySpo = new Map<string, Map<string, Fact[]>>();
    for (const fact of all) {
      const spo = `${fact.subject}|${fact.predicate}`;
      const byObject = bySpo.get(spo) ?? new Map<string, Fact[]>();
      const key = JSON.stringify(fact.object);
      byObject.set(key, [...(byObject.get(key) ?? []), fact]);
      bySpo.set(spo, byObject);
    }
    const conflicts: FactConflict[] = [];
    for (const [spo, byObject] of bySpo) {
      if (byObject.size > 1) {
        const [subject, predicate] = spo.split("|");
        this.contradictionsCaught += 1;
        conflicts.push({
          kind: "contradiction",
          subject,
          predicate,
          conflictingFactIds: [...byObject.values()].flat().map((f) => f.id),
        });
      }
    }
    return { conflicts, checked: all.length };
  }

  /** Re-run inference and confirm previously derived facts
   *  still derive (stability check). */
  async verifyInference(
    reasoning: ReasoningEngine,
    previous: InferenceResult,
    facts?: FactStore,
  ): Promise<SelfCheck> {
    this.checksRun += 1;
    const reRun = await reasoning.forwardChain();
    // A previously derived fact is stable when it still exists
    // in the store with unchanged content AND re-running the
    // rules neither contradicts it nor produces conflicts.
    const stillPresent = previous.derived.every(
      (f) =>
        facts?.get(f.id) !== undefined &&
        JSON.stringify(facts.get(f.id)!.object) === JSON.stringify(f.object),
    );
    const noNewConflicts =
      reRun.derived.filter((f) => f.status === "uncertain").length === 0;
    const passed = stillPresent && noNewConflicts;
    return {
      check: "inference-stability",
      passed,
      detail: passed
        ? `${previous.derived.length} derived fact(s) stable under re-derivation`
        : "a previously derived fact no longer holds — knowledge store changed underneath inference",
    };
  }

  /** A plan is only valid when every step's operator exists and
   *  the plan claims no missing preconditions. */
  validatePlan(plan: Plan, knownOperators: string[]): SelfCheck {
    this.checksRun += 1;
    const unknownSteps = plan.steps.filter(
      (s) => !knownOperators.includes(s.operatorId),
    );
    const passed =
      plan.executable &&
      unknownSteps.length === 0 &&
      plan.gapReport.length === 0;
    return {
      check: "plan-validity",
      passed,
      detail: passed
        ? `plan for "${plan.goal}" is executable (${plan.steps.length} steps, cost ${plan.totalCost})`
        : `plan is not executable: ${[...plan.gapReport, ...unknownSteps.map((s) => `unknown operator ${s.operatorId}`)].join("; ")}`,
    };
  }

  /** Response self-check: cited facts must exist; a knowledge
   *  answer must not cite facts below validated status as
   *  established truth.
   *
   *  FIX 47 (batch 14, Level 10 audit 2026-09-13): the
   *  misrepresentation branch was gated on assertedAsEstablished
   *  — a flag hardwired FALSE at every production call site,
   *  so the branch was dead code and a reply presenting
   *  uncertain/candidate knowledge as established truth could
   *  never trip the gate. The check is now observable from
   *  the response itself: when the reply text is provided,
   *  any cited fact below validated status (uncertain or
   *  candidate) must be epistemically labeled SOMEWHERE in
   *  the reply (the honesty contract the composer upholds —
   *  "candidate", "uncertain", "DERIVED", "owner-asserted",
   *  "confidence …%"). An unlabeled reply citing below-
   *  validated facts is a countable misrepresentation, not a
   *  silent pass. The flag is kept for explicit callers
   *  (tests, external verification) and now also flags
   *  candidate facts, not just uncertain ones. */
  verifyResponse(
    citedFactIds: string[],
    facts: FactStore,
    assertedAsEstablished: boolean,
    responseText?: string,
  ): SelfCheck {
    this.checksRun += 1;
    const missing = citedFactIds.filter((id) => !facts.get(id));
    const belowValidated = citedFactIds
      .map((id) => facts.get(id))
      .filter(
        (f): f is Fact =>
          f !== undefined &&
          (f.status === "uncertain" || f.status === "candidate"),
      );
    const labeled =
      /candidate|uncertain|derived|owner-asserted|unverified|confidence\s*\d/i.test(
        responseText ?? "",
      );
    const misrepresentationIds: string[] = [];
    for (const f of belowValidated) {
      // Explicit-assertion flag (legacy/test semantics): a
      // below-validated fact asserted as established truth is
      // a misrepresentation, label or not.
      if (assertedAsEstablished) {
        misrepresentationIds.push(f.id);
        continue;
      }
      // Observable contract (production gate): when the reply
      // text is provided, citing below-validated facts WITHOUT
      // any epistemic label in the reply is a
      // misrepresentation — the honesty label is not optional.
      if (responseText !== undefined && !labeled) {
        misrepresentationIds.push(f.id);
      }
    }
    const misrepresentations = misrepresentationIds;
    return {
      check: "response-integrity",
      passed: missing.length === 0 && misrepresentations.length === 0,
      detail:
        missing.length > 0
          ? `response cited non-existent facts: ${missing.join(", ")}`
          : misrepresentations.length > 0
            ? "response asserted below-validated (uncertain/candidate) knowledge as established fact — no epistemic label found in the reply"
            : `all ${citedFactIds.length} cited fact(s) verified`,
    };
  }

  /** PHASE 3.3 (audit, 2026-09-11) — REAL SEMANTIC
   *  VERIFICATION. The existing checks are structural: cited
   *  IDs exist, uncertain facts are not asserted. Nothing
   *  verified that the response's PROSE actually agrees with
   *  the validated facts it cites. This check does, and it is
   *  deliberately high-precision: it only flags a mismatch
   *  when the response RESTATES a claim about a cited fact's
   *  subject and gets it wrong (numeric: same unit, >5% off;
   *  textual: subject + negation + the object's distinctive
   *  term). A response that merely cites without restating,
   *  or restates correctly, passes — no false alarms.
   */
  verifySemanticClaims(citedFacts: Fact[], responseText: string): SelfCheck {
    this.checksRun += 1;
    // Decimal-aware split: a period BETWEEN DIGITS ("0.1081",
    // "12.5 mm") is not a sentence boundary — only sentence
    // terminators and newlines are.
    const sentences = responseText.split(/(?<!\d)\.(?!\d)|[!?\n]+/);
    const mismatches: string[] = [];
    let restated = 0;

    const significant = (t: string) =>
      t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(
          (w) =>
            w.length > 3 &&
            !["that", "this", "with", "have", "your"].includes(w),
        );

    for (const fact of citedFacts) {
      if (
        fact.status !== "validated" &&
        fact.status !== "derived" &&
        fact.status !== "owner-asserted"
      )
        continue;
      const subjectTokens = significant(fact.subject);
      if (subjectTokens.length === 0) continue;
      const objectStr = String(fact.object ?? "");
      const objNum = /(-?\d+(?:\.\d+)?)/.exec(objectStr)?.[1];
      const objUnit =
        /\d+(?:\.\d+)?\s*(mm|cm|m2|m3|kg|g|litres?|liters?|l|%|bags?|blocks?|hours?|days?|degrees?)/i
          .exec(objectStr)?.[1]
          ?.toLowerCase();

      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        // HIGH-PRECISION: the sentence must mention the fact's
        // subject via ALL its significant tokens ("screed
        // thickness") — a shared generic word alone ("wall
        // thickness") is NOT this fact's subject.
        const mentionsSubject = subjectTokens.every((t) =>
          new RegExp(`\\b${t}`, "i").test(lower),
        );
        if (!mentionsSubject) continue;

        if (objNum !== undefined && objUnit !== undefined) {
          // numeric claim restated with the SAME unit — must match
          const numbers = [
            ...sentence.matchAll(
              /(-?\d+(?:\.\d+)?)\s*(mm|cm|m2|m3|kg|g|litres?|liters?|l|%|bags?|blocks?|hours?|days?|degrees?)/gi,
            ),
          ];
          for (const m of numbers) {
            if (m[2].toLowerCase() !== objUnit) continue;
            const stated = Number(m[1]);
            const actual = Number(objNum);
            restated += 1;
            const relative =
              Math.abs(stated - actual) / Math.max(Math.abs(actual), 1e-9);
            if (relative > 0.05) {
              mismatches.push(
                `response states ${stated} ${objUnit} for "${fact.subject}" but the cited validated fact says ${actual} ${objUnit}`,
              );
            }
          }
        } else if (objUnit === undefined && objectStr.length > 0) {
          // textual claim negated — subject + negation + object term
          const objTokens = significant(objectStr);
          const negated =
            /\b(?:is not|are not|isn't|aren't|never|no longer|not)\b/i.test(
              sentence,
            ) && objTokens.some((t) => lower.includes(t));
          if (negated) {
            mismatches.push(
              `response negates a cited validated fact about "${fact.subject}"`,
            );
          }
        }
      }
    }
    return {
      check: "semantic-consistency",
      passed: mismatches.length === 0,
      detail:
        mismatches.length > 0
          ? mismatches.join("; ")
          : `${restated} restated claim(s) agree with cited validated facts; ${citedFacts.length} cited fact(s) semantically consistent`,
    };
  }

  /** Calibration: mean predicted confidence across outcomes. */
  calibration(
    outcomes: LearningOutcome[],
    predictedConfidences: Map<string, number>,
  ): {
    samples: number;
    meanPredicted: number;
    successRate: number;
  } {
    const withPredictions = outcomes.filter((o) =>
      predictedConfidences.has(o.task),
    );
    if (withPredictions.length === 0) {
      return { samples: 0, meanPredicted: 0, successRate: 0 };
    }
    const meanPredicted =
      withPredictions.reduce(
        (s, o) => s + (predictedConfidences.get(o.task) ?? 0),
        0,
      ) / withPredictions.length;
    const successRate =
      withPredictions.filter((o) => o.kind === "success").length /
      withPredictions.length;
    return { samples: withPredictions.length, meanPredicted, successRate };
  }

  stats(): { selfChecksRun: number; contradictionsCaught: number } {
    return {
      selfChecksRun: this.checksRun,
      contradictionsCaught: this.contradictionsCaught,
    };
  }
}
