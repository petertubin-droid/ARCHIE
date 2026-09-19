// =========================================================
// FRELUX PHASE 8, ARCHIE INTELLIGENCE FOUNDATION: TYPES
//
// ARCHIE is FRELUX's built-in AI. Core domain: Architecture,
// extensible with NO artificial domain ceiling, domains are
// registry data, never a fixed enum.
//
// Everything ARCHIE learns flows through the unified pipeline:
// INPUT → EXTRACT/ANALYZE → STRUCTURE → VALIDATE → EVALUATE →
// HUMAN APPROVAL → VERSION → KNOWLEDGE
//
// Evidence states mirror Phase 6.5 §13 exactly and are never
// silently converted (see governance.ts).
// =========================================================

import type { EvidenceState, KnowledgeScope } from "@/lib/learning/types";

/** The nine ARCHIE evidence states (Phase 6.5 §13, unchanged). */
export type ArchieEvidenceState = EvidenceState;

/** ARCHIE knowledge scopes (Phase 6.5, unchanged). */
export type ArchieScope = KnowledgeScope;

/** Risk classes, decide the verification bar for promotion. */
export type ArchieRiskClass =
  "STANDARD" | "ENGINEERING_REVIEW" | "DETERMINISTIC";

/** Every modality ARCHIE can learn from. */
export type ArchieInputType =
  | "TEXT"
  | "IMAGE"
  | "PDF_DOCUMENT"
  | "SCANNED_TECHNICAL"
  | "ENGINEERING_DRAWING"
  | "TABLE_CALCULATION"
  | "AUDIO_VOICE"
  | "VIDEO_DEMONSTRATION"
  | "PROJECT_OUTCOME"
  | "SOURCE_CODE"
  | "WEB_INTELLIGENCE";

/** Contributor roles, permissions are enforced, not cosmetic. */
export type ArchieContributorRole =
  "ARCHIE_ADMIN" | "DOMAIN_CONTRIBUTOR" | "OBSERVER";

/** Pipeline states for an ingestion. */
export type ArchiePipelineState =
  | "RECEIVED"
  | "EXTRACTING"
  | "EXTRACTED"
  | "STRUCTURED"
  | "VALIDATED"
  | "EVALUATED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

/** Canonical pipeline order (foundation contract). */
export const PIPELINE_ORDER: readonly ArchiePipelineState[] = [
  "RECEIVED",
  "EXTRACTING",
  "EXTRACTED",
  "STRUCTURED",
  "VALIDATED",
  "EVALUATED",
  "AWAITING_APPROVAL",
  "APPROVED",
] as const;

/** Knowledge types ARCHIE may structure. */
export type ArchieKnowledgeType =
  | "FACT"
  | "METHOD"
  | "MATERIAL"
  | "PRICE"
  | "REGIONAL_PRACTICE"
  | "TERMINOLOGY"
  | "STANDARD"
  | "CODE_INSIGHT"
  | "ARCHITECTURE_NOTE"
  | "GENERAL";

/** A registered ARCHIE domain (DB row). */
export interface ArchieDomain {
  key: string;
  label: string;
  description?: string | null;
  is_core: boolean;
  risk_class: ArchieRiskClass;
  active: boolean;
}

/** A contributor record (DB row). */
export interface ArchieContributor {
  user_id: string;
  display_name: string;
  role: ArchieContributorRole;
  allowed_domains: string[];
  must_review: boolean;
  active: boolean;
}

/** Raw training input handed to the pipeline. */
export interface ArchieTrainingInput {
  input_type: ArchieInputType;
  title: string;
  domain: string;
  region?: string;
  /** Free text: admin instructions, transcription, extracted text. */
  text?: string;
  /** Supabase storage path (bucket archie-media) for media inputs. */
  media_uri?: string;
  /** External reference (URL, book, drawing number…). */
  source_ref?: string;
  contributor: ArchieContributor;
  /** True when the contributor explicitly confirms every fact. */
  user_confirmed?: boolean;
}

/** One structured fact produced by EXTRACT/ANALYZE. */
export interface ArchieCandidate {
  topic: string;
  content: Record<string, unknown>;
  domain: string;
  region?: string;
  knowledge_type: ArchieKnowledgeType;
  evidence_state: ArchieEvidenceState;
  confidence: number; // 0..1
  evidence: string[];
  cited_sources: string[];
  assumptions: string[];
  proposed_scope: ArchieScope;
  scope_key?: string;
  /** Set when the candidate touches protected deterministic math. */
  requires_engineering_review: boolean;
  provenance: ArchieProvenance;
}

/** Full provenance retained on every learned item. */
export interface ArchieProvenance {
  ingestion_id?: string;
  input_type: ArchieInputType;
  contributor_id: string;
  contributor_name: string;
  source_ref?: string;
  media_uri?: string;
  extracted_by?: string; // provider id, e.g. GEMINI
  model_version?: string;
  ingested_at: string; // ISO timestamp
}

/** Extraction output of the multimodal EXTRACT/ANALYZE step. */
export interface ArchieExtraction {
  summary: string;
  detected_domain?: string;
  detected_region?: string;
  facts: Array<{
    topic: string;
    content: Record<string, unknown>;
    knowledge_type?: ArchieKnowledgeType;
    confidence?: number;
    evidence?: string[];
    cited_sources?: string[];
    assumptions?: string[];
  }>;
  warnings: string[];
}

/** Validation outcome of the VALIDATE step. */
export interface ArchieValidationResult {
  ok: boolean;
  sanitized_text?: string;
  flags: string[];
  quarantined: boolean;
  quarantine_reason?: string;
}

/** Evaluation outcome of the EVALUATE step. */
export interface ArchieEvaluationResult {
  ok: boolean;
  duplicate_count: number;
  candidates: ArchieCandidate[];
  requires_engineering_review: boolean;
  risk_class: ArchieRiskClass;
  flags: string[];
}

/** Ingestion record as persisted (DB row shape). */
export interface ArchieIngestion {
  id: string;
  created_by: string;
  input_type: ArchieInputType;
  title: string;
  domain: string;
  region?: string | null;
  media_uri?: string | null;
  source_ref?: string | null;
  raw_text?: string | null;
  pipeline_state: ArchiePipelineState;
  extraction?: ArchieExtraction | null;
  flags: string[];
  candidate_count: number;
  created_date: string;
  updated_date: string;
}

/** Code intelligence finding, always a proposal, never an action. */
export interface ArchieCodeFinding {
  area: string; // frontend | backend | database | edge | tests | deps | config
  path: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  summary: string;
  recommendation: string;
  requires_engineering_review: true;
}
