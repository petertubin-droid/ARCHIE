// =========================================================
// FRELUX PHASE 6.5, UNIFIED LEARNING ENGINE (pure logic)
//
// Lifecycle, verification, evaluation, human approval,
// versioning and rollback for ALL intelligence sources.
// These are pure, testable functions; persistence lives in
// learning-store / learning-client. AI can never approve its
// own learning, and deterministic math capabilities are
// permanently protected from automatic promotion.
// =========================================================
import type { KnowledgeScope, LearningLifecycle } from "./types";
import { MATH_CAPABILITIES } from "./types";

// ---------------------------------------------------------
// 1. Lifecycle state machine (Phase 6.5 §7)
// ---------------------------------------------------------
const LIFECYCLE_TRANSITIONS: Record<LearningLifecycle, LearningLifecycle[]> = {
  CRAWLED: ["EXTRACTED", "REJECTED"],
  EXTRACTED: ["CANDIDATE", "REJECTED"],
  ARCHIE_RECEIVED: ["CANDIDATE", "REJECTED"],
  CANDIDATE: ["VERIFYING", "REJECTED", "DEFERRED"],
  VERIFYING: ["EVALUATING", "CANDIDATE", "REJECTED", "DEFERRED"],
  EVALUATING: ["READY_FOR_REVIEW", "CANDIDATE", "REJECTED", "DEFERRED"],
  READY_FOR_REVIEW: ["APPROVED", "REJECTED", "DEFERRED", "VERIFYING"],
  APPROVED: [],
  REJECTED: ["CANDIDATE"],
  DEFERRED: ["CANDIDATE", "VERIFYING"],
};

export function canTransition(
  from: LearningLifecycle,
  to: LearningLifecycle,
): boolean {
  return (LIFECYCLE_TRANSITIONS[from] ?? []).includes(to);
}

/** Terminal-ish statuses that block further review actions. */
export function isReviewAction(
  action: "APPROVE" | "REJECT" | "DEFER" | "REQUEST_VERIFICATION",
): boolean {
  return ["APPROVE", "REJECT", "DEFER", "REQUEST_VERIFICATION"].includes(
    action,
  );
}

export interface TransitionResult {
  ok: boolean;
  to: LearningLifecycle;
  error?: string;
}

export function advanceLifecycle(
  from: LearningLifecycle,
  to: LearningLifecycle,
): TransitionResult {
  if (from === to) return { ok: true, to };
  if (!canTransition(from, to)) {
    return {
      ok: false,
      to: from,
      error: `Illegal lifecycle transition: ${from} → ${to}.`,
    };
  }
  return { ok: true, to };
}

// ---------------------------------------------------------
// 2. Knowledge scope isolation (Phase 6.5 §12, §24)
// ---------------------------------------------------------
const SCOPE_RANK: Record<KnowledgeScope, number> = {
  USER: 1,
  PROPERTY: 2,
  PROJECT: 3,
  REGIONAL: 4,
  GLOBAL: 5,
};

export interface ScopePromotionResult {
  allowed: boolean;
  requiresExplicitApproval: boolean;
  reason: string;
}

/**
 * Scope promotion rules:
 *  - widening within safe pairs is fine with ordinary approval
 *  - any promotion INTO GLOBAL requires an explicit, additional
 *    approval flag (never silent)
 *  - PROJECT → GLOBAL and USER → GLOBAL are denied outright
 *    without independent verification + engineering review
 */
export function evaluateScopePromotion(
  from: KnowledgeScope,
  to: KnowledgeScope,
  opts: { explicitlyApproved?: boolean; independentlyVerified?: boolean } = {},
): ScopePromotionResult {
  if (from === to) {
    return {
      allowed: true,
      requiresExplicitApproval: false,
      reason: "Same scope.",
    };
  }
  const widening = SCOPE_RANK[to] > SCOPE_RANK[from];
  if (!widening) {
    return {
      allowed: true,
      requiresExplicitApproval: false,
      reason: "Narrowing scope is safe.",
    };
  }
  if (to === "GLOBAL") {
    const dangerous =
      from === "PROJECT" || from === "USER" || from === "PROPERTY";
    if (
      dangerous &&
      !(opts.independentlyVerified === true && opts.explicitlyApproved === true)
    ) {
      return {
        allowed: false,
        requiresExplicitApproval: true,
        reason: `${from} → GLOBAL requires independent verification AND explicit approval. Nigerian practice must never silently become a global default.`,
      };
    }
    if (!opts.explicitlyApproved) {
      return {
        allowed: false,
        requiresExplicitApproval: true,
        reason:
          "Promotion to GLOBAL requires an explicit additional approval step.",
      };
    }
    return {
      allowed: true,
      requiresExplicitApproval: true,
      reason: "Explicit GLOBAL promotion approved.",
    };
  }
  return {
    allowed: true,
    requiresExplicitApproval: false,
    reason: "Ordinary widening promotion; reviewer approval still required.",
  };
}

/** Regional isolation: a knowledge lookup must never cross markets. */
export function regionMatches(
  itemScope: KnowledgeScope,
  itemScopeKey: string | null | undefined,
  requestedRegion: string | null | undefined,
): boolean {
  if (itemScope === "GLOBAL") return true;
  if (itemScope !== "REGIONAL") return false;
  if (!requestedRegion) return false;
  return (itemScopeKey ?? "").toUpperCase() === requestedRegion.toUpperCase();
}

// ---------------------------------------------------------
// 3. Deterministic engine protection (Phase 6.5 §17)
// ---------------------------------------------------------
export function isMathCapability(capability: string): boolean {
  const norm = capability.trim().toLowerCase();
  for (const m of MATH_CAPABILITIES) {
    if (norm === m || norm.startsWith(`${m}:`) || norm.includes(m)) return true;
  }
  return false;
}

export interface PromotionCheckResult {
  allowed: boolean;
  requiresEngineeringReview: boolean;
  reason: string;
}

/**
 * The single promotion gate. A record may only become production
 * knowledge when:
 *  - it reached READY_FOR_REVIEW
 *  - a HUMAN reviewer (not the AI source) approves
 *  - scope promotion is legal
 *  - math capabilities require the engineering-review flag
 */
export function checkPromotion(args: {
  lifecycle: LearningLifecycle;
  capability: string;
  proposed_scope: KnowledgeScope;
  target_scope: KnowledgeScope;
  reviewer: string | null | undefined;
  engineeringReviewed?: boolean;
  scopeExplicitlyApproved?: boolean;
  independentlyVerified?: boolean;
}): PromotionCheckResult {
  if (args.lifecycle !== "READY_FOR_REVIEW") {
    return {
      allowed: false,
      requiresEngineeringReview: isMathCapability(args.capability),
      reason: `Only READY_FOR_REVIEW records can be promoted (current: ${args.lifecycle}).`,
    };
  }
  if (!args.reviewer || args.reviewer === "AI" || args.reviewer === "SYSTEM") {
    return {
      allowed: false,
      requiresEngineeringReview: isMathCapability(args.capability),
      reason:
        "AI must never approve its own learning, a human reviewer is required.",
    };
  }
  const scope = evaluateScopePromotion(args.proposed_scope, args.target_scope, {
    explicitlyApproved: args.scopeExplicitlyApproved,
    independentlyVerified: args.independentlyVerified,
  });
  if (!scope.allowed) {
    return {
      allowed: false,
      requiresEngineeringReview: isMathCapability(args.capability),
      reason: `Scope isolation: ${scope.reason}`,
    };
  }
  if (isMathCapability(args.capability) && args.engineeringReviewed !== true) {
    return {
      allowed: false,
      requiresEngineeringReview: true,
      reason: `Capability '${args.capability}' is deterministic engine math: DETECT → VERIFY → ENGINEERING REVIEW → REGRESSION TEST → HUMAN APPROVAL → VERSIONED DEPLOYMENT applies.`,
    };
  }
  return {
    allowed: true,
    requiresEngineeringReview: isMathCapability(args.capability),
    reason: "Promotion permitted.",
  };
}

// ---------------------------------------------------------
// 4. Evaluation engine (Phase 6.5 §18)
// ---------------------------------------------------------
export interface EvaluationMetrics {
  total: number;
  correct: number;
  accuracy: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  mean_absolute_error: number | null;
  mean_absolute_percentage_error: number | null;
  confidence_calibration_error: number | null;
}

export function computeEvaluationMetrics(
  cases: Array<{
    expected: number;
    actual: number | null;
    predicted_positive?: boolean;
    actual_positive?: boolean;
    confidence?: number;
  }>,
): EvaluationMetrics {
  const total = cases.length;
  let correct = 0;
  let tp = 0,
    fp = 0,
    fn = 0;
  let absErrSum = 0,
    pctErrSum = 0,
    comparable = 0;
  let calibErrSum = 0,
    calibrated = 0;
  for (const c of cases) {
    if (c.actual != null && Number.isFinite(c.actual)) {
      const err = Math.abs((c.expected ?? 0) - c.actual);
      absErrSum += err;
      pctErrSum +=
        (c.expected ?? 0) !== 0
          ? err / Math.abs(c.expected ?? 0)
          : err > 0
            ? 1
            : 0;
      comparable += 1;
      if ((c.expected ?? 0) === c.actual) correct += 1;
    }
    if (c.predicted_positive === true && c.actual_positive === true) tp += 1;
    else if (c.predicted_positive === true && c.actual_positive === false)
      fp += 1;
    else if (c.predicted_positive !== true && c.actual_positive === true)
      fn += 1;
    if (typeof c.confidence === "number") {
      const wasRight = c.actual != null && c.actual === (c.expected ?? 0);
      calibErrSum += Math.abs((c.confidence ?? 0) - (wasRight ? 1 : 0));
      calibrated += 1;
    }
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    true_positives: tp,
    false_positives: fp,
    false_negatives: fn,
    precision,
    recall,
    f1:
      precision != null && recall != null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null,
    mean_absolute_error: comparable > 0 ? absErrSum / comparable : null,
    mean_absolute_percentage_error:
      comparable > 0 ? pctErrSum / comparable : null,
    confidence_calibration_error:
      calibrated > 0 ? calibErrSum / calibrated : null,
  };
}

/**
 * Repeated verified correction signals may produce an improvement
 * proposal in DRAFT. It never changes production extraction logic
 * by itself (Phase 6.5 §9).
 */
export function shouldProposeImprovement(
  verifiedCorrectionCount: number,
  threshold = 5,
): boolean {
  return verifiedCorrectionCount >= threshold;
}

// ---------------------------------------------------------
// 5. Multi-AI comparison (Phase 6.5 §15)
// ---------------------------------------------------------
export interface ProviderOpinion {
  provider: string;
  recommendation: string;
  confidence: number;
  evidenceCount: number;
}

export interface ComparisonResult {
  agreement: number;
  groups: Array<{ recommendation: string; providers: string[] }>;
  note: string;
}

export function compareProviderOpinions(
  opinions: ProviderOpinion[],
): ComparisonResult {
  const groups = new Map<string, string[]>();
  for (const o of opinions) {
    const key = o.recommendation.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), o.provider]);
  }
  const agreement =
    opinions.length > 0
      ? Math.max(...[...groups.values()].map((g) => g.length)) / opinions.length
      : 0;
  return {
    agreement,
    groups: [...groups.entries()].map(([recommendation, providers]) => ({
      recommendation,
      providers,
    })),
    note: "Majority AI agreement is NOT proof of correctness, independent verification remains mandatory.",
  };
}
