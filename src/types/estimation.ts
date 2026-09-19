// FRELUX Phase 1 Estimation Engine Types
// Database Row Types (mirroring supabase/migrations/20260818000000_phase1_estimation_engine.sql)
// and Calculation Engine Supporting Types

// =========================================================
// Supporting Types for Calculation Engine
// =========================================================

// Calculation method types
// Coverage unit types for the paint calculation engine
export type CoverageUnit = 'm2_per_liter' | 'm2_per_bucket' | 'ft2_per_liter' | 'ft2_per_bucket' | 'frelux_calibration';

export type CalculationMethod =
  | 'room_based'
  | 'partition_based'
  | 'area_based'
  | 'material_based'
  | 'fixed_quantity'
  | 'custom';

// Estimate status
export type EstimateStatus =
  | 'draft'
  | 'calculated'
  | 'adjusted'
  | 'saved'
  | 'shared'
  | 'completed'
  | 'cancelled';

// Rule status (distinguishes verified FRELUX rules from admin-configured ones)
export type RuleStatus =
  | 'verified_frelux'
  | 'admin_configured'
  | 'calculated'
  | 'manual_adjustment'
  | 'negotiated';

// Price snapshot, stored on each estimate line item
export interface PriceSnapshot {
  price_type: 'product' | 'quality' | 'material';
  ref_id: string;
  ref_name: string;
  unit_price: number;
  currency: string;
  pack_size: number | null;
  pack_unit: string | null;
  effective_date: string;
  price_id: string;
}

// Opening dimensions (doors/windows)
export interface OpeningInput {
  quantity: number;
  width: number;
  height: number;
}

// Coat configuration
export interface CoatConfig {
  standard_coats: number;
  selected_coats: number;
  additional_coats: number;
  reason: string | null;
}

// Ceiling configuration
export interface CeilingConfig {
  include_ceiling: boolean;
  ceiling_paint_type: string | null;
  ceiling_quality_id: string | null;
  ceiling_colour: string;
  use_default_colour: boolean;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Pack rounding result
export interface PackRoundingResult {
  theoretical_quantity: number;
  practical_purchase_quantity: number;
  pack_size: number;
  pack_count: number;
  leftover_quantity: number;
  rounding_rule: string;
}

// Estimate input (base, calculators extend this)
export interface EstimateInputBase {
  calculator_type: string;
  project_description: string;
  currency: string;
  user_id: string | null;
  client_hash: string | null;
}

// Estimate line item (for creating estimates)
export interface EstimateLineItemInput {
  item_name: string;
  item_type: 'product' | 'material' | 'primer' | 'sealer' | 'labour' | 'other';
  product_id?: string | null;
  quality_level_id?: string | null;
  material_id?: string | null;
  quantity_required: number;
  practical_purchase_qty: number;
  unit: string;
  pack_size?: number | null;
  unit_price: number;
  total_price: number;
  price_snapshot: PriceSnapshot;
  calculation_source: 'calculated' | 'manual' | 'adjusted' | 'negotiated';
  notes?: string;
}

// Adjustment input
export interface AdjustmentInput {
  estimate_id: string;
  item_id?: string | null;
  field_name: string;
  original_value: unknown;
  adjusted_value: unknown;
  reason: string;
}

// Audit log input
export interface AuditLogInput {
  entity_type: string;
  entity_id?: string | null;
  action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate' | 'price_change' | 'adjust';
  old_value?: unknown;
  new_value?: unknown;
}

// =========================================================
// Database Entity Row Interfaces (15 Tables)
// =========================================================

// 1. estimation_units table
export interface EstimationUnit {
  id: string;
  name: string;
  symbol: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 2. estimation_products table
export interface EstimationProduct {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  product_type: string;
  calculation_method: CalculationMethod | string;
  standard_pack_size: number | null;
  pack_unit_id: string | null;
  recommended_surface: string | null;
  finish: string | null;
  texture: string | null;
  gloss_level: string | null;
  durability: string | null;
  colour_compatibility: string | null;
  paint_compatibility: string | null;
  has_quality_levels: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 3. estimation_product_quality table
export interface EstimationProductQuality {
  id: string;
  product_id: string;
  name: string;
  slug: string;
  description: string | null;
  coverage: number | null;
  coverage_unit: string | null;  // m2_per_liter, m2_per_bucket, ft2_per_liter, ft2_per_bucket, frelux_calibration
  ceiling_coverage: number | null;  // separate ceiling coverage rate
  ceiling_coverage_unit: string | null;
  finish: string | null;
  texture: string | null;
  gloss_level: string | null;
  shine_level: string | null;
  durability: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 4. estimation_materials table
export interface EstimationMaterial {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  unit_id: string | null;
  pack_size: number | null;
  pack_unit_id: string | null;
  supplier: string | null;
  notes: string | null;
  effective_date: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 5. estimation_pack_sizes table
export interface EstimationPackSize {
  id: string;
  ref_type: 'product' | 'material' | 'quality';
  ref_id: string;
  pack_size: number;
  pack_unit_id: string | null;
  purchase_rule: string;
  min_quantity: number;
  rounding_rule: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 6. estimation_prices table
export interface EstimationPrice {
  id: string;
  price_type: 'product' | 'quality' | 'material';
  ref_id: string;
  price: number;
  currency: string;
  pack_size_id: string | null;
  effective_date: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 7. estimation_price_history table
export interface EstimationPriceHistory {
  id: string;
  price_type: 'product' | 'quality' | 'material';
  ref_id: string;
  old_price: number | null;
  new_price: number;
  currency: string;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

// 8. estimation_calc_rules table
export interface EstimationCalcRule {
  id: string;
  rule_key: string;
  calculator_type: string | null;
  rule_value: Record<string, unknown>;
  rule_status: RuleStatus;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 9. estimation_calc_versions table
export interface EstimationCalcVersion {
  id: string;
  calculator_type: string;
  version_number: number;
  version_label: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 10. estimation_estimates table
export interface EstimationEstimate {
  id: string;
  estimate_ref: string;
  user_id: string | null;
  client_hash: string | null;
  calculator_type: string;
  project_description: string | null;
  inputs: Record<string, unknown>;
  calculation_method: CalculationMethod | string;
  calc_version_id: string | null;
  calculated_quantities: Record<string, unknown>;
  total_material_cost: number;
  currency: string;
  labour_status: 'not_included' | 'negotiated_separately' | 'included';
  warnings: unknown[];
  recommendations: unknown[];
  notes: string | null;
  status: EstimateStatus;
  created_at: string;
  updated_at: string;
}

// 11. estimation_estimate_items table
export interface EstimationEstimateItem {
  id: string;
  estimate_id: string;
  item_name: string;
  item_type: 'product' | 'material' | 'primer' | 'sealer' | 'labour' | 'other';
  product_id: string | null;
  quality_level_id: string | null;
  material_id: string | null;
  quantity_required: number;
  practical_purchase_qty: number;
  unit: string;
  pack_size: number | null;
  unit_price: number;
  total_price: number;
  price_snapshot: PriceSnapshot | Record<string, unknown>;
  calculation_source: 'calculated' | 'manual' | 'adjusted' | 'negotiated';
  adjustment_status: 'none' | 'adjusted' | 'pending_review';
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 12. estimation_adjustments table
export interface EstimationAdjustment {
  id: string;
  estimate_id: string;
  item_id: string | null;
  field_name: string;
  original_value: unknown;
  adjusted_value: unknown;
  reason: string;
  adjusted_by: string | null;
  created_at: string;
}

// 13. estimation_audit_log table
export interface EstimationAuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate' | 'price_change' | 'adjust';
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  created_at: string;
}

// 14. estimation_colour_conditions table
export interface EstimationColourCondition {
  id: string;
  condition_key: string;
  name: string;
  description: string | null;
  requires_warning: boolean;
  min_coats_override: number | null; // 2 = standard, 3 = colour transition
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 15. estimation_surface_conditions table
export interface EstimationSurfaceCondition {
  id: string;
  condition_key: string;
  name: string;
  description: string | null;
  requires_preparation: boolean;
  primer_recommended: boolean;
  coverage_adjustment_factor: number | null; // 1.0 = full, 0.85 = 15% less coverage
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
