// =========================================================
// FRELUX PHASE 6.5, LEARNING ENGINE TYPES
//
// One unified learning architecture for every intelligence
// source: GEMINI, OPENAI, ARCHIE/ChatGPT reference, USER
// corrections and ACTUAL project outcomes. Providers are
// replaceable; provenance is explicit on every record.
//
// Deterministic engines are protected by MATH_CAPABILITIES:
// learning touching them can never be auto-promoted.
// =========================================================

/** Intelligence sources feeding the unified Learning Engine. */
export type LearningSource =
  "GEMINI" | "OPENAI" | "ARCHIE" | "USER" | "OUTCOME" | "SYSTEM" | "WEB";

/** Evidence states, never silently changed (Phase 6.5 §13). */
export type EvidenceState =
  | "AI_EXTRACTED"
  | "AI_RECOMMENDATION"
  | "USER_PROVIDED"
  | "USER_CONFIRMED"
  | "SYSTEM_VERIFIED"
  | "EXTERNAL_SOURCE_VERIFIED"
  | "ESTIMATED"
  | "ASSUMPTION"
  | "ACTUAL_OUTCOME";

/** Knowledge scopes, isolation is enforced by evaluateScopePromotion. */
export type KnowledgeScope =
  "GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER";

/**
 * Ingestion → production lifecycle (Phase 6.5 §7). Phase 6.5 Alpha
 * ADDS CRAWLED/EXTRACTED for external web intelligence:
 * CRAWLED → EXTRACTED → CANDIDATE → ... (existing chain reused).
 */
export type LearningLifecycle =
  | "CRAWLED"
  | "EXTRACTED"
  | "ARCHIE_RECEIVED"
  | "CANDIDATE"
  | "VERIFYING"
  | "EVALUATING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DEFERRED";

/**
 * Capabilities whose rules are deterministic certified math.
 * Learning events may OBSERVE these (corrections, outcomes) and
 * proposals may suggest changes, but promotion REQUIRES the
 * engineering-review process, never automatic, never via
 * ordinary Admin config. Mirrors the Logic & Rules Registry
 * high-risk classes.
 */
export const MATH_CAPABILITIES: ReadonlySet<string> = new Set([
  "painting",
  "screeding",
  "tiling",
  "pop_ceiling",
  "tyrolene",
  "grafitex",
  "unit_conversion",
  "roof_geometry",
  "structural",
  "foundation",
  "build_to_roof",
  "material_ratios",
  "waste_factors",
  "rounding",
  "cost_formulas",
  "safety_thresholds",
  "quantity_takeoff",
]);

/**
 * Low-risk automatic learning capability families (Phase 6.5 §20):
 * confirmed preferences, terminology, retrieval relevance, UX.
 * These may auto-record as events and create DRAFT proposals :
 * never production knowledge without approval.
 */
export const AUTO_LEARN_CAPABILITIES: ReadonlySet<string> = new Set([
  "user_preferences",
  "terminology",
  "regional_language",
  "retrieval_relevance",
  "clarification_patterns",
  "output_preferences",
  "ux_recommendations",
]);

/** Structured ARCHIE reference submission (Phase 6.5 §4). */
export interface ArchieIngestionPayload {
  source: "ARCHIE";
  source_type?: string; // e.g. CHATGPT_REFERENCE
  provider?: string; // e.g. OPENAI
  model_version?: string;
  topic: string;
  capability: string;
  request_context?: string;
  recommendation?: string;
  conclusion?: string;
  evidence?: string[];
  cited_sources?: string[];
  assumptions?: string[];
  proposed_scope: KnowledgeScope;
  scope_key?: string; // market code / project id when scoped
  project_id?: string;
  property_id?: string;
  confidence?: number; // 0..1
  provenance?: Record<string, unknown>;
}

/** Validated record handed to the store after ingestion. */
export interface LearningRecordInput {
  source: LearningSource;
  source_type?: string;
  provider?: string;
  model_version?: string;
  topic: string;
  capability: string;
  request_context?: string;
  recommendation?: string;
  conclusion?: string;
  evidence: string[];
  cited_sources: string[];
  assumptions: string[];
  proposed_scope: KnowledgeScope;
  scope_key?: string;
  project_id?: string;
  property_id?: string;
  created_by?: string;
  provenance: Record<string, unknown>;
  confidence?: number;
  content_hash: string;
  payload_size: number;
}

/** Ingestion result, used by the edge function AND the tests. */
export interface IngestionResult {
  accepted: boolean;
  code:
    | "INGESTED"
    | "DUPLICATE"
    | "RATE_LIMITED"
    | "UNAUTHORIZED"
    | "PAYLOAD_TOO_LARGE"
    | "INVALID_PAYLOAD"
    | "INJECTION_QUARANTINED";
  record_id?: string;
  message: string;
  flags?: string[];
}

/** Unified learning event (browser-recorded signal stream). */
export interface LearningEventInput {
  event_type:
    | "USER_CORRECTION"
    | "AI_EXTRACTION_CORRECTION"
    | "CHAT_SIGNAL"
    | "MISSING_INFO"
    | "RETRIEVAL_FAILURE"
    | "TOOL_SELECTION"
    | "ACTUAL_OUTCOME";
  source: LearningSource;
  capability: string;
  subject: string;
  ai_value?: string;
  user_value?: string;
  expected_value?: string;
  actual_value?: string;
  region?: string;
  project_id?: string;
  plan_document_id?: string;
  metadata?: Record<string, unknown>;
}
