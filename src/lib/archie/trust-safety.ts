// =========================================================
// FRELUX TRUST & SAFETY CORE, INTEGRATED WITH ARCHIE
//
// ARCHIE analyzes FRELUX-controlled activity for spam,
// scams, impersonation, fraudulent contractor/supplier
// profiles, suspicious payment requests, manipulated
// reviews, malicious links/files, account takeover
// indicators, marketplace abuse, suspicious transaction
// patterns, coordinated manipulation and repeated
// fraudulent behavior.
//
// Everything is EVIDENCE-BASED: a risk score requires
// recorded evidence. AI confidence alone is never
// evidence, never risk justification, and NEVER financial
// truth. Significant detections are auditable records.
// =========================================================

import type { ReviewSeverity } from "./code-review-intelligence";

// ---------------------------------------------------------
// Signal taxonomy
// ---------------------------------------------------------
export type TrustSafetySignal =
  | "spam_message_flooding"
  | "scam_attempt"
  | "impersonation"
  | "fraudulent_contractor_supplier_profile"
  | "suspicious_payment_request"
  | "manipulated_review"
  | "malicious_link_or_file"
  | "account_takeover_indicator"
  | "marketplace_abuse"
  | "suspicious_transaction_pattern"
  | "coordinated_manipulation"
  | "repeated_fraudulent_behavior";

export const TRUST_SAFETY_SIGNALS: readonly TrustSafetySignal[] = [
  "spam_message_flooding",
  "scam_attempt",
  "impersonation",
  "fraudulent_contractor_supplier_profile",
  "suspicious_payment_request",
  "manipulated_review",
  "malicious_link_or_file",
  "account_takeover_indicator",
  "marketplace_abuse",
  "suspicious_transaction_pattern",
  "coordinated_manipulation",
  "repeated_fraudulent_behavior",
];

/** Base evidence weight per signal, stronger signals carry
 *  more risk. Every point must still be backed by recorded
 *  evidence. */
const SIGNAL_BASE_WEIGHT: Record<TrustSafetySignal, number> = {
  spam_message_flooding: 15,
  scam_attempt: 30,
  impersonation: 25,
  fraudulent_contractor_supplier_profile: 25,
  suspicious_payment_request: 25,
  manipulated_review: 20,
  malicious_link_or_file: 30,
  account_takeover_indicator: 30,
  marketplace_abuse: 20,
  suspicious_transaction_pattern: 25,
  coordinated_manipulation: 25,
  repeated_fraudulent_behavior: 25,
};

// ---------------------------------------------------------
// Evidence
// ---------------------------------------------------------
export interface TrustSafetyEvidence {
  /** What was observed, verifiable record reference. */
  observed: string;
  /** Where: message id, listing id, transaction ref, profile… */
  source_ref: string;
  /** When the evidence was captured. */
  captured_at: string;
}

/** Evidence must be concrete: an observation with a source
 *  reference and a timestamp. Confidence is NOT evidence. */
export function isEvidenceValid(e: TrustSafetyEvidence): boolean {
  return (
    e.observed.trim().length > 0 &&
    e.source_ref.trim().length > 0 &&
    !Number.isNaN(Date.parse(e.captured_at))
  );
}

// ---------------------------------------------------------
// Assessment
// ---------------------------------------------------------
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface TrustSafetyAssessment {
  account_id: string;
  signals: TrustSafetySignal[];
  evidence: TrustSafetyEvidence[];
  /** 0–100, computed ONLY from evidence-backed signals. */
  risk_score: number;
  risk_level: RiskLevel;
  /** The audit record for a significant detection. */
  detection_record: {
    account_identity: string;
    detected_behaviors: TrustSafetySignal[];
    evidence: TrustSafetyEvidence[];
    risk_level: RiskLevel;
    risk_score: number;
    assessed_at: string;
    assessor: "ARCHIE";
    review_status: "PENDING_OWNER_REVIEW" | "REVIEWED";
  };
}

/** Map a 0–100 score onto a risk level. */
export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export type AssessmentResult =
  | { ok: true; assessment: TrustSafetyAssessment }
  | { ok: false; error: string };

/** Assess trust & safety for one account. EVIDENCE IS
 *  MANDATORY: signals without valid evidence are dropped,
 *  and an assessment with no valid evidence is refused :
 *  ARCHIE never flags on confidence alone. Repeated signals
 *  escalate: each repeated evidence-backed signal adds a
 *  smaller escalation bump. */
export function assessTrustSafety(input: {
  account_id: string;
  signals: TrustSafetySignal[];
  evidence: TrustSafetyEvidence[];
  now?: string;
}): AssessmentResult {
  const accountId = input.account_id.trim();
  if (!accountId)
    return { ok: false, error: "An assessment requires the account identity" };

  // Pair every signal with at least one valid evidence item.
  const validEvidence = input.evidence.filter(isEvidenceValid);
  if (validEvidence.length === 0) {
    return {
      ok: false,
      error:
        "No valid evidence: a risk assessment cannot rely on confidence alone",
    };
  }
  // All signals are backed: validEvidence.length > 0 is guaranteed
  // by the early return above (the old .filter(() => true) was a
  // constant no-op).
  const backed = input.signals;

  // Score: sum of base weights, escalating on repetition.
  let score = 0;
  const seen = new Map<TrustSafetySignal, number>();
  for (const signal of backed) {
    const repeats = (seen.get(signal) ?? 0) + 1;
    seen.set(signal, repeats);
    score += SIGNAL_BASE_WEIGHT[signal] + (repeats - 1) * 5;
  }
  score = Math.min(100, score);
  const riskLevel = riskLevelForScore(score);

  return {
    ok: true,
    assessment: {
      account_id: accountId,
      signals: backed,
      evidence: validEvidence,
      risk_score: score,
      risk_level: riskLevel,
      detection_record: {
        account_identity: accountId,
        detected_behaviors: backed,
        evidence: validEvidence,
        risk_level: riskLevel,
        risk_score: score,
        assessed_at: input.now ?? new Date().toISOString(),
        assessor: "ARCHIE",
        review_status: score >= 50 ? "PENDING_OWNER_REVIEW" : "REVIEWED",
      },
    },
  };
}

// ---------------------------------------------------------
// Governance separation (amendment section 8)
// ---------------------------------------------------------
export type AuthorityLayer =
  | "ARCHIE_DETECTION"
  | "ARCHIE_RECOMMENDATION"
  | "ARCHIE_TEMPORARY_SECURITY_ENFORCEMENT"
  | "OWNER_AUTHORITY"
  | "PAYMENT_ESCROW_PROVIDER_AUTHORITY";

export const AUTHORITY_LAYERS: Readonly<
  Record<AuthorityLayer, { label: string; scope: string }>
> = {
  ARCHIE_DETECTION: {
    label: "ARCHIE, Detection",
    scope:
      "Evidence-based detection of spam, fraud, abuse and risk. Detects; never judges finances.",
  },
  ARCHIE_RECOMMENDATION: {
    label: "ARCHIE, Recommendation",
    scope:
      "Recommends actions (pause, flag, dispute analysis). Recommendations carry evidence and provenance; they are never self-executing financial decisions.",
  },
  ARCHIE_TEMPORARY_SECURITY_ENFORCEMENT: {
    label: "ARCHIE, Temporary Security Enforcement",
    scope:
      "Explicitly owner-authorized, bounded: temporary account pauses for HIGH/CRITICAL evidence-backed violations, pending owner review, with maximum duration and appeal.",
  },
  OWNER_AUTHORITY: {
    label: "Owner, Final Authority",
    scope:
      "Final authority on reinstatement, restriction, termination, protected production and financial decisions.",
  },
  PAYMENT_ESCROW_PROVIDER_AUTHORITY: {
    label: "Payment/Escrow Provider, Funds Authority",
    scope:
      "Sole authority over custody, movement, release and refund of funds under its own controls and applicable regulation.",
  },
};

export const FINAL_PRINCIPLE = {
  archie_understands_frelux: true,
  archie_understands_its_code: true,
  archie_can_learn_coding_and_app_development: true,
  archie_identifies_bugs_warnings_vulnerabilities: true,
  archie_prepares_and_tests_fixes: true,
  archie_monitors_spam_and_fraud: true,
  archie_can_temporarily_pause_serious_offenders_when_authorized: true,
  archie_assists_escrow_and_transaction_intelligence: true,
  archie_cannot_bypass_owner_protected_authority: true,
  archie_cannot_independently_perform_irreversible_financial_or_production_actions: true,
  archie_is: "broad operational intelligence",
  owner_is: "final authority",
  ai_confidence_is_not_financial_truth: true,
} as const;

/** Provenance requirement for significant enforcement and
 *  transaction decisions (amendment section 8). */
export function hasValidProvenance(decision: {
  evidence: unknown[];
  reason: string;
  assessor: string;
  timestamp: string;
}): boolean {
  return (
    Array.isArray(decision.evidence) &&
    decision.evidence.length > 0 &&
    decision.reason.trim().length > 0 &&
    decision.assessor.trim().length > 0 &&
    !Number.isNaN(Date.parse(decision.timestamp))
  );
}

export type { ReviewSeverity };
