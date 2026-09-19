import type {
  CalculatorInput,
  CalculatorResult,
  CostEstimateInput,
  CostEstimateResult,
  ContainerRecommendation,
  ProjectType,
  OpeningDimensions,
  ScreedingMixConfig,
  ScreedingMixResult,
  AdvancedEstimateData,
  AdvancedEstimateLineItem,
  SurfaceCondition,
  ColorCondition,
  ScreedingSystemConfig,
  ScreedingMaterialBreakdown,
  ScreedingPuttyResult,
  ScreedingMixSystemResult,
  ScreedingSystemResult,
} from "@/types";
import {
  feetToMeters,
  DEFAULT_DOOR_WIDTH_M,
  DEFAULT_DOOR_HEIGHT_M,
  DEFAULT_WINDOW_WIDTH_M,
  DEFAULT_WINDOW_HEIGHT_M,
} from "@/lib/utils";

// ─────────────────────────────────────────────────────────
// Configurable constants (defaults; overridden by DB values)
// ─────────────────────────────────────────────────────────

// LEGACY FALLBACK ONLY, NOT a FRELUX business rule.
// The central Paint Calculation Engine uses admin-configured coverage from the database.
// This default is only used by the legacy calculatePaint() when no DB config is available.
export const DEFAULT_COVERAGE_M2_PER_LITER = 10;
export const DEFAULT_CONTAINER_SIZES_LITERS = [1, 4, 20];

export const DEFAULT_DOOR_DIMS: OpeningDimensions = {
  width: DEFAULT_DOOR_WIDTH_M,
  height: DEFAULT_DOOR_HEIGHT_M,
};
export const DEFAULT_WINDOW_DIMS: OpeningDimensions = {
  width: DEFAULT_WINDOW_WIDTH_M,
  height: DEFAULT_WINDOW_HEIGHT_M,
};

// ─────────────────────────────────────────────────────────
// Surface condition coverage adjustment factors
// Rough/textured surfaces absorb more paint, reducing effective coverage.
// These are industry-standard multipliers applied to the base coverage rate.
// ─────────────────────────────────────────────────────────
export const SURFACE_CONDITION_FACTORS: Record<
  SurfaceCondition,
  { factor: number; label: string; description: string }
> = {
  smooth: {
    factor: 1.0,
    label: "Smooth / Previously Painted",
    description: "Sound, smooth surface, standard coverage applies.",
  },
  textured: {
    factor: 0.85,
    label: "Textured",
    description:
      "Textured surface, ~15% more paint absorbed due to surface profile.",
  },
  rough: {
    factor: 0.75,
    label: "Rough",
    description:
      "Rough surface, ~25% more paint absorbed. Consider surface preparation.",
  },
  new_plaster: {
    factor: 0.8,
    label: "New / Bare Plaster",
    description:
      "New plaster is porous, ~20% more paint absorbed on first coat. Primer strongly recommended.",
  },
};

// ─────────────────────────────────────────────────────────
// Color condition logic
// Dark colors over light, or significant transitions, may require extra coats
// or primer. These generate warnings, NOT automatic adjustments (per FRELUX rules).
// ─────────────────────────────────────────────────────────
export const COLOR_CONDITION_INFO: Record<
  ColorCondition,
  { label: string; warning: string | null; minCoats: number }
> = {
  same_or_light: { label: "Same / Light Colour", warning: null, minCoats: 2 },
  dark_over_light: {
    label: "Dark over Light",
    warning:
      "Dark colour over light surface typically requires 3+ coats or a tinted primer for full opacity.",
    minCoats: 3,
  },
  light_over_dark: {
    label: "Light over Dark",
    warning:
      "Light colour over dark surface requires primer + 2-3 coats for complete coverage.",
    minCoats: 3,
  },
  new_unpainted: {
    label: "New / Unpainted",
    warning:
      "New/unpainted surfaces are porous. Primer/sealer is strongly recommended before painting.",
    minCoats: 2,
  },
};

// FRELUX standard height threshold (8 ft / 2.4384 m)
const STANDARD_HEIGHT_FT = 8;
const STANDARD_HEIGHT_M = 2.4384;

export function getSurfaceConditionFactor(
  condition: SurfaceCondition | undefined,
): { factor: number; label: string; description: string } {
  if (!condition) return SURFACE_CONDITION_FACTORS.smooth;
  return (
    SURFACE_CONDITION_FACTORS[condition] ?? SURFACE_CONDITION_FACTORS.smooth
  );
}

export function getColorConditionInfo(condition: ColorCondition | undefined): {
  label: string;
  warning: string | null;
  minCoats: number;
} {
  if (!condition) return COLOR_CONDITION_INFO.same_or_light;
  return COLOR_CONDITION_INFO[condition] ?? COLOR_CONDITION_INFO.same_or_light;
}

// ─────────────────────────────────────────────────────────
// Configurable rule resolution (AUDIT RESOLUTION
// cf_calc_hardcoded_fallbacks): the documented industry-standard
// factors below remain the tested, owner-confirmed defaults, but
// every value is now resolvable from database configuration with
// a single validated precedence:
//   per-condition DB override → scalar DB override → documented default
// Invalid configured values (non-positive factors, factors that
// would increase coverage beyond smooth, non-positive coats) are
// rejected and fall back to the documented default — never
// silently applied.
// ─────────────────────────────────────────────────────────

/** Maximum meaningful coverage factor (smooth = full rate). */
const MAX_SURFACE_FACTOR = 1.0;

/** Resolve the coverage adjustment factor for a surface condition. */
export function resolveSurfaceFactor(
  condition: SurfaceCondition | undefined,
  config?: Pick<CalcConfig, "surfaceFactorOverride" | "surfaceFactorOverrides">,
): number {
  const documented = getSurfaceConditionFactor(condition).factor;
  const perCondition = condition
    ? config?.surfaceFactorOverrides?.[condition]
    : undefined;
  if (perCondition !== undefined) {
    if (perCondition > 0 && perCondition <= MAX_SURFACE_FACTOR)
      return perCondition;
  }
  const scalar = config?.surfaceFactorOverride;
  if (scalar !== undefined) {
    if (scalar > 0 && scalar <= MAX_SURFACE_FACTOR) return scalar;
  }
  return documented;
}

/** Resolve the minimum coats for a colour condition. */
export function resolveMinCoats(
  condition: ColorCondition | undefined,
  config?: Pick<CalcConfig, "minCoatsOverride" | "minCoatsOverrides">,
): number {
  const documented = getColorConditionInfo(condition).minCoats;
  const perCondition = condition
    ? config?.minCoatsOverrides?.[condition]
    : undefined;
  if (perCondition !== undefined) {
    if (Number.isInteger(perCondition) && perCondition >= 1)
      return perCondition;
  }
  const scalar = config?.minCoatsOverride;
  if (scalar !== undefined) {
    if (Number.isInteger(scalar) && scalar >= 1) return scalar;
  }
  return documented;
}

export function evaluateHeightWarning(
  heightM: number,
  unit: "meters" | "feet",
): string | null {
  const standardM = STANDARD_HEIGHT_M;
  const standardFt = STANDARD_HEIGHT_FT;
  if (heightM > standardM) {
    const _heightFt = unit === "feet" ? heightM / 0.3048 : heightM * 3.28084;
    return `Wall height exceeds the FRELUX standard (${standardFt} ft / ${standardM.toFixed(2)} m). Professional assessment recommended for non-standard heights.`;
  }
  return null;
}

// Config the calculator receives from the caller. All fields optional :
// when omitted, the defaults above are used. The caller loads these from
// Supabase (paint_types table) and passes them in.
export interface CalcConfig {
  coverageRate?: number; // m² per liter per coat
  containerSizes?: number[]; // liters, ascending
  surfaceFactorOverride?: number; // DB-driven coverage adjustment factor (all conditions)
  minCoatsOverride?: number; // DB-driven minimum coats (all colour conditions)
  /** DB-driven per-condition coverage factors. Take precedence over the
   *  scalar override; invalid values fall back to documented defaults. */
  surfaceFactorOverrides?: Partial<Record<SurfaceCondition, number>>;
  /** DB-driven per-condition minimum coats. Take precedence over the
   *  scalar override; invalid values fall back to documented defaults. */
  minCoatsOverrides?: Partial<Record<ColorCondition, number>>;
  primerCoverageMultiplier?: number; // 1.3 = primer covers 30% more area per litre (admin-configurable)
}

// ─────────────────────────────────────────────────────────
// Unit conversion, single internal unit (meters)
// ─────────────────────────────────────────────────────────

function toMeters(value: number, unit: "meters" | "feet"): number {
  return unit === "feet" ? feetToMeters(value) : value;
}

// ─────────────────────────────────────────────────────────
// Surface area calculations
// ─────────────────────────────────────────────────────────

export function calculateWallArea(
  lengthM: number,
  widthM: number,
  heightM: number,
  projectType: ProjectType,
): number {
  // Room / House / Exterior: perimeter × height.
  // Fence: treat as a flat surface, length × height (width irrelevant).
  if (projectType === "fence") {
    return lengthM * heightM;
  }
  // When width is 0 (optional field left blank), calculate only the two
  // walls defined by length so the result is still mathematically valid.
  if (widthM <= 0) {
    return 2 * lengthM * heightM;
  }
  const perimeter = 2 * (lengthM + widthM);
  return perimeter * heightM;
}

export function calculateCeilingArea(
  lengthM: number,
  widthM: number,
  projectType: ProjectType,
): number {
  // Ceiling only applies to rooms/houses (interior). Exterior and fence have no ceiling.
  if (projectType === "exterior" || projectType === "fence") return 0;
  // Width is optional, if not provided, ceiling area cannot be determined.
  if (widthM <= 0) return 0;
  return lengthM * widthM;
}

export function calculateDoorArea(
  doorCount: number,
  dims: OpeningDimensions = DEFAULT_DOOR_DIMS,
): number {
  const areaPerDoor = Math.max(0, dims.width) * Math.max(0, dims.height);
  return Math.max(0, doorCount) * areaPerDoor;
}

export function calculateWindowArea(
  windowCount: number,
  dims: OpeningDimensions = DEFAULT_WINDOW_DIMS,
): number {
  const areaPerWindow = Math.max(0, dims.width) * Math.max(0, dims.height);
  return Math.max(0, windowCount) * areaPerWindow;
}

export function calculatePaintableArea(
  wallAreaM2: number,
  ceilingAreaM2: number,
  doorAreaM2: number,
  windowAreaM2: number,
  includeCeiling: boolean,
): number {
  const surface = wallAreaM2 + (includeCeiling ? ceilingAreaM2 : 0);
  const openings = doorAreaM2 + windowAreaM2;
  return Math.max(0, surface - openings);
}

// ─────────────────────────────────────────────────────────
// Paint quantity calculations
// ─────────────────────────────────────────────────────────

export function calculatePaintRequired(
  paintableAreaM2: number,
  coats: number,
  coverageRate: number,
): number {
  if (coverageRate <= 0) return 0;
  return (paintableAreaM2 * Math.max(1, coats)) / coverageRate;
}

export function calculateAdjustedPaintRequired(
  paintRequiredLiters: number,
  wasteMarginPercent: number,
): number {
  const margin = Math.max(0, Math.min(100, wasteMarginPercent)) / 100;
  return paintRequiredLiters * (1 + margin);
}

// ─────────────────────────────────────────────────────────
// Container recommendation
// ─────────────────────────────────────────────────────────

export function recommendContainerCombination(
  liters: number,
  containerSizes: number[],
): ContainerRecommendation[] {
  const sizes =
    containerSizes.length > 0
      ? [...containerSizes].sort((a, b) => b - a) // descending, prefer larger containers
      : [...DEFAULT_CONTAINER_SIZES_LITERS].sort((a, b) => b - a);

  let remaining = Math.max(0, liters);
  const recommendations: ContainerRecommendation[] = [];

  for (const size of sizes) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / size);
    if (count > 0) {
      recommendations.push({ size, count });
      remaining -= count * size;
    }
  }

  // If there's a remainder, add one of the smallest container.
  if (remaining > 0) {
    const smallest = sizes[sizes.length - 1];
    recommendations.push({ size: smallest, count: 1 });
  }

  return recommendations;
}

/**
 * Practical container recommendation, prefers larger containers (20L buckets)
 * over multiple smaller ones, even when it means buying slightly more paint.
 * This follows FRELUX's "20-litre buckets as standard purchase unit" rule.
 *
 * Example: 19L needed → 1 × 20L bucket (practical) vs 4×4L + 3×1L (theoretical)
 */
export function recommendPracticalContainers(
  liters: number,
  containerSizes: number[],
): ContainerRecommendation[] {
  const sizes =
    containerSizes.length > 0
      ? [...containerSizes].sort((a, b) => b - a)
      : [...DEFAULT_CONTAINER_SIZES_LITERS].sort((a, b) => b - a);

  const need = Math.max(0, liters);
  if (need === 0) return [];

  // Find the smallest single container that covers the full requirement.
  // sizes is sorted descending, so iterate from the end (smallest) to find
  // the smallest container that can cover the entire need in one purchase.
  for (let i = sizes.length - 1; i >= 0; i--) {
    if (sizes[i] >= need) {
      return [{ size: sizes[i], count: 1 }];
    }
  }

  // No single container covers everything, use greedy fill, then round up last container.
  let remaining = need;
  const recommendations: ContainerRecommendation[] = [];

  for (const size of sizes) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / size);
    if (count > 0) {
      recommendations.push({ size, count });
      remaining -= count * size;
    }
  }

  // If there's a remainder, round up to one more of the smallest practical size.
  if (remaining > 0) {
    // Prefer rounding up to a 20L bucket if the remainder is more than half a bucket
    const _largest = sizes[0];
    const smallest = sizes[sizes.length - 1];
    if (remaining > smallest * 0.5 && recommendations.length > 0) {
      // Check if upgrading the last recommendation to a larger size is better
      const lastRec = recommendations[recommendations.length - 1];
      // Find next larger size
      const nextSize = sizes.find((s) => s > lastRec.size);
      if (nextSize && remaining <= nextSize) {
        // Replace last rec with one larger container
        recommendations[recommendations.length - 1] = {
          size: nextSize,
          count: 1,
        };
        remaining = 0;
      } else {
        recommendations.push({ size: smallest, count: 1 });
      }
    } else {
      recommendations.push({ size: smallest, count: 1 });
    }
  }

  return recommendations;
}

// ─────────────────────────────────────────────────────────
// Full paint calculation
// ─────────────────────────────────────────────────────────

export function calculatePaint(
  input: CalculatorInput,
  config?: CalcConfig,
): CalculatorResult {
  const baseCoverageRate =
    config?.coverageRate ?? DEFAULT_COVERAGE_M2_PER_LITER;
  const containerSizes =
    config?.containerSizes ?? DEFAULT_CONTAINER_SIZES_LITERS;

  // Convert to meters internally.
  const lengthM = toMeters(input.length, input.unit);
  const widthM = toMeters(input.width, input.unit);
  const heightM = toMeters(input.wallHeight, input.unit);

  const wall = calculateWallArea(lengthM, widthM, heightM, input.projectType);
  const ceiling = calculateCeilingArea(lengthM, widthM, input.projectType);
  const door = calculateDoorArea(input.doors, input.doorDims);
  const window = calculateWindowArea(input.windows, input.windowDims);
  const area = calculatePaintableArea(
    wall,
    ceiling,
    door,
    window,
    input.includeCeiling,
  );

  // ── Surface condition adjustment ──
  // Rough/textured surfaces reduce effective coverage, apply factor to base rate.
  // Use DB-driven override if provided, otherwise fall back to hardcoded factor.
  const surfaceCondition = input.surfaceCondition ?? "smooth";
  const surfaceFactor = resolveSurfaceFactor(surfaceCondition, config);
  const adjustedCoverageRate = round(baseCoverageRate * surfaceFactor);

  // ── Color condition logic ──
  // Use DB-driven override for min coats if provided.
  const colorCondition = input.colorCondition ?? "same_or_light";
  const colorInfo = getColorConditionInfo(colorCondition);
  const minCoats = resolveMinCoats(colorCondition, config);
  const effectiveCoats = Math.max(input.coats, minCoats);

  // ── Height warning ──
  const heightWarning = evaluateHeightWarning(heightM, input.unit);

  // ── Paint calculation (with adjusted coverage and effective coats) ──
  const baseLiters = calculatePaintRequired(
    area,
    effectiveCoats,
    adjustedCoverageRate,
  );
  const adjustedLiters = calculateAdjustedPaintRequired(
    baseLiters,
    input.wasteMargin,
  );

  // ── Practical container recommendation (prefers 20L buckets) ──
  const containers = recommendPracticalContainers(
    adjustedLiters,
    containerSizes,
  );
  const totalRecommended = containers.reduce(
    (sum, c) => sum + c.count * c.size,
    0,
  );
  const leftoverLiters = Math.max(0, round(totalRecommended - adjustedLiters));

  // ── Primer calculation (if included or recommended) ──
  const primerRecommended =
    surfaceCondition === "new_plaster" ||
    surfaceCondition === "rough" ||
    colorCondition === "new_unpainted" ||
    colorCondition === "light_over_dark";
  const includePrimer = input.includePrimer ?? primerRecommended;
  // Primer typically covers more area per liter (~30% more than paint) and needs 1 coat
  const primerCoverageRate =
    adjustedCoverageRate * (config?.primerCoverageMultiplier ?? 1.3);
  const primerLiters = includePrimer
    ? calculateAdjustedPaintRequired(
        calculatePaintRequired(area, 1, primerCoverageRate),
        input.wasteMargin,
      )
    : 0;
  const primerContainers =
    primerLiters > 0
      ? recommendPracticalContainers(primerLiters, containerSizes)
      : [];
  const primerTotalLiters = primerContainers.reduce(
    (sum, c) => sum + c.count * c.size,
    0,
  );

  return {
    projectType: input.projectType,
    unit: input.unit,
    wallArea: round(wall),
    ceilingArea: round(ceiling),
    doorArea: round(door),
    windowArea: round(window),
    paintableArea: round(area),
    coats: effectiveCoats,
    paintType: input.paintType,
    coverageRate: adjustedCoverageRate,
    baseCoverageRate,
    surfaceCondition,
    surfaceConditionFactor: surfaceFactor,
    paintRequiredLiters: round(baseLiters),
    wasteMargin: input.wasteMargin,
    adjustedLiters: round(adjustedLiters),
    recommendedContainers: containers,
    totalRecommendedLiters: round(totalRecommended),
    leftoverLiters,
    primerLiters: round(primerLiters),
    primerContainers,
    primerTotalLiters: round(primerTotalLiters),
    heightWarning,
    colorWarning: colorInfo.warning,
    primerRecommended,
  };
}

// ─────────────────────────────────────────────────────────
// Cost calculations
// ─────────────────────────────────────────────────────────

// Paint cost based on actual container purchases, not a per-liter rate.
// When a product is selected with a container size > 0, we compute the
// number of containers needed (ceil) and multiply by the container price.
// When no product is selected, we fall back to the manual per-liter price.
export function calculatePaintCost(input: CostEstimateInput): {
  cost: number;
  containerCount: number;
} {
  if (
    input.paintUseContainerPricing &&
    input.paintContainerSize > 0 &&
    input.paintContainerPrice > 0
  ) {
    const containersNeeded = Math.ceil(
      Math.max(0, input.paintLiters) / input.paintContainerSize,
    );
    return {
      cost: containersNeeded * input.paintContainerPrice,
      containerCount: containersNeeded,
    };
  }
  // Manual per-liter fallback
  return {
    cost:
      Math.max(0, input.paintLiters) * Math.max(0, input.paintPricePerLiter),
    containerCount: 0,
  };
}

export function calculateMaterialCost(input: CostEstimateInput): number {
  let sum = 0;
  if (input.includeFiller) sum += Math.max(0, input.fillerCost);
  if (input.includePutty) sum += Math.max(0, input.puttyCost);
  if (input.includeSandpaper) sum += Math.max(0, input.sandpaperCost);
  if (input.includeBrushes) sum += Math.max(0, input.brushesCost);
  if (input.includeRollers) sum += Math.max(0, input.rollersCost);
  if (input.includeOther) sum += Math.max(0, input.otherMaterialsCost);
  return sum;
}

export function calculateLaborCost(input: CostEstimateInput): number {
  if (input.laborMode === "perSqm") {
    return (
      Math.max(0, input.paintableArea) * Math.max(0, input.laborRatePerSqm)
    );
  }
  return Math.max(0, input.laborTotal);
}

export function calculateEstimatedTotal(
  input: CostEstimateInput,
): CostEstimateResult {
  const { cost: paintCost, containerCount } = calculatePaintCost(input);
  const primerCost = input.includePrimer
    ? Math.max(0, input.primerLiters) * Math.max(0, input.primerPricePerLiter)
    : 0;
  const fillerCost = input.includeFiller ? Math.max(0, input.fillerCost) : 0;
  const puttyCost = input.includePutty ? Math.max(0, input.puttyCost) : 0;
  const sandpaperCost = input.includeSandpaper
    ? Math.max(0, input.sandpaperCost)
    : 0;
  const brushesCost = input.includeBrushes ? Math.max(0, input.brushesCost) : 0;
  const rollersCost = input.includeRollers ? Math.max(0, input.rollersCost) : 0;
  const otherMaterialsCost = input.includeOther
    ? Math.max(0, input.otherMaterialsCost)
    : 0;
  const materialsCost = calculateMaterialCost(input);
  const laborCost = calculateLaborCost(input);
  const total = paintCost + primerCost + materialsCost + laborCost;

  return {
    paintCost: round(paintCost),
    paintContainerCount: containerCount,
    primerCost: round(primerCost),
    fillerCost: round(fillerCost),
    puttyCost: round(puttyCost),
    sandpaperCost: round(sandpaperCost),
    brushesCost: round(brushesCost),
    rollersCost: round(rollersCost),
    otherMaterialsCost: round(otherMaterialsCost),
    materialsCost: round(materialsCost),
    laborCost: round(laborCost),
    total: round(total),
    currency: input.currency,
    currencySymbol: input.currencySymbol,
  };
}

// ─────────────────────────────────────────────────────────
// Wall Screeding Mix Calculations (Paint + White Cement)
// ─────────────────────────────────────────────────────────

export function calculateScreedingMix(
  netScreedingAreaM2: number,
  config: ScreedingMixConfig,
): ScreedingMixResult {
  const area = Math.max(0, netScreedingAreaM2);
  const coverageRate = Math.max(0.01, config.paintCoverageRateM2PerL);
  const wasteFraction =
    Math.max(0, Math.min(100, config.wastePercentage)) / 100;
  const taxFraction = Math.max(0, Math.min(100, config.taxVatPercentage)) / 100;

  // Screeding Paint (litres)
  const paintRequiredLiters = area / coverageRate;
  const paintWithWaste = paintRequiredLiters * (1 + wasteFraction);
  const paintBucketsNeeded = Math.ceil(
    paintWithWaste / Math.max(0.01, config.paintBucketSizeL),
  );
  const paintTotalCost = paintBucketsNeeded * config.paintPricePerBucket;

  // White Cement (kg)
  const cementRequiredKg = paintWithWaste * config.cementConsumptionRatioKgPerL;
  const cementBagsNeeded = Math.ceil(
    cementRequiredKg / Math.max(0.01, config.cementBagSizeKg),
  );
  const cementTotalCost = cementBagsNeeded * config.cementPricePerBag;

  // Costs
  const materialCost = paintTotalCost + cementTotalCost;
  const labourCost = 0; // Labour not included, negotiated separately
  const wasteAllowance = materialCost * (wasteFraction / (1 + wasteFraction)); // informational: waste portion of materialCost (already baked into quantities)
  const subtotal = materialCost;
  const taxAmount = subtotal * taxFraction;
  const grandTotal = subtotal + taxAmount;

  return {
    netScreedingArea: round(area),
    paintRequiredLiters: round(paintWithWaste),
    paintBucketsNeeded,
    paintUnitPrice: config.paintPricePerBucket,
    paintTotalCost: round(paintTotalCost),
    cementRequiredKg: round(cementRequiredKg),
    cementBagsNeeded,
    cementUnitPrice: config.cementPricePerBag,
    cementTotalCost: round(cementTotalCost),
    materialCost: round(materialCost),
    labourCost: round(labourCost),
    wasteAllowance: round(wasteFraction * 100),
    wasteAmount: round(wasteAllowance),
    taxAmount: round(taxAmount),
    grandTotal: round(grandTotal),
    currency: config.currency,
    currencySymbol: config.currencySymbol,
  };
}

// ─────────────────────────────────────────────────────────
// Screeding Material System, Coverage-Area Model
// Supports: Putty and White Cement + Screeding Paint
// All parameters come from ScreedingSystemConfig (Admin-configured).
// No hardcoded business values.
// ─────────────────────────────────────────────────────────

/**
 * Build a material breakdown from config-driven parameters.
 * Shows base quantity, waste, final quantity, and purchase quantity.
 */
function buildMaterialBreakdown(params: {
  name: string;
  unit: string;
  baseQuantity: number;
  wastePercentage: number;
  pricePerUnit: number | null;
  roundingRule: "ceil" | "none";
}): ScreedingMaterialBreakdown {
  const wasteFraction =
    Math.max(0, Math.min(100, params.wastePercentage)) / 100;
  const wasteQuantity = params.baseQuantity * wasteFraction;
  const finalQuantity = params.baseQuantity + wasteQuantity;
  const purchaseQuantity =
    params.roundingRule === "ceil"
      ? Math.max(0, Math.ceil(finalQuantity))
      : Math.max(0, finalQuantity);
  const totalCost =
    params.pricePerUnit != null && params.pricePerUnit > 0
      ? purchaseQuantity * params.pricePerUnit
      : null;

  return {
    name: params.name,
    unit: params.unit,
    baseQuantity: round(params.baseQuantity),
    wastePercentage: params.wastePercentage,
    wasteQuantity: round(wasteQuantity),
    finalQuantity: round(finalQuantity),
    purchaseQuantity,
    pricePerUnit: params.pricePerUnit ?? null,
    totalCost: totalCost != null ? round(totalCost) : null,
  };
}

/**
 * Calculate Putty screeding requirements.
 *
 * Model: the admin-configured ratio (e.g. 2 buckets per 12 m²) describes the
 * COMPLETE standard job at the default coat count, it already includes the
 * standard number of coats. The quantity therefore scales linearly with area
 * only, at the default coats. Selecting a number of coats DIFFERENT from the
 * admin default scales the requirement proportionally relative to that
 * default (e.g. 3 coats vs a 2-coat default = ×1.5). Waste is applied after.
 *
 * @param areaM2 - Total screeding surface area in m²
 * @param config - Admin-configured Putty system configuration
 * @param coats - Number of coats (defaults to config.defaultCoats)
 * @returns ScreedingPuttyResult with full breakdown
 */
export function calculateScreedingPutty(
  areaM2: number,
  config: ScreedingSystemConfig,
  coats?: number,
): ScreedingPuttyResult {
  const area = Math.max(0, areaM2);
  const defaultCoats = Math.max(1, config.defaultCoats);
  const effectiveCoats = Math.max(1, coats ?? defaultCoats);
  const coverage = Math.max(0.01, config.coverageAreaM2);
  const puttyQty = config.puttyQuantity ?? 0;
  const wastePct = config.wastePercentage;

  // Base units = (area / coverage) × puttyQuantity × (coats / defaultCoats).
  // At the admin default coats the factor is exactly 1, the configured
  // ratio (e.g. 2 buckets per 12 m²) is taken verbatim.
  const coatFactor = effectiveCoats / defaultCoats;
  const baseUnits = (area / coverage) * puttyQty * coatFactor;

  const putty = buildMaterialBreakdown({
    name: config.puttyName ?? "Putty",
    unit: config.puttyUnit ?? "bucket",
    baseQuantity: baseUnits,
    wastePercentage: wastePct,
    pricePerUnit: config.puttyPricePerUnit,
    roundingRule: config.roundingRule,
  });

  const materialCost = putty.totalCost ?? null;

  return {
    systemType: "putty",
    netScreedingArea: round(area),
    coats: effectiveCoats,
    coverageAreaM2: coverage,
    putty,
    materialCost,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
  };
}

/**
 * Calculate White Cement + Screeding Paint requirements.
 *
 * Model: the admin-configured ratio (e.g. 2 paint buckets + 1 cement bag per
 * 20 m²) describes the COMPLETE standard job at the default coat count, it
 * already includes the standard number of coats. Quantities scale linearly
 * with area at the default coats. Selecting a number of coats DIFFERENT from
 * the admin default scales requirements proportionally relative to that
 * default. Waste is applied to each material independently.
 *
 * @param areaM2 - Total screeding surface area in m²
 * @param config - Admin-configured White Cement + Paint system configuration
 * @param coats - Number of coats (defaults to config.defaultCoats)
 * @returns ScreedingMixSystemResult with separate paint and cement breakdowns
 */
export function calculateScreedingMixSystem(
  areaM2: number,
  config: ScreedingSystemConfig,
  coats?: number,
): ScreedingMixSystemResult {
  const area = Math.max(0, areaM2);
  const defaultCoats = Math.max(1, config.defaultCoats);
  const effectiveCoats = Math.max(1, coats ?? defaultCoats);
  const coverage = Math.max(0.01, config.coverageAreaM2);
  const paintQty = config.paintQuantity ?? 0;
  const cementQty = config.cementQuantity ?? 0;
  // Optional third material (e.g. Bond), only participates when the admin
  // has enabled it AND given it a name+quantity; dormant otherwise.
  const extraActive =
    config.extraEnabled === true &&
    config.extraName != null &&
    (config.extraQuantity ?? 0) > 0;
  const extraQty = extraActive ? (config.extraQuantity ?? 0) : 0;
  const wastePct = config.wastePercentage;

  // Base units = (area / coverage) × materialQuantity × (coats / defaultCoats).
  // At the admin default coats the factor is exactly 1, the configured ratio
  // is taken verbatim.
  const coatFactor = effectiveCoats / defaultCoats;
  const baseUnits = area / coverage;
  const basePaint = baseUnits * paintQty * coatFactor;
  const baseCement = baseUnits * cementQty * coatFactor;
  const baseExtra = baseUnits * extraQty * coatFactor;

  const paint = buildMaterialBreakdown({
    name: config.paintName ?? "Screeding Paint",
    unit: config.paintUnit ?? "bucket",
    baseQuantity: basePaint,
    wastePercentage: wastePct,
    pricePerUnit: config.paintPricePerUnit,
    roundingRule: config.roundingRule,
  });

  const cement = buildMaterialBreakdown({
    name: config.cementName ?? "White Cement",
    unit: config.cementUnit ?? "bag",
    baseQuantity: baseCement,
    wastePercentage: wastePct,
    pricePerUnit: config.cementPricePerUnit,
    roundingRule: config.roundingRule,
  });

  const extra = extraActive
    ? buildMaterialBreakdown({
        name: config.extraName as string,
        unit: config.extraUnit ?? "bucket",
        baseQuantity: baseExtra,
        wastePercentage: wastePct,
        pricePerUnit: config.extraPricePerUnit ?? null,
        roundingRule: config.roundingRule,
      })
    : null;

  const paintCost = paint.totalCost ?? 0;
  const cementCost = cement.totalCost ?? 0;
  const extraCost = extra?.totalCost ?? 0;
  const pricedParts = [paint.totalCost, cement.totalCost, extra?.totalCost];
  const hasAnyPrice = pricedParts.some((c) => c != null);
  const materialCost = hasAnyPrice
    ? round(paintCost + cementCost + extraCost)
    : null;

  return {
    systemType: "white_cement_paint",
    netScreedingArea: round(area),
    coats: effectiveCoats,
    coverageAreaM2: coverage,
    wastePercentage: wastePct,
    paint,
    cement,
    extra,
    materialCost,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
  };
}

/**
 * Dispatch to the correct screeding calculation function based on system type.
 */
export function calculateScreedingSystem(
  areaM2: number,
  config: ScreedingSystemConfig,
  coats?: number,
): ScreedingSystemResult {
  if (config.systemType === "putty") {
    return calculateScreedingPutty(areaM2, config, coats);
  }
  return calculateScreedingMixSystem(areaM2, config, coats);
}

/**
 * Convert a DbScreedingSystemConfig to the app-level ScreedingSystemConfig.
 */
export function dbToSystemConfig(db: {
  system_type: "putty" | "white_cement_paint";
  display_name: string;
  description: string | null;
  coverage_area_m2: number;
  coverage_unit: string;
  default_coats: number;
  waste_percentage: number;
  currency: string;
  currency_symbol: string;
  putty_name: string | null;
  putty_quantity: number | null;
  putty_unit: string | null;
  putty_price_per_unit: number | null;
  paint_name: string | null;
  paint_quantity: number | null;
  paint_unit: string | null;
  paint_price_per_unit: number | null;
  cement_name: string | null;
  cement_quantity: number | null;
  cement_unit: string | null;
  cement_price_per_unit: number | null;
  // Optional: rows/configs created before Phase 37 have no extra_* columns
  //, treat them as "extra material disabled".
  extra_enabled?: boolean | null;
  extra_name?: string | null;
  extra_quantity?: number | null;
  extra_unit?: string | null;
  extra_price_per_unit?: number | null;
  rounding_rule: "ceil" | "none";
}): ScreedingSystemConfig {
  return {
    systemType: db.system_type,
    displayName: db.display_name,
    description: db.description,
    coverageAreaM2: Number(db.coverage_area_m2),
    coverageUnit: db.coverage_unit,
    defaultCoats: Number(db.default_coats),
    wastePercentage: Number(db.waste_percentage),
    currency: db.currency,
    currencySymbol: db.currency_symbol,
    puttyName: db.putty_name,
    puttyQuantity: db.putty_quantity != null ? Number(db.putty_quantity) : null,
    puttyUnit: db.putty_unit,
    puttyPricePerUnit:
      db.putty_price_per_unit != null ? Number(db.putty_price_per_unit) : null,
    paintName: db.paint_name,
    paintQuantity: db.paint_quantity != null ? Number(db.paint_quantity) : null,
    paintUnit: db.paint_unit,
    paintPricePerUnit:
      db.paint_price_per_unit != null ? Number(db.paint_price_per_unit) : null,
    cementName: db.cement_name,
    cementQuantity:
      db.cement_quantity != null ? Number(db.cement_quantity) : null,
    cementUnit: db.cement_unit,
    cementPricePerUnit:
      db.cement_price_per_unit != null
        ? Number(db.cement_price_per_unit)
        : null,
    extraEnabled: db.extra_enabled === true,
    extraName: db.extra_name,
    extraQuantity: db.extra_quantity != null ? Number(db.extra_quantity) : null,
    extraUnit: db.extra_unit,
    extraPricePerUnit:
      db.extra_price_per_unit != null ? Number(db.extra_price_per_unit) : null,
    roundingRule: db.rounding_rule,
  };
}

// ─────────────────────────────────────────────────────────
// Advanced Calculator
// ─────────────────────────────────────────────────────────

export interface AdvancedCalcInput {
  netArea: number;
  thickness: number; // mm
  coats: number;
  mixRatio: string;
  paintCoverageRateM2PerL: number;
  paintBucketSizeL: number;
  paintPricePerBucket: number;
  cementRatioKgPerL: number;
  cementBagSizeKg: number;
  cementPricePerBag: number;
  labourRatePerSqm: number;
  transportCost: number;
  wastePercentage: number;
  markupPercentage: number;
  profitPercentage: number;
  taxPercentage: number;
  currency: string;
  currencySymbol: string;
}

export function calculateAdvancedEstimate(
  input: AdvancedCalcInput,
): AdvancedEstimateData {
  const area = Math.max(0, input.netArea);
  const wasteFraction = Math.max(0, Math.min(100, input.wastePercentage)) / 100;
  const markupFraction = Math.max(0, input.markupPercentage) / 100;
  const profitFraction = Math.max(0, input.profitPercentage) / 100;
  const taxFraction = Math.max(0, Math.min(100, input.taxPercentage)) / 100;

  const coatMultiplier = Math.max(1, input.coats);
  const thicknessFactor = Math.max(1, input.thickness / 10); // relative to 10mm baseline

  const basePaintLiters =
    (area * coatMultiplier * thicknessFactor) /
    Math.max(0.01, input.paintCoverageRateM2PerL);
  const paintLiters = basePaintLiters * (1 + wasteFraction);
  const paintBuckets = Math.ceil(
    paintLiters / Math.max(0.01, input.paintBucketSizeL),
  );
  const paintCost = paintBuckets * input.paintPricePerBucket;

  const cementKg = paintLiters * input.cementRatioKgPerL;
  const cementBags = Math.ceil(
    cementKg / Math.max(0.01, input.cementBagSizeKg),
  );
  const cementCost = cementBags * input.cementPricePerBag;

  const materialCost = paintCost + cementCost;
  const labourCost = 0; // Labour not included, negotiated separately
  const transportCost = Math.max(0, input.transportCost);
  // Extract the waste portion from the already-waste-adjusted materialCost.
  // wasteAmount = materialCost × (wasteFraction / (1 + wasteFraction))
  const wasteAmount = materialCost * (wasteFraction / (1 + wasteFraction));
  // materialCost already includes waste (paintLiters = base × 1+waste%).
  // wasteAmount is informational only, represents the waste portion of materialCost.
  const subtotal = materialCost + transportCost;
  const markupAmount = subtotal * markupFraction;
  const profitAmount = (subtotal + markupAmount) * profitFraction;
  const preTax = subtotal + markupAmount + profitAmount;
  const taxAmount = preTax * taxFraction;
  const grandTotal = preTax + taxAmount;

  const lineItems: AdvancedEstimateLineItem[] = [
    {
      label: "Screeding Paint (20 L Buckets)",
      quantity: paintBuckets,
      unit: "bucket(s)",
      unitPrice: input.paintPricePerBucket,
      total: round(paintCost),
    },
    {
      label: "White Cement (40 kg Bags)",
      quantity: cementBags,
      unit: "bag(s)",
      unitPrice: input.cementPricePerBag,
      total: round(cementCost),
    },
    // Labour not included, negotiated separately
    {
      label: "Transport & Logistics",
      quantity: 1,
      unit: "trip",
      unitPrice: transportCost,
      total: round(transportCost),
    },
  ];

  return {
    projectType: "screeding",
    netArea: round(area),
    thickness: input.thickness,
    coats: input.coats,
    mixRatio: input.mixRatio,
    paintLiters: round(paintLiters),
    paintBuckets,
    cementKg: round(cementKg),
    cementBags,
    lineItems,
    materialCost: round(materialCost),
    labourCost: round(labourCost),
    transportCost: round(transportCost),
    wastePercentage: input.wastePercentage,
    wasteAmount: round(wasteAmount),
    markupPercentage: input.markupPercentage,
    markupAmount: round(markupAmount),
    profitPercentage: input.profitPercentage,
    profitAmount: round(profitAmount),
    taxPercentage: input.taxPercentage,
    taxAmount: round(taxAmount),
    grandTotal: round(grandTotal),
    currency: input.currency,
    currencySymbol: input.currencySymbol,
    notes: "",
    aiRecommendations: [],
  };
}

// Backward-compatible alias.
export const calculateCost = calculateEstimatedTotal;

// ─────────────────────────────────────────────────────────
// Validation helpers, project-type-aware
// ─────────────────────────────────────────────────────────

export function validateCalculatorInput(
  input: CalculatorInput,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.projectType) errors.projectType = "Select a project type";
  if (input.length <= 0 || !isFinite(input.length))
    errors.length = "Enter a valid length greater than 0";
  // Width is optional for all project types. When left blank, only the two
  // walls defined by length are calculated. Fence projects never use width.
  if (input.wallHeight <= 0 || !isFinite(input.wallHeight))
    errors.wallHeight = "Enter a valid wall height greater than 0";
  if (input.doors < 0 || !isFinite(input.doors))
    errors.doors = "Doors cannot be negative";
  if (input.windows < 0 || !isFinite(input.windows))
    errors.windows = "Windows cannot be negative";
  if (input.coats < 1 || !isFinite(input.coats))
    errors.coats = "Enter at least 1 coat";
  if (
    input.wasteMargin < 0 ||
    input.wasteMargin > 100 ||
    !isFinite(input.wasteMargin)
  )
    errors.wasteMargin = "Waste margin must be between 0 and 100";
  return errors;
}

// ─────────────────────────────────────────────────────────
// Rounding
// ─────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
