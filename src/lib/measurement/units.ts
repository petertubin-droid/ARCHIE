/**
 * FRELUX CENTRAL UNIT CONVERSION SERVICE
 *
 * Single source of truth for all measurement conversions across FRELUX.
 * Every calculator must use these functions, NO duplicate conversion logic.
 *
 * Principles:
 * - All internal calculations use METRES as the canonical length unit
 * - All internal area calculations use SQUARE METRES (m²) as the canonical area unit
 * - The user's original input unit is preserved for display
 * - Conversions are mathematically exact and deterministic
 * - No premature rounding, full precision retained internally
 */

// =========================================================
// Unit Types
// =========================================================

export type LengthUnit = 'feet' | 'meters' | 'inches';

/**
 * Area input units the user might choose directly.
 * Note: users typically enter length × width in a length unit, not as a pre-computed area.
 * But for flexibility, direct area entry is supported where applicable.
 */
export type AreaUnit = 'sqft' | 'sqm';

/**
 * Calculator context, determines which units are available to the user.
 * This is the context-aware unit selector (spec section 22).
 */
export type CalculatorContext =
  | 'painting'
  | 'screeding'
  | 'tiling'
  | 'grafitex'
  | 'block'
  | 'pop'
  | 'tyrolene'
  | 'fence_screeding'
  | 'fence_painting';

// =========================================================
// Conversion Constants (exact, per international definition)
// =========================================================

/** 1 foot = 0.3048 metres (exact, international definition) */
export const FT_TO_M = 0.3048;

/** 1 inch = 0.0254 metres (exact, international definition) */
export const INCH_TO_M = 0.0254;

/** 1 metre = 3.28084 feet (derived) */
export const M_TO_FT = 1 / FT_TO_M;

/** 1 square metre = 10.7639 square feet (derived) */
export const SQM_TO_SQFT = 1 / (FT_TO_M * FT_TO_M);

/** 1 square foot = 0.092903 square metres (derived) */
export const SQFT_TO_SQM = FT_TO_M * FT_TO_M;

// =========================================================
// Length Conversions → Metres (canonical internal unit)
// =========================================================

/**
 * Convert a length value from the given unit to metres.
 * This is the primary normalisation function used by all calculators.
 */
export function toMeters(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'meters':
      return value;
    case 'feet':
      return value * FT_TO_M;
    case 'inches':
      return value * INCH_TO_M;
    default:
      throw new Error(`Unknown length unit: ${unit}`);
  }
}

/**
 * Convert metres back to the user's display unit.
 * Used for display purposes only, never for calculation.
 */
export function fromMeters(valueM: number, unit: LengthUnit): number {
  switch (unit) {
    case 'meters':
      return valueM;
    case 'feet':
      return valueM * M_TO_FT;
    case 'inches':
      return valueM / INCH_TO_M;
    default:
      throw new Error(`Unknown length unit: ${unit}`);
  }
}

// =========================================================
// Area Conversions → Square Metres (canonical internal unit)
// =========================================================

/**
 * Convert an area value from the given unit to square metres.
 * Use this when the user enters a pre-computed area (rare).
 * For the common case (length × width), use computeAreaM2() instead.
 */
export function toSqMeters(value: number, unit: AreaUnit): number {
  switch (unit) {
    case 'sqm':
      return value;
    case 'sqft':
      return value * SQFT_TO_SQM;
    default:
      throw new Error(`Unknown area unit: ${unit}`);
  }
}

/**
 * Convert square metres back to the user's display unit.
 */
export function fromSqMeters(valueSqm: number, unit: AreaUnit): number {
  switch (unit) {
    case 'sqm':
      return valueSqm;
    case 'sqft':
      return valueSqm * SQM_TO_SQFT;
    default:
      throw new Error(`Unknown area unit: ${unit}`);
  }
}

/**
 * Convert square feet to square metres.
 */
export function sqftToSqm(sqft: number): number {
  return sqft * SQFT_TO_SQM;
}

/**
 * Convert square metres to square feet.
 */
export function sqmToSqft(sqm: number): number {
  return sqm * SQM_TO_SQFT;
}

// =========================================================
// Context-Aware Unit Configuration (spec section 22)
// =========================================================

/**
 * Returns the allowed input length units for a given calculator context.
 *
 * Per spec:
 * - Painting, Screeding, Grafitex, Tiling, Fence, POP, Tyrolene → feet / metres
 * - Block → feet / metres / inches (the ONLY calculator with inches)
 * - Inches are NEVER exposed as a general measurement option
 */
export function getAllowedUnits(context: CalculatorContext): LengthUnit[] {
  switch (context) {
    case 'block':
      return ['feet', 'meters', 'inches'];
    case 'painting':
    case 'screeding':
    case 'tiling':
    case 'grafitex':
    case 'pop':
    case 'tyrolene':
    case 'fence_screeding':
    case 'fence_painting':
      return ['feet', 'meters'];
    default:
      return ['feet', 'meters'];
  }
}

/**
 * Whether inches are allowed in the given calculator context.
 * Only block calculator returns true.
 */
export function isInchesAllowed(context: CalculatorContext): boolean {
  return context === 'block';
}

/**
 * Human-readable label for a length unit.
 */
export function lengthUnitLabel(unit: LengthUnit): string {
  switch (unit) {
    case 'feet':
      return 'Feet';
    case 'meters':
      return 'Metres';
    case 'inches':
      return 'Inches';
    default:
      return unit;
  }
}

/**
 * Human-readable short label for a length unit.
 */
export function lengthUnitShort(unit: LengthUnit): string {
  switch (unit) {
    case 'feet':
      return 'ft';
    case 'meters':
      return 'm';
    case 'inches':
      return 'in';
    default:
      return unit;
  }
}

/**
 * Human-readable label for an area unit.
 */
export function areaUnitLabel(unit: AreaUnit): string {
  switch (unit) {
    case 'sqm':
      return 'm²';
    case 'sqft':
      return 'ft²';
    default:
      return unit;
  }
}

// =========================================================
// Tile Dimension Normalisation
// =========================================================

/**
 * Convert tile dimensions (typically in mm or cm) to metres.
 * Tile sizes are often specified in mm (e.g. 600mm × 600mm) or cm (e.g. 60cm × 60cm).
 */
export function tileDimensionToMeters(value: number, unit: 'mm' | 'cm' | 'm'): number {
  switch (unit) {
    case 'mm':
      return value / 1000;
    case 'cm':
      return value / 100;
    case 'm':
      return value;
    default:
      throw new Error(`Unknown tile dimension unit: ${unit}`);
  }
}

/**
 * Calculate the area of a single tile in m² from its dimensions.
 * @param length - tile length value
 * @param width - tile width value
 * @param unit - 'mm', 'cm', or 'm'
 */
export function tileAreaM2(length: number, width: number, unit: 'mm' | 'cm' | 'm'): number {
  const lengthM = tileDimensionToMeters(length, unit);
  const widthM = tileDimensionToMeters(width, unit);
  return lengthM * widthM;
}
