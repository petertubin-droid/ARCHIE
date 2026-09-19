/**
 * FRELUX CENTRAL PAINT CALCULATION ENGINE
 *
 * This is the SINGLE source of truth for normal paint calculations (Emulsion, Matt, Satin).
 * Tyrolene and Grafitex remain separate engines.
 *
 * Both /paint-calculator and /painting-estimator use this engine.
 *
 * Key principles:
 * - Room-based: customer enters room dimensions, NOT m²
 * - Coverage is product-specific AND quality-specific (never global)
 * - Coverage units are configurable (m²/L, m²/bucket, ft²/L, ft²/bucket, FRELUX calibration)
 * - Ceiling uses separate configurable coverage (NOT same as wall)
 * - Theoretical quantity preserved (never rounded prematurely)
 * - Practical purchase quantity calculated separately (rounds up to buckets)
 * - Labour is NEVER calculated
 * - All values come from admin configuration (nothing hardcoded)
 * - Price snapshots preserve historical estimate data
 */

import type {
  EstimationProduct,
  EstimationProductQuality,
  EstimationPrice,
  EstimationCalcRule,
  EstimationColourCondition,
  EstimationSurfaceCondition,
  CoverageUnit,
  OpeningInput,
} from "@/types/estimation";
import { feetToMeters } from "@/lib/utils";

// =========================================================
// Types
// =========================================================

export interface PaintEngineRoomInput {
  room_id: string;
  room_name: string;
  length: number;
  width: number;
  height: number;
  unit: "feet" | "meters";
  doors: OpeningInput[];
  windows: OpeningInput[];
  doors_unknown: boolean;
  windows_unknown: boolean;
  product_id: string;
  quality_id: string;
  coats: number;
  include_ceiling: boolean;
  ceiling_colour: string;
  surface_condition_key: string;
  colour_condition_key: string;
  include_primer: boolean;
  primer_product_id?: string | null;
}

export interface PaintEngineConfig {
  product: EstimationProduct | null;
  quality: EstimationProductQuality | null;
  price: EstimationPrice | null;
  primer_price?: EstimationPrice | null;
  ceilingRule: EstimationCalcRule | null;
  ceilingCoverageRule: EstimationCalcRule | null;
  packSizeRule: EstimationCalcRule | null;
  roundingRule: EstimationCalcRule | null;
  standardHeightRule: EstimationCalcRule | null;
  heightAdjustmentRule: EstimationCalcRule | null;
  openingDeductionRule: EstimationCalcRule | null;
  coatCountRule: EstimationCalcRule | null;
  calibrationReferencesRule: EstimationCalcRule | null;
  colourConditions: EstimationColourCondition[];
  primer_coverage_multiplier?: number; // 1.3 = primer covers 30% more area per litre than paint
  surfaceConditions: EstimationSurfaceCondition[];
  calcVersionId: string | null;
}

export interface PaintEngineCalcStep {
  label: string;
  value: string;
  detail?: string;
}

export interface PaintEngineRoomResult {
  room_id: string;
  room_name: string;
  // Internal geometry
  length_m: number;
  width_m: number;
  height_m: number;
  gross_wall_area_m2: number;
  door_area_m2: number;
  window_area_m2: number;
  opening_deduction_m2: number;
  net_wall_area_m2: number;
  ceiling_area_m2: number;
  // Product info
  product: EstimationProduct | null;
  quality: EstimationProductQuality | null;
  coverage_rate: number | null; // normalized to m²/L per coat
  coverage_unit: string;
  ceiling_coverage_rate: number | null; // separate ceiling coverage
  pack_size_litres: number;
  // Coats
  coats: number;
  effective_coats: number; // after colour condition min_coats_override
  // Theoretical
  theoretical_wall_litres: number;
  theoretical_ceiling_litres: number;
  theoretical_total_litres: number;
  theoretical_wall_buckets: number;
  theoretical_ceiling_buckets: number;
  theoretical_total_buckets: number;
  // Practical
  practical_wall_buckets: number;
  practical_ceiling_buckets: number;
  practical_total_buckets: number;
  practical_total_litres: number;
  leftover_litres: number;
  // Pricing
  unit_price: number;
  material_cost: number;
  price_configured: boolean;
  // Primer
  primer_recommended: boolean;
  primer_included: boolean;
  primer_litres: number;
  primer_buckets: number;
  primer_cost: number;
  // Surface condition
  surface_condition: EstimationSurfaceCondition | null;
  surface_factor: number;
  // Colour condition
  colour_condition: EstimationColourCondition | null;
  // Height
  height_warning: string | null;
  // Customer summary
  customer_summary: PaintEngineCustomerSummary;
  // Validation
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
  // Steps
  calculation_steps: PaintEngineCalcStep[];
  // Versioning
  calc_version_id: string | null;
  price_snapshot: PriceSnapshotData | null;
}

export interface PaintEngineCustomerSummary {
  room_name: string;
  room_size: string;
  wall_height: string;
  paint: string;
  quality: string;
  coats: string;
  ceiling: string;
  doors: string;
  windows: string;
  theoretical_buckets: string;
  practical_purchase: string;
  material_cost: number | null; // numeric cost; null = not configured
  material_cost_formatted: string; // display-ready, currency included
  height_notice: string | null;
  labour_note: string;
}

export interface PriceSnapshotData {
  product_name: string;
  quality_name: string | null;
  pack_size_litres: number;
  coverage_rate: number | null;
  coverage_unit: string;
  unit_price: number;
  price_id: string | null;
  currency: string;
  effective_date: string | null;
  calc_version_id: string | null;
}

export interface PaintEngineProjectResult {
  rooms: PaintEngineRoomResult[];
  combined_theoretical_litres: number;
  combined_theoretical_buckets: number;
  combined_practical_buckets: number;
  combined_practical_litres: number;
  combined_leftover_litres: number;
  total_material_cost: number;
  total_primer_cost: number;
  grand_total: number;
  currency: string;
  warnings: string[];
  recommendations: string[];
  errors: string[];
  valid: boolean;
  calc_version_id: string | null;
  labour_note: string;
}

// =========================================================
// Coverage Unit Normalization
// =========================================================

const SQM_PER_SQFT = 0.09290304;

/**
 * Normalizes a coverage value from any unit to m² per liter per coat.
 * This is the internal standard the engine uses for all calculations.
 *
 * Supported units:
 * - m2_per_liter: value is m²/L → use directly
 * - m2_per_bucket: value is m² per 20L bucket → divide by bucket size
 * - ft2_per_liter: value is ft²/L → multiply by SQM_PER_SQFT
 * - ft2_per_bucket: value is ft² per bucket → multiply by SQM_PER_SQFT then divide by bucket size
 * - frelux_calibration: uses calibration reference points
 */
export function normalizeCoverage(
  coverageValue: number,
  coverageUnit: string,
  packSizeLitres: number,
): number {
  if (coverageValue <= 0) return 0;
  const bucket = packSizeLitres > 0 ? packSizeLitres : 20;

  switch (coverageUnit) {
    case "m2_per_liter":
      return coverageValue;
    case "m2_per_bucket":
      return coverageValue / bucket;
    case "ft2_per_liter":
      return coverageValue * SQM_PER_SQFT;
    case "ft2_per_bucket":
      return (coverageValue * SQM_PER_SQFT) / bucket;
    case "frelux_calibration":
      // Calibration mode, the coverage value IS the calibration reference
      // The engine uses calibration logic separately
      return coverageValue; // Will be handled by calibration logic
    default:
      return coverageValue; // Default: assume m²/L
  }
}

/**
 * Gets coverage display label for admin UI
 */
export function getCoverageUnitLabel(unit: string): string {
  switch (unit) {
    case "m2_per_liter":
      return "m² per litre";
    case "m2_per_bucket":
      return "m² per 20-L bucket";
    case "ft2_per_liter":
      return "ft² per litre";
    case "ft2_per_bucket":
      return "ft² per 20-L bucket";
    case "frelux_calibration":
      return "FRELUX Calibration";
    default:
      return unit;
  }
}

export const COVERAGE_UNIT_OPTIONS: { value: CoverageUnit; label: string }[] = [
  { value: "m2_per_liter", label: "m² per litre" },
  { value: "m2_per_bucket", label: "m² per 20-L bucket" },
  { value: "ft2_per_liter", label: "ft² per litre" },
  { value: "ft2_per_bucket", label: "ft² per 20-L bucket" },
  { value: "frelux_calibration", label: "FRELUX Calibration" },
];

// =========================================================
// Geometry (internal, not customer-facing)
// =========================================================

function toMeters(value: number, unit: "feet" | "meters"): number {
  return unit === "feet" ? feetToMeters(value) : value;
}

function calculateWallArea(
  lengthM: number,
  widthM: number,
  heightM: number,
): number {
  const safeL = Math.max(0, lengthM);
  const safeW = Math.max(0, widthM);
  const safeH = Math.max(0, heightM);
  if (safeL === 0 || safeH === 0) return 0;
  if (safeW === 0) return 2 * safeL * safeH;
  return Math.round(2 * (safeL + safeW) * safeH * 100) / 100;
}

function calculateCeilingArea(lengthM: number, widthM: number): number {
  return Math.round(Math.max(0, lengthM) * Math.max(0, widthM) * 100) / 100;
}

function calculateOpeningArea(
  openings: OpeningInput[],
  unit: "feet" | "meters",
): number {
  if (!openings || openings.length === 0) return 0;
  let total = 0;
  for (const o of openings) {
    const w = toMeters(o.width, unit);
    const h = toMeters(o.height, unit);
    total += Math.max(0, w) * Math.max(0, h) * Math.max(0, o.quantity);
  }
  return Math.round(total * 100) / 100;
}

// =========================================================
// Rule Helpers
// =========================================================

export function getPackSizeLitres(
  product: EstimationProduct | null,
  packSizeRule: EstimationCalcRule | null,
): number {
  if (product?.standard_pack_size && product.standard_pack_size > 0)
    return product.standard_pack_size;
  if (packSizeRule?.rule_value) {
    const litres = (packSizeRule.rule_value as Record<string, unknown>).litres;
    if (typeof litres === "number" && litres > 0) return litres;
  }
  return 20;
}

export function getRoundingRule(
  roundingRule: EstimationCalcRule | null,
): string {
  if (roundingRule?.rule_value) {
    const rule = (roundingRule.rule_value as Record<string, unknown>).rule;
    if (typeof rule === "string") return rule;
  }
  return "ceil";
}

export function getStandardHeight(
  standardHeightRule: EstimationCalcRule | null,
): { ft: number; m: number } {
  if (standardHeightRule?.rule_value) {
    const rv = standardHeightRule.rule_value as Record<string, unknown>;
    const valueM = rv.value_m as number | undefined;
    const valueFt = rv.value_ft as number | undefined;
    if (
      typeof valueM === "number" &&
      valueM > 0 &&
      typeof valueFt === "number" &&
      valueFt > 0
    ) {
      return { ft: valueFt, m: valueM };
    }
    if (typeof valueM === "number" && valueM > 0)
      return { ft: valueM / 0.3048, m: valueM };
    if (typeof valueFt === "number" && valueFt > 0)
      return { ft: valueFt, m: feetToMeters(valueFt) };
  }
  return { ft: 8, m: 2.4384 };
}

export function getStandardCoatCount(
  coatCountRule: EstimationCalcRule | null,
): number {
  if (coatCountRule?.rule_value) {
    const count = (coatCountRule.rule_value as Record<string, unknown>).count;
    if (typeof count === "number" && count > 0) return count;
  }
  return 2;
}

export function getOpeningDeductionPct(
  rule: EstimationCalcRule | null,
): number {
  if (!rule?.rule_value) return 100;
  const pct = (rule.rule_value as Record<string, unknown>).deduction_percentage;
  if (typeof pct === "number" && pct >= 0 && pct <= 100) return pct;
  return 100;
}

export function getCeilingQuantityBuckets(
  ceilingRule: EstimationCalcRule | null,
): number {
  if (!ceilingRule || !ceilingRule.rule_value) return 0.5;
  const buckets = (ceilingRule.rule_value as Record<string, unknown>).buckets;
  if (typeof buckets === "number" && buckets >= 0) return buckets;
  return 0.5;
}

export function getCeilingCoverageRate(
  ceilingCoverageRule: EstimationCalcRule | null,
): { enabled: boolean; m2PerLiter: number | null } {
  if (!ceilingCoverageRule?.rule_value)
    return { enabled: false, m2PerLiter: null };
  const rv = ceilingCoverageRule.rule_value as Record<string, unknown>;
  const enabled = rv.enabled !== false;
  const rate = typeof rv.m2_per_liter === "number" ? rv.m2_per_liter : null;
  return { enabled, m2PerLiter: rate };
}

// =========================================================
// Practical Purchase Rounding
// =========================================================

function roundUpToBuckets(
  litres: number,
  packSizeLitres: number,
  roundingRule: string,
): number {
  if (packSizeLitres <= 0) return 0;
  const buckets = litres / packSizeLitres;
  switch (roundingRule) {
    case "ceil":
      return Math.ceil(buckets);
    case "round":
      return Math.round(buckets);
    case "floor":
      return Math.max(0, Math.floor(buckets));
    default:
      return Math.ceil(buckets);
  }
}

// =========================================================
// Price Helpers
// =========================================================

export function isPriceConfigured(price: number): boolean {
  return typeof price === "number" && price > 0;
}

function buildPriceSnapshot(
  product: EstimationProduct | null,
  quality: EstimationProductQuality | null,
  price: EstimationPrice | null,
  packSizeLitres: number,
  coverageRate: number | null,
  coverageUnit: string,
  calcVersionId: string | null,
): PriceSnapshotData | null {
  if (!price) return null;
  return {
    product_name: product?.name ?? "Unknown",
    quality_name: quality?.name ?? null,
    pack_size_litres: packSizeLitres,
    coverage_rate: coverageRate,
    coverage_unit: coverageUnit,
    unit_price: price.price,
    price_id: price.id,
    currency: price.currency,
    effective_date: price.effective_date,
    calc_version_id: calcVersionId,
  };
}

// =========================================================
// FRELUX Calibration
// =========================================================

interface CalibrationReference {
  room_ft: string; // "10x12"
  height_ft: number;
  coats: number;
  buckets: number;
  quality_id?: string;
}

export function getCalibrationReferences(
  calibrationRule: EstimationCalcRule | null,
): CalibrationReference[] {
  if (!calibrationRule?.rule_value) return [];
  const refs = (calibrationRule.rule_value as Record<string, unknown>)
    .references;
  if (!Array.isArray(refs)) return [];
  return refs as CalibrationReference[];
}

/**
 * Attempts to find a calibration match for the given room dimensions.
 * Returns the calibrated bucket count or null if no match found.
 */
function findCalibrationMatch(
  lengthFt: number,
  widthFt: number,
  heightFt: number,
  coats: number,
  qualityId: string,
  references: CalibrationReference[],
): number | null {
  // Try exact match first
  for (const ref of references) {
    const [refL, refW] = ref.room_ft.split("x").map(Number);
    if (
      refL === lengthFt &&
      refW === widthFt &&
      ref.height_ft === heightFt &&
      ref.coats === coats
    ) {
      if (!ref.quality_id || ref.quality_id === qualityId) return ref.buckets;
    }
    // Also try reversed dimensions (12x10 == 10x12)
    if (
      refW === lengthFt &&
      refL === widthFt &&
      ref.height_ft === heightFt &&
      ref.coats === coats
    ) {
      if (!ref.quality_id || ref.quality_id === qualityId) return ref.buckets;
    }
  }
  return null;
}

// =========================================================
// Single Room Calculation
// =========================================================

export function calculateRoom(
  room: PaintEngineRoomInput,
  config: PaintEngineConfig,
): PaintEngineRoomResult {
  const steps: PaintEngineCalcStep[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const errors: string[] = [];

  // ── Convert to meters internally ──
  const lengthM = toMeters(room.length, room.unit);
  const widthM = toMeters(room.width, room.unit);
  const heightM = toMeters(room.height, room.unit);

  // ── STEP 1: Room Dimensions ──
  steps.push({
    label: "Room Dimensions",
    value: `${room.length} × ${room.width} × ${room.height} ${room.unit}`,
    detail: `Converted to ${lengthM.toFixed(2)} × ${widthM.toFixed(2)} × ${heightM.toFixed(2)} m`,
  });

  // ── STEP 2: Wall Geometry ──
  const grossWallArea = calculateWallArea(lengthM, widthM, heightM);
  steps.push({
    label: "Gross Wall Area",
    value: `${grossWallArea.toFixed(2)} m²`,
    detail: `2 × (${lengthM.toFixed(2)} + ${widthM.toFixed(2)}) × ${heightM.toFixed(2)} = perimeter × height`,
  });

  // ── STEP 3: Door/Window Deduction ──
  let doorArea = 0;
  let windowArea = 0;

  if (!room.doors_unknown) {
    doorArea = calculateOpeningArea(room.doors, room.unit);
  }
  if (!room.windows_unknown) {
    windowArea = calculateOpeningArea(room.windows, room.unit);
  }

  const totalOpeningArea = doorArea + windowArea;
  const deductionPct = getOpeningDeductionPct(config.openingDeductionRule);
  const openingDeduction =
    Math.round(((totalOpeningArea * deductionPct) / 100) * 100) / 100;
  const netWallArea = Math.max(0, grossWallArea - openingDeduction);

  if (totalOpeningArea > 0) {
    steps.push({
      label: "Opening Deduction",
      value: `−${openingDeduction.toFixed(2)} m² (${deductionPct}% of ${totalOpeningArea.toFixed(2)} m²)`,
    });
  }
  steps.push({
    label: "Net Wall Area",
    value: `${netWallArea.toFixed(2)} m²`,
    detail: `${grossWallArea.toFixed(2)} − ${openingDeduction.toFixed(2)}`,
  });

  // ── STEP 4: Ceiling ──
  let ceilingArea = 0;
  if (room.include_ceiling) {
    ceilingArea = calculateCeilingArea(lengthM, widthM);
    steps.push({
      label: "Ceiling Area",
      value: `${ceilingArea.toFixed(2)} m²`,
      detail: `${lengthM.toFixed(2)} × ${widthM.toFixed(2)}, calculated separately from walls`,
    });
  } else {
    steps.push({ label: "Ceiling", value: "Not included" });
  }

  // ── STEP 5: Height Rule ──
  const standardHeight = getStandardHeight(config.standardHeightRule);
  const heightFt = room.unit === "feet" ? room.height : room.height * 3.28084;
  let heightWarning: string | null = null;

  if (heightFt > standardHeight.ft) {
    heightWarning = `Wall height (${heightFt.toFixed(1)} ft) exceeds the FRELUX standard (${standardHeight.ft} ft). Professional assessment recommended.`;
    warnings.push(heightWarning);
  }
  steps.push({
    label: "Height Rule",
    value: `${room.height} ${room.unit}`,
    detail:
      heightWarning ?? `Within FRELUX standard (7–${standardHeight.ft} ft).`,
  });

  // ── STEP 6: Surface Condition ──
  const surfaceCondition =
    config.surfaceConditions.find(
      (s) => s.condition_key === room.surface_condition_key,
    ) ?? null;
  const surfaceFactor = surfaceCondition?.coverage_adjustment_factor ?? 1.0;
  let primerRecommended = false;

  if (surfaceCondition) {
    steps.push({
      label: "Surface Condition",
      value: surfaceCondition.name,
      detail:
        surfaceFactor !== 1.0
          ? `Coverage adjustment: ×${surfaceFactor} (${Math.round((1 - surfaceFactor) * 100)}% more paint needed)`
          : "No coverage adjustment.",
    });
    if (surfaceCondition.primer_recommended) {
      primerRecommended = true;
      recommendations.push(
        `${surfaceCondition.name}: Primer/sealer recommended.`,
      );
    }
  }

  // ── STEP 7: Colour Condition ──
  const colourCondition =
    config.colourConditions.find(
      (c) => c.condition_key === room.colour_condition_key,
    ) ?? null;
  const minCoatsOverride = colourCondition?.min_coats_override ?? null;

  if (colourCondition?.requires_warning) {
    const w =
      "Strong colour transition detected. Additional preparation or paint may be required.";
    warnings.push(w);
    steps.push({
      label: "Colour Condition",
      value: colourCondition.name,
      detail: w,
    });
  } else if (colourCondition) {
    steps.push({ label: "Colour Condition", value: colourCondition.name });
  }

  // ── STEP 8: Product & Quality ──
  steps.push({
    label: "Paint Type",
    value: config.product?.name ?? "N/A",
    detail: config.product ? `Category: ${config.product.category}` : undefined,
  });

  const coverage = config.quality?.coverage ?? null;
  const coverageUnit = config.quality?.coverage_unit ?? "m2_per_liter";
  const packSizeLitres = getPackSizeLitres(config.product, config.packSizeRule);

  steps.push({
    label: "Bucket Size",
    value: `${packSizeLitres} L per bucket`,
    detail: "FRELUX standard: 20-L buckets.",
  });

  if (coverage === null || coverage === undefined) {
    errors.push(
      `Coverage has not been configured for ${config.product?.name ?? "product"}, ${config.quality?.name ?? "quality"}. ` +
        "Accurate FRELUX calculation unavailable until the required coverage rate is configured.",
    );
    steps.push({
      label: "Paint Quality & Coverage",
      value: `${config.quality?.name ?? "N/A"}, NOT CONFIGURED`,
      detail: "Admin must configure coverage before accurate calculation.",
    });
  } else {
    steps.push({
      label: "Paint Quality & Coverage",
      value: `${config.quality?.name ?? "N/A"}, ${coverage} ${getCoverageUnitLabel(coverageUnit)}`,
      detail:
        "Product-specific and quality-specific coverage. No global coverage inheritance.",
    });
  }

  // ── STEP 9: Coats ──
  const standardCoats = getStandardCoatCount(config.coatCountRule);
  const userCoats = Math.max(1, room.coats || standardCoats);
  const effectiveCoats = Math.max(userCoats, minCoatsOverride ?? 0);
  steps.push({
    label: "Coats",
    value: `${effectiveCoats} coat(s)`,
    detail:
      effectiveCoats > userCoats
        ? `User selected ${userCoats}; colour condition requires minimum ${minCoatsOverride}. Using ${effectiveCoats}.`
        : `FRELUX standard: ${standardCoats} coats.`,
  });

  // ── STEP 10: Normalize Coverage ──
  let wallCoverageM2PerL = 0;
  let ceilingCoverageM2PerL: number | null = null;

  if (coverage && coverage > 0) {
    wallCoverageM2PerL = normalizeCoverage(
      coverage,
      coverageUnit,
      packSizeLitres,
    );
    // Apply surface condition factor
    wallCoverageM2PerL = wallCoverageM2PerL * surfaceFactor;
    steps.push({
      label: "Normalized Wall Coverage",
      value: `${wallCoverageM2PerL.toFixed(2)} m²/L per coat`,
      detail: `Normalized from ${coverage} ${getCoverageUnitLabel(coverageUnit)}${surfaceFactor !== 1.0 ? ` × surface factor ${surfaceFactor}` : ""}`,
    });
  }

  // Ceiling coverage: separate rate if configured
  const ceilingCoverageConfig = getCeilingCoverageRate(
    config.ceilingCoverageRule,
  );
  if (room.include_ceiling) {
    if (
      config.quality?.ceiling_coverage &&
      config.quality.ceiling_coverage > 0
    ) {
      const ceilingUnit = config.quality.ceiling_coverage_unit ?? coverageUnit;
      ceilingCoverageM2PerL = normalizeCoverage(
        config.quality.ceiling_coverage,
        ceilingUnit,
        packSizeLitres,
      );
      steps.push({
        label: "Ceiling Coverage",
        value: `${ceilingCoverageM2PerL.toFixed(2)} m²/L per coat`,
        detail: "Separate ceiling coverage rate (NOT same as wall).",
      });
    } else if (
      ceilingCoverageConfig.enabled &&
      ceilingCoverageConfig.m2PerLiter &&
      ceilingCoverageConfig.m2PerLiter > 0
    ) {
      ceilingCoverageM2PerL = ceilingCoverageConfig.m2PerLiter;
      steps.push({
        label: "Ceiling Coverage",
        value: `${ceilingCoverageM2PerL.toFixed(2)} m²/L per coat`,
        detail: "From ceiling_coverage_rate calc rule.",
      });
    } else {
      // Fall back to ceiling_quantity_per_room rule
      const ceilingBuckets = getCeilingQuantityBuckets(config.ceilingRule);
      const ceilingLitres = ceilingBuckets * packSizeLitres;
      steps.push({
        label: "Ceiling Paint",
        value: `${ceilingBuckets} bucket(s) (${ceilingLitres.toFixed(2)} L)`,
        detail:
          "FRELUX rule: ceiling_quantity_per_room. Ceiling coverage is NOT assumed to equal wall coverage.",
      });
    }
  }

  // ── STEP 11: Theoretical Wall Litres ──
  const theoreticalWallLitres =
    wallCoverageM2PerL > 0
      ? Math.round(
          ((netWallArea * effectiveCoats) / wallCoverageM2PerL) * 100,
        ) / 100
      : 0;
  const theoreticalWallBuckets =
    packSizeLitres > 0
      ? Math.round((theoreticalWallLitres / packSizeLitres) * 10000) / 10000
      : 0;

  steps.push({
    label: "Theoretical Wall Requirement",
    value:
      wallCoverageM2PerL > 0
        ? `${theoreticalWallLitres.toFixed(2)} L (${theoreticalWallBuckets.toFixed(4)} buckets)`
        : "Cannot calculate, coverage not configured",
    detail: `(${netWallArea.toFixed(2)} m² × ${effectiveCoats} coats) ÷ ${wallCoverageM2PerL.toFixed(2)} m²/L`,
  });

  // ── STEP 12: Theoretical Ceiling ──
  let theoreticalCeilingLitres = 0;
  let theoreticalCeilingBuckets = 0;

  if (room.include_ceiling) {
    if (ceilingCoverageM2PerL && ceilingCoverageM2PerL > 0) {
      theoreticalCeilingLitres =
        Math.round(
          ((ceilingArea * effectiveCoats) / ceilingCoverageM2PerL) * 100,
        ) / 100;
      theoreticalCeilingBuckets =
        packSizeLitres > 0
          ? Math.round((theoreticalCeilingLitres / packSizeLitres) * 10000) /
            10000
          : 0;
      steps.push({
        label: "Theoretical Ceiling Requirement",
        value: `${theoreticalCeilingLitres.toFixed(2)} L (${theoreticalCeilingBuckets.toFixed(4)} buckets)`,
        detail: `(${ceilingArea.toFixed(2)} m² × ${effectiveCoats} coats) ÷ ${ceilingCoverageM2PerL.toFixed(2)} m²/L`,
      });
    } else {
      // Use ceiling_quantity_per_room rule
      const ceilingBuckets = getCeilingQuantityBuckets(config.ceilingRule);
      theoreticalCeilingBuckets = ceilingBuckets;
      theoreticalCeilingLitres = ceilingBuckets * packSizeLitres;
      steps.push({
        label: "Theoretical Ceiling Requirement",
        value: `${theoreticalCeilingBuckets.toFixed(2)} buckets (${theoreticalCeilingLitres.toFixed(2)} L)`,
        detail: "FRELUX ceiling_quantity_per_room rule.",
      });
    }
  }

  // ── STEP 13: Total Theoretical ──
  const theoreticalTotalLitres =
    theoreticalWallLitres + theoreticalCeilingLitres;
  const theoreticalTotalBuckets =
    theoreticalWallBuckets + theoreticalCeilingBuckets;
  steps.push({
    label: "Total Theoretical Quantity",
    value: `${theoreticalTotalLitres.toFixed(2)} L (${theoreticalTotalBuckets.toFixed(4)} buckets)`,
    detail: "Wall + Ceiling theoretical (before purchase rounding).",
  });

  // ── STEP 14: FRELUX Calibration Check ──
  const calibrationRefs = getCalibrationReferences(
    config.calibrationReferencesRule,
  );
  if (coverageUnit === "frelux_calibration" && calibrationRefs.length > 0) {
    const calMatch = findCalibrationMatch(
      room.unit === "feet" ? room.length : room.length * 3.28084,
      room.unit === "feet" ? room.width : room.width * 3.28084,
      heightFt,
      effectiveCoats,
      room.quality_id,
      calibrationRefs,
    );
    if (calMatch !== null) {
      steps.push({
        label: "FRELUX Calibration",
        value: `${calMatch} bucket(s)`,
        detail:
          "Matched FRELUX calibration reference point for this room size.",
      });
    }
  }

  // ── STEP 15: Practical Purchase Quantity ──
  const roundingRule = getRoundingRule(config.roundingRule);
  const practicalWallBuckets = roundUpToBuckets(
    theoreticalWallLitres,
    packSizeLitres,
    roundingRule,
  );
  const practicalCeilingBuckets = ceilingCoverageM2PerL
    ? roundUpToBuckets(theoreticalCeilingLitres, packSizeLitres, roundingRule)
    : room.include_ceiling
      ? Math.ceil(theoreticalCeilingBuckets)
      : 0;

  const practicalTotalBuckets = practicalWallBuckets + practicalCeilingBuckets;
  const practicalTotalLitres = practicalTotalBuckets * packSizeLitres;
  const leftoverLitres = Math.max(
    0,
    Math.round((practicalTotalLitres - theoreticalTotalLitres) * 100) / 100,
  );

  steps.push({
    label: "Practical Purchase Quantity",
    value: `${practicalTotalBuckets} bucket(s) (${practicalTotalLitres.toFixed(2)} L)`,
    detail: `Theoretical ${theoreticalTotalBuckets.toFixed(4)} → rounded up to ${practicalTotalBuckets} × ${packSizeLitres}-L buckets (${roundingRule} rule).`,
  });

  if (leftoverLitres > 0) {
    steps.push({
      label: "Estimated Remaining",
      value: `${leftoverLitres.toFixed(2)} L`,
      detail: "Excess paint after theoretical requirement is met.",
    });
  }

  // ── STEP 16: Pricing ──
  const unitPrice = config.price?.price ?? 0;
  const priceConfigured = isPriceConfigured(unitPrice);
  if (!priceConfigured) {
    warnings.push(
      `Price not configured for ${config.product?.name ?? "product"}, ${config.quality?.name ?? "quality"}. Material cost cannot be calculated.`,
    );
  }
  const materialCost = priceConfigured ? unitPrice * practicalTotalBuckets : 0;

  steps.push({
    label: "Price",
    value: priceConfigured
      ? `${unitPrice} ${config.price?.currency ?? "NGN"} per ${packSizeLitres}-L bucket`
      : "NOT CONFIGURED",
  });
  steps.push({
    label: "Material Cost",
    value: priceConfigured
      ? `${materialCost.toFixed(2)} ${config.price?.currency ?? "NGN"}`
      : "Cannot calculate, price not configured",
    detail: `${practicalTotalBuckets} bucket(s) × ${unitPrice}`,
  });

  // ── STEP 17: Primer (if included) ──
  let primerLitres = 0;
  let primerBuckets = 0;
  let primerCost = 0;
  const includePrimer = room.include_primer || primerRecommended;

  if (includePrimer) {
    // Primer covers ~30% more area per liter
    const primerMultiplier = config.primer_coverage_multiplier ?? 1.3;
    const primerCoverageM2PerL =
      wallCoverageM2PerL > 0 ? wallCoverageM2PerL * primerMultiplier : 0;
    primerLitres =
      primerCoverageM2PerL > 0
        ? Math.round(((netWallArea * 1) / primerCoverageM2PerL) * 100) / 100
        : 0;
    primerBuckets =
      primerLitres > 0
        ? roundUpToBuckets(primerLitres, packSizeLitres, roundingRule)
        : 0;
    const primerUnitPrice = config.primer_price?.price ?? 0;
    primerCost = primerUnitPrice > 0 ? primerUnitPrice * primerBuckets : 0;

    steps.push({
      label: "Primer/Sealer",
      value:
        primerBuckets > 0
          ? `${primerBuckets} bucket(s) (${primerLitres.toFixed(2)} L)`
          : "Recommended but not calculated (coverage not configured)",
      detail:
        primerCost > 0
          ? `Cost: ${primerCost.toFixed(2)} ${config.primer_price?.currency ?? "NGN"}`
          : "Primer price not configured.",
    });
  }

  // ── Price Snapshot ──
  const priceSnapshot = buildPriceSnapshot(
    config.product,
    config.quality,
    config.price,
    packSizeLitres,
    coverage,
    coverageUnit,
    config.calcVersionId,
  );

  // ── Customer Summary ──
  const customerSummary: PaintEngineCustomerSummary = {
    room_name: room.room_name,
    room_size: `${room.length} × ${room.width} ${room.unit}`,
    wall_height: `${room.height} ${room.unit}`,
    paint: config.product?.name ?? "N/A",
    quality: config.quality?.name ?? "N/A",
    coats: String(effectiveCoats),
    ceiling: room.include_ceiling ? "Included" : "Not included",
    doors: room.doors_unknown
      ? "Not provided"
      : String(room.doors.reduce((s, o) => s + o.quantity, 0)),
    windows: room.windows_unknown
      ? "Not provided"
      : String(room.windows.reduce((s, o) => s + o.quantity, 0)),
    theoretical_buckets: `${theoreticalTotalBuckets.toFixed(2)} buckets (${theoreticalTotalLitres.toFixed(2)} L)`,
    practical_purchase: `${practicalTotalBuckets} × ${packSizeLitres}-L buckets`,
    material_cost: priceConfigured
      ? Math.round(materialCost * 100) / 100
      : null,
    material_cost_formatted: priceConfigured
      ? `${materialCost.toFixed(2)} ${config.price?.currency ?? "NGN"}`
      : "Not configured",
    height_notice: heightWarning,
    labour_note: "Labour: Not included, negotiated separately.",
  };

  return {
    room_id: room.room_id,
    room_name: room.room_name,
    length_m: Math.round(lengthM * 100) / 100,
    width_m: Math.round(widthM * 100) / 100,
    height_m: Math.round(heightM * 100) / 100,
    gross_wall_area_m2: grossWallArea,
    door_area_m2: doorArea,
    window_area_m2: windowArea,
    opening_deduction_m2: openingDeduction,
    net_wall_area_m2: netWallArea,
    ceiling_area_m2: ceilingArea,
    product: config.product,
    quality: config.quality,
    coverage_rate: coverage,
    coverage_unit: coverageUnit,
    ceiling_coverage_rate: ceilingCoverageM2PerL,
    pack_size_litres: packSizeLitres,
    coats: userCoats,
    effective_coats: effectiveCoats,
    theoretical_wall_litres: theoreticalWallLitres,
    theoretical_ceiling_litres: theoreticalCeilingLitres,
    theoretical_total_litres: theoreticalTotalLitres,
    theoretical_wall_buckets: theoreticalWallBuckets,
    theoretical_ceiling_buckets: theoreticalCeilingBuckets,
    theoretical_total_buckets: theoreticalTotalBuckets,
    practical_wall_buckets: practicalWallBuckets,
    practical_ceiling_buckets: practicalCeilingBuckets,
    practical_total_buckets: practicalTotalBuckets,
    practical_total_litres: practicalTotalLitres,
    leftover_litres: leftoverLitres,
    unit_price: unitPrice,
    material_cost: materialCost,
    price_configured: priceConfigured,
    primer_recommended: primerRecommended,
    primer_included: includePrimer,
    primer_litres: primerLitres,
    primer_buckets: primerBuckets,
    primer_cost: primerCost,
    surface_condition: surfaceCondition,
    surface_factor: surfaceFactor,
    colour_condition: colourCondition,
    height_warning: heightWarning,
    customer_summary: customerSummary,
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations,
    calculation_steps: steps,
    calc_version_id: config.calcVersionId,
    price_snapshot: priceSnapshot,
  };
}

// =========================================================
// Multi-Room Project Calculation
// =========================================================

export function calculatePaintProject(
  rooms: PaintEngineRoomInput[],
  config: {
    products: EstimationProduct[];
    qualities: Map<string, EstimationProductQuality[]>;
    prices: Map<string, EstimationPrice>;
    calcRules: Map<string, EstimationCalcRule>;
    colourConditions: EstimationColourCondition[];
    surfaceConditions: EstimationSurfaceCondition[];
    calcVersionId: string | null;
    primerPrice?: EstimationPrice | null;
  },
): PaintEngineProjectResult {
  const allWarnings: string[] = [];
  const allRecommendations: string[] = [];
  const allErrors: string[] = [];
  const roomResults: PaintEngineRoomResult[] = [];

  // Extract shared rules
  const ceilingRule = config.calcRules.get("ceiling_quantity_per_room") ?? null;
  const ceilingCoverageRule =
    config.calcRules.get("ceiling_coverage_rate") ?? null;
  const packSizeRule = config.calcRules.get("pack_size_bucket_litres") ?? null;
  const roundingRule = config.calcRules.get("purchase_rounding_rule") ?? null;
  const standardHeightRule =
    config.calcRules.get("standard_room_height") ?? null;
  const heightAdjustmentRule =
    config.calcRules.get("height_adjustment_rule") ?? null;
  const openingDeductionRule =
    config.calcRules.get("opening_deduction_rule") ?? null;
  const coatCountRule = config.calcRules.get("standard_coat_count") ?? null;
  const calibrationReferencesRule =
    config.calcRules.get("frelux_calibration_references") ?? null;

  for (const room of rooms) {
    const product =
      config.products.find((p) => p.id === room.product_id) ?? null;
    const qualities = room.product_id
      ? (config.qualities.get(room.product_id) ?? [])
      : [];
    const quality = qualities.find((q) => q.id === room.quality_id) ?? null;
    const priceKey = room.quality_id ?? room.product_id;
    const price = config.prices.get(priceKey) ?? null;

    const roomResult = calculateRoom(room, {
      product,
      quality,
      price,
      primer_price: config.primerPrice ?? null,
      ceilingRule,
      ceilingCoverageRule,
      packSizeRule,
      roundingRule,
      standardHeightRule,
      heightAdjustmentRule,
      openingDeductionRule,
      coatCountRule,
      calibrationReferencesRule,
      colourConditions: config.colourConditions,
      surfaceConditions: config.surfaceConditions,
      calcVersionId: config.calcVersionId,
    });

    roomResults.push(roomResult);
    allWarnings.push(...roomResult.warnings);
    allRecommendations.push(...roomResult.recommendations);
    allErrors.push(...roomResult.errors);
  }

  // Combined totals
  const combinedTheoreticalLitres = roomResults.reduce(
    (s, r) => s + r.theoretical_total_litres,
    0,
  );
  const combinedTheoreticalBuckets = roomResults.reduce(
    (s, r) => s + r.theoretical_total_buckets,
    0,
  );
  const combinedPracticalBuckets = roomResults.reduce(
    (s, r) => s + r.practical_total_buckets,
    0,
  );
  const combinedPracticalLitres = roomResults.reduce(
    (s, r) => s + r.practical_total_litres,
    0,
  );
  const combinedLeftoverLitres = roomResults.reduce(
    (s, r) => s + r.leftover_litres,
    0,
  );
  const totalMaterialCost = roomResults.reduce(
    (s, r) => s + r.material_cost,
    0,
  );
  const totalPrimerCost = roomResults.reduce((s, r) => s + r.primer_cost, 0);
  const grandTotal = totalMaterialCost + totalPrimerCost;

  return {
    rooms: roomResults,
    combined_theoretical_litres:
      Math.round(combinedTheoreticalLitres * 100) / 100,
    combined_theoretical_buckets:
      Math.round(combinedTheoreticalBuckets * 10000) / 10000,
    combined_practical_buckets: combinedPracticalBuckets,
    combined_practical_litres: combinedPracticalLitres,
    combined_leftover_litres: Math.round(combinedLeftoverLitres * 100) / 100,
    total_material_cost: Math.round(totalMaterialCost * 100) / 100,
    total_primer_cost: Math.round(totalPrimerCost * 100) / 100,
    grand_total: Math.round(grandTotal * 100) / 100,
    currency:
      config.prices.size > 0
        ? Array.from(config.prices.values())[0].currency
        : "NGN",
    warnings: [...new Set(allWarnings)],
    recommendations: [...new Set(allRecommendations)],
    errors: allErrors,
    valid: allErrors.length === 0,
    calc_version_id: config.calcVersionId,
    labour_note: "Labour: Not included, negotiated separately.",
  };
}
