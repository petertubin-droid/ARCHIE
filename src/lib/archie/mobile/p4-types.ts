// =========================================================
// FRELUX PHASE 8 P4, TRUSTED DEVICES & SUBSCRIBER
// INTELLIGENCE: TYPES
//
// ARCHIE operates across explicitly enrolled, authorized
// mobile devices. Every device has its own identity, user,
// token, permission set, security status and revocation
// state. Multiple devices are NEVER treated as one
// unrestricted device: consents and permission sets are
// per-device, and every learned item records its source
// device for full origin traceability.
//
// Authority boundaries (fixed):
//   KNOWLEDGE ≠ AUTHORITY
//   CONNECTION ≠ OWNERSHIP
//   CONSENT TO ANALYZE ≠ CONSENT TO SHARE
//   USER DATA ≠ GLOBAL KNOWLEDGE
// =========================================================

import type { ArchieEvidenceState } from "../types";

// ---------------------------------------------------------
// Trusted devices
// ---------------------------------------------------------

/** A device moves: PENDING → ENROLLED → ACTIVE, and can be
 *  SUSPENDED or REVOKED. Only ACTIVE + TRUSTED devices may
 *  interact with ARCHIE. */
export type DeviceEnrollmentState =
  | "PENDING"
  | "ENROLLED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED";

export type DeviceSecurityStatus = "TRUSTED" | "UNTRUSTED" | "SUSPICIOUS";

export interface TrustedDevice {
  id: string;
  user_id: string;
  /** User-chosen device name ("My Samsung A54"). */
  device_name: string;
  /** Stable non-covert fingerprint (Phase 8b scheme). */
  fingerprint: string;
  enrollment_state: DeviceEnrollmentState;
  security_status: DeviceSecurityStatus;
  /** SHA-256 digest of the device token. The token itself only
   *  ever lives on the device, FRELUX stores the digest. */
  token_digest: string;
  token_rotated_at: string;
  /** MobileDataCategory keys granted to THIS device. */
  permission_set: string[];
  enrolled_at: string;
  last_seen: string;
  revoked_at: string | null;
}

// ---------------------------------------------------------
// Granular consent categories (per device, per category)
// ---------------------------------------------------------

export type MobileDataCategory =
  | "PHOTOGRAPHS"
  | "VIDEOS"
  | "PDF_DOCUMENTS"
  | "VOICE_RECORDINGS"
  | "SELECTED_FILES"
  | "DRAWINGS"
  | "SCREENSHOTS"
  | "MEASUREMENTS"
  | "PROJECT_INFORMATION"
  | "CONSTRUCTION_OBSERVATIONS"
  | "MATERIAL_INFORMATION"
  | "PROJECT_OUTCOMES"
  | "USER_CORRECTIONS"
  | "AUTHORIZED_CODE_RESOURCES"
  | "OTHER_SELECTED_INFORMATION";

/** Categories that can NEVER be granted, they do not exist as
 *  capabilities anywhere in the system. Requesting them is a
 *  hard refusal, and the attempt is a security signal. */
export const FORBIDDEN_DEVICE_CATEGORIES: ReadonlySet<string> = new Set([
  "SILENT_MICROPHONE",
  "SILENT_CAMERA",
  "MESSAGES",
  "CALLS",
  "CONTINUOUS_LOCATION_TRACKING",
  "SCREEN_MONITORING",
  "ALL_DEVICE_FILES",
]);

export interface DeviceDataConsent {
  device_id: string;
  user_id: string;
  category: MobileDataCategory;
  granted: boolean;
  /** The explanation shown to the user at grant time. */
  explanation_shown: string | null;
  granted_at: string | null;
  revoked_at: string | null;
}

// ---------------------------------------------------------
// Mobile knowledge scope
// ---------------------------------------------------------

export type MobileKnowledgeScope =
  | "PRIVATE"
  | "PROJECT"
  | "PROPERTY"
  | "REGIONAL"
  | "FRELUX_GLOBAL_CANDIDATE"
  | "FRELUX_GLOBAL_APPROVED";

// ---------------------------------------------------------
// Mobile learning pipeline
// ---------------------------------------------------------

export type MobileLearningState =
  | "CONSENTED"
  | "SELECTED"
  | "INGESTED"
  | "EXTRACTED"
  | "STRUCTURED"
  | "VALIDATED"
  | "EVALUATED"
  | "SHOWN_TO_USER"
  | "USER_CONFIRMED"
  | "SCOPED"
  | "APPROVED"
  | "VERSIONED"
  | "REJECTED";

export const MOBILE_PIPELINE_ORDER: readonly MobileLearningState[] = [
  "CONSENTED",
  "SELECTED",
  "INGESTED",
  "EXTRACTED",
  "STRUCTURED",
  "VALIDATED",
  "EVALUATED",
  "SHOWN_TO_USER",
  "USER_CONFIRMED",
  "SCOPED",
  "APPROVED",
  "VERSIONED",
];

export interface MobileLearning {
  id: string;
  user_id: string;
  device_id: string;
  category: MobileDataCategory;
  pipeline_state: MobileLearningState;
  /** What the user was shown (required at SHOWN_TO_USER). */
  shown_summary: string | null;
  /** Explicit user confirmation (required beyond PRIVATE when
   *  the scope leaves the user's own data). */
  user_confirmed: boolean;
  scope: MobileKnowledgeScope | null;
  /** The structured facts learned (never raw data). */
  learned: Array<{
    topic: string;
    content: Record<string, unknown>;
    confidence: number;
  }>;
  flags: string[];
  created_date: string;
  updated_date: string;
}

// ---------------------------------------------------------
// Subscriber contributions
// ---------------------------------------------------------

export interface ContributionApprovalEntry {
  actor: "USER" | "ADMIN" | "OWNER" | "ENGINEER" | "ARCHIE";
  action: string;
  at: string;
  note: string;
}

export type ContributionEvaluationState =
  | "UNEVALUATED"
  | "EVALUATING"
  | "ACCEPTED"
  | "FLAGGED"
  | "REJECTED";

export interface SubscriberContribution {
  id: string;
  user_id: string;
  /** Origin traceability, always present. */
  device_id: string;
  source_type: MobileDataCategory;
  topic: string;
  content: Record<string, unknown>;
  project_ref: string | null;
  property_ref: string | null;
  country_region: string | null;
  evidence: string[];
  /** Full provenance, who, which device, when, from what. */
  provenance: {
    contributor_id: string;
    device_id: string;
    source_type: MobileDataCategory;
    contributed_at: string;
    extraction_note?: string;
  };
  confidence: number;
  consent_status: "GRANTED" | "REVOKED";
  scope: MobileKnowledgeScope;
  verification_state: ArchieEvidenceState;
  evaluation_state: ContributionEvaluationState;
  version: number;
  approval_history: ContributionApprovalEntry[];
  withdrawn: boolean;
  withdrawn_at: string | null;
  created_date: string;
}

// ---------------------------------------------------------
// Network quality (learning network)
// ---------------------------------------------------------

export interface NetworkSubmission {
  contribution_id: string;
  contributor_id: string;
  topic: string;
  domain: string;
  region: string | null;
  content: Record<string, unknown>;
  evidence_state: ArchieEvidenceState;
  confidence: number;
  created_at: string;
}
