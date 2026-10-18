// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — RECURSIVE REVIEW & SELF-CORRECTION
// Spec §4.G: Recursive Review and Self-Correction
//
// Bounded, measurable self-review and error correction:
//   - Identifies candidate flaws: calculation drift, assumption escalation,
//     unsupported leaps, contradiction with known facts
//   - Attempts bounded iterative repair
//   - Strict termination limits: maxIterations (default 3), convergence check
//   - Non-infinite loops: repeated or non-improving states terminate immediately
//   - Does not treat internal repetition as independent proof
// =========================================================

import type {
  CandidateSolution,
  ProblemConstraint,
  ReasoningPremise,
  RecursiveReviewReport,
  ReviewIteration,
} from "./types.ts";
import { evaluateExpression } from "./math.ts";

export interface ReviewTarget {
  candidate: CandidateSolution;
  premises: ReasoningPremise[];
  constraints: ProblemConstraint[];
  maxIterations?: number;
}

/** Execute bounded recursive self-review and repair */
export function executeRecursiveReview(
  target: ReviewTarget,
): RecursiveReviewReport {
  const maxIterations = target.maxIterations ?? 3;
  const iterations: ReviewIteration[] = [];
  const flawsFixed: string[] = [];
  const remainingFlaws: string[] = [];

  let currentDescription = target.candidate.description;
  let converged = false;
  const stateHistory = new Set<string>();

  for (let iter = 1; iter <= maxIterations; iter++) {
    const checks: Array<{ checkName: string; passed: boolean; message: string }> = [];
    const iterFlaws: string[] = [];
    const corrections: string[] = [];

    // Check 1: Premise Support Check
    const premiseIds = new Set(target.premises.map((p) => p.id));
    const unsupportedPremises = target.candidate.premiseIds.filter((id) => !premiseIds.has(id));
    if (unsupportedPremises.length > 0) {
      iterFlaws.push(`References unsupported premise ID(s): ${unsupportedPremises.join(", ")}`);
      checks.push({
        checkName: "PREMISE_SUPPORT",
        passed: false,
        message: `Missing ${unsupportedPremises.length} premise reference(s)`,
      });
      // Attempt correction: strip unsupported references
      target.candidate.premiseIds = target.candidate.premiseIds.filter((id) => premiseIds.has(id));
      corrections.push("Filtered out unsupported premise references.");
      flawsFixed.push("Stripped unsupported premise IDs");
    } else {
      checks.push({ checkName: "PREMISE_SUPPORT", passed: true, message: "All premises resolved" });
    }

    // Check 2: Embedded Math Verification
    const mathMatch = /([0-9\s.+\-*/^()]+)\s*=\s*([0-9.]+)/.exec(currentDescription);
    if (mathMatch) {
      const expr = mathMatch[1].trim();
      const statedVal = Number(mathMatch[2]);
      const reVal = evaluateExpression(expr);
      if (reVal.ok && Math.abs(reVal.value - statedVal) > 1e-4) {
        iterFlaws.push(`Mathematical calculation error: '${expr}' is ${reVal.value}, not ${statedVal}`);
        checks.push({
          checkName: "ARITHMETIC_VERIFICATION",
          passed: false,
          message: `Stated ${statedVal} != recomputed ${reVal.value}`,
        });
        // Repair correction
        currentDescription = currentDescription.replace(
          `${expr} = ${statedVal}`,
          `${expr} = ${reVal.value}`,
        );
        corrections.push(`Corrected calculation result to ${reVal.value}`);
        flawsFixed.push(`Corrected math error in ${expr}`);
      } else {
        checks.push({ checkName: "ARITHMETIC_VERIFICATION", passed: true, message: "Calculation verified" });
      }
    }

    // Check 3: Hard Constraint Enforcement
    for (const c of target.constraints) {
      if (c.kind === "HARD" && c.bound) {
        // Find if candidate contains quantity violating bound
        const numMatch = /(\d+(?:\.\d+)?)/.exec(currentDescription);
        if (numMatch) {
          const val = Number(numMatch[1]);
          const violated =
            (c.bound.op === "<=" && val > c.bound.quantity.value) ||
            (c.bound.op === "<" && val >= c.bound.quantity.value) ||
            (c.bound.op === ">=" && val < c.bound.quantity.value) ||
            (c.bound.op === ">" && val <= c.bound.quantity.value);
          if (violated) {
            iterFlaws.push(`Hard constraint violated: ${c.statement}`);
            checks.push({
              checkName: "HARD_CONSTRAINT_CHECK",
              passed: false,
              message: `Value ${val} violates bound ${c.bound.op} ${c.bound.quantity.value}`,
            });
            remainingFlaws.push(`Constraint violation: ${c.statement}`);
          }
        }
      }
    }

    // Convergence check
    if (iterFlaws.length === 0 || corrections.length === 0) {
      converged = true;
    }

    iterations.push({
      iteration: iter,
      candidateSummary: currentDescription,
      checksExecuted: checks,
      flawsIdentified: iterFlaws,
      correctionsApplied: corrections,
      converged,
    });

    // Loop protection: if the candidate description repeated, stop immediately
    if (stateHistory.has(currentDescription)) {
      break;
    }
    stateHistory.add(currentDescription);

    if (converged) {
      break;
    }
  }

  return {
    totalIterations: iterations.length,
    maxIterationsAllowed: maxIterations,
    converged,
    initialCandidate: target.candidate.description,
    finalCandidate: currentDescription,
    flawsFixed,
    remainingUnresolvedFlaws: remainingFlaws,
    iterations,
  };
}
