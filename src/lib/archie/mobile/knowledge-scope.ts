// =========================================================
// FRELUX PHASE 8 P4, MOBILE KNOWLEDGE SCOPE
//
// Every learned item carries an EXPLICIT scope:
//
//   PRIVATE                only the contributing user
//   PROJECT                authorized members of the project
//   PROPERTY               authorized property context
//   REGIONAL               regional context, after verification
//   FRELUX_GLOBAL_CANDIDATE  submitted for FRELUX-wide evaluation
//   FRELUX_GLOBAL_APPROVED   global, only after full approval
//
// The central prohibition, enforced as a transition matrix:
//
//   USER DATA → GLOBAL KNOWLEDGE IS FORBIDDEN
//
// A subscriber's private data NEVER becomes global ARCHIE
// knowledge. The only path toward global is the user's own
// explicit contribution (→ CANDIDATE) followed by the human
// verification/approval pipeline (→ APPROVED). There is no
// direct route to APPROVED, ever.
//
// CONSENT TO ANALYZE ≠ CONSENT TO SHARE: analyzing private data
// (PRIVATE scope) requires no sharing; contributing to the
// FRELUX ecosystem requires a SECOND, explicit consent.
// =========================================================

import type { MobileKnowledgeScope } from "./p4-types";

const SCOPE_RANK: Record<MobileKnowledgeScope, number> = {
  PRIVATE: 0,
  PROJECT: 1,
  PROPERTY: 1,
  REGIONAL: 2,
  FRELUX_GLOBAL_CANDIDATE: 3,
  FRELUX_GLOBAL_APPROVED: 4,
};

export interface ScopeTransitionResult {
  allowed: boolean;
  requires_user_consent: boolean;
  requires_human_approval: boolean;
  reason: string;
}

/** The scope transition matrix. Anything not permitted here is
 *  forbidden, there are no implicit promotions. */
export function evaluateScopeTransition(
  from: MobileKnowledgeScope,
  to: MobileKnowledgeScope,
  opts: {
    /** The separate, explicit "contribute to FRELUX" consent. */
    user_contributes?: boolean;
    /** Human approval record id (admin/owner pipeline). */
    human_approval_id?: string;
  } = {},
): ScopeTransitionResult {
  if (from === to) {
    return {
      allowed: true,
      requires_user_consent: false,
      requires_human_approval: false,
      reason: "Same scope.",
    };
  }
  // Narrowing (toward PRIVATE) is always the user's right.
  if (SCOPE_RANK[to] < SCOPE_RANK[from] && to !== "FRELUX_GLOBAL_APPROVED") {
    return {
      allowed: true,
      requires_user_consent: false,
      requires_human_approval: false,
      reason: "Narrowing scope is the user's right at any time.",
    };
  }
  // PROJECT ↔ PROPERTY moves stay inside the user's authorized
  // contexts and need explicit context approval only.
  if (
    (from === "PROJECT" && to === "PROPERTY") ||
    (from === "PROPERTY" && to === "PROJECT")
  ) {
    return {
      allowed: true,
      requires_user_consent: false,
      requires_human_approval: true,
      reason: "Cross-context move needs a reviewer's confirmation of the context.",
    };
  }
  switch (to) {
    case "PRIVATE":
      return {
        allowed: true,
        requires_user_consent: false,
        requires_human_approval: false,
        reason: "Narrowing to PRIVATE is the user's right at any time.",
      };
    case "PROJECT":
    case "PROPERTY":
      return {
        allowed: true,
        requires_user_consent: false,
        requires_human_approval: true,
        reason: `Sharing private data into ${to} scope requires human approval, consent to analyze is not consent to share.`,
      };
    case "REGIONAL":
      return {
        allowed: true,
        requires_user_consent: false,
        requires_human_approval: true,
        reason: "Regional scope requires verification and human approval.",
      };
    case "FRELUX_GLOBAL_CANDIDATE":
      if (!opts.user_contributes) {
        return {
          allowed: false,
          requires_user_consent: true,
          requires_human_approval: false,
          reason:
            "USER DATA → GLOBAL is forbidden without the user's explicit, separate contribution consent.",
        };
      }
      return {
        allowed: true,
        requires_user_consent: true,
        requires_human_approval: false,
        reason:
          "User explicitly contributed: the item enters the candidate pool for evaluation. It is NOT global knowledge yet.",
      };
    case "FRELUX_GLOBAL_APPROVED":
      if (from !== "FRELUX_GLOBAL_CANDIDATE") {
        return {
          allowed: false,
          requires_user_consent: false,
          requires_human_approval: true,
          reason:
            "Direct approval is forbidden: knowledge must pass through FRELUX_GLOBAL_CANDIDATE evaluation first.",
        };
      }
      if (!opts.human_approval_id) {
        return {
          allowed: false,
          requires_user_consent: false,
          requires_human_approval: true,
          reason:
            "Global approval requires the human verification/approval pipeline. ARCHIE never self-approves.",
        };
      }
      return {
        allowed: true,
        requires_user_consent: false,
        requires_human_approval: true,
        reason: "Human-approved global knowledge (approval record retained).",
      };
  }
}

/** Default scope for anything learned from a device: PRIVATE.
 *  Never assume a wider scope. */
export const DEFAULT_MOBILE_SCOPE: MobileKnowledgeScope = "PRIVATE";

/** Which scopes require the SHOW USER / USER CONFIRMATION
 *  steps before the item is finalized. */
export function requiresUserConfirmation(
  scope: MobileKnowledgeScope,
): boolean {
  return scope !== "PRIVATE";
}

/** Which scopes require the human/owner approval pipeline
 *  after user confirmation. */
export function requiresHumanApproval(scope: MobileKnowledgeScope): boolean {
  return (
    scope === "PROJECT" ||
    scope === "PROPERTY" ||
    scope === "REGIONAL" ||
    scope === "FRELUX_GLOBAL_APPROVED"
  );
}

/** Map to the Phase 6.5 persistence scopes when mobile-learned
 *  knowledge is versioned into frelux_knowledge_items. The
 *  GLOBAL persistence scope is reserved for APPROVED items;
 *  candidates keep their candidate status in the mobile
 *  tables until human-promoted. */
export function toPersistenceScope(
  scope: MobileKnowledgeScope,
): "USER" | "PROJECT" | "PROPERTY" | "REGIONAL" | "GLOBAL" {
  switch (scope) {
    case "PRIVATE":
      return "USER";
    case "PROJECT":
      return "PROJECT";
    case "PROPERTY":
      return "PROPERTY";
    case "REGIONAL":
      return "REGIONAL";
    case "FRELUX_GLOBAL_CANDIDATE":
    case "FRELUX_GLOBAL_APPROVED":
      return "GLOBAL";
  }
}

/** The four authority boundaries, fixed. */
export const P4_AUTHORITY_BOUNDARIES = {
  knowledge_nequals_authority: true,
  connection_nequals_ownership: true,
  consent_to_analyze_nequals_consent_to_share: true,
  user_data_nequals_global_knowledge: true,
} as const;
