// =========================================================
// FRELUX PLAN VISION, Geometric Consistency Validator (§6)
//
// Deterministic validation of extracted dimensions against each
// other. Detects:
//   - impossible room dimensions (room larger than the building)
//   - contradictory dimensions (same element, conflicting values)
//   - inconsistent totals (rooms don't sum to stated footprint)
//   - missing dimensions
//   - duplicate elements
//   - impossible door/window placement
//
// The validator NEVER silently corrects contradictory plan
// information, every finding becomes a ConsistencyIssue that is
// surfaced to the user for review (§6, §22). Pure functions only.
// =========================================================

import type {
  ConsistencyIssue,
  DimensionValue,
  ExtractedBuildingFact,
  ExtractedRoom,
} from "./types";
import { dimensionToMeters, isUnknown } from "./dimensions";

// =========================================================
// CONFIGURATION, deterministic engineering bounds
// =========================================================

/** A single room larger than this is flagged as suspicious (m²). */
export const MAX_PLAUSIBLE_ROOM_AREA_M2 = 400;
/** Dimension tolerance for "contradictory" checks (10% relative). */
export const CONTRADICTION_TOLERANCE = 0.1;
/** Room area sum may exceed footprint×floors by at most this factor. */
export const FOOTPRINT_OVERFLOW_FACTOR = 1.15;
/** Minimum plausible opening dimension (m). */
export const MIN_OPENING_DIM_M = 0.15;
/** Wall height below which opening-height checks are skipped (m). */
export const MIN_ROOM_HEIGHT_M = 2;

// =========================================================
// UNIT-SAFE COMPARISON (compares in metres, never conflates units)
// =========================================================

/** Convert any document dimension to metres (0 when unknown). */
function metersOf(dim: DimensionValue | null): number | null {
  return dimensionToMeters(dim);
}

/**
 * Compare two dimension values for the SAME element, unit-safely.
 * Returns true when they differ by more than the tolerance.
 */
export function dimensionsContradict(
  a: DimensionValue,
  b: DimensionValue,
): boolean {
  const fa = {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    ft: 0.3048,
    in: 0.0254,
  } as const;
  const aM = a.value * fa[a.unit];
  const bM = b.value * fa[b.unit];
  return Math.abs(aM - bM) > Math.abs(aM) * CONTRADICTION_TOLERANCE;
}

// =========================================================
// ROOM-LEVEL CHECKS
// =========================================================

/**
 * Detect rooms with impossible dimensions: non-positive, absurdly
 * large, or larger than the stated building footprint. Rooms with
 * missing dimensions are flagged as missing (never inferred, §4).
 */
export function findImpossibleRooms(
  rooms: ExtractedRoom[],
  footprintLengthM: number | null,
  footprintWidthM: number | null,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const room of rooms) {
    const lengthM = metersOf(room.length);
    const widthM = metersOf(room.width);

    if (isUnknown(room.length) || isUnknown(room.width)) {
      issues.push({
        code: "missing_dimension",
        severity: "warning",
        elementIds: [room.id],
        message: `Room "${room.name}" is missing a reliable ${
          isUnknown(room.length) ? "length" : "width"
        }. Enter it manually, FRELUX will not infer it.`,
      });
      continue;
    }

    if (lengthM !== null && lengthM <= 0) {
      issues.push({
        code: "room_exceeds_footprint",
        severity: "error",
        elementIds: [room.id],
        message: `Room "${room.name}" has a non-positive length (${lengthM} m), impossible geometry.`,
      });
      continue;
    }

    const areaM2 = lengthM! * (widthM ?? 0);
    if (areaM2 > MAX_PLAUSIBLE_ROOM_AREA_M2) {
      issues.push({
        code: "room_exceeds_footprint",
        severity: "error",
        elementIds: [room.id],
        message: `Room "${room.name}" has an area of ${areaM2.toFixed(1)} m², implausibly large for a single room. Verify the dimensions and units.`,
      });
      continue;
    }

    // Room larger than the whole building footprint, impossible.
    if (footprintLengthM && footprintWidthM) {
      if (
        (lengthM !== null &&
          lengthM > footprintLengthM * FOOTPRINT_OVERFLOW_FACTOR) ||
        (widthM !== null &&
          widthM > footprintWidthM * FOOTPRINT_OVERFLOW_FACTOR)
      ) {
        issues.push({
          code: "room_exceeds_footprint",
          severity: "error",
          elementIds: [room.id],
          message: `Room "${room.name}" (${lengthM?.toFixed(2)} × ${widthM?.toFixed(2)} m) is larger than the building footprint (${footprintLengthM} × ${footprintWidthM} m). Check the dimensions or the building size.`,
        });
      }
    }
  }

  return issues;
}

// =========================================================
// DUPLICATE DETECTION
// =========================================================

/**
 * Detect duplicate elements: same space type + floor + near-identical
 * dimensions (5 cm tolerance) = probably the same room twice.
 */
export function findDuplicateRooms(rooms: ExtractedRoom[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const seen = new Map<string, ExtractedRoom>();

  for (const room of rooms) {
    const lengthM = metersOf(room.length);
    const widthM = metersOf(room.width);
    if (lengthM === null || widthM === null) continue;

    const key = [
      room.spaceType,
      room.floor ?? "?",
      Math.round(lengthM * 20), // 5 cm buckets
      Math.round(widthM * 20),
    ].join("|");

    const existing = seen.get(key);
    if (existing) {
      issues.push({
        code: "duplicate_element",
        severity: "warning",
        elementIds: [existing.id, room.id],
        message: `"${existing.name}" and "${room.name}" have the same type, floor and near-identical dimensions, possibly the same room extracted twice. Reject one if duplicated.`,
      });
    } else {
      seen.set(key, room);
    }
  }

  return issues;
}

// =========================================================
// CONTRADICTORY BUILDING FACTS
// =========================================================

/**
 * Detect the same building fact carrying materially different
 * values within one extraction (e.g. two building_length facts).
 */
export function findContradictoryFacts(
  facts: ExtractedBuildingFact[],
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const byKey = new Map<string, ExtractedBuildingFact[]>();

  for (const fact of facts) {
    if (fact.reviewStatus === "user_rejected" || isUnknown(fact.dimension))
      continue;
    const list = byKey.get(fact.key) ?? [];
    list.push(fact);
    byKey.set(fact.key, list);
  }

  for (const [key, group] of byKey) {
    for (let i = 1; i < group.length; i++) {
      if (dimensionsContradict(group[0].dimension!, group[i].dimension!)) {
        issues.push({
          code: "contradictory_dimensions",
          severity: "error",
          elementIds: [group[0].id, group[i].id],
          message: `${group[0].label}: conflicting values found (${group[0].dimension!.value} ${group[0].dimension!.unit} vs ${group[i].dimension!.value} ${group[i].dimension!.unit}). Choose the correct value, FRELUX will not silently pick one.`,
        });
      }
    }
    void key;
  }

  return issues;
}

// =========================================================
// TOTALS CHECK
// =========================================================

/**
 * Compare the sum of room areas against the stated footprint area.
 * Only meaningful when ALL non-rejected rooms have known dimensions
 *, a partial sum is never used to claim inconsistency.
 */
export function checkAreaTotals(
  rooms: ExtractedRoom[],
  footprintAreaM2: number | null,
): ConsistencyIssue[] {
  if (!footprintAreaM2 || footprintAreaM2 <= 0) return [];

  const active = rooms.filter((r) => r.reviewStatus !== "user_rejected");
  const withDims = active.filter(
    (r) => !isUnknown(r.length) && !isUnknown(r.width),
  );
  // All rooms must be dimensioned for the sum to be meaningful.
  if (withDims.length === 0 || withDims.length !== active.length) return [];

  let totalM2 = 0;
  for (const room of withDims) {
    totalM2 += metersOf(room.length)! * metersOf(room.width)!;
  }

  const floors = Math.max(1, new Set(withDims.map((r) => r.floor ?? 1)).size);
  const allowed = footprintAreaM2 * floors * FOOTPRINT_OVERFLOW_FACTOR;
  if (totalM2 > allowed) {
    return [
      {
        code: "inconsistent_totals",
        severity: "warning",
        elementIds: withDims.map((r) => r.id),
        message: `Room areas sum to ${totalM2.toFixed(1)} m², which exceeds ${allowed.toFixed(1)} m² (footprint × floors + tolerance). Verify room dimensions or the building footprint.`,
      },
    ];
  }
  return [];
}

// =========================================================
// OPENING CHECKS (§13)
// =========================================================

/**
 * Detect impossible openings: dimensions below plausible minimums,
 * wider than the room, or taller than the wall. Openings with
 * unknown dimensions are flagged as requiring confirmation :
 * dimensions are NEVER invented for them.
 */
export function checkOpenings(rooms: ExtractedRoom[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const room of rooms) {
    const roomLengthM = metersOf(room.length);
    const roomWidthM = metersOf(room.width);
    const roomHeightM = metersOf(room.height);

    for (const opening of room.openings) {
      // Unknown opening dimensions → requires confirmation (§13).
      if (isUnknown(opening.width) || isUnknown(opening.height)) {
        issues.push({
          code: "missing_dimension",
          severity: "warning",
          elementIds: [opening.id],
          message: `${opening.type === "door" ? "Door" : "Window"} in "${room.name}" has no reliable dimensions. Confirm its size before it can be deducted from any area, FRELUX will not invent dimensions.`,
        });
        continue;
      }

      const wM = metersOf(opening.width)!;
      const hM = metersOf(opening.height)!;

      if (wM < MIN_OPENING_DIM_M || hM < MIN_OPENING_DIM_M) {
        issues.push({
          code: "impossible_opening",
          severity: "error",
          elementIds: [opening.id],
          message: `${opening.type === "door" ? "Door" : "Window"} in "${room.name}" has implausible dimensions (${wM.toFixed(2)} × ${hM.toFixed(2)} m).`,
        });
        continue;
      }

      // Opening wider than the room, impossible placement.
      const maxRoomSpanM = Math.max(roomLengthM ?? 0, roomWidthM ?? 0);
      if (
        maxRoomSpanM > 0 &&
        wM > maxRoomSpanM * (1 + CONTRADICTION_TOLERANCE)
      ) {
        issues.push({
          code: "impossible_opening",
          severity: "error",
          elementIds: [opening.id, room.id],
          message: `${opening.type === "door" ? "Door" : "Window"} in "${room.name}" is wider (${wM.toFixed(2)} m) than the room itself (${maxRoomSpanM.toFixed(2)} m).`,
        });
      }
      // Opening taller than the wall, impossible placement.
      if (
        roomHeightM !== null &&
        roomHeightM >= MIN_ROOM_HEIGHT_M &&
        hM > roomHeightM
      ) {
        issues.push({
          code: "impossible_opening",
          severity: "error",
          elementIds: [opening.id, room.id],
          message: `${opening.type === "door" ? "Door" : "Window"} in "${room.name}" is taller (${hM.toFixed(2)} m) than the wall (${roomHeightM.toFixed(2)} m).`,
        });
      }
    }
  }

  return issues;
}

// =========================================================
// FOOTPRINT FROM FACTS
// =========================================================

export interface FootprintDims {
  lengthM: number | null;
  widthM: number | null;
  areaM2: number | null;
}

/** Extract footprint metres from building facts (null when unknown). */
export function footprintFromFacts(
  facts: ExtractedBuildingFact[],
): FootprintDims {
  const get = (key: string): DimensionValue | null => {
    const f = facts.find((x) => x.key === key);
    return f && f.reviewStatus !== "user_rejected" ? f.dimension : null;
  };
  const lengthM = metersOf(get("building_length"));
  const widthM = metersOf(get("building_width"));
  return {
    lengthM,
    widthM,
    areaM2: lengthM !== null && widthM !== null ? lengthM * widthM : null,
  };
}

// =========================================================
// FULL VALIDATION PASS
// =========================================================

/**
 * Run the complete deterministic consistency pass over one
 * extraction's rooms and building facts. Pure, same input,
 * same issues, always in a stable order.
 */
export function validateExtraction(
  rooms: ExtractedRoom[],
  buildingFacts: ExtractedBuildingFact[],
): ConsistencyIssue[] {
  const footprint = footprintFromFacts(buildingFacts);
  const activeRooms = rooms.filter((r) => r.reviewStatus !== "user_rejected");

  const issues: ConsistencyIssue[] = [
    ...findImpossibleRooms(activeRooms, footprint.lengthM, footprint.widthM),
    ...findDuplicateRooms(activeRooms),
    ...checkOpenings(activeRooms),
    ...checkAreaTotals(activeRooms, footprint.areaM2),
    ...findContradictoryFacts(buildingFacts),
  ];

  // Stable de-duplication (same code + elements + message).
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}:${i.elementIds.slice().sort().join(",")}:${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
