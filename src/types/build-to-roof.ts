// =========================================================
// FRELUX Build-to-Roof Construction Cost Estimator
// Types, Phase 30
//
// Covers: site/foundation → ground floor → walls → structural frame → roof
// Stops at "ready for finishing", no plastering, painting, tiling, doors, etc.
// =========================================================

// ── Enums / Union types ──

export type BuildingType =
  | 'bungalow'
  | 'duplex'
  | 'two_storey'
  | 'apartment'
  | 'office'
  | 'shop'
  | 'custom';

export type FoundationType =
  | 'strip_footing'
  | 'pad_footing'
  | 'raft'
  | 'pile'
  | 'custom';

export type RoofType = 'gable' | 'hip' | 'mono_pitch' | 'flat' | 'custom';

/**
 * Nigerian block sizes (inch-based, industry standard):
 * - 9-inch: hollow block, best for foundations and storey buildings
 * - 6-inch: hollow or solid, used for internal walls and partitions
 * - 5-inch: solid block only, used for non-load-bearing partitions
 */
export type BlockSize = '9inch' | '6inch' | '5inch' | 'custom';

export type RoofingMaterial =
  | 'long_span_aluminium'
  | 'stone_coated'
  | 'gi_sheet'
  | 'shingle'
  | 'custom';

export type ConfidenceLevel = 'high' | 'moderate' | 'preliminary';

export type ConstructionStage =
  | 'site_preparation'
  | 'foundation'
  | 'ground_floor'
  | 'walls'
  | 'structural_frame'
  | 'roofing';

// ── Input types ──

export interface OpeningInput {
  type: 'door' | 'window';
  width: number; // meters
  height: number; // meters
  count: number;
  label?: string;
}

export interface StructuralMemberInput {
  id: string;
  type: 'column' | 'ground_beam' | 'suspended_beam' | 'ring_beam' | 'lintel' | 'slab' | 'other';
  label: string;
  length: number; // meters
  width: number; // meters (or diameter for columns)
  depth: number; // meters (or thickness for slabs)
  quantity: number; // number of identical members
  // Reinforcement (optional, from engineer's schedule)
  bar_diameter_mm?: number;
  bar_count_main?: number; // number of main bars
  bar_count_links?: number; // links/stirrups per meter
  link_diameter_mm?: number;
  bar_length_main?: number; // length per main bar (m), defaults to member length
  cover_mm?: number; // concrete cover
}

export interface BuildToRoofInput {
  // Project info
  project_name: string;
  location: string;
  building_type: BuildingType;
  number_of_floors: number;
  measurement_unit: 'm' | 'ft';

  // Building dimensions (stored in meters internally; converted from ft if unit is ft)
  building_length: number;
  building_width: number;
  floor_to_floor_height: number; // wall height per floor
  wall_thickness: number; // meters (e.g. 0.225 for 9-inch)

  // Internal walls
  internal_wall_length: number; // total length of internal partition walls (m)
  internal_wall_thickness: number; // meters

  // Openings (doors/windows), used for wall deductions only
  openings: OpeningInput[];

  // Foundation
  foundation_type: FoundationType;
  foundation_depth: number; // trench depth (m), used for excavation
  foundation_width: number; // trench/pad width (m)
  footing_thickness: number; // concrete footing thickness (m), configurable, NOT hardcoded
  blinding_thickness: number; // blinding concrete thickness (m)
  hardcore_thickness: number; // hardcore fill thickness (m)
  dpc_length: number; // DPC roll length needed (m), 0 if none

  // Block specification
  block_size: BlockSize;
  block_length: number; // inches (18" standard)
  block_height: number; // inches (9" standard)
  block_width: number; // inches (thickness: 9", 6", or 5")

  // Concrete mix (cement:sand:aggregate by volume)
  concrete_mix_cement: number; // parts
  concrete_mix_sand: number;
  concrete_mix_granite: number;

  // Mortar mix (cement:sand by volume)
  mortar_mix_cement: number;
  mortar_mix_sand: number;

  // Roof
  roof_type: RoofType;
  roof_pitch_degrees: number;
  roof_overhang: number; // meters
  roofing_material: RoofingMaterial;

  // Structural members (optional, from engineer's schedule)
  structural_members: StructuralMemberInput[];
  has_engineer_schedule: boolean;

  // Wastage percentages
  wastage: WastageConfig;

  // Prices (Naira)
  prices: PriceConfig;

  // Labour rates
  labour: LabourConfig;

  // Drawing analysis
  drawing_analysis?: DrawingAnalysis;

  // Sand filling (under ground floor slab)
  sand_filling_thickness?: number; // meters, default 0.05 (50mm)

  // Contingency
  contingency_percent: number; // e.g. 5 means 5%
}

export interface WastageConfig {
  blocks: number; // %
  cement: number; // %
  sand: number; // %
  granite: number; // %
  reinforcement: number; // %
  timber: number; // %
  roofing_sheets: number; // %
  hardcore: number; // %
}

export interface PriceConfig {
  cement_per_bag: number; // ₦ per 50kg bag
  block_per_piece: number; // ₦ per block
  sand_per_m3: number; // ₦ per cubic meter
  sand_per_trip: number; // ₦ per trip (1 trip ≈ 3.5 m³, 5-tonne tipper)
  granite_per_m3: number; // ₦ per cubic meter
  granite_per_trip: number; // ₦ per trip (1 trip ≈ 3.5 m³, 5-tonne tipper)
  hardcore_per_m3: number; // ₦ per cubic meter (hardcore stone/laterite)
  reinforcement_per_tonne: number; // ₦ per tonne (bulk fallback)
  // Per-diameter rebar prices (Nigerian market sells by diameter × length)
  rebar_12mm_per_length: number; // ₦ per 12m length of 12mm bar
  rebar_16mm_per_length: number; // ₦ per 12m length of 16mm bar
  rebar_20mm_per_length: number; // ₦ per 12m length of 20mm bar
  rebar_25mm_per_length: number; // ₦ per 12m length of 25mm bar
  binding_wire_per_kg: number; // ₦ per kg
  timber_per_m: number; // ₦ per linear meter (2x4 equivalent)
  roofing_sheet_per_piece: number; // ₦ per sheet
  ridge_cap_per_meter: number; // ₦ per linear meter
  roofing_screws_per_piece: number; // ₦ per screw
  fascia_per_meter: number; // ₦ per linear meter
  dpc_per_meter: number; // ₦ per linear meter (DPC roll)
  dpm_per_m2: number; // ₦ per m² (DPM membrane, different from DPC roll)
  formwork_per_m2: number; // ₦ per m² of formwork (plywood + nails)
  price_date: string; // ISO date
  price_source: string; // e.g. "User-supplied" or "Admin-configured"
}

export interface LabourConfig {
  excavation_per_m3: number; // ₦ per m³ excavated
  blockwork_per_block: number; // ₦ per block laid
  concrete_per_m3: number; // ₦ per m³ cast
  reinforcement_per_tonne: number; // ₦ per tonne fixed
  formwork_per_m2: number; // ₦ per m² erected/removed
  roofing_per_m2: number; // ₦ per m² roof area
  blinding_per_m3: number; // ₦ per m³
  hardcore_per_m3: number; // ₦ per m³ (laying + compacting)
  sand_filling_per_m3: number; // ₦ per m³
  compaction_per_m3: number; // ₦ per m³ (compaction of hardcore/filling)
  backfilling_per_m3: number; // ₦ per m³
  general_labour_per_day: number; // ₦ per day
  general_labour_days: number; // estimated days for site prep + clearing + setting out
  // Role-based daily rates (Nigerian construction)
  bricklayer_per_day: number; // ₦ per day per bricklayer/mason
  bricklayer_days: number; // estimated bricklayer-days for blockwork
  contractor_fee: number; // ₦, lump sum or daily rate × days
  contractor_fee_type: 'daily' | 'contract'; // payment mode
  contractor_days: number; // if daily, estimated contractor days
  supervisor_per_day: number; // ₦ per day
  supervisor_days: number; // estimated supervisor days
  foreman_per_day: number; // ₦ per day
  foreman_days: number; // estimated foreman days
  carpenter_per_day: number; // ₦ per day (formwork + roof timber)
  carpenter_days: number; // estimated carpenter days
  concrete_labourer_per_day: number; // ₦ per day
  concrete_labourer_days: number; // estimated concrete labourer days
}

export interface DrawingAnalysis {
  file_name: string;
  file_url?: string;
  detected: DrawingDetectedDimensions;
  confirmed: DrawingConfirmedDimensions;
  processed_at: string; // ISO timestamp
  notes: string[];
}

export interface DrawingDetectedDimensions {
  building_length?: number;
  building_width?: number;
  wall_thickness?: number;
  floor_height?: number;
  number_of_floors?: number;
  perimeter?: number;
  floor_area?: number;
  room_count?: number;
  wall_lengths?: { label: string; length: number; thickness: number }[];
  openings?: { type: 'door' | 'window'; width: number; height: number; count: number }[];
  roof_type?: string;
  roof_pitch?: number;
  roof_dimensions?: { length: number; width: number };
  foundation_dimensions?: { length: number; width: number; depth: number };
  structural_members?: { type: string; dimensions: string }[];
}

export interface DrawingConfirmedDimensions {
  building_length: number | null;
  building_width: number | null;
  wall_thickness: number | null;
  floor_height: number | null;
  number_of_floors: number | null;
  internal_wall_length: number | null;
  openings_confirmed: boolean;
  roof_confirmed: boolean;
  structural_confirmed: boolean;
  user_corrections: string[];
}

// ── Calculation result types ──

export interface QuantityLine {
  label: string;
  formula: string;
  inputs: Record<string, number>;
  base_quantity: number;
  unit: string;
  wastage_percent: number;
  final_quantity: number;
}

export interface MaterialLine {
  label: string;
  unit: string;
  base_quantity: number;
  wastage_percent: number;
  final_quantity: number;
  unit_price: number;
  total_cost: number;
  price_source: string;
}

export interface LabourLine {
  label: string;
  unit: string;
  quantity: number;
  rate: number;
  total_cost: number;
}

export interface StageResult {
  stage: ConstructionStage;
  stage_label: string;
  quantities: QuantityLine[];
  materials: MaterialLine[];
  labour: LabourLine[];
  materials_total: number;
  labour_total: number;
  stage_total: number;
  reinforcement_breakdown?: ReinforcementBreakdown;
}

export interface ConsolidatedMaterial {
  label: string;
  unit: string;
  total_quantity: number;
  unit_price: number;
  total_cost: number;
  stages: string[];
}

export interface ReinforcementBreakdownItem {
  diameter_mm: number;
  label: string;           // e.g. "12mm Main Bars"
  base_length_m: number;   // net length in meters (before wastage)
  total_length_m: number;  // total length in meters (incl. wastage)
  standard_lengths: number; // number of 12m standard lengths
  weight_kg: number;       // total weight
  weight_tonnes: number;   // total weight in tonnes
  unit_price: number;      // ₦ per standard 12m length
  total_cost: number;      // standard_lengths × unit_price
  source: 'main' | 'links'; // main bars or stirrups/links
}

export interface ReinforcementBreakdown {
  items: ReinforcementBreakdownItem[];
  total_weight_tonnes: number;
  total_length_m: number;
  binding_wire_kg: number;
  binding_wire_cost: number;
  total_cost: number;
}

export interface BuildToRoofResult {
  // Summary
  project_name: string;
  location: string;
  building_type: BuildingType;
  number_of_floors: number;
  total_floor_area: number; // m²
  construction_stage: string;
  confidence: ConfidenceLevel;
  confidence_reason: string;

  // Stages
  stages: StageResult[];

  // Consolidated shopping list
  shopping_list: ConsolidatedMaterial[];

  // Reinforcement breakdown (user-friendly, split by bar diameter)
  reinforcement_breakdown?: ReinforcementBreakdown;

  // Totals
  materials_total: number;
  labour_total: number;
  wastage_allowance: number; // extra cost due to wastage
  contingency: number;
  grand_total: number;

  // Assumptions
  assumptions: string[];
  limitations: string[];
  missing_info: string[];

  // Price info
  price_date: string;
  price_source: string;
  price_age_days: number; // days since price_date
  price_stale: boolean; // true if older than 30 days
}
