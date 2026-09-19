/**
 * FRELUX Phase 3, Tyrolene Estimation Engine
 *
 * Partition-based Tyrolene estimator. Uses the Phase 1 estimation infrastructure
 * (products, materials, prices, calc rules, pack sizing, validation, adjustments).
 *
 * Key principles:
 * - Partition-based: primary input is number of standard partitions
 * - Material ratio is per 4 standard partitions (verified FRELUX rule)
 * - Theoretical vs practical purchase quantity are ALWAYS shown separately
 * - Fractional partitions are supported (theoretical quantities preserved)
 * - Actual partition dimensions scale via equivalent standard partitions
 * - Multiple partition types are combined into total equivalent partitions
 * - No quality levels (single Tyrolene product configuration)
 * - No labour calculation (negotiated separately)
 * - Exterior only
 * - All business values come from database configuration (never hardcoded)
 * - Price snapshots preserved on estimates (historical estimates unaffected by price changes)
 * - Calc versioning: old estimates retain their calculation version
 */

import type {
  EstimationProduct,
  EstimationMaterial,
  EstimationPrice,
  EstimationCalcRule,
  EstimationPackSize,
  ValidationResult,
  EstimateLineItemInput,
} from '@/types/estimation';

import {
  validateQuantity,
  validateDimensions,
  createValidationResult,
} from './validation';

import { roundPackQuantity } from './pack-sizing';

import {
  createPriceSnapshot,
  calculateLineTotal,
  formatCurrency,
  isPriceConfigured,
} from './pricing';

// =========================================================
// Types
// =========================================================

/** A single partition type entry (e.g., "Type A, 10 partitions, 3m × 2.5m") */
export interface PartitionTypeInput {
  id: string;
  label: string;
  quantity: number;
  width: number;   // in metres
  height: number;  // in metres
}

/** Main input for the Tyrolene calculator */
export interface TyroleneProjectInput {
  /** Partition types with actual dimensions. If empty, uses standard_partition_count. */
  partition_types: PartitionTypeInput[];
  /** Direct count of standard partitions (used when no actual dimensions are provided) */
  standard_partition_count: number | null;
  currency: string;
  user_id: string | null;
  client_hash: string | null;
  project_description: string;
  customer_location: 'owerri' | 'outside_owerri' | 'unknown';
}

/** Material ratio entry from the calc rule */
export interface MaterialRatioEntry {
  slug: string;
  quantity: number;
  unit: string;
}

/** Parsed material ratio config */
export interface TyroleneMaterialRatio {
  partitions_per_ratio: number;
  materials: MaterialRatioEntry[];
}

/** Standard partition dimensions */
export interface StandardPartitionDimensions {
  width: number | null;
  height: number | null;
}

/** Per-material calculation result */
export interface TyroleneMaterialResult {
  material_slug: string;
  material_name: string;
  theoretical_quantity: number;
  theoretical_unit: string;
  practical_purchase_quantity: number;
  pack_size: number;
  pack_count: number;
  leftover_quantity: number;
  unit_price: number;
  total_price: number;
  price_snapshot: unknown;
  rounding_rule: string;
  calculation_source: 'calculated' | 'manual' | 'adjusted' | 'negotiated';
}

/** Calculation transparency step */
export interface TyroleneCalcStep {
  label: string;
  value: string;
  detail?: string;
}

/** Full Tyrolene estimate result */
export interface TyroleneEstimateResult {
  // Partition info
  standard_partition_count: number;
  equivalent_standard_partitions: number;
  has_dimensional_adjustment: boolean;
  partition_breakdown: Array<{
    label: string;
    quantity: number;
    width: number;
    height: number;
    area: number;
    equivalent_partitions: number;
  }>;
  // Standard partition config used
  standard_partition_width: number | null;
  standard_partition_height: number | null;
  // Material ratio used
  material_ratio: TyroleneMaterialRatio;
  // Material results
  materials: TyroleneMaterialResult[];
  // Costs
  theoretical_material_cost: number;
  practical_purchase_cost: number;
  currency: string;
  // Line items (for saving estimate)
  line_items: EstimateLineItemInput[];
  // Labour
  labour_note: string;
  // Production
  production_eligible: boolean;
  production_message: string;
  production_min_required: number;
  production_min_configured: boolean;
  // Transparency
  calculation_steps: TyroleneCalcStep[];
  // Warnings & errors
  warnings: string[];
  recommendations: string[];
  valid: boolean;
  errors: string[];
  // Versioning
  calc_version_id: string | null;
  // Product
  product: EstimationProduct | null;
}

/** Production rule row (same structure as painting engine) */
export interface ProductionRuleRow {
  product_category: string;
  quality_slug: string | null;
  location_rule: string;
  min_quantity: number;
  is_active: boolean;
}

/** Configuration passed into the calculation */
export interface TyroleneCalcConfig {
  product: EstimationProduct | null;
  materials: EstimationMaterial[];
  prices: Map<string, EstimationPrice>;   // keyed by material slug
  packSizes: Map<string, EstimationPackSize>; // keyed by material slug
  calcRules: Map<string, EstimationCalcRule>;
  productionRules: ProductionRuleRow[];
  calcVersionId: string | null;
}

// =========================================================
// Constants
// =========================================================

const CALCULATOR_TYPE = 'tyrolene';
const TYROLENE_CATEGORY = 'tyrolene';

// Material slug constants
const MATERIAL_SLUGS = ['cement', 'sand', 'acrylic-bond', 'water-seal', 'anti-fungal'] as const;

// =========================================================
// Config Parsing
// =========================================================

/**
 * Parses the material ratio from the calc rule.
 * Falls back to the verified FRELUX ratio if the rule is malformed.
 */
export function parseMaterialRatio(
  rule: EstimationCalcRule | null
): TyroleneMaterialRatio {
  if (!rule || !rule.rule_value) {
    // Fallback to verified FRELUX ratio (should not normally happen)
    return {
      partitions_per_ratio: 4,
      materials: [
        { slug: 'cement', quantity: 1, unit: 'bags' },
        { slug: 'sand', quantity: 6, unit: 'bags' },
        { slug: 'acrylic-bond', quantity: 3, unit: 'kg' },
        { slug: 'water-seal', quantity: 1, unit: 'kg' },
        { slug: 'anti-fungal', quantity: 0.5, unit: 'kg' },
      ],
    };
  }

  const val = rule.rule_value as Record<string, unknown>;
  const partitionsPerRatio = typeof val.partitions_per_ratio === 'number' ? val.partitions_per_ratio : 4;
  const rawMaterials = Array.isArray(val.materials) ? val.materials : [];

  const materials: MaterialRatioEntry[] = rawMaterials
    .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
    .map((m) => ({
      slug: String(m.slug ?? ''),
      quantity: typeof m.quantity === 'number' ? m.quantity : 0,
      unit: String(m.unit ?? ''),
    }))
    .filter((m) => m.slug !== '' && m.quantity > 0);

  return { partitions_per_ratio: partitionsPerRatio, materials };
}

/**
 * Parses the standard partition dimensions from the calc rule.
 * Returns nulls if not yet configured (admin must set these).
 */
export function parseStandardPartition(
  rule: EstimationCalcRule | null
): StandardPartitionDimensions {
  if (!rule || !rule.rule_value) {
    return { width: null, height: null };
  }

  const val = rule.rule_value as Record<string, unknown>;
  const width = typeof val.width === 'number' && val.width > 0 ? val.width : null;
  const height = typeof val.height === 'number' && val.height > 0 ? val.height : null;

  return { width, height };
}

/**
 * Gets the purchase rounding rule for Tyrolene.
 */
export function getRoundingRule(
  rule: EstimationCalcRule | null
): string {
  if (!rule || !rule.rule_value) return 'ceil';
  const val = rule.rule_value as Record<string, unknown>;
  const ruleStr = typeof val.rule === 'string' ? val.rule : 'ceil';
  return ruleStr;
}

// =========================================================
// Core Calculation Functions
// =========================================================

/**
 * Calculates the area of a single partition: width × height.
 */
export function calculatePartitionArea(widthM: number, heightM: number): number {
  const w = Math.max(0, widthM);
  const h = Math.max(0, heightM);
  return Math.round(w * h * 10000) / 10000;
}

/**
 * Calculates the standard partition area.
 * Returns null if dimensions are not configured.
 */
export function calculateStandardPartitionArea(
  standard: StandardPartitionDimensions
): number | null {
  if (standard.width === null || standard.height === null) return null;
  if (standard.width <= 0 || standard.height <= 0) return null;
  return calculatePartitionArea(standard.width, standard.height);
}

/**
 * Calculates equivalent standard partitions from actual partition dimensions.
 * Formula: total actual area / standard partition area = equivalent partitions
 */
export function calculateEquivalentPartitions(
  partitionTypes: PartitionTypeInput[],
  standardArea: number
): { equivalent: number; breakdown: Array<{ label: string; quantity: number; width: number; height: number; area: number; equivalent_partitions: number }> } {
  if (standardArea <= 0) {
    return { equivalent: 0, breakdown: [] };
  }

  let totalEquivalent = 0;
  const breakdown: Array<{ label: string; quantity: number; width: number; height: number; area: number; equivalent_partitions: number }> = [];

  for (const pt of partitionTypes) {
    const safeQty = Math.max(0, pt.quantity);
    const area = calculatePartitionArea(pt.width, pt.height);
    const totalArea = area * safeQty;
    const equivalent = totalArea / standardArea;
    totalEquivalent += equivalent;

    breakdown.push({
      label: pt.label || 'Partition',
      quantity: safeQty,
      width: pt.width,
      height: pt.height,
      area,
      equivalent_partitions: Math.round(equivalent * 10000) / 10000,
    });
  }

  return {
    equivalent: Math.round(totalEquivalent * 10000) / 10000,
    breakdown,
  };
}

/**
 * Calculates theoretical material quantity for a given number of equivalent partitions.
 * Formula: (equivalent_partitions / partitions_per_ratio) × material_quantity_per_ratio
 */
export function calculateTheoreticalMaterialQuantity(
  equivalentPartitions: number,
  ratioEntry: MaterialRatioEntry,
  partitionsPerRatio: number
): number {
  if (partitionsPerRatio <= 0) return 0;
  const safePartitions = Math.max(0, equivalentPartitions);
  const ratio = safePartitions / partitionsPerRatio;
  return Math.round(ratio * ratioEntry.quantity * 10000) / 10000;
}

// =========================================================
// Validation
// =========================================================

/**
 * Validates Tyrolene project input.
 */
export function validateTyroleneInput(
  input: TyroleneProjectInput,
  config: TyroleneCalcConfig
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if any partition input is provided
  const hasPartitionTypes = input.partition_types.length > 0 && input.partition_types.some(pt => pt.quantity > 0);
  const hasStandardCount = input.standard_partition_count !== null && input.standard_partition_count > 0;

  if (!hasPartitionTypes && !hasStandardCount) {
    errors.push('At least one partition input is required (either standard partition count or actual partition dimensions).');
  }

  // Validate partition types
  for (const pt of input.partition_types) {
    if (pt.quantity > 0) {
      const qtyValidation = validateQuantity(pt.quantity, `Partition quantity for ${pt.label || 'partition'}`);
      if (!qtyValidation.valid) errors.push(...qtyValidation.errors);

      const dimValidation = validateDimensions({ width: pt.width, height: pt.height });
      if (!dimValidation.valid) errors.push(...dimValidation.errors);
    }
  }

  // Validate standard partition count
  if (input.standard_partition_count !== null && input.standard_partition_count < 0) {
    errors.push('Standard partition count cannot be negative.');
  }

  // Check product
  if (!config.product) {
    errors.push('Tyrolene product is not configured. Contact FRELUX admin.');
  } else if (!config.product.is_active) {
    errors.push('Tyrolene product is currently inactive.');
  }

  // Check standard partition dimensions
  const standardPartition = parseStandardPartition(
    config.calcRules.get('standard_partition_dimensions') ?? null
  );
  if (hasPartitionTypes) {
    if (standardPartition.width === null || standardPartition.height === null) {
      errors.push('Standard partition dimensions are not configured. Accurate Tyrolene calculation with actual dimensions requires FRELUX admin to configure the standard partition width and height.');
    }
  }

  // Check material ratio
  const materialRatio = parseMaterialRatio(
    config.calcRules.get('material_ratio') ?? null
  );
  if (materialRatio.materials.length === 0) {
    errors.push('Tyrolene material ratio is not configured. Contact FRELUX admin.');
  }

  // Check each material has a price
  for (const mat of materialRatio.materials) {
    const price = config.prices.get(mat.slug);
    if (!price || !isPriceConfigured(price.price)) {
      warnings.push(`Material '${mat.slug}' does not have a configured price. Material cost will be incomplete until FRELUX admin configures the price.`);
    }
  }

  // Check each material has a pack size
  for (const mat of materialRatio.materials) {
    const packSize = config.packSizes.get(mat.slug);
    if (!packSize) {
      warnings.push(`Material '${mat.slug}' does not have a configured pack size. Practical purchase quantity may not be accurate.`);
    }
  }

  if (config.calcVersionId === null) {
    warnings.push('No active calculation version found for Tyrolene. The estimate may not be versioned correctly.');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

// =========================================================
// Production Eligibility
// =========================================================

/**
 * Checks production eligibility for Tyrolene.
 * Owerri: no minimum (always eligible).
 * Outside Owerri: checks configured minimum. If no minimum is configured, indicates that eligibility cannot be determined.
 */
export function checkTyroleneProductionEligibility(
  customerLocation: 'owerri' | 'outside_owerri' | 'unknown',
  requiredPartitions: number,
  productionRules: ProductionRuleRow[]
): {
  eligible: boolean;
  message: string;
  min_required: number;
  min_configured: boolean;
} {
  // Owerri: no minimum
  if (customerLocation === 'owerri') {
    return {
      eligible: true,
      message: 'FRELUX Tyrolene production is available with no minimum quantity for clients in Owerri.',
      min_required: 0,
      min_configured: true,
    };
  }

  // Outside Owerri or unknown: check for configured minimum
  const locationRule = 'outside_owerri';
  const rule = productionRules.find(
    (r) =>
      r.product_category === TYROLENE_CATEGORY &&
      r.quality_slug === null &&
      r.location_rule === locationRule &&
      r.is_active
  );

  if (!rule) {
    // No minimum configured, do NOT invent one
    return {
      eligible: false,
      message: 'Tyrolene production eligibility for locations outside Owerri cannot be determined, the production minimum has not been configured. Contact FRELUX to confirm production availability.',
      min_required: 0,
      min_configured: false,
    };
  }

  const minRequired = rule.min_quantity;

  if (requiredPartitions >= minRequired) {
    return {
      eligible: true,
      message: `FRELUX Tyrolene production is available. Required quantity (${requiredPartitions} partitions) meets the minimum (${minRequired} partitions).`,
      min_required: minRequired,
      min_configured: true,
    };
  }

  return {
    eligible: false,
    message: `FRELUX Tyrolene production is currently available for this order only if the required production quantity meets the applicable minimum (${minRequired} partitions). You may purchase from an external producer.`,
    min_required: minRequired,
    min_configured: true,
  };
}

// =========================================================
// Full Project Calculation
// =========================================================

/**
 * Calculates the complete Tyrolene estimate.
 *
 * Process:
 * 1. Determine equivalent standard partitions
 * 2. Parse material ratio from config
 * 3. Calculate theoretical material quantities (preserved, not rounded)
 * 4. Apply material-specific pack rounding for practical purchase quantities
 * 5. Calculate material costs using current prices
 * 6. Check production eligibility
 * 7. Generate calculation steps for transparency
 */
export function calculateTyroleneProject(
  input: TyroleneProjectInput,
  config: TyroleneCalcConfig
): TyroleneEstimateResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const recommendations: string[] = [];
  const calcSteps: TyroleneCalcStep[] = [];
  const lineItems: EstimateLineItemInput[] = [];

  // ── Validate ──
  const validation = validateTyroleneInput(input, config);
  warnings.push(...validation.warnings);
  errors.push(...validation.errors);

  // ── Parse config ──
  const standardPartition = parseStandardPartition(
    config.calcRules.get('standard_partition_dimensions') ?? null
  );
  const materialRatio = parseMaterialRatio(
    config.calcRules.get('material_ratio') ?? null
  );
  const roundingRule = getRoundingRule(
    config.calcRules.get('purchase_rounding_rule') ?? null
  );
  const standardArea = calculateStandardPartitionArea(standardPartition);

  // ── Determine equivalent standard partitions ──
  let equivalentPartitions = 0;
  let standardCount = 0;
  let hasDimensionalAdjustment = false;
  let partitionBreakdown: TyroleneEstimateResult['partition_breakdown'] = [];

  const hasActualDimensions = input.partition_types.some(pt => pt.quantity > 0);

  if (hasActualDimensions && standardArea !== null) {
    // Use actual dimensions → calculate equivalent partitions
    const result = calculateEquivalentPartitions(input.partition_types.filter(pt => pt.quantity > 0), standardArea);
    equivalentPartitions = result.equivalent;
    standardCount = Math.round(equivalentPartitions * 100) / 100;
    hasDimensionalAdjustment = true;
    partitionBreakdown = result.breakdown;

    calcSteps.push({
      label: 'Actual Partition Dimensions',
      value: `${input.partition_types.filter(pt => pt.quantity > 0).length} partition type(s) provided`,
      detail: partitionBreakdown.map(b =>
        `${b.label}: ${b.quantity} × ${b.width}m × ${b.height}m = ${b.area}m² each → ${b.equivalent_partitions} equivalent`
      ).join('; '),
    });

    calcSteps.push({
      label: 'Standard Partition Area',
      value: `${standardArea} m²`,
      detail: `Standard partition: ${standardPartition.width}m × ${standardPartition.height}m`,
    });

    calcSteps.push({
      label: 'Total Actual Area',
      value: `${Math.round(partitionBreakdown.reduce((sum, b) => sum + b.area * b.quantity, 0) * 100) / 100} m²`,
      detail: 'Sum of all partition type areas',
    });

    calcSteps.push({
      label: 'Equivalent Standard Partitions',
      value: `${equivalentPartitions}`,
      detail: 'Total actual area ÷ standard partition area',
    });
  } else if (input.standard_partition_count !== null && input.standard_partition_count > 0) {
    // Direct standard partition count
    equivalentPartitions = input.standard_partition_count;
    standardCount = input.standard_partition_count;
    hasDimensionalAdjustment = false;

    calcSteps.push({
      label: 'Standard Partition Count',
      value: `${equivalentPartitions}`,
      detail: 'Entered directly, no dimensional adjustment applied',
    });
  } else if (hasActualDimensions && standardArea === null) {
    // Actual dimensions provided but standard partition not configured
    errors.push('Accurate Tyrolene calculation unavailable until the required FRELUX configuration is completed. Standard partition dimensions must be configured by FRELUX admin to use actual partition dimensions.');
  }

  // ── Calculate material quantities ──
  const materialResults: TyroleneMaterialResult[] = [];

  if (equivalentPartitions > 0 && materialRatio.materials.length > 0) {
    calcSteps.push({
      label: 'Material Ratio',
      value: `Per ${materialRatio.partitions_per_ratio} standard partitions`,
      detail: materialRatio.materials.map(m => `${m.slug}: ${m.quantity} ${m.unit}`).join(', '),
    });

    calcSteps.push({
      label: 'Scaling Factor',
      value: `${equivalentPartitions} ÷ ${materialRatio.partitions_per_ratio} = ${Math.round((equivalentPartitions / materialRatio.partitions_per_ratio) * 10000) / 10000}`,
      detail: 'Equivalent partitions ÷ partitions per ratio',
    });

    for (const ratioEntry of materialRatio.materials) {
      const material = config.materials.find(m => m.slug === ratioEntry.slug);
      const price = config.prices.get(ratioEntry.slug);
      const packSize = config.packSizes.get(ratioEntry.slug);

      // Theoretical quantity (preserved exactly)
      const theoreticalQty = calculateTheoreticalMaterialQuantity(
        equivalentPartitions,
        ratioEntry,
        materialRatio.partitions_per_ratio
      );

      // Practical purchase quantity (apply pack rounding)
      let practicalQty = theoreticalQty;
      let packCount = 0;
      let leftoverQty = 0;
      let effectivePackSize = 1;
      let effectiveRoundingRule = roundingRule;

      if (packSize && packSize.pack_size > 0) {
        effectivePackSize = packSize.pack_size;
        effectiveRoundingRule = packSize.rounding_rule || roundingRule;
        const roundingResult = roundPackQuantity(
          theoreticalQty,
          effectivePackSize,
          effectiveRoundingRule
        );
        practicalQty = roundingResult.practical_purchase_quantity;
        packCount = roundingResult.pack_count;
        leftoverQty = roundingResult.leftover_quantity;
      } else {
        // No pack size configured, use rounding rule only
        if (roundingRule === 'ceil' && theoreticalQty > 0) {
          practicalQty = Math.ceil(theoreticalQty);
        }
        practicalQty = Math.round(practicalQty * 10000) / 10000;
      }

      // Price
      const unitPrice = price && isPriceConfigured(price.price) ? price.price : 0;
      const totalPrice = calculateLineTotal(unitPrice, practicalQty);

      const priceSnapshot = price
        ? createPriceSnapshot(
            price.price,
            material?.name ?? ratioEntry.slug,
            effectivePackSize,
            ratioEntry.unit,
            {
              priceType: 'material',
              refId: price.ref_id,
              currency: input.currency,
              priceId: price.id,
              effectiveDate: price.effective_date,
            }
          )
        : createPriceSnapshot(0, material?.name ?? ratioEntry.slug, effectivePackSize, ratioEntry.unit, {
            priceType: 'material',
            refId: '',
            currency: input.currency,
            priceId: '',
            effectiveDate: new Date().toISOString().split('T')[0],
          });

      materialResults.push({
        material_slug: ratioEntry.slug,
        material_name: material?.name ?? ratioEntry.slug,
        theoretical_quantity: theoreticalQty,
        theoretical_unit: ratioEntry.unit,
        practical_purchase_quantity: practicalQty,
        pack_size: effectivePackSize,
        pack_count: packCount,
        leftover_quantity: leftoverQty,
        unit_price: unitPrice,
        total_price: totalPrice,
        price_snapshot: priceSnapshot,
        rounding_rule: effectiveRoundingRule,
        calculation_source: 'calculated',
      });

      // Create line item for estimate saving
      lineItems.push({
        item_name: `${material?.name ?? ratioEntry.slug}`,
        item_type: 'material',
        material_id: material?.id ?? undefined,
        quantity_required: theoreticalQty,
        practical_purchase_qty: practicalQty,
        unit: ratioEntry.unit,
        pack_size: effectivePackSize,
        unit_price: unitPrice,
        total_price: totalPrice,
        price_snapshot: priceSnapshot,
        calculation_source: 'calculated',
        notes: `${theoreticalQty} ${ratioEntry.unit} theoretical → ${practicalQty} ${ratioEntry.unit} practical (${packCount} pack(s) × ${effectivePackSize})`,
      });
    }
  }

  // ── Costs ──
  const theoreticalMaterialCost = materialResults.reduce((sum, m) => {
    return sum + calculateLineTotal(m.unit_price, m.theoretical_quantity);
  }, 0);

  const practicalPurchaseCost = materialResults.reduce((sum, m) => sum + m.total_price, 0);

  // ── Production eligibility ──
  const productionEligibility = checkTyroleneProductionEligibility(
    input.customer_location,
    equivalentPartitions,
    config.productionRules
  );

  // ── Labour note ──
  const labourNote = 'Labour: Not included, negotiated separately.';

  // ── Add calculation steps for materials ──
  for (const m of materialResults) {
    calcSteps.push({
      label: `${m.material_name}: Theoretical`,
      value: `${m.theoretical_quantity} ${m.theoretical_unit}`,
      detail: `(${equivalentPartitions} ÷ ${materialRatio.partitions_per_ratio}) × ratio quantity`,
    });

    calcSteps.push({
      label: `${m.material_name}: Practical Purchase`,
      value: `${m.practical_purchase_quantity} ${m.theoretical_unit}`,
      detail: `Rounded using ${m.rounding_rule} rule, pack size ${m.pack_size} → ${m.pack_count} pack(s)`,
    });
  }

  // ── Cost summary steps ──
  calcSteps.push({
    label: 'Theoretical Material Cost',
    value: formatCurrency(theoreticalMaterialCost, input.currency),
    detail: 'Cost if materials could be purchased in exact theoretical quantities',
  });

  calcSteps.push({
    label: 'Practical Purchase Cost',
    value: formatCurrency(practicalPurchaseCost, input.currency),
    detail: 'Cost based on practical purchase quantities (after pack rounding)',
  });

  // ── Recommendations ──
  if (!validation.valid) {
    recommendations.push('Contact FRELUX admin to complete the required configuration for accurate Tyrolene estimation.');
  }

  return {
    standard_partition_count: standardCount,
    equivalent_standard_partitions: equivalentPartitions,
    has_dimensional_adjustment: hasDimensionalAdjustment,
    partition_breakdown: partitionBreakdown,
    standard_partition_width: standardPartition.width,
    standard_partition_height: standardPartition.height,
    material_ratio: materialRatio,
    materials: materialResults,
    theoretical_material_cost: Math.round(theoreticalMaterialCost * 100) / 100,
    practical_purchase_cost: Math.round(practicalPurchaseCost * 100) / 100,
    currency: input.currency,
    line_items: lineItems,
    labour_note: labourNote,
    production_eligible: productionEligibility.eligible,
    production_message: productionEligibility.message,
    production_min_required: productionEligibility.min_required,
    production_min_configured: productionEligibility.min_configured,
    calculation_steps: calcSteps,
    warnings: [...new Set(warnings)],
    recommendations: [...new Set(recommendations)],
    valid: errors.length === 0,
    errors,
    calc_version_id: config.calcVersionId,
    product: config.product,
  };
}

// =========================================================
// Formatting helpers
// =========================================================

export function formatTyroleneCurrency(amount: number, currency = 'NGN'): string {
  return formatCurrency(amount, currency);
}

export { CALCULATOR_TYPE, MATERIAL_SLUGS };
