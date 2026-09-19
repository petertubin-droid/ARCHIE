/**
 * FRELUX Phase 2, Painting Estimation Engine
 *
 * Room-based painting estimator that follows FRELUX's actual estimating methodology.
 * Uses the Phase 1 estimation infrastructure (products, quality levels, prices, calc rules,
 * pack sizing, validation, adjustments), does NOT duplicate or replace those systems.
 *
 * Key principles:
 * - Room-based: primary inputs are room length, breadth, wall height
 * - Theoretical vs practical purchase quantity are ALWAYS shown separately
 * - Coverage comes from admin-configured product quality levels (never hardcoded)
 * - Ceiling is calculated separately (FRELUX rule: 0.5 bucket per room)
 * - Colour/surface conditions generate warnings, NOT automatic percentage adjustments
 * - Manual professional adjustments are recorded and never overwrite the original
 * - Labour is NEVER calculated (negotiated separately)
 * - All business values come from database configuration
 * - Height adjustment: walls above 8 ft (FRELUX standard) are "too high" and trigger
 *   a customer-facing warning plus an optional admin-configurable adjustment factor
 * - Opening deduction: admin-configurable percentage (default 100% = full deduction)
 *
 * Calculation flow (per spec section 23):
 * ROOM DIMENSIONS → WALL GEOMETRY → CEILING → DOOR/WINDOW ADJUSTMENT →
 * HEIGHT RULE → SURFACE CONDITION → COLOUR CHANGE → PAINT TYPE →
 * QUALITY → COATS → FRELUX ROOM-BASED CALIBRATION →
 * THEORETICAL BUCKET REQUIREMENT → PRACTICAL PURCHASE QUANTITY →
 * PRICE → TOTAL MATERIAL COST
 */

import type {
  EstimationProduct,
  EstimationProductQuality,
  EstimationPrice,
  EstimationCalcRule,
  EstimationColourCondition,
  EstimationSurfaceCondition,
  ValidationResult,
  EstimateLineItemInput,
  OpeningInput,
} from "@/types/estimation";

import {
  validateDimensions,
  validateQuantity,
  validateProduct,
  createValidationResult,
} from "./validation";

import { roundPackQuantity } from "./pack-sizing";

import {
  createPriceSnapshot,
  calculateLineTotal,
  formatCurrency,
  isPriceConfigured,
} from "./pricing";

import { feetToMeters } from "@/lib/utils";

// MERGED (audit finding cf_dual_paint_engines, resolved 2026-09-09):
// the central paint-engine is the single source of truth for ALL
// shared estimation rules — coverage normalization, pack size,
// rounding, standard height, ceiling quantity. This room-based
// engine is an orchestration layer over those rules; it no longer
// duplicates any rule definition, so the two calculators can
// never disagree on a shared rule again.
import {
  normalizeCoverage,
  getCoverageUnitLabel,
  getPackSizeLitres,
  getRoundingRule,
  getStandardHeight,
  getCeilingQuantityBuckets,
} from "./paint-engine";
export {
  normalizeCoverage,
  getCoverageUnitLabel,
  getPackSizeLitres,
  getRoundingRule,
  getStandardHeight,
  getCeilingQuantityBuckets,
} from "./paint-engine";

// =========================================================
// Types
// =========================================================

export interface PaintingRoomInput {
  room_id: string;
  room_name: string;
  length: number; // in feet or meters
  breadth: number; // in feet or meters
  height: number; // wall height in feet or meters
  unit: "feet" | "meters";
  doors: OpeningInput[]; // door openings (each: quantity, width, height)
  windows: OpeningInput[]; // window openings (each: quantity, width, height)
  doors_unknown: boolean; // "I don't know the dimensions"
  windows_unknown: boolean;
  product_id: string;
  quality_id: string;
  colour_condition_key: string;
  surface_condition_key: string;
  coats: number;
  include_ceiling: boolean;
  ceiling_colour: string;
}

export interface PaintingProjectInput {
  rooms: PaintingRoomInput[];
  currency: string;
  user_id: string | null;
  client_hash: string | null;
  project_description: string;
  customer_location: "owerri" | "outside_owerri" | "unknown";
  add_primer: boolean;
  primer_product_id?: string | null;
}

export interface HeightAdjustmentInfo {
  is_high: boolean;
  standard_height_m: number;
  actual_height_m: number;
  adjustment_factor: number;
  message: string;
}

export interface OpeningDeductionInfo {
  deduction_percentage: number; // 100 = full deduction, 50 = half, 0 = no deduction
  total_opening_area_m2: number;
  deducted_area_m2: number;
}

/** Customer-facing room summary, painter language, not m² */
export interface RoomCustomerSummary {
  room_name: string;
  room_size: string; // "12 ft × 14 ft"
  wall_height: string; // "8 ft"
  paint: string; // "Premium Emulsion"
  coats: string; // "2"
  ceiling: string; // "Included" or "Not included"
  doors: string; // "2" or "Not provided"
  windows: string; // "3" or "Not provided"
  calculated_requirement: string; // "X buckets"
  practical_purchase: string; // "X × 20-L buckets"
  material_cost: number | null; // numeric cost; null = not configured
  material_cost_formatted: string; // display-ready, currency included
  height_notice: string | null; // height warning if applicable
}

export interface PaintingRoomCalcResult {
  room_id: string;
  room_name: string;
  // Dimensions (in meters for internal calc)
  length_m: number;
  breadth_m: number;
  height_m: number;
  // Areas
  gross_wall_area_m2: number;
  door_area_m2: number;
  window_area_m2: number;
  net_wall_area_m2: number;
  ceiling_area_m2: number;
  // Opening deduction
  opening_deduction: OpeningDeductionInfo | null;
  // Product info
  product: EstimationProduct | null;
  quality: EstimationProductQuality | null;
  coverage_m2_per_liter: number | null;
  pack_size_litres: number;
  // Calculation
  coats: number;
  theoretical_wall_litres: number;
  theoretical_ceiling_litres: number;
  theoretical_total_litres: number;
  theoretical_wall_buckets: number;
  theoretical_ceiling_buckets: number;
  theoretical_total_buckets: number;
  // Purchase
  practical_wall_buckets: number;
  practical_ceiling_buckets: number;
  practical_total_buckets: number;
  leftover_litres: number;
  // Ceiling
  include_ceiling: boolean;
  ceiling_colour: string;
  ceiling_quantity_buckets: number;
  // Height adjustment
  height_adjustment: HeightAdjustmentInfo | null;
  // Customer-facing summary
  customer_summary: RoomCustomerSummary;
  // Warnings
  warnings: string[];
  recommendations: string[];
  // Validation
  valid: boolean;
  errors: string[];
  // Conditions
  colour_condition: EstimationColourCondition | null;
  surface_condition: EstimationSurfaceCondition | null;
  // Primer
  primer_recommended: boolean;
  // Transparency steps
  calculation_steps: PaintingCalcStep[];
}

export interface PaintingCalcStep {
  label: string;
  value: string;
  detail?: string;
}

/** Breakdown entry for multi-room summary */
export interface SummaryBreakdownEntry {
  label: string; // e.g. "Emulsion (Standard)"
  product_name: string;
  quality_name: string | null;
  room_count: number;
  theoretical_litres: number;
  practical_buckets: number;
  material_cost: number;
}

export interface PaintingEstimateResult {
  rooms: PaintingRoomCalcResult[];
  // Combined totals
  combined_theoretical_litres: number;
  combined_theoretical_buckets: number;
  combined_practical_buckets: number;
  combined_leftover_litres: number;
  total_material_cost: number;
  currency: string;
  // Line items
  line_items: EstimateLineItemInput[];
  // Breakdown by paint type/quality
  breakdown: SummaryBreakdownEntry[];
  // Warnings (all rooms combined)
  warnings: string[];
  recommendations: string[];
  // Labour
  labour_note: string;
  // Production
  production_eligible: boolean;
  production_message: string;
  production_min_required: number;
  // Validity
  valid: boolean;
  errors: string[];
  // Calc version
  calc_version_id: string | null;
  // Estimate reference for marketplace posting
  estimate_ref?: string;
}

// =========================================================
// Constants
// =========================================================

const CALCULATOR_TYPE = "painting";

// =========================================================
// Core Calculation Functions
// =========================================================

function toMeters(value: number, unit: "feet" | "meters"): number {
  return unit === "feet" ? feetToMeters(value) : value;
}

export function calculateWallArea(
  lengthM: number,
  breadthM: number,
  heightM: number,
): number {
  const safeL = Math.max(0, lengthM);
  const safeB = Math.max(0, breadthM);
  const safeH = Math.max(0, heightM);
  if (safeL === 0 || safeH === 0) return 0;
  if (safeB === 0) return 2 * safeL * safeH;
  const perimeter = 2 * (safeL + safeB);
  return Math.round(perimeter * safeH * 100) / 100;
}

export function calculateOpeningArea(
  openings: OpeningInput[],
  unit: "feet" | "meters" = "feet",
): number {
  if (!openings || openings.length === 0) return 0;
  let total = 0;
  for (const opening of openings) {
    const w = toMeters(opening.width, unit);
    const h = toMeters(opening.height, unit);
    const area =
      Math.max(0, w) * Math.max(0, h) * Math.max(0, opening.quantity);
    total += area;
  }
  return Math.round(total * 100) / 100;
}

export function calculateCeilingArea(
  lengthM: number,
  breadthM: number,
): number {
  return Math.round(Math.max(0, lengthM) * Math.max(0, breadthM) * 100) / 100;
}

/**
 * Internal calculation, NOT shown as the primary FRELUX methodology to the customer.
 */
export function calculateTheoreticalLitres(
  areaM2: number,
  coats: number,
  coverageM2PerLiter: number,
): number {
  if (coverageM2PerLiter <= 0) return 0;
  const safeArea = Math.max(0, areaM2);
  const safeCoats = Math.max(1, coats);
  return Math.round(((safeArea * safeCoats) / coverageM2PerLiter) * 100) / 100;
}

export function litresToBuckets(
  litres: number,
  packSizeLitres: number,
): number {
  if (packSizeLitres <= 0) return 0;
  return Math.round((Math.max(0, litres) / packSizeLitres) * 10000) / 10000;
}

export function evaluateHeightAdjustment(
  heightM: number,
  unit: "feet" | "meters",
  inputHeight: number,
  heightAdjustmentRule: EstimationCalcRule | null,
  standardHeight: { ft: number; m: number },
): HeightAdjustmentInfo | null {
  const rv = heightAdjustmentRule?.rule_value as Record<string, unknown> | null;
  const enabled = rv ? rv.enabled !== false : true;
  if (!enabled) return null;

  const thresholdM =
    (rv?.warning_threshold_m as number | undefined) ?? standardHeight.m;
  const adjustmentFactor =
    typeof rv?.adjustment_factor === "number"
      ? (rv.adjustment_factor as number)
      : 1.0;
  const message =
    typeof rv?.message === "string"
      ? (rv.message as string)
      : `Wall height exceeds the FRELUX standard (${standardHeight.ft} ft / ${standardHeight.m.toFixed(2)} m). This is considered a high wall. Professional assessment recommended for non-standard heights.`;

  if (heightM > thresholdM) {
    return {
      is_high: true,
      standard_height_m: standardHeight.m,
      actual_height_m: heightM,
      adjustment_factor: adjustmentFactor,
      message,
    };
  }
  return null;
}

/**
 * Gets the opening deduction percentage from calc rules.
 * Default: 100 (full deduction of door/window areas from gross wall area).
 * Admin can configure a different percentage (e.g., 50 for half deduction).
 * 0 means no deduction at all.
 */
export function getOpeningDeductionRule(
  openingDeductionRule: EstimationCalcRule | null,
): number {
  if (!openingDeductionRule?.rule_value) return 100;
  const pct = (openingDeductionRule.rule_value as Record<string, unknown>)
    .deduction_percentage;
  if (typeof pct === "number" && pct >= 0 && pct <= 100) return pct;
  return 100;
}

// =========================================================
// Validation for a single room
// =========================================================

export function validateRoomInput(
  room: PaintingRoomInput,
  product: EstimationProduct | null,
  quality: EstimationProductQuality | null,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dimValidation = validateDimensions({
    length: room.length,
    breadth: room.breadth,
    height: room.height,
  });
  if (!dimValidation.valid) errors.push(...dimValidation.errors);

  const productValidation = validateProduct(product);
  if (!productValidation.valid) errors.push(...productValidation.errors);

  if (!quality) {
    errors.push("Quality level is required.");
  } else if (!quality.is_active) {
    errors.push(`Quality level '${quality.name}' is inactive.`);
  }

  if (
    quality &&
    (quality.coverage === null || quality.coverage === undefined)
  ) {
    warnings.push(
      `Coverage has not been configured for ${product?.name ?? "product"}, ${quality.name}. ` +
        "Accurate calculation unavailable until the required FRELUX product/rule configuration is completed.",
    );
  }

  const coatsValidation = validateQuantity(room.coats, "Coats", false);
  if (!coatsValidation.valid) errors.push(...coatsValidation.errors);

  for (const [i, door] of room.doors.entries()) {
    const doorValidation = validateQuantity(
      door.quantity,
      `Door ${i + 1} quantity`,
      true,
    );
    if (!doorValidation.valid) errors.push(...doorValidation.errors);
    if (!room.doors_unknown && door.quantity > 0) {
      const dimsValidation = validateDimensions({
        width: door.width,
        height: door.height,
      });
      if (!dimsValidation.valid)
        errors.push(`Door ${i + 1}: ${dimsValidation.errors.join(", ")}`);
    }
  }

  for (const [i, win] of room.windows.entries()) {
    const winValidation = validateQuantity(
      win.quantity,
      `Window ${i + 1} quantity`,
      true,
    );
    if (!winValidation.valid) errors.push(...winValidation.errors);
    if (!room.windows_unknown && win.quantity > 0) {
      const dimsValidation = validateDimensions({
        width: win.width,
        height: win.height,
      });
      if (!dimsValidation.valid)
        errors.push(`Window ${i + 1}: ${dimsValidation.errors.join(", ")}`);
    }
  }

  if (room.doors_unknown)
    warnings.push(
      "Door dimensions not provided, estimate may be less precise.",
    );
  if (room.windows_unknown)
    warnings.push(
      "Window dimensions not provided, estimate may be less precise.",
    );

  return createValidationResult(errors.length === 0, errors, warnings);
}

// =========================================================
// Helper: count total openings
// =========================================================
function countOpenings(openings: OpeningInput[], unknown: boolean): string {
  if (unknown) return "Not provided";
  const total = openings.reduce((sum, o) => sum + Math.max(0, o.quantity), 0);
  return String(total);
}

// =========================================================
// Single Room Calculation
// =========================================================

export function calculateRoom(
  room: PaintingRoomInput,
  config: {
    product: EstimationProduct | null;
    quality: EstimationProductQuality | null;
    price: EstimationPrice | null;
    ceilingRule: EstimationCalcRule | null;
    packSizeRule: EstimationCalcRule | null;
    roundingRule: EstimationCalcRule | null;
    colourConditions: EstimationColourCondition[];
    surfaceConditions: EstimationSurfaceCondition[];
    standardHeightRule?: EstimationCalcRule | null;
    heightAdjustmentRule?: EstimationCalcRule | null;
    openingDeductionRule?: EstimationCalcRule | null;
    ceilingCoverageRule?: EstimationCalcRule | null;
  },
): PaintingRoomCalcResult {
  const steps: PaintingCalcStep[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const errors: string[] = [];

  // Validate
  const validation = validateRoomInput(room, config.product, config.quality);
  if (!validation.valid) errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  // Convert to meters
  const lengthM = toMeters(room.length, room.unit);
  const breadthM = toMeters(room.breadth, room.unit);
  const heightM = toMeters(room.height, room.unit);

  // ── STEP 1: ROOM DIMENSIONS ──
  steps.push({
    label: "Room Dimensions",
    value: `${room.length} × ${room.breadth} × ${room.height} ${room.unit}`,
    detail: `Converted to ${lengthM.toFixed(2)} × ${breadthM.toFixed(2)} × ${heightM.toFixed(2)} m`,
  });

  // ── STEP 2: WALL GEOMETRY ──
  const grossWallArea = calculateWallArea(lengthM, breadthM, heightM);
  steps.push({
    label: "Wall Geometry",
    value: `${grossWallArea.toFixed(2)} m²`,
    detail: `2 × (${lengthM.toFixed(2)} + ${breadthM.toFixed(2)}) × ${heightM.toFixed(2)} = perimeter × height`,
  });

  // ── STEP 3: CEILING (if selected) ──
  let ceilingArea = 0;
  let theoreticalCeilingLitres = 0;
  let theoreticalCeilingBuckets = 0;

  if (room.include_ceiling) {
    ceilingArea = calculateCeilingArea(lengthM, breadthM);
    // Determine ceiling mode up-front so the transparency step matches what
    // Step 11 will actually compute (audit fix, previously always per-room).
    const qCeilEarly = config.quality?.ceiling_coverage;
    let ruleCeilEarly = false;
    if (config.ceilingCoverageRule?.rule_value) {
      const rv = config.ceilingCoverageRule.rule_value as Record<
        string,
        unknown
      >;
      ruleCeilEarly =
        rv.enabled !== false &&
        typeof rv.m2_per_liter === "number" &&
        (rv.m2_per_liter as number) > 0;
    }
    if ((qCeilEarly && qCeilEarly > 0) || ruleCeilEarly) {
      // Area-based ceiling coverage configured, computed with pack size at Step 11
      steps.push({
        label: "Ceiling",
        value: `${ceilingArea.toFixed(2)} m²`,
        detail: `Ceiling calculated separately from walls using configured ceiling coverage. Colour: ${room.ceiling_colour}. Area: ${ceilingArea.toFixed(2)} m².`,
      });
    } else {
      const ceilingQtyBuckets = getCeilingQuantityBuckets(config.ceilingRule);
      theoreticalCeilingBuckets = ceilingQtyBuckets;
      // Litres are NOT derived here: the theoretical litres are computed at
      // Step 11 from the actual configured pack size (never an assumed 20 L).
      // AUDIT RESOLUTION (code-intelligence cf_paint_placeholder_step):
      // the former interim `* 20` placeholder was provably dead — Step 11
      // overwrites it in every reachable path under this same
      // `room.include_ceiling` guard — and is removed so no placeholder
      // value can ever exist in this engine.
      steps.push({
        label: "Ceiling",
        value: `${theoreticalCeilingBuckets} bucket(s)`,
        detail: `FRELUX rule: ${ceilingQtyBuckets} bucket per room. Colour: ${room.ceiling_colour}. Area: ${ceilingArea.toFixed(2)} m². Calculated separately from walls.`,
      });
    }
  } else {
    steps.push({
      label: "Ceiling",
      value: "Not included",
      detail: "Ceiling excluded, ceiling quantity = 0.",
    });
  }

  // ── STEP 4: DOOR/WINDOW ADJUSTMENT ──
  let doorArea = 0;
  let windowArea = 0;
  let openingDeduction: OpeningDeductionInfo | null = null;

  if (room.doors_unknown) {
    steps.push({
      label: "Door Openings",
      value: "Not provided",
      detail: "Opening dimensions not provided, estimate may be less precise.",
    });
  } else {
    doorArea = calculateOpeningArea(room.doors, room.unit);
    if (doorArea > 0) {
      steps.push({
        label: "Door Opening Area",
        value: `${doorArea.toFixed(2)} m²`,
      });
    }
  }

  if (room.windows_unknown) {
    steps.push({
      label: "Window Openings",
      value: "Not provided",
      detail: "Opening dimensions not provided, estimate may be less precise.",
    });
  } else {
    windowArea = calculateOpeningArea(room.windows, room.unit);
    if (windowArea > 0) {
      steps.push({
        label: "Window Opening Area",
        value: `${windowArea.toFixed(2)} m²`,
      });
    }
  }

  const totalOpeningArea = doorArea + windowArea;
  const deductionPct = getOpeningDeductionRule(
    config.openingDeductionRule ?? null,
  );
  const deductedArea =
    Math.round(((totalOpeningArea * deductionPct) / 100) * 100) / 100;
  const netWallArea = Math.max(0, grossWallArea - deductedArea);

  if (totalOpeningArea > 0) {
    openingDeduction = {
      deduction_percentage: deductionPct,
      total_opening_area_m2: totalOpeningArea,
      deducted_area_m2: deductedArea,
    };
    steps.push({
      label: "Opening Deduction",
      value: `−${deductedArea.toFixed(2)} m² (${deductionPct}% of ${totalOpeningArea.toFixed(2)} m²)`,
      detail:
        deductionPct === 100
          ? "Full deduction (FRELUX default). Admin can configure a different percentage."
          : `Admin-configured deduction: ${deductionPct}%.`,
    });
  }

  steps.push({
    label: "Net Wall Area",
    value: `${netWallArea.toFixed(2)} m²`,
    detail: `Gross Wall Area − Deducted Opening Area = ${grossWallArea.toFixed(2)} − ${deductedArea.toFixed(2)}`,
  });

  // ── STEP 5: HEIGHT RULE ──
  const standardHeight = getStandardHeight(config.standardHeightRule ?? null);
  const heightAdjustment = evaluateHeightAdjustment(
    heightM,
    room.unit,
    room.height,
    config.heightAdjustmentRule ?? null,
    standardHeight,
  );

  // NOTE: Per FRELUX rules, height adjustment_factor is informational only.
  // It warns the customer about high walls but does NOT auto-adjust the calculation.
  // The actual wall height is used directly in the wall area calculation.
  if (heightAdjustment) {
    warnings.push(heightAdjustment.message);
    steps.push({
      label: "Height Rule",
      value: `${room.height} ${room.unit} (above FRELUX standard of ${standardHeight.ft} ft)`,
      detail:
        heightAdjustment.message +
        (heightAdjustment.adjustment_factor !== 1.0
          ? ` Adjustment factor: ${heightAdjustment.adjustment_factor}.`
          : " Actual height is used in wall area calculation, no additional factor applied."),
    });
  } else {
    steps.push({
      label: "Height Rule",
      value: `${room.height} ${room.unit}`,
      detail:
        room.height <= standardHeight.ft
          ? `Within FRELUX standard (7–${standardHeight.ft} ft).`
          : undefined,
    });
  }

  // ── STEP 6: SURFACE CONDITION ──
  const surfaceCondition =
    config.surfaceConditions.find(
      (s) => s.condition_key === room.surface_condition_key,
    ) ?? null;
  let primerRecommended = false;

  if (surfaceCondition?.requires_preparation) {
    const warningMsg = `${surfaceCondition.name} detected. Surface preparation may be required before painting.`;
    warnings.push(warningMsg);
    steps.push({
      label: "Surface Condition",
      value: surfaceCondition.name,
      detail: warningMsg,
    });
  } else if (surfaceCondition) {
    steps.push({ label: "Surface Condition", value: surfaceCondition.name });
  }

  if (surfaceCondition?.primer_recommended) {
    primerRecommended = true;
    recommendations.push(
      `${surfaceCondition.name}: Primer/sealer is recommended. You can add it as a separate line item.`,
    );
  }

  // ── STEP 7: COLOUR CHANGE ──
  const colourCondition =
    config.colourConditions.find(
      (c) => c.condition_key === room.colour_condition_key,
    ) ?? null;

  if (colourCondition?.requires_warning) {
    const warningMsg =
      "Strong colour transition detected. Additional preparation or paint may be required. Professional adjustment recommended.";
    warnings.push(warningMsg);
    steps.push({
      label: "Colour Condition",
      value: colourCondition.name,
      detail: warningMsg,
    });
  } else if (colourCondition) {
    steps.push({ label: "Colour Condition", value: colourCondition.name });
  }

  // ── STEP 8: PAINT TYPE ──
  steps.push({
    label: "Paint Type",
    value: config.product?.name ?? "N/A",
    detail: config.product
      ? `Category: ${config.product.category}. ${config.product.has_quality_levels ? "Has quality levels." : "No quality levels."}`
      : undefined,
  });

  // ── STEP 9: QUALITY ──
  const coverage = config.quality?.coverage ?? null;
  if (coverage === null || coverage === undefined) {
    errors.push(
      `Coverage has not been configured for ${config.product?.name ?? "product"}, ${config.quality?.name ?? "quality"}. ` +
        "Accurate calculation unavailable until the required FRELUX product/rule configuration is completed.",
    );
  }
  const coverageUnit = config.quality?.coverage_unit ?? "m2_per_liter";
  steps.push({
    label: "Paint Quality & Coverage",
    value: coverage
      ? `${config.quality?.name ?? "N/A"}, ${coverage} ${getCoverageUnitLabel(coverageUnit)}`
      : `${config.quality?.name ?? "N/A"}, NOT CONFIGURED`,
    detail: coverage
      ? `Coverage rate configured for ${config.quality?.name ?? "this quality"} level. This feeds the FRELUX room-based engine.`
      : "Admin must configure coverage before accurate calculation.",
  });

  // ── STEP 10: COATS ──
  const coats = room.coats;
  steps.push({
    label: "Coats",
    value: `${coats} coat(s)`,
    detail:
      coats === 2 ? "FRELUX standard: 2 coats." : `${coats} coats selected.`,
  });

  // ── STEP 11: FRELUX ROOM-BASED CALIBRATION → THEORETICAL ──
  const packSizeLitres = getPackSizeLitres(config.product, config.packSizeRule);
  steps.push({
    label: "Bucket Size",
    value: `${packSizeLitres} L per bucket`,
    detail: "FRELUX standard: 20-L buckets.",
  });

  // AUDIT FIX (unit bug): coverage must be normalized from its configured unit
  // to m²/L before use. Previously the raw configured value was treated as
  // m²/L, so an admin coverage configured as "m² per bucket" or "ft² per
  // litre" produced silently wrong estimates here (while the central
  // paint-engine handled the same configuration correctly).
  const normalizedCoverageM2PerL = coverage
    ? normalizeCoverage(coverage, coverageUnit, packSizeLitres)
    : null;

  if (
    coverage &&
    normalizedCoverageM2PerL &&
    normalizedCoverageM2PerL !== coverage
  ) {
    steps.push({
      label: "Normalized Coverage",
      value: `${normalizedCoverageM2PerL.toFixed(2)} m²/L per coat`,
      detail: `Normalized from ${coverage} ${getCoverageUnitLabel(coverageUnit)} (${packSizeLitres}-L bucket).`,
    });
  }

  // AUDIT FIX (ceiling divergence): honor configured ceiling coverage with the
  // same priority as the central paint-engine, (1) quality-level ceiling
  // coverage, (2) ceiling_coverage_rate calc rule, (3) per-room
  // ceiling_quantity_per_room fallback. Previously this engine ALWAYS used the
  // per-room rule, so the two calculators disagreed for the same room whenever
  // admin configured ceiling coverage.
  let ceilingCoverageM2PerL: number | null = null;
  if (room.include_ceiling) {
    const qCeil = config.quality?.ceiling_coverage;
    if (qCeil && qCeil > 0) {
      const qCeilUnit = config.quality?.ceiling_coverage_unit ?? coverageUnit;
      ceilingCoverageM2PerL = normalizeCoverage(
        qCeil,
        qCeilUnit,
        packSizeLitres,
      );
      steps.push({
        label: "Ceiling Coverage",
        value: `${ceilingCoverageM2PerL.toFixed(2)} m²/L per coat`,
        detail:
          "Separate ceiling coverage configured for this quality level (matches central paint-engine).",
      });
    } else if (config.ceilingCoverageRule?.rule_value) {
      const rv = config.ceilingCoverageRule.rule_value as Record<
        string,
        unknown
      >;
      const enabled = rv.enabled !== false;
      const rate = typeof rv.m2_per_liter === "number" ? rv.m2_per_liter : null;
      if (enabled && rate && rate > 0) {
        ceilingCoverageM2PerL = rate;
        steps.push({
          label: "Ceiling Coverage",
          value: `${ceilingCoverageM2PerL.toFixed(2)} m²/L per coat`,
          detail:
            "From ceiling_coverage_rate calc rule (matches central paint-engine).",
        });
      }
    }
  }

  if (room.include_ceiling) {
    if (ceilingCoverageM2PerL && ceilingCoverageM2PerL > 0) {
      // Area-based ceiling, matches central engine Step 12
      theoreticalCeilingLitres =
        Math.round(((ceilingArea * coats) / ceilingCoverageM2PerL) * 100) / 100;
      theoreticalCeilingBuckets = litresToBuckets(
        theoreticalCeilingLitres,
        packSizeLitres,
      );
      steps.push({
        label: "Theoretical Ceiling Requirement",
        value: `${theoreticalCeilingLitres.toFixed(2)} L (${theoreticalCeilingBuckets.toFixed(4)} buckets)`,
        detail: `(${ceilingArea.toFixed(2)} m² × ${coats} coat(s)) ÷ ${ceilingCoverageM2PerL.toFixed(2)} m²/L`,
      });
    } else {
      // Per-room rule fallback, recalculated with the actual pack size
      theoreticalCeilingLitres = theoreticalCeilingBuckets * packSizeLitres;
    }
  }

  const theoreticalWallLitres = normalizedCoverageM2PerL
    ? calculateTheoreticalLitres(netWallArea, coats, normalizedCoverageM2PerL)
    : 0;
  const theoreticalWallBuckets = litresToBuckets(
    theoreticalWallLitres,
    packSizeLitres,
  );

  steps.push({
    label: "Theoretical Wall Requirement",
    value: coverage
      ? `${theoreticalWallLitres.toFixed(2)} L (${theoreticalWallBuckets.toFixed(4)} buckets)`
      : "Cannot calculate, coverage not configured",
    detail: coverage
      ? `Based on ${room.length} × ${room.breadth} ${room.unit} room at ${room.height} ${room.unit} height, ${coats} coat(s), ${config.quality?.name ?? "N/A"} quality.`
      : undefined,
  });

  // ── STEP 12: TOTAL THEORETICAL ──
  const theoreticalTotalLitres =
    theoreticalWallLitres + theoreticalCeilingLitres;
  const theoreticalTotalBuckets =
    theoreticalWallBuckets + theoreticalCeilingBuckets;
  steps.push({
    label: "Total Theoretical Quantity",
    value: `${theoreticalTotalLitres.toFixed(2)} L (${theoreticalTotalBuckets.toFixed(4)} buckets)`,
    detail: "Wall + Ceiling theoretical quantities (before purchase rounding).",
  });

  // ── STEP 13: PRACTICAL PURCHASE QUANTITY ──
  const roundingRule = getRoundingRule(config.roundingRule);
  const wallRounding = roundPackQuantity(
    theoreticalWallLitres,
    packSizeLitres,
    roundingRule,
  );
  const ceilingRounding = room.include_ceiling
    ? {
        practical_purchase_quantity: theoreticalCeilingLitres,
        pack_count: Math.ceil(theoreticalCeilingBuckets),
        leftover_quantity: 0,
      }
    : { practical_purchase_quantity: 0, pack_count: 0, leftover_quantity: 0 };

  const practicalWallBuckets = wallRounding.pack_count;
  const practicalCeilingBuckets = ceilingRounding.pack_count;
  const practicalTotalBuckets = practicalWallBuckets + practicalCeilingBuckets;
  const practicalTotalLitres = practicalTotalBuckets * packSizeLitres;
  const leftoverLitres = Math.max(
    0,
    practicalTotalLitres - theoreticalTotalLitres,
  );

  steps.push({
    label: "Practical Purchase Quantity",
    value: `${practicalTotalBuckets} bucket(s) (${practicalTotalLitres.toFixed(2)} L)`,
    detail: `Theoretical ${theoreticalTotalBuckets.toFixed(4)} buckets → rounded up to ${practicalTotalBuckets} full ${packSizeLitres}-L buckets (${roundingRule} rule).`,
  });

  if (leftoverLitres > 0) {
    steps.push({
      label: "Estimated Remaining Quantity",
      value: `${leftoverLitres.toFixed(2)} L`,
      detail: "Excess paint after theoretical requirement is met.",
    });
  }

  // ── STEP 14: PRICE ──
  if (!config.price || !isPriceConfigured(config.price?.price)) {
    warnings.push(
      `Price has not been configured for ${config.product?.name ?? "product"}, ${config.quality?.name ?? "quality"}. ` +
        "Material cost cannot be calculated until pricing is configured.",
    );
  }

  const unitPrice = config.price?.price ?? 0;
  const lineTotal =
    unitPrice > 0 ? calculateLineTotal(unitPrice, practicalTotalBuckets) : 0;

  // ── Build customer-facing summary ──
  const customerSummary: RoomCustomerSummary = {
    room_name: room.room_name,
    room_size: `${room.length} × ${room.breadth} ${room.unit}`,
    wall_height: `${room.height} ${room.unit}`,
    paint:
      `${config.quality?.name ?? ""} ${config.product?.name ?? "Paint"}`.trim(),
    coats: String(coats),
    ceiling: room.include_ceiling ? "Included" : "Not included",
    doors: countOpenings(room.doors, room.doors_unknown),
    windows: countOpenings(room.windows, room.windows_unknown),
    calculated_requirement: `${theoreticalTotalBuckets.toFixed(2)} buckets (${theoreticalTotalLitres.toFixed(2)} L)`,
    practical_purchase: `${practicalTotalBuckets} × ${packSizeLitres}-L buckets`,
    material_cost: unitPrice > 0 ? Math.round(lineTotal * 100) / 100 : null,
    material_cost_formatted:
      unitPrice > 0
        ? formatCurrency(lineTotal, config.price?.currency ?? "NGN")
        : "Not configured",
    height_notice: heightAdjustment?.message ?? null,
  };

  return {
    room_id: room.room_id,
    room_name: room.room_name,
    length_m: Math.round(lengthM * 100) / 100,
    breadth_m: Math.round(breadthM * 100) / 100,
    height_m: Math.round(heightM * 100) / 100,
    gross_wall_area_m2: grossWallArea,
    door_area_m2: doorArea,
    window_area_m2: windowArea,
    net_wall_area_m2: netWallArea,
    ceiling_area_m2: ceilingArea,
    opening_deduction: openingDeduction,
    product: config.product,
    quality: config.quality,
    coverage_m2_per_liter: normalizedCoverageM2PerL,
    pack_size_litres: packSizeLitres,
    coats,
    theoretical_wall_litres: theoreticalWallLitres,
    theoretical_ceiling_litres: theoreticalCeilingLitres,
    theoretical_total_litres: theoreticalTotalLitres,
    theoretical_wall_buckets: theoreticalWallBuckets,
    theoretical_ceiling_buckets: theoreticalCeilingBuckets,
    theoretical_total_buckets: theoreticalTotalBuckets,
    practical_wall_buckets: practicalWallBuckets,
    practical_ceiling_buckets: practicalCeilingBuckets,
    practical_total_buckets: practicalTotalBuckets,
    leftover_litres: Math.round(leftoverLitres * 100) / 100,
    include_ceiling: room.include_ceiling,
    ceiling_colour: room.ceiling_colour,
    ceiling_quantity_buckets: room.include_ceiling
      ? theoreticalCeilingBuckets
      : 0,
    height_adjustment: heightAdjustment,
    customer_summary: customerSummary,
    warnings,
    recommendations,
    valid: errors.length === 0,
    errors,
    colour_condition: colourCondition,
    surface_condition: surfaceCondition,
    primer_recommended: primerRecommended,
    calculation_steps: steps,
  };
}

// =========================================================
// Production Eligibility
// =========================================================

export interface ProductionRuleRow {
  product_category: string;
  quality_slug: string | null;
  location_rule: string;
  min_quantity: number;
  is_active: boolean;
}

export function checkProductionEligibility(
  customerLocation: "owerri" | "outside_owerri" | "unknown",
  productCategory: string,
  qualitySlug: string | null,
  requiredBuckets: number,
  productionRules: ProductionRuleRow[],
): {
  eligible: boolean;
  message: string;
  min_required: number;
} {
  if (customerLocation === "owerri") {
    return {
      eligible: true,
      message:
        "FRELUX production is available in Owerri with no minimum quantity.",
      min_required: 0,
    };
  }

  if (customerLocation === "unknown") {
    return {
      eligible: true,
      message:
        "FRELUX production eligibility depends on location. Please confirm your location for accurate production availability.",
      min_required: 0,
    };
  }

  const locationRule = "outside_owerri";
  let rule = productionRules.find(
    (r) =>
      r.product_category === productCategory &&
      r.quality_slug === qualitySlug &&
      r.location_rule === locationRule &&
      r.is_active,
  );
  if (!rule) {
    rule = productionRules.find(
      (r) =>
        r.product_category === productCategory &&
        r.quality_slug === null &&
        r.location_rule === locationRule &&
        r.is_active,
    );
  }
  const minRequired = rule ? rule.min_quantity : 10;

  if (requiredBuckets >= minRequired) {
    return {
      eligible: true,
      message: `FRELUX production is available. Required quantity (${requiredBuckets} buckets) meets the minimum (${minRequired} buckets).`,
      min_required: minRequired,
    };
  }

  return {
    eligible: false,
    message: `FRELUX production is currently available for this order only if the required production quantity meets the applicable minimum (${minRequired} buckets). You may purchase from a paint seller or external producer.`,
    min_required: minRequired,
  };
}

// =========================================================
// Full Project Calculation
// =========================================================

export function calculatePaintingProject(
  input: PaintingProjectInput,
  config: {
    products: EstimationProduct[];
    qualities: Map<string, EstimationProductQuality[]>;
    prices: Map<string, EstimationPrice>;
    calcRules: Map<string, EstimationCalcRule>;
    colourConditions: EstimationColourCondition[];
    surfaceConditions: EstimationSurfaceCondition[];
    productionRules: ProductionRuleRow[];
    calcVersionId: string | null;
  },
): PaintingEstimateResult {
  const allWarnings: string[] = [];
  const allRecommendations: string[] = [];
  const allErrors: string[] = [];
  const lineItems: EstimateLineItemInput[] = [];
  const roomResults: PaintingRoomCalcResult[] = [];
  const breakdownMap = new Map<string, SummaryBreakdownEntry>();

  const ceilingRule = config.calcRules.get("ceiling_quantity_per_room") ?? null;
  const packSizeRule = config.calcRules.get("pack_size_bucket_litres") ?? null;
  const roundingRule = config.calcRules.get("purchase_rounding_rule") ?? null;
  const standardHeightRule =
    config.calcRules.get("standard_room_height") ?? null;
  const heightAdjustmentRule =
    config.calcRules.get("height_adjustment_rule") ?? null;
  const openingDeductionRule =
    config.calcRules.get("opening_deduction_rule") ?? null;
  const ceilingCoverageRule =
    config.calcRules.get("ceiling_coverage_rate") ?? null;

  for (const room of input.rooms) {
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
      ceilingRule,
      packSizeRule,
      roundingRule,
      colourConditions: config.colourConditions,
      surfaceConditions: config.surfaceConditions,
      standardHeightRule,
      heightAdjustmentRule,
      openingDeductionRule,
      ceilingCoverageRule,
    });

    roomResults.push(roomResult);
    allWarnings.push(...roomResult.warnings);
    allRecommendations.push(...roomResult.recommendations);
    allErrors.push(...roomResult.errors);

    // Create line item
    if (roomResult.valid && price && isPriceConfigured(price.price)) {
      const priceSnapshot = createPriceSnapshot(
        price.price,
        product?.name ?? "Unknown Product",
        roomResult.pack_size_litres,
        "L",
        {
          priceType: price.price_type,
          refId: price.ref_id,
          currency: input.currency,
          priceId: price.id,
          effectiveDate: price.effective_date,
        },
      );

      const itemTotal = calculateLineTotal(
        price.price,
        roomResult.practical_total_buckets,
      );
      lineItems.push({
        item_name: `${room.room_name}, ${product?.name ?? "Paint"} (${quality?.name ?? "N/A"})`,
        item_type: "product",
        product_id: room.product_id,
        quality_level_id: room.quality_id,
        quantity_required: roomResult.theoretical_total_litres,
        practical_purchase_qty: roomResult.practical_total_buckets,
        unit: "bucket(s)",
        pack_size: roomResult.pack_size_litres,
        unit_price: price.price,
        total_price: itemTotal,
        price_snapshot: priceSnapshot,
        calculation_source: "calculated",
        notes: `${roomResult.practical_total_buckets} bucket(s) × ${roomResult.pack_size_litres}L`,
      });

      // Build breakdown entry
      const breakdownKey = `${product?.name ?? "Unknown"}|${quality?.name ?? "N/A"}`;
      const existing = breakdownMap.get(breakdownKey);
      if (existing) {
        existing.room_count += 1;
        existing.theoretical_litres += roomResult.theoretical_total_litres;
        existing.practical_buckets += roomResult.practical_total_buckets;
        existing.material_cost += itemTotal;
      } else {
        breakdownMap.set(breakdownKey, {
          label: `${product?.name ?? "Unknown"} (${quality?.name ?? "N/A"})`,
          product_name: product?.name ?? "Unknown",
          quality_name: quality?.name ?? null,
          room_count: 1,
          theoretical_litres: roomResult.theoretical_total_litres,
          practical_buckets: roomResult.practical_total_buckets,
          material_cost: itemTotal,
        });
      }
    }
  }

  // Combined totals
  const combinedTheoreticalLitres = roomResults.reduce(
    (sum, r) => sum + r.theoretical_total_litres,
    0,
  );
  const combinedTheoreticalBuckets = roomResults.reduce(
    (sum, r) => sum + r.theoretical_total_buckets,
    0,
  );
  const combinedPracticalBuckets = roomResults.reduce(
    (sum, r) => sum + r.practical_total_buckets,
    0,
  );
  const combinedLeftoverLitres = roomResults.reduce(
    (sum, r) => sum + r.leftover_litres,
    0,
  );
  const totalMaterialCost = lineItems.reduce(
    (sum, item) => sum + item.total_price,
    0,
  );

  // Production eligibility
  let productionEligible = false;
  let productionMessage = "";
  let productionMinRequired = 0;

  if (input.rooms.length > 0) {
    const firstRoom = roomResults[0];
    const productCategory = firstRoom.product?.category ?? "";
    const qualitySlug = firstRoom.quality?.slug ?? null;
    const eligibility = checkProductionEligibility(
      input.customer_location,
      productCategory,
      qualitySlug,
      combinedPracticalBuckets,
      config.productionRules,
    );
    productionEligible = eligibility.eligible;
    productionMessage = eligibility.message;
    productionMinRequired = eligibility.min_required;
  }

  const labourNote = "Labour: Not included, negotiated separately.";

  return {
    rooms: roomResults,
    combined_theoretical_litres:
      Math.round(combinedTheoreticalLitres * 100) / 100,
    combined_theoretical_buckets:
      Math.round(combinedTheoreticalBuckets * 10000) / 10000,
    combined_practical_buckets: combinedPracticalBuckets,
    combined_leftover_litres: Math.round(combinedLeftoverLitres * 100) / 100,
    total_material_cost: Math.round(totalMaterialCost * 100) / 100,
    currency: input.currency,
    line_items: lineItems,
    breakdown: Array.from(breakdownMap.values()),
    warnings: [...new Set(allWarnings)],
    recommendations: [...new Set(allRecommendations)],
    labour_note: labourNote,
    production_eligible: productionEligible,
    production_message: productionMessage,
    production_min_required: productionMinRequired,
    valid: allErrors.length === 0,
    errors: allErrors,
    calc_version_id: config.calcVersionId,
  };
}

// =========================================================
// Formatting helpers
// =========================================================

export function formatPaintingCurrency(
  amount: number,
  currency = "NGN",
): string {
  return formatCurrency(amount, currency);
}

export { CALCULATOR_TYPE };
