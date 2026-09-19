// =========================================================
// FRELUX PLAN VISION, Extraction Client & Sanitizer
//
// Calls the ai-plan-extraction Edge Function (vision model) and
// DETERMINISTICALLY sanitizes every response before it can become
// a PlanExtraction:
//   - strict element whitelist + range clamps
//   - confidence clamped 0..1
//   - dimension classification validated (§4), a model can never
//     label an inference "explicit"; the sanitizer re-derives the
//     kind from the declared source
//   - photos can never produce explicit/dimension_annotation data
//     (§16), visual sources are forced to "inferred"
//   - unknown values stay null, never filled (§22)
//
// PERFORMANCE (§24): extractions are keyed by document + version;
// a caller must not reprocess a document whose verified extraction
// already exists (see shouldReextract).
// =========================================================

import type {
  DimensionValue,
  ExtractedBuildingFact,
  ExtractedOpening,
  ExtractedRoof,
  ExtractedRoom,
  PlanDocumentKind,
  PlanExtraction,
  ProvenanceRef,
  ScaleRecord,
  ConsistencyIssue,
} from "./types";
import { DOCUMENT_RELIABILITY } from "./types";
import { clamp01, evaluateScale, missingScale } from "./dimensions";
import { validateExtraction } from "./consistency";

// =========================================================
// PUBLIC REQUEST TYPES
// =========================================================

export class PlanExtractionError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "PlanExtractionError";
  }
}

export interface PlanExtractionRequest {
  documentKind: PlanDocumentKind;
  /** data URL of the ORIGINAL document (never modified). */
  documentDataUrl: string;
  documentId: string;
  regionContext?: string;
}

// =========================================================
// RANGE CONFIGURATION (deterministic clamps, mirror server-side)
// =========================================================

const LENGTH_MIN_M = 0.01;
const LENGTH_MAX_M = 500;
const OPENING_MIN_M = 0.1;
const OPENING_MAX_M = 8;
const PITCH_MIN_DEG = 0;
const PITCH_MAX_DEG = 75;
const FLOORS_MIN = 1;
const FLOORS_MAX = 100;

// =========================================================
// SANITIZER, pure, deterministic, unit-tested without network
// =========================================================

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}
function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Sanitize one raw dimension into a DimensionValue, or null. */
function sanitizeDimension(
  raw: unknown,
  forceKind: DimensionValue["kind"] | null,
  visualOnly: boolean,
): DimensionValue | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const value = asNumber(rec.value);
  if (value === null) return null;

  const unitRaw = asString(rec.unit) ?? "m";
  const unit = (["mm", "cm", "m", "ft", "in"] as const).includes(
    unitRaw.toLowerCase() as DimensionValue["unit"],
  )
    ? (unitRaw.toLowerCase() as DimensionValue["unit"])
    : "m";

  // Range check in metres.
  const toM: Record<string, number> = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    ft: 0.3048,
    in: 0.0254,
  };
  const meters = value * toM[unit];
  if (meters < LENGTH_MIN_M || meters > LENGTH_MAX_M) return null;

  // §4: the KIND is re-derived here, the model cannot self-certify
  // a value as "explicit". "dimension_annotation" is only honored
  // for dimension-grade documents; visual-only sources are forced
  // to inferred (§16).
  const declaredSource = asString(rec.source) ?? "";
  let kind: DimensionValue["kind"];
  if (forceKind) {
    kind = forceKind;
  } else if (visualOnly) {
    kind = "inferred";
  } else if (declaredSource === "dimension_annotation") {
    kind = "explicit";
  } else if (
    declaredSource === "scale_derived" ||
    declaredSource === "derived"
  ) {
    kind = "derived";
  } else {
    kind = "inferred";
  }

  return {
    value,
    unit,
    kind,
    confidence: clamp01(asNumber(rec.confidence) ?? 0),
  };
}

/** Sanitize a raw opening (§13, unknown dims stay null). */
function sanitizeOpening(
  raw: unknown,
  provenance: ProvenanceRef,
  visualOnly: boolean,
): ExtractedOpening | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const type = asString(rec.type) === "window" ? "window" : "door";
  const count = asNumber(rec.count);
  const w = sanitizeDimension(rec.width, null, visualOnly);
  const h = sanitizeDimension(rec.height, null, visualOnly);

  // Impossible opening sizes are dropped (dims become unknown :
  // flagged for confirmation, never invented).
  const wM = w
    ? w.value *
      ({ mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, in: 0.0254 } as const)[w.unit]
    : null;
  const hM = h
    ? h.value *
      ({ mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, in: 0.0254 } as const)[h.unit]
    : null;
  const okW =
    wM === null ? null : wM >= OPENING_MIN_M && wM <= OPENING_MAX_M ? w : null;
  const okH =
    hM === null ? null : hM >= OPENING_MIN_M && hM <= OPENING_MAX_M ? h : null;

  return {
    id:
      asString(rec.id) ?? `opening_${Math.random().toString(36).slice(2, 10)}`,
    type,
    width: okW,
    height: okH,
    count: count !== null && count >= 0 && count <= 200 ? Math.round(count) : 1,
    confidence: clamp01(asNumber(rec.confidence) ?? 0),
    provenance,
    reviewStatus: "ai_extracted",
    verifiedAt: null,
  };
}

/** Sanitize a raw room. */
function sanitizeRoom(
  raw: unknown,
  documentId: string,
  visualOnly: boolean,
  now: string,
): ExtractedRoom | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const name = asString(rec.name);
  const spaceType = asString(rec.spaceType);
  if (!name || !spaceType) return null;

  const page = asNumber(rec.page) ?? 1;
  const bboxRaw = asRecord(rec.bbox);
  const bbox =
    bboxRaw &&
    [bboxRaw.x, bboxRaw.y, bboxRaw.w, bboxRaw.h].every(
      (v) => typeof v === "number" && v >= 0 && v <= 1,
    )
      ? {
          x: bboxRaw.x as number,
          y: bboxRaw.y as number,
          w: bboxRaw.w as number,
          h: bboxRaw.h as number,
        }
      : undefined;

  const provenance: ProvenanceRef = {
    documentId,
    page: Math.max(1, Math.round(page)),
    bbox,
    quote: asString(rec.evidence) ?? undefined,
    method: "vision_model",
  };

  const length = sanitizeDimension(rec.length, null, visualOnly);
  const width = sanitizeDimension(rec.width, null, visualOnly);
  const height = sanitizeDimension(rec.height, null, visualOnly);

  const openingsRaw = Array.isArray(rec.openings) ? rec.openings : [];
  const openings = openingsRaw
    .map((o) => sanitizeOpening(o, provenance, visualOnly))
    .filter((o): o is ExtractedOpening => o !== null);

  const floor = asNumber(rec.floor);
  const now0 = now;

  return {
    id: asString(rec.id) ?? `room_${Math.random().toString(36).slice(2, 10)}`,
    name,
    spaceType: spaceType as ExtractedRoom["spaceType"],
    length,
    width,
    height,
    openings,
    floor:
      floor !== null && floor >= FLOORS_MIN && floor <= 30
        ? Math.round(floor)
        : null,
    aiNotes: asString(rec.notes) ?? undefined,
    provenance,
    confidence: clamp01(asNumber(rec.confidence) ?? 0),
    reviewStatus: "ai_extracted",
    corrections: [],
    extractedAt: now0,
    verifiedAt: null,
  };
}

/** Sanitize the raw roof element (§14). */
function sanitizeRoof(
  raw: unknown,
  documentId: string,
  visualOnly: boolean,
  now: string,
): ExtractedRoof | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const roofTypeRaw = asString(rec.roofType);
  const KNOWN_ROOF_TYPES = new Set([
    "gable",
    "hip",
    "mono_pitch",
    "flat",
    "pyramid",
  ]);
  const roofType: ExtractedRoof["roofType"] =
    roofTypeRaw && KNOWN_ROOF_TYPES.has(roofTypeRaw)
      ? (roofTypeRaw as ExtractedRoof["roofType"])
      : "unknown";

  const provenance: ProvenanceRef = {
    documentId,
    page: Math.max(1, Math.round(asNumber(rec.page) ?? 1)),
    quote: asString(rec.evidence) ?? undefined,
    method: "vision_model",
  };

  const pitchRaw = sanitizeDimension(rec.pitchDegrees, null, visualOnly);
  const pitchOK =
    pitchRaw &&
    pitchRaw.value >= PITCH_MIN_DEG &&
    pitchRaw.value <= PITCH_MAX_DEG
      ? pitchRaw
      : null;

  const planeCount = asNumber(rec.planeCount);
  const hips = asNumber(rec.hipsCount);
  const valleys = asNumber(rec.valleysCount);

  // §14: geometry sufficiency is decided deterministically, a roof
  // is sufficient only when its type is known AND its pitch is
  // explicitly known (or it is flat). Missing geometry ⇒ Requires
  // Confirmation; NO generic multiplier is ever used.
  const pitchKnown =
    pitchOK !== null &&
    (pitchOK.kind === "explicit" || pitchOK.kind === "derived");
  const geometrySufficient =
    roofType !== "unknown" && (roofType === "flat" || pitchKnown);

  return {
    id: asString(rec.id) ?? `roof_${Math.random().toString(36).slice(2, 10)}`,
    roofType,
    pitchDegrees: pitchOK,
    overhang: sanitizeDimension(rec.overhang, null, visualOnly),
    ridgeLength: sanitizeDimension(rec.ridgeLength, null, visualOnly),
    planeCount:
      planeCount !== null && planeCount >= 0 && planeCount <= 50
        ? Math.round(planeCount)
        : null,
    hipsCount:
      hips !== null && hips >= 0 && hips <= 50 ? Math.round(hips) : null,
    valleysCount:
      valleys !== null && valleys >= 0 && valleys <= 50
        ? Math.round(valleys)
        : null,
    geometrySufficient,
    insufficientReason: geometrySufficient
      ? undefined
      : roofType === "unknown"
        ? "Roof type could not be determined from the drawing, confirm the roof type."
        : "Roof pitch is not explicitly known, confirm the pitch before roof calculations.",
    provenance,
    confidence: clamp01(asNumber(rec.confidence) ?? 0),
    reviewStatus: "ai_extracted",
    corrections: [],
    extractedAt: now,
    verifiedAt: null,
  };
}

/** Sanitize a raw building fact. */
function sanitizeBuildingFact(
  raw: unknown,
  documentId: string,
  visualOnly: boolean,
  now: string,
): ExtractedBuildingFact | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const key = asString(rec.key);
  if (!key) return null;

  const provenance: ProvenanceRef = {
    documentId,
    page: Math.max(1, Math.round(asNumber(rec.page) ?? 1)),
    quote: asString(rec.evidence) ?? undefined,
    method: "vision_model",
  };

  const enumValue = asString(rec.enumValue);
  const dimension = sanitizeDimension(rec.dimension, null, visualOnly);

  if (!enumValue && !dimension) return null;

  // Floors clamp.
  if (key === "number_of_floors" && dimension) {
    if (dimension.value < FLOORS_MIN || dimension.value > FLOORS_MAX)
      return null;
  }

  return {
    id: asString(rec.id) ?? `fact_${Math.random().toString(36).slice(2, 10)}`,
    key,
    label: asString(rec.label) ?? key,
    dimension,
    enumValue: enumValue ?? undefined,
    provenance,
    confidence: clamp01(asNumber(rec.confidence) ?? 0),
    reviewStatus: "ai_extracted",
    corrections: [],
    extractedAt: now,
    verifiedAt: null,
  };
}

/**
 * Sanitize a raw scale record (§5). unusable scales are kept :
 * the user sees why scale-derived dimensions are disabled.
 */
function sanitizeScale(raw: unknown): ScaleRecord | null {
  const rec = asRecord(raw);
  if (!rec) return missingScale();

  const source = asString(rec.source);
  const text = asString(rec.text) ?? "";
  const confidence = clamp01(asNumber(rec.confidence) ?? 0);

  if (!source || source === "unknown" || !text) return missingScale();
  return evaluateScale(
    source as "written_scale" | "graphic_scale_bar" | "user_calibrated",
    text,
    confidence,
  );
}

// =========================================================
// FULL RESPONSE SANITIZATION
// =========================================================

export interface SanitizeOptions {
  documentId: string;
  documentKind: PlanDocumentKind;
  extractionId: string;
  now?: string;
}

/**
 * Convert a raw edge-function response into a PlanExtraction.
 * Deterministic and total: any malformed element is dropped, any
 * missing data stays missing. The response NEVER becomes a
 * fabricated result (§22).
 */
export function sanitizeExtractionResponse(
  raw: unknown,
  options: SanitizeOptions,
): PlanExtraction {
  const { documentId, documentKind, extractionId } = options;
  const now = options.now ?? new Date().toISOString();
  const visualOnly = DOCUMENT_RELIABILITY[documentKind] === "visual_only";

  const rec = asRecord(raw);
  if (!rec) {
    return emptyExtraction(extractionId, documentId, now, [
      "The AI response could not be read.",
    ]);
  }

  const roomsRaw = Array.isArray(rec.rooms) ? rec.rooms : [];
  const rooms = roomsRaw
    .map((r) => sanitizeRoom(r, documentId, visualOnly, now))
    .filter((r): r is ExtractedRoom => r !== null);

  const roof = sanitizeRoof(rec.roof, documentId, visualOnly, now);

  const factsRaw = Array.isArray(rec.buildingFacts) ? rec.buildingFacts : [];
  const buildingFacts = factsRaw
    .map((f) => sanitizeBuildingFact(f, documentId, visualOnly, now))
    .filter((f): f is ExtractedBuildingFact => f !== null);

  const scale = sanitizeScale(rec.scale);

  const notes = Array.isArray(rec.notes)
    ? rec.notes.filter((n): n is string => typeof n === "string").slice(0, 12)
    : [];
  const warnings = Array.isArray(rec.warnings)
    ? rec.warnings
        .filter((w): w is string => typeof w === "string")
        .slice(0, 12)
    : [];

  // §6 deterministic consistency pass, issues surfaced, never corrected.
  let issues: ConsistencyIssue[] = [];
  try {
    issues = validateExtraction(rooms, buildingFacts);
  } catch {
    issues = [];
  }

  const nativeUnit = asString(rec.nativeUnit) === "ft" ? "feet" : "meters";

  return {
    id: extractionId,
    documentId,
    version: 1,
    scale,
    rooms,
    roof,
    buildingFacts,
    notes,
    warnings,
    issues,
    nativeUnit,
    extractedAt: now,
  };
}

function emptyExtraction(
  id: string,
  documentId: string,
  now: string,
  warnings: string[],
): PlanExtraction {
  return {
    id,
    documentId,
    version: 1,
    scale: missingScale(),
    rooms: [],
    roof: null,
    buildingFacts: [],
    notes: [],
    warnings,
    issues: [],
    nativeUnit: "meters",
    extractedAt: now,
  };
}

// =========================================================
// PERFORMANCE (§24), do not reprocess verified extractions
// =========================================================

/**
 * Should the document be re-extracted? NO when a verified
 * extraction already exists (avoid unnecessary AI processing).
 * Force re-extraction only when the user explicitly asks.
 */
export function shouldReextract(
  existing: PlanExtraction | null,
  force = false,
): boolean {
  if (force) return true;
  if (!existing) return true;
  const hasVerifiedWork =
    existing.rooms.some(
      (r) =>
        r.reviewStatus === "user_confirmed" || r.reviewStatus === "user_edited",
    ) ||
    existing.buildingFacts.some(
      (f) =>
        f.reviewStatus === "user_confirmed" || f.reviewStatus === "user_edited",
    );
  return !hasVerifiedWork;
}

// =========================================================
// NETWORK CALL (edge function)
// =========================================================

/**
 * Request an element-level extraction from the ai-plan-extraction
 * Edge Function. Errors are surfaced honestly with codes, the
 * caller NEVER receives a fabricated extraction (§22).
 */
export async function requestPlanExtraction(
  request: PlanExtractionRequest,
): Promise<PlanExtraction> {
  const { supabase } = await import("@/lib/supabase");
  const { captureAiError } = await import("@/lib/errorMonitor");

  const extractionId = `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { data, error } = await supabase.functions.invoke(
      "ai-plan-extraction",
      {
        body: {
          documentKind: request.documentKind,
          documentDataUrl: request.documentDataUrl,
          regionContext: request.regionContext ?? "",
        },
      },
    );
    if (error) throw error;
    return sanitizeExtractionResponse(data, {
      documentId: request.documentId,
      documentKind: request.documentKind,
      extractionId,
    });
  } catch (err) {
    captureAiError(
      err instanceof Error ? err : new Error("ai-plan-extraction unavailable"),
      {
        feature: "plan-vision",
      },
    );
    const message = err instanceof Error ? err.message : "Extraction failed.";
    throw new PlanExtractionError(
      /timeout|abort/i.test(message)
        ? "The AI extraction timed out. Try again, or enter dimensions manually."
        : /too large/i.test(message)
          ? "The document is too large to process. Upload a smaller file or enter dimensions manually."
          : "The AI extraction is temporarily unavailable. Try again, or enter dimensions manually.",
      /timeout|abort/i.test(message)
        ? "AI_TIMEOUT"
        : /too large/i.test(message)
          ? "TOO_LARGE"
          : "PROVIDER_ERROR",
    );
  }
}
