// =========================================================
// FRELUX PLAN VISION, Dimensions & Scale Handling
//
// §4 DIMENSION CLASSIFICATION: explicit / derived / inferred /
//    unknown are NEVER conflated. An inferred dimension never
//    becomes an explicit measurement.
// §5 SCALE HANDLING: a scale is only used when its source is
//    reliable AND confidence is sufficient. Missing/ambiguous
//    scale ⇒ request user confirmation or manual measurement :
//    NEVER guess.
// §20 GLOBAL SUPPORT: metric + imperial. Native units are
//    preserved; conversion to FRELUX internal units (metres)
//    uses the central measurement unit service, exact factors.
// =========================================================

import type { LengthUnit } from "@/lib/measurement/units";
import type {
  DimensionKind,
  DimensionReliability,
  DimensionValue,
  ScaleRecord,
  ScaleSource,
} from "./types";
import { SCALE_USABLE_CONFIDENCE } from "./types";

// Re-exported for consumers of this module (used by tests and scale checks).
export { SCALE_USABLE_CONFIDENCE } from "./types";
import { FT_TO_M, INCH_TO_M } from "@/lib/measurement/units";

// =========================================================
// NATIVE UNIT CONVERSION (exact factors, central service rules)
// =========================================================

/** Exact factors to metres. 'mm'/'cm' derived from SI; ft/in exact. */
export const TO_METERS: Record<DimensionValue["unit"], number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  ft: FT_TO_M,
  in: INCH_TO_M,
};

/**
 * Convert a document-native dimension into FRELUX internal metres.
 * The ORIGINAL DimensionValue is never mutated, this returns a number.
 * Returns null when the dimension is unknown (never invents, §13/§4).
 */
export function dimensionToMeters(dim: DimensionValue | null): number | null {
  if (!dim) return null;
  if (dim.kind === "unknown") return null;
  return dim.value * TO_METERS[dim.unit];
}

/**
 * Create an explicit dimension (clearly written on the document).
 * Confidence must be honest, the caller (extraction sanitizer)
 * decides it; this factory only classifies.
 */
export function explicitDimension(
  value: number,
  unit: DimensionValue["unit"],
  confidence: number,
): DimensionValue {
  return { value, unit, kind: "explicit", confidence: clamp01(confidence) };
}

/**
 * Create a derived dimension (mathematically derived from other
 * CONFIRMED dimensions, e.g. total width minus two wall thicknesses).
 * Derived values are second-class to explicit ones.
 */
export function derivedDimension(
  value: number,
  unit: DimensionValue["unit"],
  confidence: number,
): DimensionValue {
  return { value, unit, kind: "derived", confidence: clamp01(confidence) };
}

/** Create an inferred dimension (AI interpretation, visual/scale estimate). */
export function inferredDimension(
  value: number,
  unit: DimensionValue["unit"],
  confidence: number,
): DimensionValue {
  return { value, unit, kind: "inferred", confidence: clamp01(confidence) };
}

/** The canonical unknown, must be confirmed by the user, never filled. */
export function unknownDimension(): DimensionValue {
  return { value: 0, unit: "m", kind: "unknown", confidence: 0 };
}

export function isUnknown(dim: DimensionValue | null): boolean {
  return !dim || dim.kind === "unknown";
}

// =========================================================
// SORTING DIMENSIONS BY TRUSTWORTHINESS (§4 + requirements priority)
// =========================================================

const KIND_RANK: Record<DimensionKind, number> = {
  explicit: 0,
  derived: 1,
  inferred: 2,
  unknown: 3,
};

/**
 * Compare two dimensions for the SAME element. Explicit beats
 * derived beats inferred; within a kind, higher confidence wins.
 * Used by reconciliation when documents disagree, but the
 * disagreement is STILL surfaced to the user (§15); this ranking
 * only proposes a default candidate, it never silently resolves.
 */
export function rankDimensions(
  a: DimensionValue | null,
  b: DimensionValue | null,
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rank !== 0) return rank;
  return b.confidence - a.confidence;
}

// =========================================================
// SCALE HANDLING (§5)
// =========================================================

/**
 * Evaluate a detected scale. A scale is USABLE only when:
 *   - its source is written on the drawing, a graphic scale bar,
 *     or the user calibrated it manually, AND
 *   - confidence >= SCALE_USABLE_CONFIDENCE.
 * An unusable/missing scale NEVER blocks explicit dimensions :
 * it only forbids scale-DERIVED measurements, which then require
 * user confirmation or manual measurement instead.
 */
export function evaluateScale(
  source: ScaleSource,
  text: string,
  confidence: number,
): ScaleRecord {
  const c = clamp01(confidence);
  if (source === "unknown") {
    return {
      source,
      text: text || "No scale detected",
      confidence: c,
      usable: false,
      reason:
        "No reliable scale was detected on this document. Scale-derived measurements are disabled, confirm dimensions manually.",
    };
  }
  if (c < SCALE_USABLE_CONFIDENCE) {
    return {
      source,
      text,
      confidence: c,
      usable: false,
      reason: `Scale detected as "${text}" but confidence (${Math.round(c * 100)}%) is below the ${Math.round(
        SCALE_USABLE_CONFIDENCE * 100,
      )}% threshold. Confirm the scale manually before scale-derived dimensions can be used.`,
    };
  }
  return {
    source,
    text,
    confidence: c,
    usable: true,
    reason:
      source === "user_calibrated"
        ? "Scale calibrated by you, scale-derived dimensions may be used."
        : `Scale read from the drawing as "${text}" with sufficient confidence.`,
  };
}

/** The honest missing-scale record, requests user calibration. */
export function missingScale(): ScaleRecord {
  return {
    source: "unknown",
    text: "",
    confidence: 0,
    usable: false,
    reason:
      "No scale found on this document. Please calibrate the scale or enter dimensions manually, FRELUX will not guess.",
  };
}

/**
 * A user-calibrated scale is usable by definition (the user is the
 * authority), recorded as such for provenance.
 */
export function userCalibratedScale(text: string): ScaleRecord {
  return {
    source: "user_calibrated",
    text,
    confidence: 1,
    usable: true,
    reason: "Scale calibrated by you, scale-derived dimensions may be used.",
  };
}

// =========================================================
// DOCUMENT RELIABILITY GATES (§16)
// =========================================================

/**
 * May dimensions extracted from a document of this reliability
 * contribute to verified building data? Photos/screenshots are
 * visual-only: their "dimensions" are observations requiring
 * confirmation and can never outrank a dimensioned drawing.
 */
export function isDimensionGrade(reliability: DimensionReliability): boolean {
  return reliability === "dimensioned_drawing";
}

/**
 * Convert a document-native dimension into the FRELUX display unit
 * for review UIs (native unit preserved; metres internally).
 */
export function dimensionInUnit(
  dim: DimensionValue | null,
  target: LengthUnit | DimensionValue["unit"],
): number | null {
  if (isUnknown(dim)) return null;
  const meters = dimensionToMeters(dim);
  if (meters === null) return null;
  switch (target) {
    case "ft":
      return meters / FT_TO_M;
    case "in":
      return meters / INCH_TO_M;
    case "mm":
      return meters * 1000;
    case "cm":
      return meters * 100;
    default:
      return meters;
  }
}

// =========================================================
// HELPERS
// =========================================================

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
