// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — TYPES
//
// The fourth permanent intelligence layer (spec §EVIDENCE).
// Sits ABOVE the Lexicon, Semantic Graph and Context &
// Inference layers and CONNECTS them: every evidence record
// references the real lower-layer rows through source_ref;
// lower-layer knowledge statuses ride along unchanged —
// nothing is re-stamped, duplicated or bypassed.
//
// EPISTEMIC CONTRACT (spec §§5, §15, §16, §26):
//   VERIFIED      — strongly supported by reliable evidence
//   SUPPORTED     — evidence exists and reasonably supports
//   USER_PROVIDED — user/owner statement, never silently
//                   converted to independently verified fact
//   INFERRED      — derived through an allowed inference
//   CONFLICTED    — credible sources disagree
//   OUTDATED      — may have been correct, no longer current
//   UNVERIFIED    — insufficient evidence to establish
//   UNKNOWN       — not enough information to determine
//
// The engine NEVER manufactures sources, citations,
// statistics, measurements, quotations or dates. A claim
// whose source genuinely does not exist is
// SOURCE_UNAVAILABLE — never a fabricated source.
// =========================================================

/** Machine-readable verification states (spec §5). */
export type VerificationState =
  | "VERIFIED"
  | "SUPPORTED"
  | "USER_PROVIDED"
  | "INFERRED"
  | "CONFLICTED"
  | "OUTDATED"
  | "UNVERIFIED"
  | "UNKNOWN";

/** Conflict state for a claim (separate from its evidence
 *  state — a CONFLICTED claim keeps both flags honestly). */
export type ClaimConflictState = "NONE" | "CONFLICTED" | "RESOLVED";

/** SOURCE_AVAILABLE vs SOURCE_UNAVAILABLE (spec §4): a claim
 *  with no genuine source is never given a fabricated one. */
export type SourceAvailability = "SOURCE_AVAILABLE" | "SOURCE_UNAVAILABLE";

/** Temporal validity (spec §12). Old information is never
 *  treated as automatically current. */
export type TemporalState =
  | "HISTORICAL" // applicable_from in the past, no end, previously supported
  | "CURRENT" // valid now (or no temporal restriction and evidence current)
  | "FUTURE_DATED" // applicable_from in the future
  | "EXPIRED" // applicable_until in the past
  | "SUPERSEDED" // superseded by a newer claim version
  | "UNDETERMINED"; // no temporal metadata — stated honestly

/** Evidence categories (spec §6). NOT all equivalent —
 *  tiering happens in sources.ts with a documented basis. */
export type EvidenceType =
  | "DIRECT_SOURCE"
  | "OFFICIAL_DOCUMENTATION"
  | "STRUCTURED_DATABASE"
  | "USER_PROVIDED_EVIDENCE"
  | "OBSERVED_APP_DATA"
  | "MATHEMATICAL_DERIVATION"
  | "DETERMINISTIC_CALCULATOR"
  | "SEMANTIC_RELATIONSHIP"
  | "GRAPH_RELATIONSHIP"
  | "INFERENCE"
  | "HISTORICAL_RECORD"
  | "TEMPORAL_EVIDENCE"
  | "DOMAIN_SPECIFIC"
  | "CORROBORATING"
  | "CONTRADICTORY";

/** Where evidence physically comes from. Drives reliability
 *  classification — never a flat "source X is always true". */
export type SourceType =
  | "SEMANTIC_GRAPH"
  | "LEXICON"
  | "FRELUX_CALCULATOR"
  | "FRELUX_DATABASE"
  | "CONVERSATION"
  | "USER_STATEMENT"
  | "EXTERNAL_DOCUMENT"
  | "ARCHIE_INFERENCE"
  | "APP_OBSERVATION"
  | "HISTORICAL_RECORD";

/** Ordinal reliability tiers with a DOCUMENTED basis (spec
 *  §9, §17). No invented numeric confidence — an ordinal
 *  tier plus the reason it was assigned. */
export type ReliabilityTier =
  | "DETERMINISTIC" // deterministic calculator / mathematical derivation
  | "STRUCTURED_VERIFIED" // lower layer already VERIFIED (sourced relationship)
  | "STRUCTURED" // real structured data, not independently verified
  | "DOCUMENTED" // external documentation, unverified by ARCHIE
  | "USER_STATEMENT" // user/owner said so — context, not independent fact
  | "DERIVED" // ARCHIE inference — always distinguishable from fact
  | "UNRATED"; // no basis for a rating — honesty over invention

export interface Reliability {
  tier: ReliabilityTier;
  /** WHY this tier was assigned — documented basis only. */
  basis: string;
}

/** One step in a provenance chain (spec §7): SOURCE →
 *  extracted fact → normalized fact → graph relationship →
 *  inference. Every transformation APPENDS a step; the
 *  original source step is never lost. */
export interface ProvenanceStep {
  stage: string; // e.g. "SOURCE", "EXTRACTED_FACT", "GRAPH_RELATIONSHIP", "INFERENCE"
  detail: string;
  subsystem: string;
  at: string; // ISO timestamp
  /** Transformation applied to produce this step. */
  transformation?: string;
}

/** Claim shape as passed in by callers (spec §4). */
export interface ClaimDraft {
  subject: string;
  predicate: string;
  objectValue?: string | null;
  claimType?: "ATTRIBUTE" | "RELATION" | "QUANTITY" | "EVENT" | "STATEMENT";
  statement: string;
  domain?: string;
  geoScope?: string | null;
  subjectConceptKey?: string | null;
  objectConceptKey?: string | null;
  userProvided?: boolean;
  inferred?: boolean;
  directlyObserved?: boolean;
  /** Open question (UNKNOWN candidate) rather than assertion. */
  question?: boolean;
  sourceAvailability?: SourceAvailability;
  applicableFrom?: string | null;
  applicableUntil?: string | null;
  publishedAt?: string | null;
  retrievedAt?: string | null;
}

/** A claim as stored (mirrors archie_claims). */
export interface ClaimRecord {
  id: string;
  claim_key: string;
  subject: string;
  predicate: string;
  object_value: string | null;
  claim_type: string;
  statement: string;
  domain: string;
  geo_scope: string | null;
  subject_concept_key: string | null;
  object_concept_key: string | null;
  user_provided: boolean;
  inferred: boolean;
  directly_observed: boolean;
  question: boolean;
  verification_state: VerificationState;
  conflict_state: ClaimConflictState;
  source_availability: SourceAvailability;
  applicable_from: string | null;
  applicable_until: string | null;
  published_at: string | null;
  retrieved_at: string | null;
  version: number;
  history: Array<Record<string, unknown>>;
  supersedes_claim_id: string | null;
  created_by: string | null;
  created_date: string;
  updated_date: string;
}

/** Evidence as passed in by callers (spec §6–7). */
export interface EvidenceDraft {
  evidenceType: EvidenceType;
  sourceType: SourceType;
  /** Stable identity of the source, e.g. "semantic_graph_edges"
   *  or "FRELUX paint-calculator v3". Used for independent-
   *  corroboration counting (spec §10). */
  sourceIdentity: string;
  /** Pointer to the real record — never a fabricated one. */
  sourceRef?: Record<string, unknown> | null;
  originSubsystem: string;
  observedBySystem?: boolean;
  contentLabel: string;
  contentDigest?: string | null;
  /** Provenance chain; when omitted the engine starts one
   *  from the source step (never invents a different
   *  origin). */
  provenanceChain?: ProvenanceStep[];
  /** LAST transformation applied (spec §7). */
  transformation?: string | null;
  domain?: string | null;
  version?: string | null;
  retrievedAt?: string | null;
  publishedAt?: string | null;
}

/** An evidence record as stored (mirrors archie_evidence_records). */
export interface EvidenceRecord {
  id: string;
  evidence_key: string;
  evidence_type: EvidenceType;
  source_type: SourceType;
  source_identity: string;
  source_ref: Record<string, unknown> | null;
  origin_subsystem: string;
  observed_by_system: boolean;
  content_label: string;
  content_digest: string | null;
  transformation: string | null;
  provenance_chain: ProvenanceStep[];
  reliability: Reliability | Record<string, unknown>;
  domain: string | null;
  version: string | null;
  retrieved_at: string | null;
  published_at: string | null;
  created_date: string;
  updated_date: string;
}

/** Claim ↔ evidence link row. */
export interface ClaimEvidenceLink {
  claim_id: string;
  evidence_id: string;
  relation: "SUPPORTS" | "CONTRADICTS";
  note: string | null;
  created_date: string;
}

/** Claim ↔ claim relation row. */
export interface ClaimRelationRow {
  claim_a_id: string;
  claim_b_id: string;
  relation_type:
    "SUPERSEDES" | "PREMISE_OF" | "CORROBORATES" | "CONTRADICTS" | "SAME_AS";
  note: string | null;
  created_date: string;
}

/** Conflict record row (mirrors archie_evidence_conflicts). */
export interface ConflictRecord {
  id: string;
  claim_a_id: string;
  claim_b_id: string;
  kind:
    | "VALUE_CONFLICT"
    | "RELATIONSHIP_CONFLICT"
    | "TEMPORAL_CONFLICT"
    | "USER_VS_STORED";
  explanation_status: "ESTABLISHED" | "HYPOTHESIS" | "UNEXPLAINED";
  explanation: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

/** The result of evaluating one claim's evidence (spec §§5–12). */
export interface EvidenceEvaluation {
  state: VerificationState;
  temporalState: TemporalState;
  conflictState: ClaimConflictState;
  /** Number of INDEPENDENT sources that support the claim
   *  (copies of one source count once — spec §10). */
  independentCorroboration: number;
  /** Copies of the same underlying source — recognized and
   *  NOT counted as independent (spec §10). */
  duplicateCopies: number;
  /** Why the state was assigned — concise, factual. */
  notes: string;
}

/** Corroboration summary (spec §10). */
export interface Corroboration {
  independentSourceIdentities: string[];
  independentCount: number;
  duplicateCopies: number;
}

/** The full audit answer for one claim (spec §24) — data,
 *  never exposed chain-of-thought. */
export interface ClaimAudit {
  claimId: string;
  statement: string;
  state: VerificationState;
  temporalState: TemporalState;
  support: {
    supportingEvidence: number;
    contradictingEvidence: number;
    directOrObserved: boolean;
    derived: boolean;
    premiseCount: number;
    independentSources: number;
  };
  provenance: {
    traceableToSource: boolean;
    missingProvenanceSteps: number;
    originSubsystems: string[];
  };
  conflicts: Array<{ conflictId: string; explanationStatus: string }>;
  flags: {
    isUserProvided: boolean;
    isInferred: boolean;
    inferencePresentedAsFact: boolean;
    evidenceMissing: boolean;
    missingTimestamps: boolean;
    stale: boolean;
  };
}

/** The bounded machine-readable result of the live-turn
 * evidence pipeline (spec §20). `block` is the ONLY part
 * that reaches the model prompt; everything else is audit
 * data (JSONB ledger, admin surfaces) — never user-facing
 * chain-of-thought. */
export interface EvidenceGroundTruth {
  block: string;
  claimsExamined: number;
  claimsRecorded: number;
  claimsClassified: number;
  conflictsDetected: number;
  evidenceAttached: number;
  inferencesRecorded: number;
  states: Array<{ claimKey: string; state: VerificationState }>;
  /** Pipeline errors per claim — audit only; the pipeline
   *  degrades honestly (UNVERIFIED) instead of blocking. */
  degraded: Array<{ claimKey: string; reason: string }>;
}

export const EMPTY_EVIDENCE_GROUND_TRUTH: EvidenceGroundTruth = {
  block: "",
  claimsExamined: 0,
  claimsRecorded: 0,
  claimsClassified: 0,
  conflictsDetected: 0,
  evidenceAttached: 0,
  inferencesRecorded: 0,
  states: [],
  degraded: [],
};

/** The minimal supabase-like client the repository binds to
 *  (the service-role client in edge functions, the test
 *  harness mock in tests). Structurally compatible with
 *  supabase-js — same pattern the other layers use. */
export interface EvidenceClient {
  from: (table: string) => any;
}
