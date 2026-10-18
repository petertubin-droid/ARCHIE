// =========================================================
// FRELUX PHASE 6.5, UNIFIED LEARNING ENGINE (pure logic)
//
// Lifecycle, verification, evaluation, approval, versioning
// and rollback for ALL intelligence sources.
// These are pure, testable functions; persistence lives in
// learning-store / learning-client.
//
// OWNER DIRECTIVE (2026-09-12 / autonomous learning):
// ARCHIE does NOT need approval before learning and is able
// to know when to process and accept information autonomously.
// Deterministic math capabilities remain protected from
// automatic calculation modification.
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
  EVALUATING: ["READY_FOR_REVIEW", "APPROVED", "CANDIDATE", "REJECTED", "DEFERRED"],
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

// ---------------------------------------------------------
// Autonomous learning & evaluation (owner directive)
// ---------------------------------------------------------
export interface AutonomousAcceptanceInput {
  topic?: string | null;
  recommendation?: string | null;
  conclusion?: string | null;
  capability?: string | null;
  confidence?: number | null;
  evidence?: unknown;
  provenance?: unknown;
  sanitizer_flags?: readonly string[];
  proposed_scope?: KnowledgeScope | string | null;
}

export interface AutonomousAcceptanceResult {
  acceptable: boolean;
  decision: "PROMOTE" | "HOLD" | "REJECT";
  reason: string;
  confidence: number;
  selfAssessed: boolean;
}

/**
 * Determine whether ARCHIE should process and accept information
 * autonomously without requiring prior owner review.
 */
export function evaluateAutonomousAcceptance(
  input: AutonomousAcceptanceInput,
): AutonomousAcceptanceResult {
  if (input.sanitizer_flags && input.sanitizer_flags.length > 0) {
    return {
      acceptable: false,
      decision: "HOLD",
      reason: "Quarantined by ingestion sanitization (injection flags) — held for review.",
      confidence: Number(input.confidence ?? 0),
      selfAssessed: false,
    };
  }

  if (!input.topic || !String(input.topic).trim()) {
    return {
      acceptable: false,
      decision: "REJECT",
      reason: "No topic provided — nothing to anchor knowledge to.",
      confidence: 0,
      selfAssessed: false,
    };
  }

  const hasContent =
    (input.recommendation && String(input.recommendation).trim().length > 0) ||
    (input.conclusion && String(input.conclusion).trim().length > 0);
  if (!hasContent) {
    return {
      acceptable: false,
      decision: "REJECT",
      reason: "No substantive content (recommendation and conclusion empty).",
      confidence: 0,
      selfAssessed: false,
    };
  }

  const capability = String(input.capability ?? "").toLowerCase();
  if (isMathCapability(capability)) {
    return {
      acceptable: false,
      decision: "HOLD",
      reason: `Capability '${capability}' involves deterministic math calculation rules — requires engineering review.`,
      confidence: Number(input.confidence ?? 0),
      selfAssessed: false,
    };
  }

  let confidence = Number(input.confidence ?? 0);
  let selfAssessed = false;
  if (!Number.isFinite(confidence) || confidence <= 0) {
    let score = 0.4;
    if (input.recommendation && String(input.recommendation).trim()) score += 0.1;
    if (input.conclusion && String(input.conclusion).trim()) score += 0.1;
    if (Array.isArray(input.evidence) && input.evidence.length > 0) score += 0.1;
    if (
      input.provenance &&
      typeof input.provenance === "object" &&
      Object.keys(input.provenance as Record<string, unknown>).length > 0
    ) {
      score += 0.1;
    }
    confidence = Math.min(score, 0.9);
    selfAssessed = true;
  }

  const minThreshold = 0.6;
  if (confidence < minThreshold) {
    return {
      acceptable: false,
      decision: "HOLD",
      reason: `${selfAssessed ? "Self-assessed" : "Reported"} confidence ${confidence.toFixed(2)} is below autonomous acceptance threshold (${minThreshold}).`,
      confidence,
      selfAssessed,
    };
  }

  return {
    acceptable: true,
    decision: "PROMOTE",
    reason: `Passes autonomous quality criteria (${selfAssessed ? "self-assessed" : "reported"} confidence ${confidence.toFixed(2)}).`,
    confidence,
    selfAssessed,
  };
}

export function isArchieAutonomousReviewer(reviewer: string | null | undefined): boolean {
  if (!reviewer) return false;
  const norm = reviewer.trim().toUpperCase();
  return (
    norm === "ARCHIE" ||
    norm === "ARCHIE_AUTONOMOUS" ||
    norm === "AUTONOMOUS" ||
    norm === "SYSTEM_AUTONOMOUS"
  );
}

export interface PromotionCheckResult {
  allowed: boolean;
  requiresEngineeringReview: boolean;
  reason: string;
  autonomous?: boolean;
}

/**
 * The promotion gate. A record may become production knowledge when:
 *  - it reached READY_FOR_REVIEW or ARCHIE autonomously accepts it from EVALUATING
 *  - a human reviewer approves OR ARCHIE accepts it autonomously (owner directive:
 *    ARCHIE doesn't need approval before learning and knows when to accept information)
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
  // Autonomous evaluation inputs
  confidence?: number | null;
  autonomous?: boolean;
  topic?: string | null;
  recommendation?: string | null;
  conclusion?: string | null;
  sanitizer_flags?: readonly string[];
  evidence?: unknown;
  provenance?: unknown;
  hasSubstantiveContent?: boolean;
  hasAnchoredTopic?: boolean;
}): PromotionCheckResult {
  const isArchie =
    args.autonomous === true || isArchieAutonomousReviewer(args.reviewer);

  const eligibleLifecycle =
    args.lifecycle === "READY_FOR_REVIEW" ||
    (isArchie && args.lifecycle === "EVALUATING");

  if (!eligibleLifecycle) {
    return {
      allowed: false,
      requiresEngineeringReview: isMathCapability(args.capability),
      reason: isArchie
        ? `Autonomous promotion requires EVALUATING or READY_FOR_REVIEW records (current: ${args.lifecycle}).`
        : `Only READY_FOR_REVIEW records can be promoted (current: ${args.lifecycle}).`,
    };
  }

  // Untrusted, generic AI or missing reviewer cannot self-approve without ARCHIE autonomous evaluation
  if (!isArchie && (!args.reviewer || args.reviewer === "AI" || args.reviewer === "SYSTEM")) {
    return {
      allowed: false,
      requiresEngineeringReview: isMathCapability(args.capability),
      reason:
        "AI must never approve its own learning, a human reviewer is required.",
    };
  }

  // If ARCHIE is evaluating autonomously, verify quality and safety filters
  if (isArchie) {
    if (args.hasAnchoredTopic === false) {
      return {
        allowed: false,
        requiresEngineeringReview: isMathCapability(args.capability),
        reason: "No topic provided to anchor knowledge to.",
      };
    }
    if (args.hasSubstantiveContent === false) {
      return {
        allowed: false,
        requiresEngineeringReview: isMathCapability(args.capability),
        reason: "No substantive content (recommendation and conclusion empty).",
      };
    }
    if (args.confidence !== undefined && args.confidence !== null && args.confidence < 0.6) {
      return {
        allowed: false,
        requiresEngineeringReview: isMathCapability(args.capability),
        reason: `Confidence ${args.confidence} below autonomous acceptance threshold (0.60).`,
      };
    }
    if (args.topic !== undefined || args.recommendation !== undefined || args.conclusion !== undefined) {
      const evaluation = evaluateAutonomousAcceptance({
        topic: args.topic,
        recommendation: args.recommendation,
        conclusion: args.conclusion,
        capability: args.capability,
        confidence: args.confidence,
        evidence: args.evidence,
        provenance: args.provenance,
        sanitizer_flags: args.sanitizer_flags,
        proposed_scope: args.proposed_scope,
      });
      if (!evaluation.acceptable) {
        return {
          allowed: false,
          requiresEngineeringReview: isMathCapability(args.capability),
          reason: `ARCHIE autonomous acceptance held/rejected: ${evaluation.reason}`,
        };
      }
    }
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
    reason: isArchie
      ? "ARCHIE autonomous acceptance: quality and safety criteria verified."
      : "Promotion permitted.",
    autonomous: isArchie,
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
