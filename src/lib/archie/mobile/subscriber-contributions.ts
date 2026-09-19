// =========================================================
// FRELUX PHASE 8 P4, SUBSCRIBER CONTRIBUTIONS
//
// Subscribers may VOLUNTARILY contribute knowledge to
// ARCHIE. Every contribution records the full lineage:
// contributor, source device, source type, timestamp,
// project/property, country/region, evidence, provenance,
// confidence, consent status, scope, verification state,
// evaluation state, version and approval history.
//
// Important knowledge can always be traced back to its
// origin. Contributions are withdrawable; withdrawing an
// already-approved contribution flags the derived knowledge
// for human review rather than silently deleting history.
// =========================================================

import type { SubscriberContribution, MobileLearning } from "./p4-types";
import { MOBILE_BORN_EVIDENCE } from "./mobile-learning-pipeline";

/** Create a contribution from a VERSIONED mobile learning of
 *  the user's own data. The contribution requires the user's
 *  explicit global-contribution consent, verified by the
 *  caller via the scope transition (FRELUX_GLOBAL_CANDIDATE). */
export function createContribution(args: {
  learning: MobileLearning;
  country_region: string | null;
  project_ref?: string | null;
  property_ref?: string | null;
  evidence?: string[];
  now?: string;
}): { ok: boolean; error?: string; contribution?: SubscriberContribution } {
  const learning = args.learning;
  if (learning.pipeline_state !== "VERSIONED") {
    return {
      ok: false,
      error: "Only VERSIONED mobile learnings can become contributions",
    };
  }
  if (!learning.user_confirmed) {
    return {
      ok: false,
      error:
        "Contribution requires the user's explicit confirmation of what was learned",
    };
  }
  if (learning.scope !== "FRELUX_GLOBAL_CANDIDATE") {
    return {
      ok: false,
      error:
        "Contributions enter as FRELUX_GLOBAL_CANDIDATE scope (the user's contribution consent)",
    };
  }
  const topic = learning.learned[0]?.topic;
  if (!topic) {
    return { ok: false, error: "A contribution requires learned facts" };
  }
  const now = args.now ?? new Date().toISOString();
  const contribution: SubscriberContribution = {
    id: crypto.randomUUID(),
    user_id: learning.user_id,
    device_id: learning.device_id,
    source_type: learning.category,
    topic,
    content: mergeContent(learning.learned),
    project_ref: args.project_ref ?? null,
    property_ref: args.property_ref ?? null,
    country_region: args.country_region,
    evidence: args.evidence ?? [],
    provenance: {
      contributor_id: learning.user_id,
      device_id: learning.device_id,
      source_type: learning.category,
      contributed_at: now,
    },
    confidence: averageConfidence(learning.learned),
    consent_status: "GRANTED",
    scope: "FRELUX_GLOBAL_CANDIDATE",
    verification_state: MOBILE_BORN_EVIDENCE,
    evaluation_state: "UNEVALUATED",
    version: 1,
    approval_history: [
      {
        actor: "USER",
        action: "CONTRIBUTED",
        at: now,
        note: "User explicitly contributed this knowledge for FRELUX-wide evaluation",
      },
    ],
    withdrawn: false,
    withdrawn_at: null,
    created_date: now,
  };
  return { ok: true, contribution };
}

function mergeContent(
  learned: MobileLearning["learned"],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const fact of learned) {
    for (const [k, v] of Object.entries(fact.content)) {
      merged[k] = v;
    }
  }
  return merged;
}

function averageConfidence(learned: MobileLearning["learned"]): number {
  if (learned.length === 0) return 0;
  return learned.reduce((sum, f) => sum + f.confidence, 0) / learned.length;
}

export function traceOrigin(contribution: SubscriberContribution) {
  return {
    contribution_id: contribution.id,
    contributor_id: contribution.user_id,
    source_device_id: contribution.device_id,
    source_type: contribution.source_type,
    contributed_at: contribution.created_date,
    project_ref: contribution.project_ref,
    property_ref: contribution.property_ref,
    country_region: contribution.country_region,
    verification_state: contribution.verification_state,
    evaluation_state: contribution.evaluation_state,
    version: contribution.version,
    approval_history: contribution.approval_history,
    withdrawn: contribution.withdrawn,
  };
}

/** Withdraw a contribution (user's right). If the knowledge
 *  was already promoted to FRELUX_GLOBAL_APPROVED, the
 *  derived knowledge is FLAGGED for human review, history is
 *  never silently rewritten, and the withdrawal is recorded
 *  in the trace. */
export function withdrawContribution(
  contribution: SubscriberContribution,
  now?: string,
): {
  contribution: SubscriberContribution;
  derived_knowledge_action: "DELETE_CANDIDATE" | "FLAG_FOR_HUMAN_REVIEW";
} {
  const t = now ?? new Date().toISOString();
  const wasApproved = contribution.scope === "FRELUX_GLOBAL_APPROVED";
  return {
    contribution: {
      ...contribution,
      consent_status: "REVOKED",
      withdrawn: true,
      withdrawn_at: t,
      approval_history: [
        ...contribution.approval_history,
        {
          actor: "USER",
          action: "WITHDRAWN",
          at: t,
          note: "Contributor withdrew this contribution",
        },
      ],
    },
    derived_knowledge_action: wasApproved
      ? "FLAG_FOR_HUMAN_REVIEW"
      : "DELETE_CANDIDATE",
  };
}

/** A contributor's correction creates a new VERSION, the old
 *  version stays in history (audit + rollback). */
export function amendContribution(
  contribution: SubscriberContribution,
  corrected: {
    content?: Record<string, unknown>;
    country_region?: string | null;
  },
  now?: string,
): SubscriberContribution {
  const t = now ?? new Date().toISOString();
  return {
    ...contribution,
    content: corrected.content ?? contribution.content,
    country_region: corrected.country_region ?? contribution.country_region,
    version: contribution.version + 1,
    approval_history: [
      ...contribution.approval_history,
      {
        actor: "USER",
        action: "AMENDED",
        at: t,
        note: `Contributor corrected the contribution (version ${contribution.version + 1})`,
      },
    ],
  };
}
