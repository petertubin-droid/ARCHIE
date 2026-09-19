export type ProjectType = "room" | "house" | "exterior" | "fence";
export type Unit = "meters" | "feet";
export type SurfaceCondition = "smooth" | "textured" | "rough" | "new_plaster";
export type ColorCondition =
  "same_or_light" | "dark_over_light" | "light_over_dark" | "new_unpainted";

// Re-export default opening dimensions from utils so all modules
// share a single source of truth.
export {
  DEFAULT_DOOR_WIDTH_M,
  DEFAULT_DOOR_HEIGHT_M,
  DEFAULT_WINDOW_WIDTH_M,
  DEFAULT_WINDOW_HEIGHT_M,
} from "@/lib/utils";

export interface OpeningDimensions {
  width: number; // meters
  height: number; // meters
}

export interface CalculatorInput {
  projectType: ProjectType;
  length: number;
  width: number;
  wallHeight: number;
  doors: number;
  doorDims: OpeningDimensions;
  windows: number;
  windowDims: OpeningDimensions;
  coats: number;
  paintType: string; // paint type id (UUID) or name
  unit: Unit;
  includeCeiling: boolean;
  wasteMargin: number; // percentage 0–100
  surfaceCondition?: SurfaceCondition;
  colorCondition?: ColorCondition;
  includePrimer?: boolean;
  qualityId?: string; // selected estimation_product_quality id
}

export interface ContainerRecommendation {
  size: number; // liters
  count: number;
}

export interface CalculatorResult {
  projectType: ProjectType;
  unit: Unit;
  wallArea: number; // m² gross
  ceilingArea: number; // m² (0 if not included)
  doorArea: number; // m²
  windowArea: number; // m²
  paintableArea: number; // m² net (walls ± ceiling − openings)
  coats: number;
  paintType: string;
  coverageRate: number; // m² per liter per coat
  paintRequiredLiters: number; // before waste
  wasteMargin: number; // percentage
  adjustedLiters: number; // after waste
  recommendedContainers: ContainerRecommendation[];
  totalRecommendedLiters: number;
  leftoverLiters: number;
  // Primer
  primerLiters: number;
  primerContainers: ContainerRecommendation[];
  primerTotalLiters: number;
  // Surface condition
  baseCoverageRate: number;
  surfaceCondition: SurfaceCondition;
  surfaceConditionFactor: number;
  // Warnings
  heightWarning: string | null;
  colorWarning: string | null;
  primerRecommended: boolean;
}

export interface PaintContainerPurchase {
  productId: string | null;
  productName: string;
  containerSize: number; // liters
  count: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CostEstimateInput {
  projectType: ProjectType;
  paintableArea: number;
  paintLiters: number;
  coats: number;
  paintType: string;
  // Paint, actual container purchase
  paintProductId: string | null;
  paintProductName: string;
  paintContainerSize: number; // liters of one container (0 = manual per-liter)
  paintContainerPrice: number; // price of one container (0 when manual)
  paintPricePerLiter: number; // manual override when no product/container
  paintUseContainerPricing: boolean;
  // Primer
  includePrimer: boolean;
  primerLiters: number;
  primerPricePerLiter: number;
  // Materials (each optional, toggled)
  includeFiller: boolean;
  fillerCost: number;
  includePutty: boolean;
  puttyCost: number;
  includeSandpaper: boolean;
  sandpaperCost: number;
  includeBrushes: boolean;
  brushesCost: number;
  includeRollers: boolean;
  rollersCost: number;
  includeOther: boolean;
  otherMaterialsCost: number;
  // Labor
  laborMode: "perSqm" | "manual";
  laborRatePerSqm: number;
  laborTotal: number;
  // Currency
  currency: string;
  currencySymbol: string;
}

export interface CostEstimateResult {
  paintCost: number;
  paintContainerCount: number;
  primerCost: number;
  fillerCost: number;
  puttyCost: number;
  sandpaperCost: number;
  brushesCost: number;
  rollersCost: number;
  otherMaterialsCost: number;
  materialsCost: number; // sum of all non-paint, non-primer materials
  laborCost: number;
  total: number;
  currency: string;
  currencySymbol: string;
}

export interface ColorCombination {
  id: string;
  slug: string;
  name: string;
  description: string;
  categories: string[];
  image: string;
  mainColor: { name: string; hex: string };
  secondaryColor: { name: string; hex: string };
  accentColor: { name: string; hex: string };
  recommendedRooms: string[];
  style: string;
  relatedSlugs: string[];
}

export interface ScreedingCalcInput {
  method: "full_room" | "individual_wall";
  // Full room
  roomLength: number;
  roomWidth: number;
  // Individual wall
  wallWidth: number;
  wallCount: number;
  // Shared
  wallHeight: number;
  // Openings
  doors: number;
  doorDims: OpeningDimensions;
  windows: number;
  windowDims: OpeningDimensions;
  unit: Unit;
}

export interface ScreedingCalcResult {
  method: "full_room" | "individual_wall";
  unit: Unit;
  grossWallArea: number;
  doorArea: number;
  windowArea: number;
  totalDeduction: number;
  netScreedingArea: number;
}

export interface ScreedingEstimateInput {
  netScreedingArea: number;
  materialId: string;
  materialName: string;
  coverageRate: number;
  coverageUnit: string;
  packageSize: number;
  packageUnit: string;
  unitPrice: number;
  labourRatePerSqm: number;
  wasteMargin: number;
  currency: string;
  currencySymbol: string;
}

export interface ScreedingEstimateResult {
  materialName: string;
  materialRequired: number;
  materialUnit: string;
  packagesNeeded: number;
  materialCost: number;
  labourCost: number;
  total: number;
  currency: string;
  currencySymbol: string;
}

// =========================================================
// Screeding Mix Model (Paint + White Cement)
// =========================================================

export interface ScreedingMixConfig {
  paintCoverageRateM2PerL: number;
  paintBucketSizeL: number;
  paintPricePerBucket: number;
  cementConsumptionRatioKgPerL: number;
  cementBagSizeKg: number;
  cementPricePerBag: number;
  defaultMixRatio: string;
  labourRatePerSqm: number;
  wastePercentage: number;
  taxVatPercentage: number;
  currency: string;
  currencySymbol: string;
}

export interface ScreedingMixResult {
  netScreedingArea: number;
  paintRequiredLiters: number;
  paintBucketsNeeded: number;
  paintUnitPrice: number;
  paintTotalCost: number;
  cementRequiredKg: number;
  cementBagsNeeded: number;
  cementUnitPrice: number;
  cementTotalCost: number;
  materialCost: number;
  labourCost: number;
  wasteAllowance: number;
  wasteAmount: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  currencySymbol: string;
}

export interface AdvancedEstimateLineItem {
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface AdvancedEstimateData {
  projectType: string;
  netArea: number;
  thickness: number;
  coats: number;
  mixRatio: string;
  paintLiters: number;
  paintBuckets: number;
  cementKg: number;
  cementBags: number;
  lineItems: AdvancedEstimateLineItem[];
  materialCost: number;
  labourCost: number;
  transportCost: number;
  wastePercentage: number;
  wasteAmount: number;
  markupPercentage: number;
  markupAmount: number;
  profitPercentage: number;
  profitAmount: number;
  taxPercentage: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  currencySymbol: string;
  notes: string;
  aiRecommendations: string[];
}

export interface SavedEstimate {
  id: string;
  title: string;
  projectType: string;
  totalCost: number;
  currency: string;
  estimateData: AdvancedEstimateData;
  createdAt: string;
}

// =========================================================
// POP Ceiling types
// =========================================================

export interface PopCalcInput {
  workflow: "nigeria" | "international";
  roomLength: number;
  roomWidth: number;
  unit: Unit;
  wasteMargin: number;
  includeDecorative: boolean;
  includeOptional: boolean;
}

export interface PopMaterialResult {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  packagesNeeded: number;
  cost: number;
  isOptional: boolean;
}

export interface PopCalcResult {
  ceilingArea: number;
  materials: PopMaterialResult[];
  materialCost: number;
  labourCost: number;
  wasteAmount: number;
  grandTotal: number;
  currency: string;
  currencySymbol: string;
  /** Non-blocking configuration problems (missing coverage/price), audit fix */
  warnings?: string[];
}

export interface PopEstimateResult {
  ceilingArea: number;
  materials: PopMaterialResult[];
  materialCost: number;
  labourCost: number;
  wasteAmount: number;
  grandTotal: number;
  currency: string;
  currencySymbol: string;
}

// =========================================================
// Tile types
// =========================================================

export interface TileCalcInput {
  surfaceType: "floor" | "wall";
  method: "traditional" | "adhesive";
  length: number;
  width: number;
  height: number;
  tileWidthMm: number;
  tileHeightMm: number;
  tilesPerBox: number;
  tilePricePerBox: number;
  // Tile adhesive (used when method === 'adhesive')
  adhesiveCoverageRate: number;
  adhesivePricePerBag: number;
  // Cement (used when method === 'traditional')
  cementCoverageRate: number;
  cementPricePerBag: number;
  cementPackageSize: number;
  // Sharp sand (used when method === 'traditional')
  sandCoverageRate: number;
  sandPricePerBag: number;
  sandPackageSize: number;
  // Grout (always needed)
  groutCoverageRate: number;
  groutPricePerKg: number;
  // Tile spacers (always needed)
  spacerCoverageRate: number;
  spacerPricePerPack: number;
  spacerPackageSize: number;
  wasteMargin: number;
  labourRatePerSqm: number;
  unit: Unit;
}

export interface TileCalcResult {
  surfaceArea: number;
  tileArea: number;
  tilesNeeded: number;
  boxesNeeded: number;
  tileCost: number;
  method: "traditional" | "adhesive";
  adhesiveNeeded: number;
  adhesiveCost: number;
  cementNeeded: number;
  cementCost: number;
  sandNeeded: number;
  sandCost: number;
  groutNeeded: number;
  groutCost: number;
  spacerNeeded: number;
  spacerCost: number;
  wasteAmount: number;
  materialCost: number;
  labourCost: number;
  grandTotal: number;
  currency: string;
  currencySymbol: string;
  /** Non-blocking configuration problems (missing coverage/price), audit fix */
  warnings?: string[];
}

export const colorCategories = [
  "Living Room",
  "Bedroom",
  "Kitchen",
  "Exterior",
  "Modern",
  "Luxury",
  "Neutral",
  "Warm",
  "Bold",
] as const;

export type ColorFilter = {
  query?: string;
  familyId?: string | null;
  categoryId?: string | null;
  isInterior?: boolean | null;
  isExterior?: boolean | null;
  isFeatured?: boolean | null;
  isTrending?: boolean | null;
  sort?: "popularity" | "name" | "newest" | "display_order";
  page?: number;
  pageSize?: number;
};

// =========================================================
// Screeding Material System (Putty + White Cement/Paint)
// =========================================================

export type ScreedingMaterialSystem = "putty" | "white_cement_paint";

/** Configuration for a screeding material system, loaded from DB. */
export interface ScreedingSystemConfig {
  systemType: ScreedingMaterialSystem;
  displayName: string;
  description: string | null;
  coverageAreaM2: number;
  coverageUnit: string;
  defaultCoats: number;
  wastePercentage: number;
  currency: string;
  currencySymbol: string;
  roundingRule: "ceil" | "none";
  // Putty (putty system only)
  puttyName: string | null;
  puttyQuantity: number | null;
  puttyUnit: string | null;
  puttyPricePerUnit: number | null;
  // Screeding Paint (white_cement_paint system only)
  paintName: string | null;
  paintQuantity: number | null;
  paintUnit: string | null;
  paintPricePerUnit: number | null;
  // White Cement (white_cement_paint system only)
  cementName: string | null;
  cementQuantity: number | null;
  cementUnit: string | null;
  cementPricePerUnit: number | null;
  // Generic third material (white_cement_paint system only, optional).
  // Represents Bond today; dormant unless extraEnabled is true.
  // Optional so pre-existing config literals (tests, snapshots) stay valid.
  extraEnabled?: boolean | null;
  extraName?: string | null;
  extraQuantity?: number | null;
  extraUnit?: string | null;
  extraPricePerUnit?: number | null;
}

/** Per-material breakdown in a screeding calculation result. */
export interface ScreedingMaterialBreakdown {
  name: string;
  unit: string;
  baseQuantity: number; // before waste
  wastePercentage: number;
  wasteQuantity: number; // waste amount
  finalQuantity: number; // base + waste
  purchaseQuantity: number; // rounded for purchase (e.g. ceil to whole buckets)
  pricePerUnit: number | null;
  totalCost: number | null; // null when price not configured
}

/** Result for the Putty material system. */
export interface ScreedingPuttyResult {
  systemType: "putty";
  netScreedingArea: number;
  coats: number;
  coverageAreaM2: number;
  putty: ScreedingMaterialBreakdown;
  materialCost: number | null;
  currency: string;
  currencySymbol: string;
}

/** Result for the White Cement + Screeding Paint material system. */
export interface ScreedingMixSystemResult {
  systemType: "white_cement_paint";
  netScreedingArea: number;
  coats: number;
  coverageAreaM2: number;
  wastePercentage: number;
  paint: ScreedingMaterialBreakdown;
  cement: ScreedingMaterialBreakdown;
  // Optional third material (e.g. Bond). Null when not enabled/configured.
  extra: ScreedingMaterialBreakdown | null;
  materialCost: number | null;
  currency: string;
  currencySymbol: string;
}

/** Union result type for any screeding material system. */
export type ScreedingSystemResult =
  ScreedingPuttyResult | ScreedingMixSystemResult;
