// =========================================================
// FRELUX PHASE 8, ARCHIE LEARNING GOVERNANCE
//
// ARCHIE can continuously acquire and organize knowledge, but
// learning capacity does NOT equal authority. This module is
// the enforcement of that principle:
//
// 1. Evidence states are never silently converted (§ matrix).
// 2. Estimates / AI output / assumptions never become verified
//    truth without a human-approved verification step.
// 3. Deterministic math + structural/foundation/safety can
//    never be modified or auto-promoted by ARCHIE.
// 4. ARCHIE never approves its own learning.
// =========================================================

import type {
  ArchieCandidate,
  ArchieContributor,
  ArchieEvidenceState,
  ArchieKnowledgeType,
} from "./types";

/**
 * Allowed evidence-state transitions. Anything not listed is
 * FORBIDDEN, the matrix is intentionally tiny:
 *
 * - AI_EXTRACTED / AI_RECOMMENDATION may only move to
 *   USER_CONFIRMED (a human validated it) or stay as is.
 * - USER_PROVIDED may become USER_CONFIRMED.
 * - ESTIMATED / ASSUMPTION may only become USER_CONFIRMED
 *   with explicit evidence.
 * - USER_CONFIRMED / EXTERNAL_SOURCE_VERIFIED may become
 *   SYSTEM_VERIFIED only through the approval pipeline with
 *   verification evidence.
 * - ACTUAL_OUTCOME is terminal, it can never be "improved"
 *   into something else.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<ArchieEvidenceState, readonly ArchieEvidenceState[]>
> = {
  AI_EXTRACTED: ["USER_CONFIRMED"],
  AI_RECOMMENDATION: ["USER_CONFIRMED"],
  USER_PROVIDED: ["USER_CONFIRMED"],
  USER_CONFIRMED: ["SYSTEM_VERIFIED", "EXTERNAL_SOURCE_VERIFIED"],
  SYSTEM_VERIFIED: [],
  EXTERNAL_SOURCE_VERIFIED: ["SYSTEM_VERIFIED"],
  ESTIMATED: ["USER_CONFIRMED"],
  ASSUMPTION: ["USER_CONFIRMED"],
  ACTUAL_OUTCOME: [],
};

/** The states that count as verified truth. */
export const VERIFIED_STATES: ReadonlySet<ArchieEvidenceState> = new Set([
  "SYSTEM_VERIFIED",
  "EXTERNAL_SOURCE_VERIFIED",
  "ACTUAL_OUTCOME",
]);

/** Can `from` ever become `to`? (Directly or over time.) */
export function canEvidenceConvert(
  from: ArchieEvidenceState,
  to: ArchieEvidenceState,
): boolean {
  if (from === to) return true;
  // Transitive reach, e.g. AI_EXTRACTED → USER_CONFIRMED → SYSTEM_VERIFIED
  const queue = [from];
  const seen = new Set<ArchieEvidenceState>();
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of ALLOWED_TRANSITIONS[current] ?? []) queue.push(next);
  }
  return false;
}

/** A conversion step is allowed only through this gate. */
export function convertEvidenceState(
  from: ArchieEvidenceState,
  to: ArchieEvidenceState,
  opts: { approverIsHuman: boolean; hasVerificationEvidence: boolean },
): { ok: boolean; error?: string } {
  if (from === to) return { ok: true };
  if (!canEvidenceConvert(from, to)) {
    return {
      ok: false,
      error: `ARCHIE governance: "${from}" can never become "${to}" directly`,
    };
  }
  // Reaching a verified state requires BOTH a human approver and
  // verification evidence, never silent, never AI-only.
  // USER_CONFIRMED likewise demands a human: an AI can never
  // confirm on behalf of the user.
  if (VERIFIED_STATES.has(to) || to === "USER_CONFIRMED") {
    if (!opts.approverIsHuman) {
      return {
        ok: false,
        error:
          "ARCHIE cannot approve its own learning, a human approver is required",
      };
    }
    if (VERIFIED_STATES.has(to) && !opts.hasVerificationEvidence) {
      return {
        ok: false,
        error:
          "Verification evidence is required to promote to a verified state",
      };
    }
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return {
      ok: false,
      error: `Conversion "${from}" → "${to}" must go through the approval pipeline step by step`,
    };
  }
  return { ok: true };
}

/** What ARCHIE must NEVER modify, hard list, no exceptions. */
export const ARCHIE_NEVER_MODIFIES: readonly string[] = [
  "formulas",
  "unit conversions",
  "structural calculations",
  "foundation calculations",
  "roof geometry",
  "material ratios",
  "safety thresholds",
  "waste factors",
  "rounding rules",
  "deterministic quantity engines",
];

/** Knowledge types that may touch the deterministic surface as
 *  OBSERVATIONS (never as production changes). */
export const DETERMINISM_SAFE_TYPES: ReadonlySet<ArchieKnowledgeType> = new Set(
  ["FACT", "REGIONAL_PRACTICE", "TERMINOLOGY", "GENERAL", "ARCHITECTURE_NOTE"],
);

/** May ARCHIE record this candidate at all? (Recording ≠ applying.) */
export function canRecordCandidate(candidate: ArchieCandidate): {
  ok: boolean;
  error?: string;
} {
  if (!candidate.topic.trim()) {
    return { ok: false, error: "Candidate needs a topic" };
  }
  if (candidate.confidence < 0 || candidate.confidence > 1) {
    return { ok: false, error: "Confidence must be within 0..1" };
  }
  if (
    candidate.evidence_state === "SYSTEM_VERIFIED" ||
    candidate.evidence_state === "ACTUAL_OUTCOME"
  ) {
    return {
      ok: false,
      error: `New candidates can never be born verified, "${candidate.evidence_state}" is only reachable through human approval`,
    };
  }
  return { ok: true };
}

/** Promotion gate: is this candidate promotable by this actor? */
export function checkArchiePromotion(args: {
  candidate: ArchieCandidate;
  actorRole: ArchieContributor["role"];
  actorIsHuman: boolean;
  hasEngineeringReview?: boolean;
}): { ok: boolean; error?: string } {
  const { candidate, actorRole, actorIsHuman } = args;

  // ARCHIE never approves its own learning: the approver must be
  // a human in the ARCHIE_ADMIN role (DOMAIN_CONTRIBUTOR submits,
  // never approves; OBSERVER does neither).
  if (!actorIsHuman) {
    return { ok: false, error: "ARCHIE (AI) can never approve learning" };
  }
  if (actorRole !== "ARCHIE_ADMIN") {
    return { ok: false, error: "Only an ARCHIE_ADMIN may approve promotion" };
  }
  if (candidate.requires_engineering_review && !args.hasEngineeringReview) {
    return {
      ok: false,
      error:
        "High-risk knowledge (structural/foundation/safety/deterministic) requires the engineering-review process",
    };
  }
  const record = canRecordCandidate(candidate);
  if (!record.ok) return record;
  return { ok: true };
}
