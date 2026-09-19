// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — CORE TYPES
//
// Extends (never replaces) the existing ARCHIE architecture:
//   * Owner authority — the existing archie-owner-auth
//     server-side (PBKDF2-verified) authorization records.
//   * Change requests — a persistent, audited CR system over
//     the existing change-pipeline authority model.
//   * Language memory — a knowledge/evidence layer on top of
//     the existing frelux_archie_languages registry (which
//     stays intact as the FRELUX REGISTERED languages).
//
// Hard rules encoded in the types themselves:
//   - LEARNING ≠ MEMORY ≠ AUTHORITY ≠ MODIFICATION.
//   - Validation states are explicit; unknown information is
//     never silently promoted to confirmed memory.
//   - Every mutating transition carries its actor and, where
//     owner-gated, its server-verified authorization record.
// =========================================================

// ---------------------------------------------------------
// Actors
// ---------------------------------------------------------

/** Who is acting. ARCHIE may observe, learn and propose.
 *  Only the OWNER authorizes. SYSTEM is deterministic
 *  infrastructure (never grants authority). */
export type EvolutionActor = "ARCHIE" | "OWNER" | "SYSTEM";

// ---------------------------------------------------------
// Change requests (§2, §3, §6, §7)
// ---------------------------------------------------------

export type ChangeRequestState =
  | "PROPOSED"
  | "AWAITING_OWNER"
  | "AUTHORIZED"
  | "STAGING"
  | "TESTING"
  | "PASSED"
  | "FAILED"
  | "EXECUTED"
  | "REJECTED"
  | "ROLLED_BACK";

export const CHANGE_REQUEST_STATES: readonly ChangeRequestState[] = [
  "PROPOSED",
  "AWAITING_OWNER",
  "AUTHORIZED",
  "STAGING",
  "TESTING",
  "PASSED",
  "FAILED",
  "EXECUTED",
  "REJECTED",
  "ROLLED_BACK",
];

export const TERMINAL_CR_STATES: readonly ChangeRequestState[] = [
  "FAILED",
  "REJECTED",
  "ROLLED_BACK",
];

export type ChangeRisk = "low" | "medium" | "high";
export type RequestedAuthorizationLevel = "staging" | "production";

/** One check executed against a staged change (§2 STAGE). */
export interface ChangeTestCheck {
  name: string;
  /** pass/fail/skipped — skipped must state why. */
  status: "passed" | "failed" | "skipped";
  detail: string;
}

export interface ChangeTestRun {
  checks: ChangeTestCheck[];
  ranAt: string;
  environment: "staging" | "none";
  summary: "all_passed" | "failures" | "not_run";
}

/** The full change request record (§3). */
export interface EvolutionChangeRequest {
  id: string;
  /** CR-YYYY-NNNN, immutable once issued. */
  crNumber: string;
  title: string;
  description: string;
  reason: string;
  affectedFiles: string[];
  affectedComponents: string[];
  /** Unified diff of the proposed change. */
  proposedDiff: string;
  dependencies: string[];
  securityImpact: string;
  dataImpact: string;
  regressionRisk: ChangeRisk;
  testPlan: string;
  testResults: ChangeTestRun | null;
  rollbackPlan: string;
  requestedLevel: RequestedAuthorizationLevel;
  /** Owner authorization status — derived from approvals. */
  ownerAuthorizationStatus:
    "none" | "staging_authorized" | "production_authorized" | "rejected";
  /** Server-verified authorization record ids (archie-owner-auth). */
  stagingAuthorizationRecordId: string | null;
  productionAuthorizationRecordId: string | null;
  rollbackAuthorizationRecordId: string | null;
  /** Commit SHA recorded after EXECUTED, when applicable. */
  resultingCommit: string | null;
  /** True when any protected surface is touched (§5). */
  requiresOwnerIntervention: boolean;
  flags: string[];
  archieVersion: string;
  createdAt: string;
  updatedAt: string;
  state: ChangeRequestState;
}

/** Append-only audit entry. Never updated, never deleted. */
export interface ChangeAuditEntry {
  id: string;
  changeRequestId: string;
  crNumber: string;
  actor: EvolutionActor;
  action: string;
  fromState: ChangeRequestState | null;
  toState: ChangeRequestState | null;
  /** Authorization record referenced, if any. */
  authorizationRecordId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------
// Universal language learning (§8–§13)
// ---------------------------------------------------------

export type LanguageRegistryStatus =
  "frelux_registered" | "archie_learned" | "currently_learning" | "discovered";

export type LanguageValidationState =
  | "DISCOVERED"
  | "LEARNING"
  | "VALIDATING"
  | "CONFIRMED"
  | "REJECTED"
  | "NEEDS_REVIEW";

export type LanguageEntryKind = "vocabulary" | "grammar" | "phrase";

export type EvidenceSourceType =
  | "owner_provided"
  | "frelux_dictionary"
  | "external_reference"
  | "ai_inference";

/** A language profile (§10). */
export interface LanguageProfile {
  id: string;
  name: string;
  nativeName: string;
  isoCode: string | null;
  altNames: string[];
  family: string | null;
  writingSystem: string[];
  regions: string[];
  dialects: string[];
  registryStatus: LanguageRegistryStatus;
  /** Confidence across validated categories, 0..1 (null = not yet assessed). */
  confidence: number | null;
  verificationStatus: LanguageValidationState;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** One knowledge entry — vocabulary, grammar rule or phrase. */
export interface LanguageEntry {
  id: string;
  profileId: string;
  kind: LanguageEntryKind;
  /** Normalized key (word, rule id, phrase id) — case-folded. */
  key: string;
  /** Structured payload: translations, transliteration, part of
   *  speech, pronunciation, grammar info, examples (§10). */
  payload: Record<string, unknown>;
  /** Dialect/region qualifier — variants coexist (§12). */
  region: string | null;
  confidence: number | null;
  validationState: LanguageValidationState;
  /** Superseded payload snapshots (version history, §12). */
  history: Array<{
    version: number;
    payload: Record<string, unknown>;
    supersededAt: string;
  }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Evidence backing an entry (§11). */
export interface LanguageEvidence {
  id: string;
  entryId: string;
  source: string;
  sourceType: EvidenceSourceType;
  /** Source reliability 0..1 — set conservatively. */
  reliability: number;
  /** What the source says (structured or text). */
  content: Record<string, unknown>;
  createdAt: string;
}

/** Confidence per knowledge category (§11 example). */
export interface LanguageConfidenceCategories {
  vocabulary?: number;
  grammar?: number;
  translation?: number;
  pronunciation?: number;
  dialect?: number;
}

// ---------------------------------------------------------
// Evolution memory (§15)
// ---------------------------------------------------------

export interface EvolutionMemoryEntry {
  id: string;
  /** PROBLEM → PROPOSAL → DECISION → RESULT → LESSON. */
  problem: string;
  proposedSolution: string;
  ownerDecision: string;
  implementationResult: string | null;
  testResult: string | null;
  productionResult: string | null;
  failureInformation: string | null;
  rollbackInformation: string | null;
  lessonsLearned: string | null;
  relatedCrNumber: string | null;
  affectedVersion: string | null;
  createdAt: string;
}

// ---------------------------------------------------------
// Owner settings (§17)
// ---------------------------------------------------------

export interface LanguageLearningSettings {
  enabled: boolean;
  autoLearning: boolean;
  autoMemory: boolean;
  externalResearch: boolean;
  dialectLearning: boolean;
  /** 0..1 — permanent memory requires at least this. */
  minConfidenceThreshold: number;
  requireApprovalBeforePermanentMemory: boolean;
}

export interface SelfModificationSettings {
  selfCodeAnalysis: boolean;
  automaticChangeProposals: boolean;
  stagingPermission: boolean;
  productionModification: boolean;
  requireExplicitApproval: boolean;
  automaticRollback: boolean;
  maxChangeRiskAllowed: ChangeRisk;
  protectedPaths: string[];
}

export interface EvolutionSettings {
  language: LanguageLearningSettings;
  selfModification: SelfModificationSettings;
  updatedAt: string;
}

// ---------------------------------------------------------
// Result envelope
// ---------------------------------------------------------

export type EvolutionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };
