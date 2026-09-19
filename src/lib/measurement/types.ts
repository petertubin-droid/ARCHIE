/**
 * FRELUX SHARED MEASUREMENT MODEL, TYPES
 *
 * One reusable measurement model capable of representing every FRELUX calculation scenario:
 * - Single room
 * - Multiple identical rooms
 * - Different rooms (house/building)
 * - Exterior surfaces
 * - Fence with partitions
 * - Tile areas
 * - Grafitex areas
 * - Block dimensions
 * - Custom sections
 *
 * Hierarchy: UNIT → GROUP → SECTION → PROJECT
 *
 * Measurement entries store what the user entered (input unit + values).
 * Calculation results are stored SEPARATELY (spec section 32).
 */

import type { LengthUnit, CalculatorContext } from './units';

// =========================================================
// Space Types (spec section 6)
// =========================================================

export type SpaceType =
  | 'bedroom'
  | 'parlour'
  | 'living_room'
  | 'dining'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'corridor'
  | 'store'
  | 'staircase'
  | 'office'
  | 'garage'
  | 'balcony'
  | 'veranda'
  | 'other';

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  bedroom: 'Bedroom',
  parlour: 'Parlour',
  living_room: 'Living Room',
  dining: 'Dining',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  toilet: 'Toilet',
  corridor: 'Corridor',
  store: 'Store',
  staircase: 'Staircase',
  office: 'Office',
  garage: 'Garage',
  balcony: 'Balcony',
  veranda: 'Veranda',
  other: 'Other / Custom',
};

export const DEFAULT_SPACE_TYPES: SpaceType[] = [
  'bedroom',
  'parlour',
  'living_room',
  'dining',
  'kitchen',
  'bathroom',
  'toilet',
  'corridor',
  'store',
  'staircase',
  'other',
];

// =========================================================
// Surface Types (spec section 9)
// =========================================================

export type SurfaceType = 'wall' | 'ceiling' | 'floor' | 'exterior' | 'fence' | 'custom';

export const SURFACE_TYPE_LABELS: Record<SurfaceType, string> = {
  wall: 'Wall',
  ceiling: 'Ceiling',
  floor: 'Floor',
  exterior: 'Exterior',
  fence: 'Fence',
  custom: 'Custom Surface',
};

// =========================================================
// Project Types (spec section 34)
// =========================================================

export type ProjectMode = 'single_room' | 'house_building' | 'exterior' | 'fence' | 'custom_section';

export const PROJECT_MODE_LABELS: Record<ProjectMode, string> = {
  single_room: 'Single Room',
  house_building: 'House / Building',
  exterior: 'Exterior',
  fence: 'Fence',
  custom_section: 'Custom Section',
};

// =========================================================
// Tile Configuration (spec sections 12–14)
// =========================================================

export type TileSizeUnit = 'mm' | 'cm' | 'm';

export type TilePackagingMethod = 'tiles_per_carton' | 'carton_coverage';

export interface TileConfig {
  /** Tile length in the given tile unit */
  tileLength: number;
  /** Tile width in the given tile unit */
  tileWidth: number;
  /** Unit for tile dimensions (mm, cm, or m) */
  tileUnit: TileSizeUnit;
  /** Packaging method */
  packagingMethod: TilePackagingMethod;
  /** Method A: number of tiles per carton/pack */
  tilesPerCarton?: number;
  /** Method B: carton coverage in m² */
  cartonCoverageM2?: number;
}

// =========================================================
// Measurement Entry, the atomic unit (spec section 4)
// =========================================================

/**
 * A single measurement entry representing what the user entered.
 * This is the UNIT in the Unit → Group → Section → Project hierarchy.
 *
 * The entry stores the USER'S INPUT, not the calculation result.
 * Normalisation happens at calculation time, not at input time.
 */
export interface MeasurementEntry {
  id: string;
  /** What type of space/surface this measurement represents */
  spaceType?: SpaceType;
  /** What type of surface (wall, ceiling, floor, etc.) */
  surfaceType?: SurfaceType;
  /** Length in the user's input unit */
  length: number;
  /** Width in the user's input unit (optional, some surfaces only need length × height) */
  width?: number;
  /** Height in the user's input unit (walls, fences) */
  height?: number;
  /** The unit the user chose for this measurement */
  unit: LengthUnit;
  /** Quantity: how many identical units (e.g., 2 identical bedrooms), spec section 5 */
  quantity: number;
  /** Tile configuration (tiling only) */
  tileConfig?: TileConfig;
  /** Fence: number of partitions for this fence dimension, spec section 10–11 */
  partitionCount?: number;
  /** Description / label for this measurement */
  description?: string;
  /** What this measurement is for (e.g., "screeding", "painting", "tiling") */
  calculationPurpose?: string;
  /** Waste allowance percentage (0–100) */
  wasteMarginPercent?: number;
  /** Whether ceiling is included (room calculations) */
  includeCeiling?: boolean;
  /** Number of doors (for opening deductions) */
  doors?: number;
  /** Number of windows (for opening deductions) */
  windows?: number;
}

// =========================================================
// Measurement Group, identical units grouped (spec section 5)
// =========================================================

/**
 * A group of measurement entries that share the same space type
 * and dimensions, multiplied by quantity.
 * Example: 12×12 ft bedroom × 2 → one entry with quantity=2.
 *
 * Different room types with different dimensions are SEPARATE groups (spec section 6).
 */
export interface MeasurementGroup {
  id: string;
  /** Human-readable label, e.g. "Bedroom 12 × 12 ft × 2" */
  label: string;
  /** The measurement entry for this group */
  entry: MeasurementEntry;
}

// =========================================================
// Measurement Section, category of spaces (spec section 7)
// =========================================================

/**
 * A section groups related measurement groups.
 * Example: all "Bedroom" groups, or all "Fence Dimensions".
 */
export interface MeasurementSection {
  id: string;
  /** Section label, e.g. "Bedrooms", "Fence Dimensions", "Tiled Surfaces" */
  label: string;
  /** Groups within this section */
  groups: MeasurementGroup[];
}

// =========================================================
// Measurement Project, the top level (spec section 7)
// =========================================================

/**
 * The complete measurement project, the root of the hierarchy.
 * This is what gets saved, shared, and passed to calculation engines.
 */
export interface MeasurementProject {
  id: string;
  /** Which calculator this project is for */
  calculatorContext: CalculatorContext;
  /** What the user selected: single room, house/building, exterior, fence, custom */
  projectMode: ProjectMode;
  /** All measurement sections */
  sections: MeasurementSection[];
  /** User's preferred input unit (default for new entries) */
  preferredUnit: LengthUnit;
  /** Project description / name */
  description?: string;
}

// =========================================================
// Calculation Result, stored separately from measurements (spec section 32)
// =========================================================

/**
 * A transparent calculation step for the breakdown display (spec section 26).
 */
export interface CalculationStep {
  label: string;
  formula: string;
  value: string;
}

/**
 * The result of normalising and calculating a single measurement entry.
 * This is SEPARATE from the measurement, it's derived data.
 */
export interface MeasurementEntryResult {
  entryId: string;
  /** Normalised length in metres */
  normalizedLengthM: number;
  /** Normalised width in metres (if provided) */
  normalizedWidthM?: number;
  /** Normalised height in metres (if provided) */
  normalizedHeightM?: number;
  /** Surface area in m² (canonical area unit) */
  areaM2: number;
  /** Total area after multiplying by quantity */
  totalAreaM2: number;
  /** Transparent calculation steps */
  steps: CalculationStep[];
}

/**
 * The result of calculating a group (entry × quantity).
 */
export interface MeasurementGroupResult {
  groupId: string;
  label: string;
  entryResult: MeasurementEntryResult;
  /** Total area for this group (entry area × quantity) */
  totalAreaM2: number;
  steps: CalculationStep[];
}

/**
 * The result of calculating a section (sum of groups).
 */
export interface MeasurementSectionResult {
  sectionId: string;
  label: string;
  groupResults: MeasurementGroupResult[];
  /** Total area for this section */
  totalAreaM2: number;
  steps: CalculationStep[];
}

/**
 * The complete result of normalising and calculating an entire project.
 * This is what gets passed to the calculator-specific engine.
 */
export interface MeasurementProjectResult {
  projectId: string;
  calculatorContext: CalculatorContext;
  sectionResults: MeasurementSectionResult[];
  /** Total project area in m² */
  totalAreaM2: number;
  /** All calculation steps for transparent breakdown */
  steps: CalculationStep[];
  /** Entry-level results for detailed breakdown */
  entryResults: MeasurementEntryResult[];
}
