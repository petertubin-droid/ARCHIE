// =========================================================
// FRELUX Build-to-Roof Construction Cost Estimator
// Calculation Engine, Phase 30 (Audited & Corrected)
//
// SITE → FOUNDATION → GROUND FLOOR → WALLS → STRUCTURAL FRAME → ROOF → READY FOR FINISHING
//
// All formulas are transparent and testable.
// Every quantity shows: inputs, formula, base qty, wastage, final qty.
// Nigerian construction units: bags, m³, pcs, tonnes, linear meters.
//
// AUDIT FIXES APPLIED:
// 1. Foundation concrete depth is now configurable (footing_thickness input)
// 2. Roofing sheet coverage varies by roofing_material type
// 3. DPM membrane uses dpm_per_m2 price (not dpc_per_meter)
// 4. Timber slope length includes overhang
// 5. Hardcore filling has material cost (hardcore_per_m3)
// 6. Added site clearing, setting out, backfilling, compaction
// 7. Stirrup link length includes hook length (10×bar_diameter)
// 8. Foundation blockwork height includes mortar joints
// 9. Removed redundant slab/beam if-else (unified formula)
// 10. Roof area quantity line shows 0% wastage (wastage is on sheets only)
// 11. Sand filling added to ground floor (under DPM)
// 12. Compaction labour added for hardcore/filling
// =========================================================

import type {
  BuildToRoofInput,
  BuildToRoofResult,
  StageResult,
  QuantityLine,
  MaterialLine,
  LabourLine,
  ConsolidatedMaterial,
  ConfidenceLevel,
  StructuralMemberInput,
  RoofingMaterial,
  PriceConfig,
  ReinforcementBreakdown,
  ReinforcementBreakdownItem,
  LabourConfig,
  WastageConfig,
} from '@/types/build-to-roof';

// ── Constants ──

// Cement: 1 bag = 50kg, density ~1440 kg/m³ → 0.0347 m³ per bag
export const CEMENT_VOLUME_PER_BAG = 0.0347; // m³

// Dry-to-wet concrete volume ratio (1.54, standard)
export const DRY_WET_RATIO = 1.54;

// Dry-to-wet mortar volume ratio (1.33, standard)
export const MORTAR_DRY_WET_RATIO = 1.33;

// Mortar joint thickness (m), used for course height calculations
export const MORTAR_JOINT_THICKNESS = 0.025; // 25mm

// Standard hook length for stirrups = 10 × bar_diameter
export const STIRRUP_HOOK_MULTIPLIER = 10;

// Roofing sheet coverage by material type (m² per sheet)
export const SHEET_COVERAGE: Record<RoofingMaterial, number> = {
  long_span_aluminium: 1.5,   // 0.5m width × 3.0m length
  stone_coated: 0.53,         // ~0.42m × 1.27m per panel
  gi_sheet: 1.52,              // 0.83m × 1.83m per sheet
  shingle: 0.93,               // ~0.93m × 1.0m per strip
  custom: 1.5,                 // fallback
};

// Roofing screws per sheet (approximate)
export const SCREWS_PER_SHEET = 10;

// Purlin rows per roof slope
export const PURLIN_ROWS_PER_SLOPE = 4;

// Rafter spacing (m)
export const RAFTER_SPACING = 0.9;

// Foundation blockwork courses below DPC
export const FOUNDATION_COURSES = 4;

// Feet to meters conversion
export const M_PER_FT = 0.3048;

// 1 trip of sand/granite = ~3.5 m³ (standard 5-tonne tipper truck in Nigeria)
export const M3_PER_TRIP = 3.5;

// ── Helpers ──

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

// Convert m³ to trips (Nigerian construction unit)
export function m3ToTrips(m3: number): number {
  return m3 / M3_PER_TRIP;
}

// Round up to full trips (you can't buy 0.7 of a trip)
function m3ToTripCeil(m3: number): number {
  return Math.ceil(m3 / M3_PER_TRIP);
}

// Material line that shows trips (primary) but calculates from m³ volume
// Uses trip-based pricing when available, falls back to per-m³
function matLineTrips(
  label: string,
  volumeM3: number,
  wastagePercent: number,
  pricePerTrip: number,
  pricePerM3: number,
  priceSource: string
): MaterialLine {
  const finalM3 = applyWastage(volumeM3, wastagePercent);
  const trips = m3ToTripCeil(finalM3);
  // Use trip pricing (cheaper per m³ when bought in bulk)
  // but if volume is very small (< 0.5 trip), use per-m³ for accuracy
  if (finalM3 < M3_PER_TRIP * 0.5 && pricePerM3 > 0) {
    return {
      label,
      unit: 'm³',
      base_quantity: round(volumeM3),
      wastage_percent: wastagePercent,
      final_quantity: round(finalM3),
      unit_price: pricePerM3,
      total_cost: round(finalM3 * pricePerM3),
      price_source: priceSource,
    };
  }
  return {
    label: label.replace(/ \(m³\)/, '').trim(),
    unit: 'trips',
    base_quantity: round(volumeM3 / M3_PER_TRIP * 10) / 10, // show base trips (decimal)
    wastage_percent: wastagePercent,
    final_quantity: trips, // ceil to full trips
    unit_price: pricePerTrip,
    total_cost: round(trips * pricePerTrip),
    price_source: priceSource,
  };
}

function applyWastage(baseQty: number, wastagePercent: number): number {
  return baseQty * (1 + wastagePercent / 100);
}

function qtyLine(
  label: string,
  formula: string,
  inputs: Record<string, number>,
  baseQty: number,
  unit: string,
  wastagePercent: number
): QuantityLine {
  return {
    label,
    formula,
    inputs,
    base_quantity: round(baseQty),
    unit,
    wastage_percent: wastagePercent,
    final_quantity: round(applyWastage(baseQty, wastagePercent)),
  };
}

function matLine(
  label: string,
  unit: string,
  baseQty: number,
  wastagePercent: number,
  unitPrice: number,
  priceSource: string
): MaterialLine {
  const withWastage = applyWastage(baseQty, wastagePercent);
  // Discrete pieces (blocks, sheets, screws) are bought whole, one
  // purchase rounding at the end. Continuous materials keep 2 dp.
  const finalQty = unit === 'pcs' ? Math.ceil(withWastage) : withWastage;
  return {
    label,
    unit,
    base_quantity: round(baseQty),
    wastage_percent: wastagePercent,
    final_quantity: round(finalQty),
    unit_price: unitPrice,
    total_cost: round(finalQty * unitPrice),
    price_source: priceSource,
  };
}

function labLine(label: string, unit: string, qty: number, rate: number): LabourLine {
  return {
    label,
    unit,
    quantity: round(qty),
    rate: round(rate),
    total_cost: round(qty * rate),
  };
}

// ── Concrete mix → material breakdown ──

/**
 * Convert wet concrete volume (m³) into cement (bags), sand (m³), granite (m³)
 * using a mix ratio like 1:2:4 (cement:sand:granite by volume).
 *
 * Formula:
 *   dryVolume = wetVolume × 1.54
 *   totalParts = cement + sand + aggregate
 *   cementVol = dryVolume × (cement / totalParts)
 *   sandVol   = dryVolume × (sand / totalParts)
 *   graniteVol    = dryVolume × (aggregate / totalParts)
 *   cementBags = cementVol / 0.0347
 *
 * Verification: cementVol + sandVol + graniteVol = dryVolume (mass balance holds)
 */
export function concreteToMaterials(
  wetVolumeM3: number,
  mixCement: number,
  mixSand: number,
  mixGranite: number
): { cement_bags: number; sand_m3: number; granite_m3: number } {
  if (wetVolumeM3 <= 0) return { cement_bags: 0, sand_m3: 0, granite_m3: 0 };
  const dryVolume = wetVolumeM3 * DRY_WET_RATIO;
  const totalParts = mixCement + mixSand + mixGranite;
  if (totalParts <= 0) return { cement_bags: 0, sand_m3: 0, granite_m3: 0 };

  const cementVol = dryVolume * (mixCement / totalParts);
  const sandVol = dryVolume * (mixSand / totalParts);
  const graniteVol = dryVolume * (mixGranite / totalParts);

  return {
    cement_bags: cementVol / CEMENT_VOLUME_PER_BAG,
    sand_m3: sandVol,
    granite_m3: graniteVol,
  };
}

// ── Mortar mix → material breakdown ──

/**
 * Convert wet mortar volume (m³) into cement (bags) and sand (m³)
 * using a mix ratio like 1:6 (cement:sand by volume).
 *
 * Formula:
 *   dryVolume = wetVolume × 1.33
 *   totalParts = cement + sand
 *   cementVol = dryVolume × (cement / totalParts)
 *   sandVol   = dryVolume × (sand / totalParts)
 *   cementBags = cementVol / 0.0347
 */
export function mortarToMaterials(
  mortarVolumeM3: number,
  mixCement: number,
  mixSand: number
): { cement_bags: number; sand_m3: number } {
  if (mortarVolumeM3 <= 0) return { cement_bags: 0, sand_m3: 0 };
  const dryVolume = mortarVolumeM3 * MORTAR_DRY_WET_RATIO;
  const totalParts = mixCement + mixSand;
  if (totalParts <= 0) return { cement_bags: 0, sand_m3: 0 };

  const cementVol = dryVolume * (mixCement / totalParts);
  const sandVol = dryVolume * (mixSand / totalParts);

  return {
    cement_bags: cementVol / CEMENT_VOLUME_PER_BAG,
    sand_m3: sandVol,
  };
}

// ── Block calculation ──

/**
 * Calculate blocks per m² based on block face dimensions.
 * blocks_per_m² = 1 / (blockLength_m × blockHeight_m)
 *
 * Note: This is the face area including mortar joints.
 * In practice, the effective course height includes mortar,
 * so blocks per m² is slightly less than theoretical.
 * We use the block face dimension as-is (standard industry approach).
 */
export function blocksPerM2(blockLengthInches: number, blockHeightInches: number): number {
  // Convert inches to meters: 1 inch = 0.0254 m
  const blockFaceArea = (blockLengthInches * 0.0254) * (blockHeightInches * 0.0254); // m²
  if (blockFaceArea <= 0) return 0;
  return 1 / blockFaceArea;
}

// ── Roof geometry: explicit roof-plane model ──

/**
 * ONE explicit roof plane. Every supported roof is decomposed into a list
 * of these; the total roof area is the SUM of the plane areas, no plane
 * is counted twice and none is omitted.
 */
export interface RoofPlane {
  id: string;                 // unique within the decomposition
  roof_type: string;
  label: string;
  /** Horizontal projected area of the plane (m²) */
  projected_area_m2: number;
  pitch_degrees: number;
  /** Sloped (true surface) area of the plane (m²) */
  sloped_area_m2: number;
  /** Human-readable projected boundary of the plane */
  boundary: string;
}

/**
 * Decompose a roof into its explicit roof planes.
 *
 * CONVENTIONS (the geometric model of the engine):
 * - Building: rectangular footprint, L (length) × W (width).
 * - Overhang: ONE uniform HORIZONTAL eave overhang, applied once to each
 *   of the four footprint edges (so the eave rectangle is (L+2OH)×(W+2OH)).
 *   Longitudinal and transverse overhangs are not specified separately :
 *   the single value is used for both.
 * - Pitch: inclination angle θ in DEGREES relative to horizontal, converted
 *   internally via θ_rad = θ_deg × π/180. All planes of a roof share the
 *   same pitch (uniform-pitch model).
 * - Sloped area of a plane = projected area / cos(θ) (exact for a plane of
 *   constant pitch, independent of the plane's horizontal shape).
 *
 * PER-TYPE GEOMETRY (eave rectangle Le = L+2OH, We = W+2OH):
 *
 * GABLE, two rectangular planes, ridge along the LENGTH:
 *   each plane: projected Le × (We/2)   → sloped / cos θ
 *   (2 × Le × We/2 = Le·We, equivalent to the closed form Le·We/cos θ)
 *   ridge length = Le; ridge caps = Le.
 *
 * HIP, 4 planes, ridge along the LONGER eave side, R = |Le − We|
 *   (Le = We → pyramid, R = 0):
 *   2 trapezoid side planes: parallel sides Le and R, height We/2
 *     → projected (Le + R)/2 × We/2
 *   2 triangular end planes: base We, depth We/2
 *     → projected We²/4 each
 *   Projection conservation: 2 × (Le+R)/2 × We/2 + 2 × We²/4 = Le·We ✓
 *   (For uniform pitch the sloped total = Le·We/cos θ, which is EXACT for
 *   this geometry, proven by plane decomposition, not assumed.)
 *
 * MONO-PITCH, ONE rectangular plane spanning the FULL width:
 *   projected Le × We → sloped / cos θ. High and low edges run along Le.
 *
 * FLAT, one plane at 0°: sloped area = projected area = Le·We.
 *
 * CUSTOM, the engine explicitly applies the GABLE-EQUIVALENT model
 *   (2 planes, single ridge along the length) with the user-supplied
 *   pitch. This is a documented modelling choice, disclosed in the UI;
 *   complex roof geometry (L/T-shaped, cross-gable, intersecting hips,
 *   multiple ridges/valleys) is NOT supported and is not silently
 *   approximated by this tool.
 */
export function decomposeRoofPlanes(
  buildingLength: number,
  buildingWidth: number,
  pitchDegrees: number,
  overhang: number,
  roofType: string
): RoofPlane[] {
  const Le = buildingLength + 2 * overhang; // eave length (along ridge)
  const We = buildingWidth + 2 * overhang;  // eave width (across ridge)

  if (roofType === 'flat') {
    return [{
      id: 'flat-1',
      roof_type: 'flat',
      label: 'Flat roof plane',
      projected_area_m2: Le * We,
      pitch_degrees: 0,
      sloped_area_m2: Le * We,
      boundary: `Eave rectangle ${round(Le, 2)}m × ${round(We, 2)}m`,
    }];
  }

  const pitchRad = (pitchDegrees * Math.PI) / 180;

  // Guard against pitch = 90° (vertical), a wall, not a roof. The plane
  // is undefined for sheeting; the horizontal projection is returned so
  // the estimate degrades to the limiting flat case.
  if (Math.abs(pitchDegrees - 90) < 0.01) {
    return [{
      id: 'vertical-1',
      roof_type: roofType,
      label: 'Vertical plane (pitch 90°, not a roof)',
      projected_area_m2: Le * We,
      pitch_degrees: pitchDegrees,
      sloped_area_m2: Le * We,
      boundary: 'Undefined, vertical pitch is not a roof plane',
    }];
  }

  const slopeFactor = 1 / Math.cos(pitchRad);
  const plane = (
    id: string, label: string, projectedArea: number, boundary: string
  ): RoofPlane => ({
    id,
    roof_type: roofType,
    label,
    // Full precision, rounding happens only on the total (see
    // calculateRoofArea) and at purchase-quantity stage. Rounding plane
    // areas before summing leaked up to 0.02 m² into the total.
    projected_area_m2: projectedArea,
    pitch_degrees: pitchDegrees,
    sloped_area_m2: projectedArea * slopeFactor,
    boundary,
  });

  if (roofType === 'mono_pitch') {
    return [
      plane('mono-1', 'Mono-pitch plane (full width)', Le * We,
        `Eave rectangle ${round(Le, 2)}m × ${round(We, 2)}m, high edge along Le`),
    ];
  }

  if (roofType === 'hip') {
    // Ridge along the longer eave side; R = 0 gives a pyramid.
    const long = Math.max(Le, We);
    const short = Math.min(Le, We);
    const R = long - short;
    const trapProjected = ((long + R) / 2) * (short / 2);
    const triProjected = (short * short) / 4;
    const ridgeNote = R === 0 ? ' (pyramid, no ridge)' : '';
    return [
      plane('hip-side-1', `Hip trapezoid plane 1${ridgeNote}`, trapProjected,
        `Trapezoid: parallel sides ${round(long, 2)}m (eave) and ${round(R, 2)}m (ridge), height ${round(short / 2, 2)}m`),
      plane('hip-side-2', `Hip trapezoid plane 2${ridgeNote}`, trapProjected,
        `Trapezoid: parallel sides ${round(long, 2)}m (eave) and ${round(R, 2)}m (ridge), height ${round(short / 2, 2)}m`),
      plane('hip-end-1', `Hip triangular end plane 1${ridgeNote}`, triProjected,
        `Triangle: base ${round(short, 2)}m, depth ${round(short / 2, 2)}m`),
      plane('hip-end-2', `Hip triangular end plane 2${ridgeNote}`, triProjected,
        `Triangle: base ${round(short, 2)}m, depth ${round(short / 2, 2)}m`),
    ];
  }

  // GABLE, and CUSTOM, which explicitly uses the gable-equivalent model
  const typeLabel = roofType === 'custom' ? 'Custom (gable-equivalent)' : 'Gable';
  const halfSpan = We / 2;
  return [
    plane(`${roofType}-1`, `${typeLabel} plane 1 (half-span)`, Le * halfSpan,
      `Rectangle ${round(Le, 2)}m (ridge/eave) × ${round(halfSpan, 2)}m (horizontal half-span)`),
    plane(`${roofType}-2`, `${typeLabel} plane 2 (half-span)`, Le * halfSpan,
      `Rectangle ${round(Le, 2)}m (ridge/eave) × ${round(halfSpan, 2)}m (horizontal half-span)`),
  ];
}

/**
 * Total roof surface area = the sum of the explicitly decomposed roof-plane
 * areas (conservation invariant, no plane counted twice, none omitted).
 */
export function calculateRoofArea(
  buildingLength: number,
  buildingWidth: number,
  pitchDegrees: number,
  overhang: number,
  roofType: string
): number {
  const planes = decomposeRoofPlanes(buildingLength, buildingWidth, pitchDegrees, overhang, roofType);
  return round(planes.reduce((sum, p) => sum + p.sloped_area_m2, 0));
}

// ── Roofing sheets ──

/**
 * Calculate number of roofing sheets needed.
 * Coverage varies by roofing material type.
 */
export function roofingSheetsCount(roofAreaM2: number, sheetCoverageM2: number): number {
  if (sheetCoverageM2 <= 0) return 0;
  return Math.ceil(roofAreaM2 / sheetCoverageM2);
}

/**
 * Get sheet coverage based on roofing material type.
 */
export function getSheetCoverage(material: RoofingMaterial): number {
  return SHEET_COVERAGE[material] ?? SHEET_COVERAGE.custom;
}

// ── Ridge length ──

export function calculateRidgeLength(
  buildingLength: number,
  buildingWidth: number,
  roofType: string,
  overhang = 0
): number {
  switch (roofType) {
    case 'gable':
      // Ridge cap runs the full apex, the sloped planes extend 2 x overhang
      // beyond the gable walls, so the apex (and its cap) is L + 2 x overhang.
      return buildingLength + 2 * overhang;
    case 'hip': {
      // Ridge runs along the LONGER side; its length is |L - W|.
      // (L = W gives a pyramid, no ridge.)
      return Math.abs(buildingLength - buildingWidth);
    }
    case 'mono_pitch':
      return 0; // no ridge
    case 'flat':
      return 0;
    default:
      return buildingLength + 2 * overhang;
  }
}

// ── Hip length (for hip roofs) ──

export function calculateHipLength(
  buildingLength: number,
  buildingWidth: number,
  pitchDegrees: number,
  overhang = 0
): number {
  // True hip-rafter geometry (standard roofing math):
  //   plan run per direction = min(L, W)/2 + overhang  (hips sit at 45 deg
  //   in plan when all pitches are equal, and start at the eave corners)
  //   rise = plan run x tan(pitch)
  //   hip length per hip = sqrt(run^2 + run^2 + rise^2) = run x sqrt(2 + tan^2(pitch))
  // A hip is NOT a common rafter: using (run / cos(pitch)) understates the
  // true hip length by 18-34% over typical pitches.
  const pitchRad = (pitchDegrees * Math.PI) / 180;
  const run = Math.min(buildingLength, buildingWidth) / 2 + overhang;
  const hipLength = run * Math.sqrt(2 + Math.pow(Math.tan(pitchRad), 2));
  // 4 hips in a standard hip roof (one from each corner)
  return 4 * hipLength;
}

// ── Fascia length ──

export function calculateFasciaLength(
  buildingLength: number,
  buildingWidth: number,
  overhang: number
): number {
  return 2 * (buildingLength + 2 * overhang) + 2 * (buildingWidth + 2 * overhang);
}

// ── Timber estimation (rafters + purlins) ──

/**
 * Estimate timber for roof structure.
 * For gable/hip: rafters at ~900mm spacing, purlins along the slope.
 * Rafter length includes overhang extension.
 *
 * FIX: slope_length now includes overhang in the rafter length.
 */
export function estimateTimberMeters(
  roofAreaM2: number,
  buildingLength: number,
  buildingWidth: number,
  pitchDegrees: number,
  overhang: number,
  roofType: string
): number {
  if (roofType === 'flat') {
    return Math.ceil(roofAreaM2 * 2); // minimal timber for flat roof
  }

  const pitchRad = (pitchDegrees * Math.PI) / 180;

  // The framing supports the sheets, so it is measured on the EAVE rectangle
  // (the actual roof extent incl. overhang), not the wall rectangle.
  const eaveLength = buildingLength + 2 * overhang;   // along the ridge
  const eaveWidth = buildingWidth + 2 * overhang;    // across the ridge

  if (roofType === 'mono_pitch') {
    // Single plane spanning the FULL width: rafter run = eave width.
    const slopeLength = eaveWidth / Math.cos(pitchRad);
    const rafterCount = Math.ceil(eaveLength / RAFTER_SPACING) + 1;
    const rafterTotalM = rafterCount * slopeLength;              // ONE plane
    const purlinTotalM = PURLIN_ROWS_PER_SLOPE * eaveLength;     // ONE plane
    return round(rafterTotalM + purlinTotalM);
  }

  // Gable / hip: common-rafter slope covers half the eave width
  const slopeLength = (eaveWidth / 2) / Math.cos(pitchRad);

  let rafterTotalM: number;
  let purlinTotalM: number;

  if (roofType === 'hip') {
    // Commons step down toward the hips: full-height section runs between
    // the hip planes, i.e. along (eaveLength - eaveWidth).
    const commonPositions = Math.max(1, Math.ceil((eaveLength - eaveWidth) / RAFTER_SPACING) + 1);
    rafterTotalM = commonPositions * 2 * slopeLength; // 2 side planes
    // Jack rafters radiate on the 2 end planes: spaced along the eave width,
    // average length ~ half the common slope.
    const jacksPerEnd = Math.ceil(eaveWidth / RAFTER_SPACING) + 1;
    rafterTotalM += jacksPerEnd * 2 * (slopeLength / 2);
    // Purlins on all 4 planes: side planes run eaveLength; end-plane rows
    // average half the eave width (triangular planes taper to the ridge).
    purlinTotalM = PURLIN_ROWS_PER_SLOPE * 2 * eaveLength
                 + PURLIN_ROWS_PER_SLOPE * 2 * (eaveWidth / 2);
  } else {
    // Gable (and custom): 2 planes, rafters at spacing along the eave length
    const rafterCount = Math.ceil(eaveLength / RAFTER_SPACING) + 1;
    rafterTotalM = rafterCount * 2 * slopeLength; // both slopes
    purlinTotalM = PURLIN_ROWS_PER_SLOPE * 2 * eaveLength;
  }

  return round(rafterTotalM + purlinTotalM);
}

// ── Reinforcement ──
// Steel weight per meter: kg/m = d² / 162  [d in mm]
// Derives from: weight = π × d²/4 × 7850 kg/m³ / 10⁶ = d²/162.3 ≈ d²/162
// (verified: 16mm → 1.580 kg/m vs exact 1.578 kg/m, 0.1% off, standard formula)
// ── Reinforcement breakdown by bar diameter ──

interface RebarAggregate {
  diameter_mm: number;
  source: 'main' | 'links';
  total_length_m: number;
  weight_kg: number;
}

const REBAR_STANDARD_LENGTH = 12; // meters (Nigerian standard: 12m lengths)

function getRebarPriceForDiameter(diameter_mm: number, prices: PriceConfig): number {
  switch (diameter_mm) {
    case 12: return prices.rebar_12mm_per_length;
    case 16: return prices.rebar_16mm_per_length;
    case 20: return prices.rebar_20mm_per_length;
    case 25: return prices.rebar_25mm_per_length;
    default: {
      // For non-standard diameters, estimate from per-tonne price
      // weight per 12m length = d²/162 × 12
      const weightPerLength = (diameter_mm * diameter_mm / 162) * REBAR_STANDARD_LENGTH;
      return Math.round(prices.reinforcement_per_tonne / 1000 * weightPerLength);
    }
  }
}

export function buildReinforcementBreakdown(
  members: StructuralMemberInput[],
  wastagePercent: number,
  prices: PriceConfig
): ReinforcementBreakdown {
  const aggregates = new Map<string, RebarAggregate>();

  for (const member of members) {
    // Main bars
    if (member.bar_diameter_mm && member.bar_count_main) {
      const key = `${member.bar_diameter_mm}_main`;
      const mainBarLength = member.bar_length_main ?? member.length;
      const totalLength = member.bar_count_main * mainBarLength * member.quantity;
      const weightPerM = Math.pow(member.bar_diameter_mm, 2) / 162;
      const weight = totalLength * weightPerM;

      const existing = aggregates.get(key);
      if (existing) {
        existing.total_length_m += totalLength;
        existing.weight_kg += weight;
      } else {
        aggregates.set(key, {
          diameter_mm: member.bar_diameter_mm,
          source: 'main',
          total_length_m: totalLength,
          weight_kg: weight,
        });
      }
    }

    // Links/stirrups
    if (member.link_diameter_mm && member.bar_count_links) {
      const key = `${member.link_diameter_mm}_links`;
      const cover = (member.cover_mm ?? 25) / 1000;
      const linkBodyLength = 2 * (member.width + member.depth - 4 * cover);
      const hookLength = 2 * STIRRUP_HOOK_MULTIPLIER * (member.link_diameter_mm / 1000);
      const linkTotalLength = linkBodyLength + hookLength;
      const linksTotal = member.bar_count_links * member.length * member.quantity;
      const totalLength = linksTotal * linkTotalLength;
      const weightPerM = Math.pow(member.link_diameter_mm, 2) / 162;
      const weight = totalLength * weightPerM;

      const existing = aggregates.get(key);
      if (existing) {
        existing.total_length_m += totalLength;
        existing.weight_kg += weight;
      } else {
        aggregates.set(key, {
          diameter_mm: member.link_diameter_mm,
          source: 'links',
          total_length_m: totalLength,
          weight_kg: weight,
        });
      }
    }
  }

  const items: ReinforcementBreakdownItem[] = [];
  let totalWeightKg = 0;
  let totalLengthM = 0;
  let totalCost = 0;

  for (const agg of aggregates.values()) {
    const lengthWithWastage = applyWastage(agg.total_length_m, wastagePercent);
    const standardLengths = Math.ceil(lengthWithWastage / REBAR_STANDARD_LENGTH);
    const weightWithWastage = applyWastage(agg.weight_kg, wastagePercent);
    const unitPrice = getRebarPriceForDiameter(agg.diameter_mm, prices);
    const cost = standardLengths * unitPrice;

    const sourceLabel = agg.source === 'main' ? 'Main Bars' : 'Stirrups/Links';
    const label = `${agg.diameter_mm}mm ${sourceLabel}`;

    items.push({
      diameter_mm: agg.diameter_mm,
      label,
      base_length_m: round(agg.total_length_m),
      total_length_m: round(lengthWithWastage),
      standard_lengths: standardLengths,
      weight_kg: round(weightWithWastage),
      weight_tonnes: round(weightWithWastage / 1000),
      unit_price: unitPrice,
      total_cost: round(cost),
      source: agg.source,
    });

    totalWeightKg += weightWithWastage;
    totalLengthM += lengthWithWastage;
    totalCost += cost;
  }

  // Sort by diameter (ascending), main bars before links
  items.sort((a, b) => {
    if (a.diameter_mm !== b.diameter_mm) return a.diameter_mm - b.diameter_mm;
    return a.source === 'main' ? -1 : 1;
  });

  // Binding wire (~2% of steel weight)
  const bindingWireKg = totalWeightKg * 0.02;
  const bindingWireCost = bindingWireKg * prices.binding_wire_per_kg;

  return {
    items,
    total_weight_tonnes: round(totalWeightKg / 1000),
    total_length_m: round(totalLengthM),
    binding_wire_kg: round(bindingWireKg),
    binding_wire_cost: round(bindingWireCost),
    total_cost: round(totalCost + bindingWireCost),
  };
}

// ── Stage A: Site & Foundation ──

function calcSiteAndFoundation(input: BuildToRoofInput): StageResult {
  const quantities: QuantityLine[] = [];
  const materials: MaterialLine[] = [];
  const labour: LabourLine[] = [];

  const perimeter = 2 * (input.building_length + input.building_width);
  const footprintArea = input.building_length * input.building_width;

  // 1. Site clearing & setting out (allowance-based)
  quantities.push(
    qtyLine('Site clearing & setting out', 'Allowance, general labour days',
      { days: input.labour.general_labour_days },
      input.labour.general_labour_days, 'days', 0)
  );
  labour.push(labLine('Site clearing & setting out', 'days', input.labour.general_labour_days, input.labour.general_labour_per_day));

  // 2. Excavation volume
  const excavationVol = perimeter * input.foundation_width * input.foundation_depth;
  quantities.push(
    qtyLine('Excavation volume', 'Perimeter × Foundation width × Trench depth',
      { perimeter, foundation_width: input.foundation_width, foundation_depth: input.foundation_depth },
      excavationVol, 'm³', 0)
  );
  labour.push(labLine('Excavation labour', 'm³', excavationVol, input.labour.excavation_per_m3));

  // 3. Blinding concrete
  const blindingVol = footprintArea * input.blinding_thickness;
  quantities.push(
    qtyLine('Blinding concrete volume', 'Footprint area × Blinding thickness',
      { footprint_area: footprintArea, blinding_thickness: input.blinding_thickness },
      blindingVol, 'm³', input.wastage.cement)
  );
  const blindingMats = concreteToMaterials(blindingVol, input.concrete_mix_cement, input.concrete_mix_sand, input.concrete_mix_granite);
  materials.push(matLine('Cement (blinding)', 'bags', blindingMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (blinding)', blindingMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  materials.push(matLineTrips('Granite (blinding)', blindingMats.granite_m3, input.wastage.granite, input.prices.granite_per_trip, input.prices.granite_per_m3, input.prices.price_source));
  labour.push(labLine('Blinding labour', 'm³', blindingVol, input.labour.blinding_per_m3));

  // 4. Foundation concrete (strip footing), FIX: uses configurable footing_thickness
  const foundationConcreteVol = perimeter * input.foundation_width * input.footing_thickness;
  quantities.push(
    qtyLine('Foundation concrete volume', 'Perimeter × Foundation width × Footing thickness',
      { perimeter, foundation_width: input.foundation_width, footing_thickness: input.footing_thickness },
      foundationConcreteVol, 'm³', input.wastage.cement)
  );
  const foundMats = concreteToMaterials(foundationConcreteVol, input.concrete_mix_cement, input.concrete_mix_sand, input.concrete_mix_granite);
  materials.push(matLine('Cement (foundation)', 'bags', foundMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (foundation)', foundMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  materials.push(matLineTrips('Granite (foundation)', foundMats.granite_m3, input.wastage.granite, input.prices.granite_per_trip, input.prices.granite_per_m3, input.prices.price_source));
  labour.push(labLine('Concrete labour', 'm³', foundationConcreteVol, input.labour.concrete_per_m3));

  // 5. Hardcore filling, FIX: now has material cost
  const hardcoreVol = footprintArea * input.hardcore_thickness;
  quantities.push(
    qtyLine('Hardcore filling volume', 'Footprint area × Hardcore thickness',
      { footprint_area: footprintArea, hardcore_thickness: input.hardcore_thickness },
      hardcoreVol, 'm³', input.wastage.hardcore)
  );
  materials.push(matLine('Hardcore stone', 'm³', hardcoreVol, input.wastage.hardcore, input.prices.hardcore_per_m3, input.prices.price_source));
  labour.push(labLine('Hardcore labour', 'm³', hardcoreVol, input.labour.hardcore_per_m3));

  // 6. Compaction of hardcore, FIX: added compaction labour
  quantities.push(
    qtyLine('Compaction volume', 'Hardcore volume (same as filling)',
      { hardcore_volume: hardcoreVol },
      hardcoreVol, 'm³', 0)
  );
  labour.push(labLine('Compaction labour', 'm³', hardcoreVol, input.labour.compaction_per_m3));

  // 7. Sand filling (over hardcore, below DPC)
  const sandFillThickness = input.sand_filling_thickness ?? 0.05; // configurable, default 50mm
  const sandFillVol = footprintArea * sandFillThickness;
  quantities.push(
    qtyLine('Sand filling volume', 'Footprint area × 0.05 (50mm)',
      { footprint_area: footprintArea, thickness: sandFillThickness },
      sandFillVol, 'm³', input.wastage.sand)
  );
  materials.push(matLineTrips('Sand (filling)', sandFillVol, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  labour.push(labLine('Sand filling labour', 'm³', sandFillVol, input.labour.sand_filling_per_m3));

  // 8. Backfilling, FIX: added backfilling (excavated soil returned into trench)
  // Blinding sits over the full footprint (inside the walls), not inside the
  // trench, so the only trench volume occupied is the footing concrete itself.
  const backfillVol = Math.max(0, excavationVol - foundationConcreteVol);
  if (backfillVol > 0) {
    quantities.push(
      qtyLine('Backfilling volume', 'Excavation vol − Foundation concrete',
        { excavation: excavationVol, foundation_concrete: foundationConcreteVol },
        backfillVol, 'm³', 0)
    );
    labour.push(labLine('Backfilling labour', 'm³', backfillVol, input.labour.backfilling_per_m3));
  }

  // 9. DPC
  if (input.dpc_length > 0) {
    const dpcLength = perimeter + input.internal_wall_length;
    quantities.push(
      qtyLine('DPC length', 'Perimeter + Internal walls',
        { perimeter, internal_walls: input.internal_wall_length },
        dpcLength, 'm', 0)
    );
    materials.push(matLine('DPC roll', 'm', dpcLength, 0, input.prices.dpc_per_meter, input.prices.price_source));
  }

  // 10. Foundation blockwork (up to DPC), FIX: includes mortar joints in height
  const courseHeight = (input.block_height * 0.0254) + MORTAR_JOINT_THICKNESS; // block (inches→m) + mortar joint
  const foundationBlockHeight = courseHeight * FOUNDATION_COURSES;
  const foundationWallArea = perimeter * foundationBlockHeight;
  const blocksPerM2Val = blocksPerM2(input.block_length, input.block_height);
  const foundationBlocks = foundationWallArea * blocksPerM2Val;
  quantities.push(
    qtyLine('Foundation blocks', 'Foundation wall area × Blocks per m²',
      { wall_area: foundationWallArea, blocks_per_m2: blocksPerM2Val, courses: FOUNDATION_COURSES, course_height: courseHeight },
      foundationBlocks, 'pcs', input.wastage.blocks)
  );
  materials.push(matLine('Blocks (foundation)', 'pcs', foundationBlocks, input.wastage.blocks, input.prices.block_per_piece, input.prices.price_source));

  // Mortar for foundation blockwork
  const foundationMortarVol = foundationWallArea * 0.03;
  const foundMortarMats = mortarToMaterials(foundationMortarVol, input.mortar_mix_cement, input.mortar_mix_sand);
  materials.push(matLine('Cement (foundation mortar)', 'bags', foundMortarMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (foundation mortar)', foundMortarMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  labour.push(labLine('Blockwork labour (foundation)', 'blocks', foundationBlocks, input.labour.blockwork_per_block));

  const materialsTotal = materials.reduce((s, m) => s + m.total_cost, 0);
  const labourTotal = labour.reduce((s, l) => s + l.total_cost, 0);

  return {
    stage: 'site_preparation',
    stage_label: 'Site & Foundation',
    quantities,
    materials,
    labour,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    stage_total: round(materialsTotal + labourTotal),
  };
}

// ── Stage B: Ground Floor ──

function calcGroundFloor(input: BuildToRoofInput): StageResult {
  const quantities: QuantityLine[] = [];
  const materials: MaterialLine[] = [];
  const labour: LabourLine[] = [];

  const footprintArea = input.building_length * input.building_width;

  // Sand filling over the hardcore is calculated ONCE, in the Site &
  // Foundation stage (over hardcore, below DPC). The same physical layer
  // must not also be priced here, that was double-counting.
  // Oversite concrete (ground floor slab)
  const slabThickness = 0.1; // 100mm, standard Nigerian construction
  const slabVol = footprintArea * slabThickness;
  quantities.push(
    qtyLine('Ground floor concrete volume', 'Footprint area × Slab thickness (100mm)',
      { footprint_area: footprintArea, slab_thickness: slabThickness },
      slabVol, 'm³', input.wastage.cement)
  );

  const slabMats = concreteToMaterials(slabVol, input.concrete_mix_cement, input.concrete_mix_sand, input.concrete_mix_granite);
  materials.push(matLine('Cement (ground floor)', 'bags', slabMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (ground floor)', slabMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  materials.push(matLineTrips('Granite (ground floor)', slabMats.granite_m3, input.wastage.granite, input.prices.granite_per_trip, input.prices.granite_per_m3, input.prices.price_source));
  labour.push(labLine('Concrete labour (ground floor)', 'm³', slabVol, input.labour.concrete_per_m3));

  // DPM under slab, FIX: uses dpm_per_m2 (not dpc_per_meter)
  if (input.dpc_length > 0) {
    materials.push(matLine('DPM membrane', 'm²', footprintArea, 5, input.prices.dpm_per_m2, input.prices.price_source));
  }

  const materialsTotal = materials.reduce((s, m) => s + m.total_cost, 0);
  const labourTotal = labour.reduce((s, l) => s + l.total_cost, 0);

  return {
    stage: 'ground_floor',
    stage_label: 'Ground Floor',
    quantities,
    materials,
    labour,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    stage_total: round(materialsTotal + labourTotal),
  };
}

// ── Stage C: Wall Construction ──

function calcWalls(input: BuildToRoofInput): StageResult {
  const quantities: QuantityLine[] = [];
  const materials: MaterialLine[] = [];
  const labour: LabourLine[] = [];

  const perimeter = 2 * (input.building_length + input.building_width);
  const wallHeight = input.floor_to_floor_height * input.number_of_floors;

  // External wall area
  const externalGrossArea = perimeter * wallHeight;
  // Internal wall area
  const internalGrossArea = input.internal_wall_length * wallHeight;

  // Opening deductions
  const openingArea = input.openings.reduce((sum, o) => sum + o.width * o.height * o.count, 0);

  const netWallArea = Math.max(0, externalGrossArea + internalGrossArea - openingArea);

  quantities.push(
    qtyLine('External wall gross area', 'Perimeter × Wall height × Floors',
      { perimeter, wall_height: wallHeight, floors: input.number_of_floors },
      externalGrossArea, 'm²', 0)
  );
  quantities.push(
    qtyLine('Internal wall gross area', 'Internal wall length × Wall height × Floors',
      { internal_length: input.internal_wall_length, wall_height: wallHeight },
      internalGrossArea, 'm²', 0)
  );
  quantities.push(
    qtyLine('Opening deductions', 'Σ (door width × height × count) + Σ (window width × height × count)',
      { opening_area: openingArea },
      -openingArea, 'm²', 0)
  );
  quantities.push(
    qtyLine('Net wall area', 'External + Internal − Openings',
      { external: externalGrossArea, internal: internalGrossArea, openings: openingArea },
      netWallArea, 'm²', 0)
  );

  // Blocks
  const blocksM2 = blocksPerM2(input.block_length, input.block_height);
  const totalBlocks = netWallArea * blocksM2;
  quantities.push(
    qtyLine('Blocks required', 'Net wall area × Blocks per m²',
      { net_area: netWallArea, blocks_per_m2: blocksM2 },
      totalBlocks, 'pcs', input.wastage.blocks)
  );
  materials.push(matLine('Blocks (walls)', 'pcs', totalBlocks, input.wastage.blocks, input.prices.block_per_piece, input.prices.price_source));

  // Mortar, volume scales with wall thickness (thicker walls = more mortar per m²)
  // 225mm (9"): 0.03 m³/m² | 150mm (6"): 0.022 m³/m² | 125mm (5"): 0.018 m³/m²
  // Formula: mortarPerM² = 0.03 × (wallThickness / 0.225)  [linear scale from 225mm baseline]
  const mortarPerM2 = 0.03 * (input.wall_thickness / 0.225);
  const mortarVol = netWallArea * mortarPerM2;
  const mortarMats = mortarToMaterials(mortarVol, input.mortar_mix_cement, input.mortar_mix_sand);
  materials.push(matLine('Cement (wall mortar)', 'bags', mortarMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (wall mortar)', mortarMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));

  // Labour
  labour.push(labLine('Blockwork labour', 'blocks', totalBlocks, input.labour.blockwork_per_block));

  const materialsTotal = materials.reduce((s, m) => s + m.total_cost, 0);
  const labourTotal = labour.reduce((s, l) => s + l.total_cost, 0);

  return {
    stage: 'walls',
    stage_label: 'Wall Construction',
    quantities,
    materials,
    labour,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    stage_total: round(materialsTotal + labourTotal),
  };
}

// ── Stage D: Structural Frame ──

function calcStructuralFrame(input: BuildToRoofInput): StageResult {
  const quantities: QuantityLine[] = [];
  const materials: MaterialLine[] = [];
  const labour: LabourLine[] = [];

  if (input.structural_members.length === 0) {
    return {
      stage: 'structural_frame',
      stage_label: 'Structural Frame',
      quantities,
      materials,
      labour,
      materials_total: 0,
      labour_total: 0,
      stage_total: 0,
    };
  }

  let totalConcreteVol = 0;
  let totalFormworkArea = 0;

  for (const member of input.structural_members) {
    // FIX: removed redundant if/else, all member types use the same volume formula
    // vol = length × width × depth × quantity
    const vol = member.length * member.width * member.depth * member.quantity;
    totalConcreteVol += vol;

    // Formwork area (sides + soffit for beams, sides for columns, soffit for slabs)
    let formwork: number;
    if (member.type === 'column') {
      // Column: 4 sides (perimeter × height)
      formwork = member.length * 2 * (member.width + member.depth) * member.quantity;
    } else if (member.type === 'slab') {
      // Slab: soffit only (bottom face)
      formwork = member.length * member.width * member.quantity;
    } else {
      // Beams, lintels, ring beams: sides + soffit
      formwork = member.length * 2 * (member.width + member.depth) * member.quantity;
    }
    totalFormworkArea += formwork;

    quantities.push(
      qtyLine(`${member.label}, concrete`, `${member.length} × ${member.width} × ${member.depth} × ${member.quantity}`,
        { length: member.length, width: member.width, depth: member.depth, quantity: member.quantity },
        vol, 'm³', input.wastage.cement)
    );
  }

  // Concrete materials
  const concreteMats = concreteToMaterials(totalConcreteVol, input.concrete_mix_cement, input.concrete_mix_sand, input.concrete_mix_granite);
  materials.push(matLine('Cement (structural)', 'bags', concreteMats.cement_bags, input.wastage.cement, input.prices.cement_per_bag, input.prices.price_source));
  materials.push(matLineTrips('Sand (structural)', concreteMats.sand_m3, input.wastage.sand, input.prices.sand_per_trip, input.prices.sand_per_m3, input.prices.price_source));
  materials.push(matLineTrips('Granite (structural)', concreteMats.granite_m3, input.wastage.granite, input.prices.granite_per_trip, input.prices.granite_per_m3, input.prices.price_source));

  // Reinforcement, split by bar diameter for user-friendly output
  const rebarBreakdown = buildReinforcementBreakdown(input.structural_members, input.wastage.reinforcement, input.prices);
  const rebarTonnes = rebarBreakdown.total_weight_tonnes;

  // Add per-diameter items as material lines
  for (const item of rebarBreakdown.items) {
    materials.push({
      label: item.label,
      unit: 'lengths',
      // Net (pre-wastage) length ÷ 12m standard lengths, wastage is added
      // by the purchase rounding, not baked into the base quantity.
      base_quantity: round(item.base_length_m / 12),
      wastage_percent: input.wastage.reinforcement,
      final_quantity: item.standard_lengths,
      unit_price: item.unit_price,
      total_cost: item.total_cost,
      price_source: input.prices.price_source,
    });
  }

  // Binding wire
  materials.push(matLine('Binding wire', 'kg', rebarBreakdown.binding_wire_kg, 0, input.prices.binding_wire_per_kg, input.prices.price_source));

  // Formwork
  materials.push(matLine('Formwork', 'm²', totalFormworkArea, 10, input.prices.formwork_per_m2, input.prices.price_source));

  // Labour
  labour.push(labLine('Concrete labour (structural)', 'm³', totalConcreteVol, input.labour.concrete_per_m3));
  labour.push(labLine('Reinforcement labour', 'tonnes', rebarTonnes, input.labour.reinforcement_per_tonne));
  labour.push(labLine('Formwork labour', 'm²', totalFormworkArea, input.labour.formwork_per_m2));

  const materialsTotal = materials.reduce((s, m) => s + m.total_cost, 0);
  const labourTotal = labour.reduce((s, l) => s + l.total_cost, 0);

  return {
    stage: 'structural_frame',
    stage_label: 'Structural Frame',
    quantities,
    materials,
    labour,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    stage_total: round(materialsTotal + labourTotal),
    reinforcement_breakdown: rebarBreakdown,
  };
}

// ── Stage E: Roofing ──

function calcRoofing(input: BuildToRoofInput): StageResult {
  const quantities: QuantityLine[] = [];
  const materials: MaterialLine[] = [];
  const labour: LabourLine[] = [];

  const roofArea = calculateRoofArea(
    input.building_length,
    input.building_width,
    input.roof_pitch_degrees,
    input.roof_overhang,
    input.roof_type
  );

  // FIX: roof area quantity shows 0% wastage (wastage is on sheets, not on area)
  quantities.push(
    qtyLine('Roof surface area', '(L + 2×overhang) × (W + 2×overhang) / cos(pitch)',
      { length: input.building_length, width: input.building_width, pitch: input.roof_pitch_degrees, overhang: input.roof_overhang },
      roofArea, 'm²', 0)
  );

  // FIX: sheet coverage varies by roofing material
  const sheetCoverage = getSheetCoverage(input.roofing_material);
  const sheetCount = roofingSheetsCount(roofArea, sheetCoverage);
  quantities.push(
    qtyLine('Roofing sheets', `ceil(Roof area / ${sheetCoverage}m² per sheet), ${input.roofing_material}`,
      { roof_area: roofArea, coverage: sheetCoverage, material: input.roofing_material as unknown as number },
      sheetCount, 'pcs', input.wastage.roofing_sheets)
  );
  // Purchase quantity: wastage is applied to the MEASURED AREA first, then
  // ONE purchase rounding to whole sheets (ceil(count × 1.05) would compound
  // two roundings and over-order).
  const purchaseSheets = Math.ceil(applyWastage(roofArea, input.wastage.roofing_sheets) / sheetCoverage);
  materials.push({
    label: 'Roofing sheets',
    unit: 'pcs',
    base_quantity: round(sheetCount),
    wastage_percent: input.wastage.roofing_sheets,
    final_quantity: purchaseSheets,
    unit_price: input.prices.roofing_sheet_per_piece,
    total_cost: round(purchaseSheets * input.prices.roofing_sheet_per_piece),
    price_source: input.prices.price_source,
  });

  // Ridge caps
  const ridgeLength = calculateRidgeLength(input.building_length, input.building_width, input.roof_type, input.roof_overhang);
  quantities.push(
    qtyLine('Ridge cap length', 'Gable: L + 2×overhang · Hip: |L − W|',
      { roof_type: input.roof_type as unknown as number, length: input.building_length, width: input.building_width, overhang: input.roof_overhang },
      ridgeLength, 'm', 0)
  );
  if (ridgeLength > 0) {
    materials.push(matLine('Ridge caps', 'm', ridgeLength, 5, input.prices.ridge_cap_per_meter, input.prices.price_source));
  }

  // Hip accessories (for hip roofs)
  if (input.roof_type === 'hip') {
    const hipLength = calculateHipLength(input.building_length, input.building_width, input.roof_pitch_degrees, input.roof_overhang);
    quantities.push(
      qtyLine('Hip accessory length', '4 × (min(L,W)/2 + overhang) × √(2 + tan²(pitch))',
        { length: input.building_length, width: input.building_width, pitch: input.roof_pitch_degrees, overhang: input.roof_overhang },
        hipLength, 'm', 0)
    );
    materials.push(matLine('Hip accessories', 'm', hipLength, 5, input.prices.ridge_cap_per_meter, input.prices.price_source));
  }

  // Timber, FIX: passes overhang to estimateTimberMeters
  const timberM = estimateTimberMeters(roofArea, input.building_length, input.building_width, input.roof_pitch_degrees, input.roof_overhang, input.roof_type);
  quantities.push(
    qtyLine('Timber (rafters + purlins)', 'Rafters (spacing 0.9m) + purlins (4 rows/slope)',
      { roof_area: roofArea },
      timberM, 'm', input.wastage.timber)
  );
  materials.push(matLine('Timber', 'm', timberM, input.wastage.timber, input.prices.timber_per_m, input.prices.price_source));

  // Roofing screws (10 per sheet, sized to the purchase quantity)
  const screwCount = purchaseSheets * SCREWS_PER_SHEET;
  materials.push(matLine('Roofing screws', 'pcs', screwCount, 5, input.prices.roofing_screws_per_piece, input.prices.price_source));

  // Fascia
  const fasciaLength = calculateFasciaLength(input.building_length, input.building_width, input.roof_overhang);
  quantities.push(
    qtyLine('Fascia length', '2×(L + 2×overhang) + 2×(W + 2×overhang)',
      { length: input.building_length, width: input.building_width, overhang: input.roof_overhang },
      fasciaLength, 'm', 0)
  );
  materials.push(matLine('Fascia board', 'm', fasciaLength, 5, input.prices.fascia_per_meter, input.prices.price_source));

  // Labour
  labour.push(labLine('Roofing labour', 'm²', roofArea, input.labour.roofing_per_m2));

  const materialsTotal = materials.reduce((s, m) => s + m.total_cost, 0);
  const labourTotal = labour.reduce((s, l) => s + l.total_cost, 0);

  return {
    stage: 'roofing',
    stage_label: 'Roofing',
    quantities,
    materials,
    labour,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    stage_total: round(materialsTotal + labourTotal),
  };
}

// ── Consolidated shopping list ──

function consolidateMaterials(stages: StageResult[]): ConsolidatedMaterial[] {
  const map = new Map<string, ConsolidatedMaterial>();

  for (const stage of stages) {
    for (const mat of stage.materials) {
      const key = mat.label;
      const existing = map.get(key);
      if (existing) {
        existing.total_quantity += mat.final_quantity;
        existing.total_cost += mat.total_cost;
        if (!existing.stages.includes(stage.stage_label)) {
          existing.stages.push(stage.stage_label);
        }
      } else {
        map.set(key, {
          label: mat.label,
          unit: mat.unit,
          total_quantity: round(mat.final_quantity),
          unit_price: mat.unit_price,
          total_cost: round(mat.total_cost),
          stages: [stage.stage_label],
        });
      }
    }
  }

  // Consolidate cement, sand, granite, hardcore into single entries
  const consolidated: ConsolidatedMaterial[] = [];

  const consolidate = (filter: (label: string) => boolean, outLabel: string, unit: string) => {
    const matching = [...map.values()].filter(m => filter(m.label));
    if (matching.length === 0) return;
    const total = matching.reduce((s, m) => s + m.total_quantity, 0);
    const cost = matching.reduce((s, m) => s + m.total_cost, 0);
    const stagesSet = new Set<string>();
    matching.forEach(m => m.stages.forEach(s => stagesSet.add(s)));
    consolidated.push({
      label: outLabel,
      unit,
      total_quantity: round(total),
      unit_price: 0,
      total_cost: round(cost),
      stages: [...stagesSet],
    });
  };

  consolidate(l => l.toLowerCase().includes('cement'), 'Cement', 'bags');
  // Sand & Granite are measured in trips (primary) or m³ (for small quantities)
  // The unit is already set on each material line by matLineTrips
  consolidate(l => l.toLowerCase().includes('sand'), 'Sharp Sand', 'trips');
  consolidate(l => l.toLowerCase().includes('granite'), 'Granite', 'trips');
  consolidate(l => l.toLowerCase().includes('hardcore'), 'Hardcore Stone', 'trips');

  // Add non-consolidated items
  for (const [key, val] of map) {
    const lower = key.toLowerCase();
    if (!lower.includes('cement') &&
        !lower.includes('sand') &&
        !lower.includes('granite') &&
        !lower.includes('hardcore')) {
      consolidated.push(val);
    }
  }

  return consolidated;
}

// ── Confidence assessment ──

function assessConfidence(input: BuildToRoofInput): { level: ConfidenceLevel; reason: string } {
  const hasDrawing = !!input.drawing_analysis?.confirmed.building_length;
  const hasStructural = input.has_engineer_schedule && input.structural_members.length > 0;
  const hasDimensions = input.building_length > 0 && input.building_width > 0;

  if (hasDrawing && hasStructural) {
    return {
      level: 'high',
      reason: 'Dimensioned drawings and engineer-supplied structural schedule provided. Quantities derived from confirmed dimensions and verified structural inputs.',
    };
  }

  if (hasDimensions && (input.internal_wall_length > 0 || hasDrawing)) {
    if (!hasStructural) {
      return {
        level: 'moderate',
        reason: 'Architectural dimensions available but structural engineering schedule missing. Structural concrete quantities are preliminary, not a structural design.',
      };
    }
    return {
      level: 'moderate',
      reason: 'Some construction information is missing. Quantities for missing items are based on standard assumptions.',
    };
  }

  return {
    level: 'preliminary',
    reason: 'Only basic building dimensions provided. Estimate is preliminary and should not be used for procurement without detailed drawings and structural schedules.',
  };
}

// ── Unit conversion ──

/** Fields expressed in the user's measurement unit (ft or m) that must be
 *  converted when the unit changes or when the engine needs metric values.
 *  Everything NOT listed here is unit-independent (block sizes are inches,
 *  pitch is degrees, counts are integers). */
const UNIT_SCALAR_FIELDS: (keyof BuildToRoofInput)[] = [
  'building_length', 'building_width', 'floor_to_floor_height', 'wall_thickness',
  'internal_wall_length', 'internal_wall_thickness', 'foundation_depth',
  'foundation_width', 'footing_thickness', 'blinding_thickness',
  'hardcore_thickness', 'dpc_length', 'roof_overhang',
];

/**
 * Convert a Build-to-Roof input between metric and imperial, applying the
 * given factor to every unit-dependent field (m→ft: /0.3048, ft→m: ×0.3048).
 * Openings and structural members are converted too. Used by the engine
 * (ft→m before calculation) and by the UI unit toggle (both directions).
 */
export function convertBuildToRoofUnits(
  input: BuildToRoofInput,
  factor: number
): BuildToRoofInput {
  const converted: BuildToRoofInput = { ...input };
  const target = converted as unknown as Record<string, number>;
  for (const key of UNIT_SCALAR_FIELDS) {
    target[key as string] = (input[key] as number) * factor;
  }
  converted.openings = input.openings.map(o => ({
    ...o,
    width: o.width * factor,
    height: o.height * factor,
  }));
  converted.structural_members = input.structural_members.map(m => ({
    ...m,
    length: m.length * factor,
    width: m.width * factor,
    depth: m.depth * factor,
  }));
  return converted;
}

// ── Input validation ──

/**
 * Validate a Build-to-Roof input (in the user's own unit system).
 * Returns a list of human-readable problems, empty means the input is
 * safe to calculate. Ranges mirror the server-validated AI-extraction
 * clamps so manual input and AI input obey identical limits.
 */
export function validateBuildToRoofInput(rawInput: BuildToRoofInput): string[] {
  const input = rawInput.measurement_unit === 'ft'
    ? convertBuildToRoofUnits(rawInput, M_PER_FT)
    : rawInput;
  const errors: string[] = [];
  const num = (label: string, v: number, min: number, max: number, integer = false): void => {
    if (!Number.isFinite(v)) { errors.push(`${label} must be a number (got ${v})`); return; }
    if (integer && !Number.isInteger(v)) { errors.push(`${label} must be a whole number (got ${v})`); return; }
    if (v < min || v > max) errors.push(`${label} must be between ${min} and ${max} (got ${round(v, 3)})`);
  };
  const nonNeg = (label: string, v: number): void => {
    if (!Number.isFinite(v) || v < 0) errors.push(`${label} cannot be negative (got ${v})`);
  };

  num('Building length', input.building_length, 1, 300);
  num('Building width', input.building_width, 1, 300);
  num('Number of floors', input.number_of_floors, 1, 100, true);
  num('Wall height per floor', input.floor_to_floor_height, 2, 8);
  num('Wall thickness', input.wall_thickness, 0.05, 0.6);
  nonNeg('Internal wall length', input.internal_wall_length);
  if (input.internal_wall_length > 0) num('Internal wall thickness', input.internal_wall_thickness, 0.05, 0.6);
  nonNeg('Foundation depth', input.foundation_depth);
  nonNeg('Foundation width', input.foundation_width);
  nonNeg('Footing thickness', input.footing_thickness);
  nonNeg('Blinding thickness', input.blinding_thickness);
  nonNeg('Hardcore thickness', input.hardcore_thickness);
  nonNeg('DPC length', input.dpc_length);
  nonNeg('Overhang', input.roof_overhang);
  if (input.roof_type !== 'flat') num('Roof pitch', input.roof_pitch_degrees, 0, 60);
  if (input.contingency_percent < 0 || input.contingency_percent > 100)
    errors.push(`Contingency must be between 0 and 100% (got ${input.contingency_percent})`);

  for (const w of ['blocks', 'cement', 'sand', 'granite', 'reinforcement', 'timber', 'roofing_sheets', 'hardcore'] as const) {
    const v = input.wastage[w];
    if (!Number.isFinite(v) || v < 0 || v > 100)
      errors.push(`Wastage (${w}) must be between 0 and 100% (got ${v})`);
  }
  for (const [k, v] of Object.entries(input.prices)) {
    if (k === 'price_date' || k === 'price_source') continue;
    if (!Number.isFinite(v) || v < 0) errors.push(`Price (${k}) cannot be negative (got ${v})`);
  }

  for (const o of input.openings) {
    if (o.count < 0 || !Number.isInteger(o.count)) errors.push(`Opening "${o.label ?? o.type}" count must be a whole number ≥ 0`);
    if (o.count > 0) {
      num(`Opening "${o.label ?? o.type}" width`, o.width, 0.1, 20);
      num(`Opening "${o.label ?? o.type}" height`, o.height, 0.1, 20);
    }
  }
  for (const m of input.structural_members) {
    nonNeg(`Structural member "${m.label}" length`, m.length);
    nonNeg(`"${m.label}" width`, m.width);
    nonNeg(`"${m.label}" depth`, m.depth);
    if (!Number.isInteger(m.quantity) || m.quantity < 1) errors.push(`Structural member "${m.label}" quantity must be a whole number ≥ 1`);
  }
  return errors;
}

// ── Main calculation ──

export function calculateBuildToRoof(input: BuildToRoofInput): BuildToRoofResult {
  // Convert ft inputs to meters if measurement_unit is ft
  const input_m: BuildToRoofInput = input.measurement_unit === 'ft'
    ? convertBuildToRoofUnits(input, M_PER_FT)
    : input;

  // Invalid input must never produce an apparently-valid construction
  // estimate, reject explicitly.
  const validationErrors = validateBuildToRoofInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Build-to-Roof input is invalid: ${validationErrors.join('; ')}`);
  }

  const stages: StageResult[] = [];

  stages.push(calcSiteAndFoundation(input_m));
  stages.push(calcGroundFloor(input_m));
  stages.push(calcWalls(input_m));
  stages.push(calcStructuralFrame(input_m));
  stages.push(calcRoofing(input_m));

  const shoppingList = consolidateMaterials(stages);

  const materialsTotal = stages.reduce((s, stage) => s + stage.materials_total, 0);
  
  // Task-based labour total from stages
  const taskLabourTotal = stages.reduce((s, stage) => s + stage.labour_total, 0);
  
  // Role-based labour total (daily/contract rates)
  const roleLabourTotal =
    (input.labour.bricklayer_per_day * input.labour.bricklayer_days) +
    (input.labour.foreman_per_day * input.labour.foreman_days) +
    (input.labour.supervisor_per_day * input.labour.supervisor_days) +
    (input.labour.carpenter_per_day * input.labour.carpenter_days) +
    (input.labour.concrete_labourer_per_day * input.labour.concrete_labourer_days) +
    (input.labour.contractor_fee_type === 'contract'
      ? input.labour.contractor_fee
      : input.labour.contractor_fee * input.labour.contractor_days);
  
  const labourTotal = taskLabourTotal + roleLabourTotal;

  // Wastage allowance = difference between final quantities and base quantities
  const wastageAllowance = stages.reduce((sum, stage) => {
    return sum + stage.materials.reduce((s, m) => {
      const base = m.base_quantity * m.unit_price;
      return s + Math.max(0, m.total_cost - base);
    }, 0);
  }, 0);

  const contingency = (materialsTotal + labourTotal) * (input.contingency_percent / 100);
  const grandTotal = materialsTotal + labourTotal + contingency;

  const confidence = assessConfidence(input);

  // Assumptions & limitations
  const assumptions: string[] = [
    `Concrete mix ratio: ${input.concrete_mix_cement}:${input.concrete_mix_sand}:${input.concrete_mix_granite} (cement:sand:granite)`,
    `Mortar mix ratio: ${input.mortar_mix_cement}:${input.mortar_mix_sand} (cement:sand)`,
    `Block size: ${input.block_length}" × ${input.block_height}" × ${input.block_width}" (inches)`,
    `Foundation type: ${input.foundation_type}`,
    `Footing thickness: ${input.footing_thickness}m`,
    `Roof type: ${input.roof_type} at ${input.roof_pitch_degrees}° pitch with ${input.roofing_material.replace(/_/g, ' ')} sheets`,
    `Wall height: ${input.floor_to_floor_height}m per floor, ${input.number_of_floors} floor(s)`,
    `Blinding thickness: ${input.blinding_thickness}m`,
    `Hardcore thickness: ${input.hardcore_thickness}m`,
    `Foundation blockwork: ${FOUNDATION_COURSES} courses (including mortar joints)`,
    `Dry/wet concrete ratio: ${DRY_WET_RATIO}`,
    `Dry/wet mortar ratio: ${MORTAR_DRY_WET_RATIO}`,
    `Prices as of: ${input.prices.price_date} (${input.prices.price_source})`,
  ];

  const limitations: string[] = [
    'This estimate stops at the Build-to-Roof stage. It does NOT include plastering, painting, screeding, tiling, POP/ceiling finishing, doors, windows, plumbing, electrical, or other finishing works.',
    'Doors and windows are used only as wall opening deductions. Their purchase and installation costs are NOT included.',
    'Structural member sizes (columns, beams, slabs, reinforcement) must be verified by a qualified structural engineer. This tool does NOT design or certify structural adequacy.',
    'Roofing sheet count is based on standard sheet dimensions for the selected material type. Actual sheet sizes may vary by manufacturer.',
    'Mortar volume is estimated at 0.03 m³ per m² of wall, this is a standard industry approximation for 9-inch (225mm) blockwork.',
    'Sand filling thickness under ground floor slab defaults to 50mm, configurable in advanced settings.',
    'Material prices fluctuate frequently. Always verify current prices before procurement. Prices older than 30 days are flagged as stale.',
  ];

  const missingInfo: string[] = [];
  if (!input.has_engineer_schedule) {
    missingInfo.push('Engineer-supplied structural schedule, structural concrete quantities are preliminary estimates based on architectural dimensions only.');
  }
  if (input.internal_wall_length <= 0) {
    missingInfo.push('Internal wall layout, internal partition walls not specified. Wall quantities may be understated.');
  }
  if (!input.drawing_analysis) {
    missingInfo.push('Architectural drawing, no drawing uploaded. Dimensions are user-entered and should be verified against actual plans.');
  }
  if (input.openings.length === 0) {
    missingInfo.push('Door/window openings not specified, wall quantities include the full gross area with no deductions.');
  }

  return {
    project_name: input.project_name || 'Untitled Project',
    location: input.location || 'Not specified',
    building_type: input.building_type,
    number_of_floors: input.number_of_floors,
    // Use the METRIC input, in ft mode the raw values are feet and must not
    // be reported as m².
    total_floor_area: round(input_m.building_length * input_m.building_width * input_m.number_of_floors),
    construction_stage: 'SITE → FOUNDATION → GROUND FLOOR → WALLS → STRUCTURAL FRAME → ROOF → READY FOR FINISHING',
    confidence: confidence.level,
    confidence_reason: confidence.reason,
    stages,
    shopping_list: shoppingList,
    reinforcement_breakdown: stages.find(s => s.reinforcement_breakdown)?.reinforcement_breakdown,
    materials_total: round(materialsTotal),
    labour_total: round(labourTotal),
    wastage_allowance: round(wastageAllowance),
    contingency: round(contingency),
    grand_total: round(grandTotal),
    assumptions,
    limitations,
    missing_info: missingInfo,
    price_date: input.prices.price_date,
    price_source: input.prices.price_source,
    price_age_days: Math.floor((Date.now() - new Date(input.prices.price_date).getTime()) / (1000 * 60 * 60 * 24)),
    price_stale: Math.floor((Date.now() - new Date(input.prices.price_date).getTime()) / (1000 * 60 * 60 * 24)) > 30,
  };
}

// ── Default price/labour/wastage configs (Nigerian market defaults) ──

export const DEFAULT_PRICES = {
  cement_per_bag: 10000,       // Dangote/BUA 50kg, updated Aug 2026
  block_per_piece: 450,        // 9-inch hollow block, updated
  sand_per_m3: 55000,           // sharp sand per m³ (reference only)
  sand_per_trip: 192500,        // per trip (3.5 m³, 5-tonne tipper), PRIMARY
  granite_per_m3: 110000,       // 3/4" granite per m³ (reference only)
  granite_per_trip: 385000,     // per trip (3.5 m³), PRIMARY
  hardcore_per_m3: 40000,       // hardcore stone/laterite, updated
  reinforcement_per_tonne: 1350000, // bulk steel per tonne (fallback)
  // Per-diameter rebar prices (₦ per 12m standard length)
  rebar_12mm_per_length: 9500,   // 12mm × 12m, common for columns/slabs
  rebar_16mm_per_length: 16500,  // 16mm × 12m, common for columns/beams
  rebar_20mm_per_length: 25500,  // 20mm × 12m, heavy columns/beams
  rebar_25mm_per_length: 38000,  // 25mm × 12m, major beams/columns
  binding_wire_per_kg: 3000,    // annealed binding wire, updated
  timber_per_m: 3500,           // 2×4 timber per linear meter, updated
  roofing_sheet_per_piece: 12000, // long-span aluminium 0.5mm, updated
  ridge_cap_per_meter: 4500,    // aluminium ridge cap, updated
  roofing_screws_per_piece: 200, // roofing screws with washers, updated
  fascia_per_meter: 3000,       // fascia board, updated
  dpc_per_meter: 1000,          // DPC roll, updated
  dpm_per_m2: 1500,             // DPM membrane, updated
  formwork_per_m2: 5500,         // plywood formwork, updated
  price_date: new Date().toISOString().split('T')[0],
  price_source: 'FRELUX reference prices, Nigerian market (edit in Step 8; verify before ordering)',
};

export const DEFAULT_LABOUR: LabourConfig = {
  excavation_per_m3: 4000,        // manual excavation, updated
  blockwork_per_block: 200,       // per block laid, updated
  concrete_per_m3: 30000,         // per m³ cast, updated
  reinforcement_per_tonne: 180000, // per tonne fixed, updated
  formwork_per_m2: 6000,           // per m² erected/removed, updated
  roofing_per_m2: 6000,            // per m² roof area, updated
  blinding_per_m3: 10000,          // per m³, updated
  hardcore_per_m3: 7000,           // per m³, updated
  sand_filling_per_m3: 6000,       // per m³, updated
  compaction_per_m3: 3500,         // per m³, updated
  backfilling_per_m3: 3000,        // per m³, updated
  general_labour_per_day: 12000,    // per day, updated
  general_labour_days: 5,
  // Nigerian construction role-based daily rates
  bricklayer_per_day: 10000,       // per day, updated
  bricklayer_days: 20,
  contractor_fee: 600000,          // lump sum, updated
  contractor_fee_type: 'contract',
  contractor_days: 30,
  supervisor_per_day: 12000,       // per day, updated
  supervisor_days: 30,
  foreman_per_day: 8000,            // per day, updated
  foreman_days: 25,
  carpenter_per_day: 10000,         // per day, updated
  carpenter_days: 15,
  concrete_labourer_per_day: 7000,  // per day, updated
  concrete_labourer_days: 15,
};

export const DEFAULT_WASTAGE: WastageConfig = {
  blocks: 5,
  cement: 5,
  sand: 10,
  granite: 10,
  reinforcement: 3,
  timber: 10,
  roofing_sheets: 5,
  hardcore: 5,
};

export const CALCULATOR_TYPE = 'build_to_roof';
