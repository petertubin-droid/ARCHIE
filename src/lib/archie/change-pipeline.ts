// =========================================================
// FRELUX PHASE 8 P3, OWNER-GATED CHANGE PIPELINE
//
// When the owner asks ARCHIE to create something, work follows:
//
// REQUEST → UNDERSTAND → PLAN → IMPLEMENT → TEST → REVIEW →
// OWNER_AUTHORIZATION → APPLY
//
// KNOWLEDGE ≠ AUTHORITY, enforced here, not by convention:
//   * ARCHIE (the AI actor) can NEVER pass OWNER_AUTHORIZATION
//     and NEVER apply or deploy anything.
//   * Deterministic-math / structural / foundation / safety
//     changes additionally require a HUMAN engineer sign-off
//     at REVIEW, ARCHIE cannot sign for them either.
//   * APPLY requires a rollback plan, test evidence, and an
//     owner authorization record, always.
//   * States only move forward, one step at a time.
//
// Production deployment itself remains a human repo/CI action
// outside this pipeline; APPLY here records that the owner
// authorized the change for release.
// =========================================================

import { isMathCapability } from "@/lib/learning/learning-engine";

export type ChangeStage =
  | "REQUEST"
  | "UNDERSTAND"
  | "PLAN"
  | "IMPLEMENT"
  | "TEST"
  | "REVIEW"
  | "OWNER_AUTHORIZATION"
  | "APPLY"
  | "REJECTED";

export const CHANGE_STAGES: readonly ChangeStage[] = [
  "REQUEST",
  "UNDERSTAND",
  "PLAN",
  "IMPLEMENT",
  "TEST",
  "REVIEW",
  "OWNER_AUTHORIZATION",
  "APPLY",
];

export type ChangeActor = "ARCHIE" | "CONTRIBUTOR" | "ENGINEER" | "OWNER";

export interface ChangeRequest {
  id: string;
  title: string;
  /** What the change touches, areas enforce risk classification. */
  areas: string[];
  created_by: ChangeActor;
  created_at: string;
  stage: ChangeStage;
  /** Required artifacts, filled as work progresses. */
  understanding_summary?: string;
  plan?: string;
  implementation_summary?: string;
  test_evidence?: string;
  review_signoff_by?: ChangeActor;
  rollback_plan?: string;
  /** True when areas touch deterministic math/structural/
   *  foundation/safety, extra human gates apply. */
  requires_engineering_review: boolean;
  flags: string[];
}

/** Areas that force the engineering-review bar. */
const ENGINEERING_AREAS: readonly string[] = [
  "deterministic-math",
  "structural",
  "foundation",
  "safety",
  "engine",
  "formula",
];

export function createChangeRequest(args: {
  title: string;
  areas: string[];
  created_by: ChangeActor;
  now?: string;
}): ChangeRequest {
  const title = args.title.trim();
  if (!title) {
    throw new Error("A change request requires a title");
  }
  const requiresEngineering = args.areas.some((a) =>
    ENGINEERING_AREAS.some((ea) => a.toLowerCase().includes(ea)),
  );
  return {
    id: crypto.randomUUID(),
    title,
    areas: args.areas,
    created_by: args.created_by,
    created_at: args.now ?? new Date().toISOString(),
    stage: "REQUEST",
    requires_engineering_review: requiresEngineering,
    flags: requiresEngineering ? ["ENGINEERING_REVIEW_REQUIRED"] : [],
  };
}

export type AdvanceResult =
  | { ok: true; change: ChangeRequest }
  | { ok: false; error: string };

/** Advance the pipeline one stage. Every transition has an
 *  artifact requirement, and the human gates are absolute. */
export function advanceChange(
  change: ChangeRequest,
  to: ChangeStage,
  actor: ChangeActor,
  evidence: {
    understanding_summary?: string;
    plan?: string;
    implementation_summary?: string;
    test_evidence?: string;
    review_signoff_by?: ChangeActor;
    rollback_plan?: string;
  } = {},
): AdvanceResult {
  if (to === "REJECTED") {
    return { ok: true, change: { ...change, stage: "REJECTED" } };
  }
  const fromIdx = CHANGE_STAGES.indexOf(change.stage);
  const toIdx = CHANGE_STAGES.indexOf(to);
  if (toIdx === -1) return { ok: false, error: `Unknown stage "${to}"` };
  if (toIdx !== fromIdx + 1) {
    return {
      ok: false,
      error: `Stages advance one step at a time: ${change.stage} → ${to} is not allowed`,
    };
  }
  switch (to) {
    case "UNDERSTAND": {
      if (!evidence.understanding_summary?.trim()) {
        return { ok: false, error: "UNDERSTAND requires a written understanding summary" };
      }
      return { ok: true, change: { ...change, stage: to, understanding_summary: evidence.understanding_summary } };
    }
    case "PLAN": {
      if (!evidence.plan?.trim()) {
        return { ok: false, error: "PLAN requires a written implementation plan" };
      }
      return { ok: true, change: { ...change, stage: to, plan: evidence.plan } };
    }
    case "IMPLEMENT": {
      if (!evidence.implementation_summary?.trim()) {
        return { ok: false, error: "IMPLEMENT requires an implementation summary" };
      }
      return { ok: true, change: { ...change, stage: to, implementation_summary: evidence.implementation_summary } };
    }
    case "TEST": {
      if (!evidence.test_evidence?.trim()) {
        return { ok: false, error: "TEST requires recorded test evidence" };
      }
      return { ok: true, change: { ...change, stage: to, test_evidence: evidence.test_evidence } };
    }
    case "REVIEW": {
      const signer = evidence.review_signoff_by;
      if (!signer || signer === "ARCHIE") {
        return { ok: false, error: "REVIEW requires a human sign-off (ARCHIE cannot sign)" };
      }
      if (change.requires_engineering_review && signer !== "ENGINEER" && signer !== "OWNER") {
        return {
          ok: false,
          error:
            "This change touches deterministic/structural/safety systems: an engineer or the owner must sign the review",
        };
      }
      return { ok: true, change: { ...change, stage: to, review_signoff_by: signer } };
    }
    case "OWNER_AUTHORIZATION": {
      if (actor !== "OWNER") {
        return {
          ok: false,
          error: "Only the owner can authorize a change for application",
        };
      }
      if (!change.review_signoff_by) {
        return { ok: false, error: "Owner authorization requires a completed review first" };
      }
      if (!evidence.rollback_plan?.trim()) {
        return { ok: false, error: "A rollback plan is required before owner authorization" };
      }
      return { ok: true, change: { ...change, stage: to, rollback_plan: evidence.rollback_plan } };
    }
    case "APPLY": {
      if (actor !== "OWNER") {
        return { ok: false, error: "Only the owner can apply an authorized change" };
      }
      if (!change.rollback_plan) {
        return { ok: false, error: "APPLY requires an approved rollback plan" };
      }
      if (!change.test_evidence) {
        return { ok: false, error: "APPLY requires recorded test evidence" };
      }
      return { ok: true, change: { ...change, stage: to, flags: [...change.flags, "OWNER_APPLIED"] } };
    }
    default:
      return { ok: false, error: "Unreachable" };
  }
}

/** The fixed authority model, mirrors code-intelligence.ts. */
export const CHANGE_AUTHORITY = {
  archie_may_authorize: false,
  archie_may_apply: false,
  archie_may_deploy: false,
  owner_is_final_gate: true,
} as const;

/** Convenience for callers: can ARCHIE itself move this change
 *  past REVIEW? Always no. */
export function mayArchieAuthorize(): false {
  return false;
}

/** A change request whose areas reference MATH_CAPABILITIES gets
 *  the engineering-review bar no matter what the author wrote. */
export function classifyRisk(areas: string[], capabilities: string[]): {
  requires_engineering_review: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const areaHit = areas.some((a) =>
    ENGINEERING_AREAS.some((ea) => a.toLowerCase().includes(ea)),
  );
  if (areaHit) reasons.push("Area touches deterministic/structural/safety systems");
  const capHit = capabilities.some((c) => isMathCapability(c));
  if (capHit) reasons.push("Capability is protected deterministic math");
  return {
    requires_engineering_review: areaHit || capHit,
    reasons,
  };
}
