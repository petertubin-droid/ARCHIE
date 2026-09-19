// =========================================================
// FRELUX PLAN VISION, Phase 3 Core Vocabulary
//
// ADVANCED VISION + PLAN INTELLIGENCE + AI QUANTITY TAKEOFF.
//
//   Document/Image → AI extraction → provenance + confidence
//     → human verification → canonical Building Model
//     → deterministic FRELUX engine → verified quantity.
//
// HARD RULES (inherited from the AI Foundation):
//   1. AI interprets and extracts. ONLY deterministic FRELUX
//      engines calculate quantities and costs.
//   2. AI NEVER invents construction quantities to fill missing
//      information, a missing value stays "unknown".
//   3. An inferred dimension is never an explicit measurement.
//   4. Photos are visual observations, they never override
//      explicit dimensioned plans without user confirmation.
//
// This module is ADDITIVE. It reuses:
//   - ai-foundation/trust.ts (verification state machine)
//   - measurement/plan-intelligence.ts (room review workflow)
//   - measurement/space-engine.ts (canonical Space model)
//   - ai-foundation/engines-registry.ts (engine boundary)
// =========================================================

import type { LengthUnit } from "@/lib/measurement/units";
import type { SpaceType } from "@/lib/measurement/types";

// =========================================================
// DOCUMENTS
// =========================================================

/** Kinds of construction input Phase 3 understands. */
export type PlanDocumentKind =
  | "architectural_pdf" // architectural PDF (floor plans, sections…)
  | "floor_plan" // floor plan (image or PDF page)
  | "roof_plan" // roof plan
  | "elevation" // elevation drawing
  | "section" // section drawing
  | "construction_drawing" // general construction drawing
  | "scanned_plan" // scanned (possibly degraded) plan
  | "photograph" // site/building photograph
  | "screenshot"; // screenshot of a plan tool

export const PLAN_DOCUMENT_KIND_LABELS: Record<PlanDocumentKind, string> = {
  architectural_pdf: "Architectural PDF",
  floor_plan: "Floor Plan",
  roof_plan: "Roof Plan",
  elevation: "Elevation",
  section: "Section",
  construction_drawing: "Construction Drawing",
  scanned_plan: "Scanned Plan",
  photograph: "Photograph",
  screenshot: "Screenshot",
};

/**
 * Reliability tier of a document for dimension purposes.
 * Photos/screenshots are NEVER dimension-grade, they can only
 * contribute visual observations (§16).
 */
export type DimensionReliability =
  | "dimensioned_drawing" // annotated dimensions/scale, authoritative after review
  | "undimensioned_drawing" // drawing without usable scale, needs user calibration
  | "visual_only"; // photograph/screenshot, visual observation only

export interface PlanDocument {
  id: string;
  /** Owning user (RLS-enforced in the database as well). */
  userId: string;
  /** Project this document belongs to (user_projects id) or null. */
  projectId: string | null;
  kind: PlanDocumentKind;
  /** Original file name (preserved; source file is never modified). */
  fileName: string;
  /** Mime type of the stored original. */
  mimeType: string;
  /** Storage path of the ORIGINAL unmodified file (private bucket). */
  storagePath: string;
  /** Byte size of the original. */
  sizeBytes: number;
  /** Detected drawing scale, if any (see ScaleRecord). */
  scale: ScaleRecord | null;
  createdAt: string;
}

// =========================================================
// DIMENSION CLASSIFICATION (§4)
// =========================================================

/**
 * How a dimension became known. NEVER conflated:
 *   explicit , clearly written dimension on the document
 *   derived  , mathematically derived from other CONFIRMED dimensions
 *   inferred , AI interpretation (visual estimate, scale guess…)
 *   unknown  , cannot be reliably determined
 */
export type DimensionKind = "explicit" | "derived" | "inferred" | "unknown";

export const DIMENSION_KIND_LABELS: Record<DimensionKind, string> = {
  explicit: "Explicit dimension",
  derived: "Derived from confirmed dimensions",
  inferred: "AI interpretation",
  unknown: "Unknown",
};

/** A dimension value with its classification and provenance. */
export interface DimensionValue {
  /** Value in the document's native unit (never silently converted). */
  value: number;
  /** Unit as read from the document. */
  unit: "mm" | "cm" | "m" | "ft" | "in";
  kind: DimensionKind;
  /** 0..1 extraction confidence. */
  confidence: number;
}

// =========================================================
// SCALE (§5)
// =========================================================

export type ScaleSource =
  | "written_scale" // "1:100" annotation on the drawing
  | "graphic_scale_bar" // drawn scale bar
  | "user_calibrated" // the user calibrated the scale manually
  | "unknown";

export interface ScaleRecord {
  source: ScaleSource;
  /** e.g. "1:100" or "1/4 inch = 1 ft". Preserved verbatim. */
  text: string;
  /** 0..1 confidence in the detected scale. */
  confidence: number;
  /**
   * True when the scale may be used to derive dimensions.
   * Requires: source is written/graphic/user_calibrated AND
   * confidence >= SCALE_USABLE_CONFIDENCE.
   */
  usable: boolean;
  /** Why the scale is (not) usable, traceable, shown to the user. */
  reason: string;
}

/** Minimum confidence for a scale to be usable for derived dimensions. */
export const SCALE_USABLE_CONFIDENCE = 0.75;

/** Reliability tier per document kind (§16, photos are never dimension-grade). */
export const DOCUMENT_RELIABILITY: Record<
  PlanDocumentKind,
  DimensionReliability
> = {
  architectural_pdf: "dimensioned_drawing",
  floor_plan: "dimensioned_drawing",
  roof_plan: "dimensioned_drawing",
  elevation: "dimensioned_drawing",
  section: "dimensioned_drawing",
  construction_drawing: "dimensioned_drawing",
  scanned_plan: "undimensioned_drawing",
  photograph: "visual_only",
  screenshot: "visual_only",
};

// =========================================================
// PROVENANCE (§3, §7, §17, §18)
// =========================================================

/**
 * Exactly where an extracted element came from, page + region,
 * so important measurements can be highlighted on the source
 * document for visual verification (§7).
 */
export interface ProvenanceRef {
  documentId: string;
  /** 1-based page number (PDFs); 1 for images. */
  page: number;
  /**
   * Normalized bounding box on the page (0..1 of page width/height),
   * when the AI or a deterministic pass located the element.
   * Used for region highlighting; optional.
   */
  bbox?: { x: number; y: number; w: number; h: number };
  /** Quote of the annotation text that supports the value, if any. */
  quote?: string;
  /** Extraction method that produced the element. */
  method: ExtractionMethod;
}

export type ExtractionMethod =
  | "vision_model" // AI vision read the document
  | "text_parse" // deterministic text/annotation parse
  | "user_input"; // supplied by the user during review

// =========================================================
// EXTRACTED ELEMENTS (§3)
// =========================================================

/** Review/verification status, mirrors the trust state machine. */
export type ReviewStatus =
  | "ai_extracted" // fresh from extraction, awaiting review
  | "in_review" // user started reviewing
  | "user_confirmed" // user confirmed as-is
  | "user_edited" // user corrected values
  | "user_rejected"; // user rejected the element

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  ai_extracted: "AI Extracted, Requires Confirmation",
  in_review: "In Review",
  user_confirmed: "User Confirmed",
  user_edited: "User Corrected",
  user_rejected: "Rejected",
};

/** Base fields every extracted element carries (§17 confidence model). */
export interface ExtractedElementBase {
  id: string;
  /** Document + page + region this came from. */
  provenance: ProvenanceRef;
  /** 0..1 extraction confidence. */
  confidence: number;
  reviewStatus: ReviewStatus;
  /** History of user corrections (field -> previous value). */
  corrections: Array<{ field: string; from: unknown; to: unknown; at: string }>;
  /** ISO timestamp of extraction. */
  extractedAt: string;
  /** ISO timestamp of verification (when confirmed/edited). */
  verifiedAt: string | null;
}

/** An opening (door/window) attached to a room or the building. */
export interface ExtractedOpening {
  id: string;
  type: "door" | "window";
  width: DimensionValue | null; // null = unknown → requires confirmation, never invented (§13)
  height: DimensionValue | null;
  count: number;
  confidence: number;
  provenance: ProvenanceRef;
  reviewStatus: ReviewStatus;
  /** ISO timestamp of verification (when confirmed/edited). */
  verifiedAt?: string | null;
}

/** A room/space extracted from a plan. */
export interface ExtractedRoom extends ExtractedElementBase {
  /** Room name as printed on the plan (e.g. "BEDROOM 1"). */
  name: string;
  /** Normalized FRELUX space type. */
  spaceType: SpaceType;
  length: DimensionValue | null; // null = unknown
  width: DimensionValue | null;
  height: DimensionValue | null;
  /** Openings belonging to this room (doors/windows). */
  openings: ExtractedOpening[];
  /** Floor the room is on (1-based; null = unknown). */
  floor: number | null;
  aiNotes?: string;
}

/** Roof geometry extracted from a roof plan (§14). */
export interface ExtractedRoof extends ExtractedElementBase {
  roofType: "gable" | "hip" | "mono_pitch" | "flat" | "pyramid" | "unknown";
  pitchDegrees: DimensionValue | null;
  overhang: DimensionValue | null;
  ridgeLength: DimensionValue | null;
  /** Number of roof planes the AI could identify. */
  planeCount: number | null;
  hipsCount: number | null;
  valleysCount: number | null;
  /**
   * True when the extracted geometry is INSUFFICIENT to uniquely
   * determine the roof, the roof stays "Requires Confirmation"
   * and no generic multiplier approximation is allowed (§14).
   */
  geometrySufficient: boolean;
  insufficientReason?: string;
}

/** A building-level fact (footprint, floors, wall thickness…). */
export interface ExtractedBuildingFact extends ExtractedElementBase {
  /** Canonical key, e.g. building_length, number_of_floors, floor_to_floor_height. */
  key: string;
  label: string;
  dimension: DimensionValue | null;
  /** Enum value for non-numeric facts (building_type…). */
  enumValue?: string;
}

// =========================================================
// EXTRACTION RESULT (per document)
// =========================================================

export interface PlanExtraction {
  id: string;
  documentId: string;
  /** Extraction version, incremented on re-extraction. */
  version: number;
  scale: ScaleRecord | null;
  rooms: ExtractedRoom[];
  roof: ExtractedRoof | null;
  buildingFacts: ExtractedBuildingFact[];
  /** Document-wide observations (title block, drawing number…). */
  notes: string[];
  /** Honest limitations (unreadable areas, missing scale…). */
  warnings: string[];
  /** Deterministic consistency findings (§6), never silently corrected. */
  issues: ConsistencyIssue[];
  /** Unit the document predominantly uses (native display unit). */
  nativeUnit: LengthUnit;
  extractedAt: string;
}

// =========================================================
// GEOMETRIC CONSISTENCY (§6)
// =========================================================

export type ConsistencyIssueSeverity = "error" | "warning" | "info";

export interface ConsistencyIssue {
  code:
    | "room_exceeds_footprint" // room bigger than building, impossible
    | "rooms_overlap" // bounding boxes overlap
    | "contradictory_dimensions" // same element, conflicting values
    | "inconsistent_totals" // parts don't sum to stated total
    | "missing_dimension" // element lacks a required dimension
    | "duplicate_element" // same element extracted twice
    | "impossible_opening" // opening larger than wall/room
    | "footprint_conflict"; // multiple documents disagree on footprint
  severity: ConsistencyIssueSeverity;
  /** Element ids involved. */
  elementIds: string[];
  /** Human explanation, surfaced for review, never auto-corrected. */
  message: string;
}

// =========================================================
// MULTI-DOCUMENT RECONCILIATION (§15)
// =========================================================

export type ConflictResolution =
  | "keep_first" // user chose the first value
  | "keep_second" // user chose the second value
  | "keep_both" // values describe different things
  | "unresolved";

export interface DocumentConflict {
  /** Canonical fact/element the documents disagree on. */
  key: string;
  label: string;
  /** (documentId, value) pairs from each source. */
  candidates: Array<{
    documentId: string;
    value: unknown;
    confidence: number;
    provenance: ProvenanceRef;
  }>;
  resolution: ConflictResolution;
  resolvedValue?: unknown;
}
