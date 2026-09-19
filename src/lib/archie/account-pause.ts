// =========================================================
// FRELUX ARCHIE AMENDMENT, ACCOUNT PAUSE AUTHORITY
//
// The Owner EXPLICITLY authorizes ARCHIE to temporarily
// pause/suspend an offender account when STRONG EVIDENCE
// indicates serious spam, fraud, abuse, compromise or other
// FRELUX policy violations, pending Owner review.
//
// Workflow:
//   DETECT → ANALYZE → COLLECT EVIDENCE → RISK ASSESSMENT →
//   TEMPORARY PAUSE → NOTIFY OWNER → OWNER REVIEW →
//   REINSTATE / RESTRICT / TERMINATE
//
// Hard limits, enforced, not advised:
//   * Maximum suspension period (72h); a pause that the
//     Owner has not reviewed EXPIRES and the account is
//     reinstated pending the Owner's decision.
//   * ARCHIE can NEVER permanently terminate an account.
//   * ARCHIE can NEVER pause the Owner.
//   * ARCHIE can NEVER use this permission to bypass Owner
//     authority.
//   * Every pause records: account identity, reason,
//     evidence, detected behavior, risk level, timestamp,
//     ARCHIE decision, review status, final Owner decision.
//   * The account is notified of the pause and has an
//     appeal path, appeal goes to the Owner.
// =========================================================

import {
  assessTrustSafety,
  type TrustSafetyAssessment,
  type RiskLevel,
  type TrustSafetySignal,
  type TrustSafetyEvidence,
} from "./trust-safety";

export const MAX_SUSPENSION_HOURS = 72;

export const PAUSE_WORKFLOW: readonly string[] = [
  "DETECT",
  "ANALYZE",
  "COLLECT EVIDENCE",
  "RISK ASSESSMENT",
  "TEMPORARY PAUSE",
  "NOTIFY OWNER",
  "OWNER REVIEW",
  "REINSTATE / RESTRICT / TERMINATE",
];

export type PauseStage =
  | "DETECTED"
  | "ANALYZED"
  | "EVIDENCE_COLLECTED"
  | "RISK_ASSESSED"
  | "PAUSED"
  | "OWNER_NOTIFIED"
  | "OWNER_REVIEWED"
  | "REINSTATED"
  | "RESTRICTED"
  | "TERMINATED"
  | "EXPIRED";

export type OwnerDecision = "REINSTATE" | "RESTRICT" | "TERMINATE" | "PENDING";

export interface AccountPauseRecord {
  id: string;
  account_identity: string;
  reason: string;
  evidence: TrustSafetyEvidence[];
  detected_behaviors: TrustSafetySignal[];
  risk_level: RiskLevel;
  risk_score: number;
  paused_at: string;
  /** Hard-bounded: paused_at + MAX_SUSPENSION_HOURS. */
  expires_at: string;
  archie_decision: "TEMPORARY PAUSE (authorized, pending Owner review)";
  review_status: "PENDING_OWNER_REVIEW" | "REVIEWED";
  final_owner_decision: OwnerDecision;
  owner_reviewed_at?: string;
  notification: {
    owner_notified_at: string;
    account_notified: true;
    appeal_available: true;
    appeal_to: "OWNER";
  };
}

export type PauseResult =
  | { ok: true; pause: AccountPauseRecord }
  | { ok: false; error: string };

/** ARCHIE may open a temporary pause ONLY when:
 *  1. the risk assessment is HIGH or CRITICAL,
 *  2. it is backed by valid evidence,
 *  3. the target is NOT the owner,
 *  4. the reason is stated for the audit record. */
export function proposeAccountPause(input: {
  account_id: string;
  is_owner_account: boolean;
  reason: string;
  signals: TrustSafetySignal[];
  evidence: TrustSafetyEvidence[];
  now?: string;
}): PauseResult {
  if (input.is_owner_account) {
    return { ok: false, error: "ARCHIE can never pause the Owner" };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "A pause requires a stated reason" };
  }
  const assessment = assessTrustSafety({
    account_id: input.account_id,
    signals: input.signals,
    evidence: input.evidence,
    now: input.now,
  });
  if (!assessment.ok) return { ok: false, error: assessment.error };

  const { risk_level, risk_score } = assessment.assessment;
  if (risk_level !== "HIGH" && risk_level !== "CRITICAL") {
    return {
      ok: false,
      error: `Risk level ${risk_level} does not meet the pause threshold, only HIGH or CRITICAL evidence-backed violations may be paused, pending Owner review`,
    };
  }
  const now = input.now ?? new Date().toISOString();
  const expires = new Date(
    new Date(now).getTime() + MAX_SUSPENSION_HOURS * 3_600_000,
  ).toISOString();
  return {
    ok: true,
    pause: {
      id: crypto.randomUUID(),
      account_identity: input.account_id,
      reason: input.reason,
      evidence: assessment.assessment.evidence,
      detected_behaviors: assessment.assessment.signals,
      risk_level,
      risk_score,
      paused_at: now,
      expires_at: expires,
      archie_decision: "TEMPORARY PAUSE (authorized, pending Owner review)",
      review_status: "PENDING_OWNER_REVIEW",
      final_owner_decision: "PENDING",
      notification: {
        owner_notified_at: now,
        account_notified: true,
        appeal_available: true,
        appeal_to: "OWNER",
      },
    },
  };
}

/** Does a pause still hold? Pauses are temporary: past
 *  expires_at the pause EXPIRES and the account is
 *  reinstated pending the Owner's decision, ARCHIE never
 *  extends its own pause. */
export function isPauseActive(pause: AccountPauseRecord, now?: string): {
  active: boolean;
  stage: PauseStage;
} {
  const t = now ? new Date(now).getTime() : Date.now();
  if (pause.review_status === "REVIEWED") {
    const decided: PauseStage =
      pause.final_owner_decision === "REINSTATE"
        ? "REINSTATED"
        : pause.final_owner_decision === "RESTRICT"
          ? "RESTRICTED"
          : pause.final_owner_decision === "TERMINATE"
            ? "TERMINATED"
            : "OWNER_REVIEWED";
    return { active: decided === "RESTRICTED", stage: decided };
  }
  if (t >= new Date(pause.expires_at).getTime()) {
    return { active: false, stage: "EXPIRED" };
  }
  return { active: true, stage: "PAUSED" };
}

/** The account's appeal, always routed to the Owner. ARCHIE
 *  records it; it cannot adjudicate its own pause. */
export function recordAppeal(
  pause: AccountPauseRecord,
  appealText: string,
): { ok: boolean; error?: string; pause?: AccountPauseRecord } {
  if (!appealText.trim()) return { ok: false, error: "An appeal requires text" };
  return {
    ok: true,
    pause: {
      ...pause,
      notification: { ...pause.notification, appeal_available: true, appeal_to: "OWNER" },
      // appeal keeps the pause PENDING_OWNER_REVIEW, the Owner decides
      review_status: "PENDING_OWNER_REVIEW",
    },
  };
}

/** OWNER REVIEW, the final decision. ARCHIE can never call
 *  this: actor must be OWNER, and TERMINATION is ONLY ever
 *  an owner decision. */
export function ownerReview(
  pause: AccountPauseRecord,
  decision: Exclude<OwnerDecision, "PENDING">,
  actor: "ARCHIE" | "OWNER",
  now?: string,
): { ok: boolean; error?: string; pause?: AccountPauseRecord } {
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the Owner reviews a pause, ARCHIE can never adjudicate its own enforcement",
    };
  }
  return {
    ok: true,
    pause: {
      ...pause,
      review_status: "REVIEWED",
      final_owner_decision: decision,
      owner_reviewed_at: now ?? new Date().toISOString(),
    },
  };
}

/** Exported for the client layer: build the assessment record
 *  (DETECT → ANALYZE → COLLECT EVIDENCE → RISK ASSESSMENT)
 *  before deciding whether to pause. */
export function riskAssessment(input: {
  account_id: string;
  signals: TrustSafetySignal[];
  evidence: TrustSafetyEvidence[];
  now?: string;
}): { ok: boolean; error?: string; assessment?: TrustSafetyAssessment } {
  const r = assessTrustSafety({ ...input });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, assessment: r.assessment };
}
