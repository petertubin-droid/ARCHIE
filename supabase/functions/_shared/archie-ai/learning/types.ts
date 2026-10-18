// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — TYPES
// supabase/functions/_shared/archie-ai/learning/types.ts
//
// Canonical types for continuous knowledge acquisition,
// experience-based learning, pattern discovery, knowledge
// validation, procedural skill learning, error correction,
// temporal tracking, cross-domain safety, and Owner Authority.
// =========================================================

/** Intelligence sources feeding the unified Learning Engine. */
export type LearningSource =
  | "GEMINI"
  | "OPENAI"
  | "ARCHIE"
  | "USER"
  | "OUTCOME"
  | "SYSTEM"
  | "WEB"
  | "DOCUMENT"
  | "TOOL_RESULT";

/** Explicit evidence states, strictly enforced (Phase 6.5 & spec §5). */
export type EvidenceState =
  | "UNREVIEWED"
  | "SUPPORTED"
  | "VERIFIED"
  | "CONTRADICTED"
  | "UNCERTAIN"
  | "OUTDATED"
  | "SUPERSEDED"
  | "REJECTED"
  | "ROLLED_BACK";

/** Action execution lifecycle states (spec §4.2). */
export type ActionExecutionState =
  | "PROPOSED"
  | "APPROVED"
  | "ATTEMPTED"
  | "COMPLETED"
  | "SUCCESSFUL"
  | "INDEPENDENTLY_VERIFIED";

/** Categories of knowledge extracted or acquired. */
export type KnowledgeKind =
  | "FACT"
  | "CONCEPT"
  | "RELATION"
  | "RULE"
  | "PROCEDURE"
  | "PATTERN"
  | "CAUSAL_HYPOTHESIS"
  | "INSIGHT";

/** Knowledge scopes; isolation is strictly preserved. */
export type KnowledgeScope =
  | "GLOBAL"
  | "REGIONAL"
  | "PROJECT"
  | "PROPERTY"
  | "USER";

/** The 10 sequential stages of the unified learning lifecycle (spec §3). */
export type LearningLifecycleStage =
  | "ACQUISITION"
  | "NORMALIZATION"
  | "EVIDENCE_ASSESSMENT"
  | "KNOWLEDGE_EXTRACTION"
  | "NOVELTY_DETECTION"
  | "LEARNING_EVALUATION"
  | "KNOWLEDGE_INTEGRATION"
  | "PERSISTENCE"
  | "IMPACT_EVALUATION"
  | "CORRECTION_RECOVERY"
  | "INPUT_ACQUISITION";

/** Lifecycle statuses of candidate records through review. */
export type LearningLifecycleStatus =
  | "CRAWLED"
  | "EXTRACTED"
  | "ARCHIE_RECEIVED"
  | "CANDIDATE"
  | "VERIFYING"
  | "EVALUATING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "DEFERRED"
  | "ROLLED_BACK";

/** Deterministic certified math capabilities requiring explicit engineering review. */
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

/** Low-risk automatic learning capability families. */
export const AUTO_LEARN_CAPABILITIES: ReadonlySet<string> = new Set([
  "user_preferences",
  "terminology",
  "regional_language",
  "retrieval_relevance",
  "clarification_patterns",
  "output_preferences",
  "ux_recommendations",
]);

/** Raw input presented to the learning engine. */
export interface LearningInput {
  id: string;
  source: LearningSource;
  sourceReference?: string;
  rawContent: string;
  metadata?: Record<string, unknown>;
  context?: string;
  observedAt?: string;
  corroboratingSources?: string[];
  contradictingSources?: string[];
  confidence?: number;
  validAt?: string;
  scope?: KnowledgeScope;
  scopeKey?: string;
  domain?: string;
}

/** Machine-processable normalized representation preserving provenance. */
export interface NormalizedLearningInput {
  id: string;
  source: LearningSource;
  sourceReference?: string;
  normalizedContent: string;
  contentHash: string;
  sanitizerFlags: string[];
  quarantined: boolean;
  redactedSecretsCount: number;
  observedAt: string;
  scope: KnowledgeScope;
  scopeKey?: string;
  domain: string;
}

/** Temporal validity envelope. */
export interface TemporalEnvelope {
  observedAt: string;
  validAt?: string;
  recordedAt: string;
  expiresAt?: string;
  isStale?: boolean;
}

/** Structured knowledge item produced by extraction. */
export interface ExtractedKnowledgeItem {
  id: string;
  kind?: KnowledgeKind;
  subject: string;
  predicate: string;
  object: string | number | boolean | Record<string, unknown> | unknown;
  domain: string;
  scope: KnowledgeScope;
  scopeKey?: string;
  evidenceState: EvidenceState;
  confidence: number;
  confidenceBasis?: string;
  source?: LearningSource;
  sourceReference?: string;
  corroboratingSources?: string[];
  contradictingSources?: string[];
  temporal?: TemporalEnvelope;
  prerequisites?: string[];
  dependencies?: string[];
  provenance: Record<string, unknown>;
  version: number;
  previousVersionId?: string;
  supersededBy?: string;
  status: "ACTIVE" | "ARCHIVED" | "ROLLED_BACK" | "EVALUATING" | "HELD_FOR_REVIEW";
  createdAt?: string;
  updatedAt?: string;
}

/** Novelty assessment result against existing knowledge. */
export interface NoveltyAssessment {
  candidateId: string;
  status:
    | "NEW"
    | "EXACT_DUPLICATE"
    | "NEAR_DUPLICATE"
    | "CONTRADICTION"
    | "REFINEMENT"
    | "REDUNDANT";
  similarity: number;
  existingRecordId?: string;
  reason: string;
}

/** Reusable discovered pattern with counterexample guardrails (spec §4.3). */
export interface LearnedPattern {
  id: string;
  patternSignature: string;
  domain: string;
  description: string;
  sampleSize: number;
  supportingEvents: string[];
  counterexamples: Array<{ id: string; condition: string; outcome: string }>;
  boundaryConditions: string[];
  confidence: number;
  status: "HYPOTHESIS" | "SUPPORTED" | "ESTABLISHED";
  createdAt: string;
  updatedAt: string;
}

/** Step in a procedural skill. */
export interface ProceduralStep {
  stepNumber: number;
  action: string;
  expectedOutcome: string;
  failureCondition?: string;
  recoveryAction?: string;
  toolRequired?: string;
  requiresOwnerAuthorization?: boolean;
}

/** Reusable procedural skill with versioned steps and recovery (spec §4.4). */
export interface ProceduralSkill {
  id: string;
  name: string;
  description?: string;
  domain: string;
  version: number;
  prerequisites: string[];
  steps: ProceduralStep[];
  expectedOutcomes?: string[];
  failureConditions?: string[];
  recoveryStrategy?: string;
  verifiedSuccessCount: number;
  failureCount: number;
  status?: "DRAFT" | "VERIFIED" | "DEPRECATED";
  createdAt: string;
  updatedAt: string;
}

/** Root cause taxonomy for error learning (spec §4.5). */
export type ErrorRootCause =
  | "CALIBRATION"
  | "PERFORMANCE"
  | "INPUT_INTEGRITY"
  | "BOUNDARY_VIOLATION"
  | "STALE_KNOWLEDGE"
  | "CONTRADICTORY_EVIDENCE"
  | "EXECUTION_FAILURE"
  | "UNKNOWN_NEEDS_OWNER_DIAGNOSIS";

/** Error and correction record with downstream dependency tracking. */
export interface ErrorCorrectionRecord {
  id: string;
  originalClaimOrProcedureId: string;
  rootCause: ErrorRootCause;
  causeAnalysis: string;
  correction: string;
  evidence: string[];
  affectedDependentIds: string[];
  preventativeAction: string;
  recurrenceTested: boolean;
  correctedAt: string;
}

/** Cross-domain knowledge transfer check result (spec §4.7). */
export interface CrossDomainTransferCheck {
  sourceDomain: string;
  targetDomain: string;
  concept: string;
  allowed: boolean;
  jurisdictionMatch: boolean;
  unitCompatibility: boolean;
  reason: string;
}

/** Measurable performance evaluation metrics (spec §10). */
export interface EvaluationMetricReport {
  totalCandidates: number;
  acceptedCount: number;
  heldCount: number;
  rejectedCount: number;
  exactDuplicates: number;
  nearDuplicates: number;
  contradictionsDetected: number;
  accuracy: number;
  duplicatePrecision: number;
  duplicateRecall: number;
  contradictionQuality: number;
  errorRecurrenceRate: number;
  meanConfidenceCalibrationError: number;
  avgLatencyMs: number;
  quarantinedAttacks: number;
  baselineComparison?: Array<{
    metric: string;
    baselineValue: number;
    currentValue: number;
    improvement: number;
  }>;
}

/** Observable audit event record (spec §14). */
export interface LearningAuditEvent {
  id: string;
  operationId?: string;
  timestamp: string;
  stage: LearningLifecycleStage;
  status?: "SUCCESS" | "WARNING" | "BLOCKED" | "FAILED" | "QUARANTINED" | string;
  action: string;
  details?: Record<string, unknown>;
  candidateId?: string;
  reason?: string;
  operator?: string;
}

/** Rollback tracking record for reversible learning updates (spec §15). */
export interface RollbackRecord {
  id: string;
  operationId: string;
  timestamp: string;
  reason: string;
  revertedItemIds: string[];
  restoredStateSummary: Record<string, unknown>;
  affectedDownstreamSubsystems: string[];
}

/** Configurable budget and execution control for continuous learning (spec §7). */
export interface ContinuousLearningConfig {
  maxBatchSize: number;
  budgetMs: number;
  minConfidenceThreshold: number;
  autonomousAllowed: boolean;
  stopOnBoundary: boolean;
  retryLimit: number;
}

export const DEFAULT_CONTINUOUS_CONFIG: ContinuousLearningConfig = {
  maxBatchSize: 20,
  budgetMs: 10000,
  minConfidenceThreshold: 0.6,
  autonomousAllowed: true,
  stopOnBoundary: true,
  retryLimit: 3,
};

export type LearningConfig = ContinuousLearningConfig;
export const DEFAULT_LEARNING_CONFIG = DEFAULT_CONTINUOUS_CONFIG;

export interface LearningPersistenceStatus {
  durable: boolean;
  backend: "SUPABASE" | "IN_MEMORY" | string;
  storedKnowledgeCount: number;
  auditLogCount: number;
}

export interface RollbackResult {
  candidateId: string;
  success: boolean;
  previousState: EvidenceState | string;
  newState: EvidenceState | string;
  affectedDownstreamCount: number;
  reason: string;
}

export interface LearningBatchResult {
  batchId: string;
  processedCount: number;
  acceptedCount: number;
  heldCount: number;
  rejectedCount: number;
  quarantinedCount: number;
  accepted: ExtractedKnowledgeItem[];
  held: ExtractedKnowledgeItem[];
  rejected: Array<{ id: string; reason: string }>;
  quarantined: Array<{ id: string; reason: string }>;
  totalDurationMs: number;
}
