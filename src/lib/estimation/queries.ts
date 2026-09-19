import { supabase } from '@/lib/supabase';
import type {
  EstimationUnit,
  EstimationProduct,
  EstimationProductQuality,
  EstimationMaterial,
  EstimationPackSize,
  EstimationPrice,
  EstimationPriceHistory,
  EstimationCalcRule,
  EstimationCalcVersion,
  EstimationEstimate,
  EstimationEstimateItem,
  EstimationAdjustment,
  EstimationAuditLog,
  EstimationColourCondition,
  EstimationSurfaceCondition,
} from '@/types/estimation';

// =========================================================
// 1. Units
// =========================================================

export async function fetchEstimationUnits() {
  const { data, error } = await supabase
    .from('estimation_units')
    .select('*')
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationUnit[], error };
}

export async function createEstimationUnit(data: Partial<EstimationUnit>) {
  const { data: record, error } = await supabase
    .from('estimation_units')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationUnit | null, error };
}

export async function updateEstimationUnit(id: string, data: Partial<EstimationUnit>) {
  const { data: record, error } = await supabase
    .from('estimation_units')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationUnit | null, error };
}

export async function deleteEstimationUnit(id: string) {
  const { error } = await supabase
    .from('estimation_units')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 2. Products
// =========================================================

export async function fetchEstimationProducts(activeOnly: boolean = false) {
  let query = supabase.from('estimation_products').select('*');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  query = query.order('sort_order', { ascending: true });
  const { data, error } = await query;
  return { data: (data ?? []) as EstimationProduct[], error };
}

export async function fetchEstimationProduct(id: string) {
  const { data, error } = await supabase
    .from('estimation_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return { data: data as EstimationProduct | null, error };
}

export async function createEstimationProduct(data: Partial<EstimationProduct>) {
  const { data: record, error } = await supabase
    .from('estimation_products')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationProduct | null, error };
}

export async function updateEstimationProduct(id: string, data: Partial<EstimationProduct>) {
  const { data: record, error } = await supabase
    .from('estimation_products')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationProduct | null, error };
}

export async function deleteEstimationProduct(id: string) {
  const { error } = await supabase
    .from('estimation_products')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 3. Product Quality Levels
// =========================================================

export async function fetchProductQualityLevels(productId: string) {
  const { data, error } = await supabase
    .from('estimation_product_quality')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationProductQuality[], error };
}

export async function createProductQualityLevel(data: Partial<EstimationProductQuality>) {
  const { data: record, error } = await supabase
    .from('estimation_product_quality')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationProductQuality | null, error };
}

export async function updateProductQualityLevel(id: string, data: Partial<EstimationProductQuality>) {
  const { data: record, error } = await supabase
    .from('estimation_product_quality')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationProductQuality | null, error };
}

export async function deleteProductQualityLevel(id: string) {
  const { error } = await supabase
    .from('estimation_product_quality')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 4. Materials
// =========================================================

export async function fetchEstimationMaterials(activeOnly: boolean = false) {
  let query = supabase.from('estimation_materials').select('*');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  query = query.order('sort_order', { ascending: true });
  const { data, error } = await query;
  return { data: (data ?? []) as EstimationMaterial[], error };
}

export async function createEstimationMaterial(data: Partial<EstimationMaterial>) {
  const { data: record, error } = await supabase
    .from('estimation_materials')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationMaterial | null, error };
}

export async function updateEstimationMaterial(id: string, data: Partial<EstimationMaterial>) {
  const { data: record, error } = await supabase
    .from('estimation_materials')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationMaterial | null, error };
}

export async function deleteEstimationMaterial(id: string) {
  const { error } = await supabase
    .from('estimation_materials')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 5. Pack Sizes
// =========================================================

export async function fetchPackSizes(refType: string, refId: string) {
  const { data, error } = await supabase
    .from('estimation_pack_sizes')
    .select('*')
    .eq('ref_type', refType)
    .eq('ref_id', refId)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationPackSize[], error };
}

export async function createPackSize(data: Partial<EstimationPackSize>) {
  const { data: record, error } = await supabase
    .from('estimation_pack_sizes')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationPackSize | null, error };
}

export async function updatePackSize(id: string, data: Partial<EstimationPackSize>) {
  const { data: record, error } = await supabase
    .from('estimation_pack_sizes')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationPackSize | null, error };
}

export async function deletePackSize(id: string) {
  const { error } = await supabase
    .from('estimation_pack_sizes')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 6. Prices
// =========================================================

export async function fetchActivePrice(priceType: string, refId: string) {
  const { data, error } = await supabase
    .from('estimation_prices')
    .select('*')
    .eq('price_type', priceType)
    .eq('ref_id', refId)
    .eq('is_active', true)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as EstimationPrice | null, error };
}

export async function fetchPriceHistory(priceType: string, refId: string) {
  const { data, error } = await supabase
    .from('estimation_price_history')
    .select('*')
    .eq('price_type', priceType)
    .eq('ref_id', refId)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as EstimationPriceHistory[], error };
}

export async function createOrUpdatePrice(data: Partial<EstimationPrice>) {
  if (data.price_type && data.ref_id) {
    await supabase
      .from('estimation_prices')
      .update({ is_active: false })
      .eq('price_type', data.price_type)
      .eq('ref_id', data.ref_id)
      .eq('is_active', true);
  }

  const { data: record, error } = await supabase
    .from('estimation_prices')
    .insert({ ...data, is_active: true })
    .select()
    .single();

  return { data: record as EstimationPrice | null, error };
}

export async function fetchAllPrices(activeOnly: boolean = false) {
  let query = supabase.from('estimation_prices').select('*');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  query = query.order('effective_date', { ascending: false });
  const { data, error } = await query;
  return { data: (data ?? []) as EstimationPrice[], error };
}

// =========================================================
// 7. Calculation Rules
// =========================================================

export async function fetchCalcRules(calculatorType?: string) {
  let query = supabase.from('estimation_calc_rules').select('*');
  if (calculatorType) {
    query = query.eq('calculator_type', calculatorType);
  }
  const { data, error } = await query;
  return { data: (data ?? []) as EstimationCalcRule[], error };
}

export async function fetchCalcRule(ruleKey: string, calculatorType?: string) {
  let query = supabase
    .from('estimation_calc_rules')
    .select('*')
    .eq('rule_key', ruleKey);

  if (calculatorType) {
    query = query.eq('calculator_type', calculatorType);
  } else {
    query = query.is('calculator_type', null);
  }

  const { data, error } = await query.maybeSingle();
  return { data: data as EstimationCalcRule | null, error };
}

export async function createCalcRule(data: Partial<EstimationCalcRule>) {
  const { data: record, error } = await supabase
    .from('estimation_calc_rules')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationCalcRule | null, error };
}

export async function updateCalcRule(id: string, data: Partial<EstimationCalcRule>) {
  const { data: record, error } = await supabase
    .from('estimation_calc_rules')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationCalcRule | null, error };
}

export async function deleteCalcRule(id: string) {
  const { error } = await supabase
    .from('estimation_calc_rules')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 8. Calculation Versions
// =========================================================

export async function fetchCalcVersions(calculatorType?: string) {
  let query = supabase.from('estimation_calc_versions').select('*');
  if (calculatorType) {
    query = query.eq('calculator_type', calculatorType);
  }
  query = query.order('version_number', { ascending: false });
  const { data, error } = await query;
  return { data: (data ?? []) as EstimationCalcVersion[], error };
}

export async function fetchActiveCalcVersion(calculatorType: string) {
  const { data, error } = await supabase
    .from('estimation_calc_versions')
    .select('*')
    .eq('calculator_type', calculatorType)
    .eq('is_active', true)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as EstimationCalcVersion | null, error };
}

export async function createCalcVersion(data: Partial<EstimationCalcVersion>) {
  const { data: record, error } = await supabase
    .from('estimation_calc_versions')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationCalcVersion | null, error };
}

export async function updateCalcVersion(id: string, data: Partial<EstimationCalcVersion>) {
  const { data: record, error } = await supabase
    .from('estimation_calc_versions')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationCalcVersion | null, error };
}

// =========================================================
// 9. Estimates
// =========================================================

export interface FetchEstimatesOptions {
  limit?: number;
  skip?: number;
  status?: string;
  calculatorType?: string;
}

export async function fetchEstimates(userId?: string, opts: FetchEstimatesOptions = {}) {
  let query = supabase.from('estimation_estimates').select('*', { count: 'exact' });

  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (opts.status) {
    query = query.eq('status', opts.status);
  }
  if (opts.calculatorType) {
    query = query.eq('calculator_type', opts.calculatorType);
  }

  query = query.order('created_at', { ascending: false });

  if (typeof opts.skip === 'number' && typeof opts.limit === 'number') {
    query = query.range(opts.skip, opts.skip + opts.limit - 1);
  } else if (typeof opts.limit === 'number') {
    query = query.limit(opts.limit);
  }

  const { data, count, error } = await query;
  return { data: (data ?? []) as EstimationEstimate[], count: count ?? 0, error };
}

export async function fetchEstimate(id: string) {
  const { data: estimate, error: estimateError } = await supabase
    .from('estimation_estimates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (estimateError || !estimate) {
    return { data: null, error: estimateError };
  }

  const { data: items, error: itemsError } = await supabase
    .from('estimation_estimate_items')
    .select('*')
    .eq('estimate_id', id)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    return { data: null, error: itemsError };
  }

  return {
    data: {
      ...(estimate as EstimationEstimate),
      items: (items ?? []) as EstimationEstimateItem[],
    },
    error: null,
  };
}

export async function fetchEstimateByRef(ref: string) {
  const { data: estimate, error: estimateError } = await supabase
    .from('estimation_estimates')
    .select('*')
    .eq('estimate_ref', ref)
    .maybeSingle();

  if (estimateError || !estimate) {
    return { data: null, error: estimateError };
  }

  const { data: items, error: itemsError } = await supabase
    .from('estimation_estimate_items')
    .select('*')
    .eq('estimate_id', estimate.id)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    return { data: null, error: itemsError };
  }

  return {
    data: {
      ...(estimate as EstimationEstimate),
      items: (items ?? []) as EstimationEstimateItem[],
    },
    error: null,
  };
}

export async function createEstimate(data: Partial<EstimationEstimate>) {
  const { data: record, error } = await supabase
    .from('estimation_estimates')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationEstimate | null, error };
}

export async function updateEstimate(id: string, data: Partial<EstimationEstimate>) {
  const { data: record, error } = await supabase
    .from('estimation_estimates')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationEstimate | null, error };
}

export async function deleteEstimate(id: string) {
  const { error } = await supabase
    .from('estimation_estimates')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 10. Estimate Items
// =========================================================

export async function fetchEstimateItems(estimateId: string) {
  const { data, error } = await supabase
    .from('estimation_estimate_items')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationEstimateItem[], error };
}

export async function createEstimateItem(data: Partial<EstimationEstimateItem>) {
  const { data: record, error } = await supabase
    .from('estimation_estimate_items')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationEstimateItem | null, error };
}

export async function updateEstimateItem(id: string, data: Partial<EstimationEstimateItem>) {
  const { data: record, error } = await supabase
    .from('estimation_estimate_items')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  return { data: record as EstimationEstimateItem | null, error };
}

export async function deleteEstimateItem(id: string) {
  const { error } = await supabase
    .from('estimation_estimate_items')
    .delete()
    .eq('id', id);
  return { error };
}

// =========================================================
// 11. Adjustments
// =========================================================

export async function fetchAdjustments(estimateId: string) {
  const { data, error } = await supabase
    .from('estimation_adjustments')
    .select('*')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as EstimationAdjustment[], error };
}

export async function createAdjustment(data: Partial<EstimationAdjustment>) {
  const { data: record, error } = await supabase
    .from('estimation_adjustments')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationAdjustment | null, error };
}

// =========================================================
// 12. Audit Log
// =========================================================

export async function fetchAuditLog(entityType?: string, limit?: number) {
  let query = supabase
    .from('estimation_audit_log')
    .select('*')
    .order('created_at', { ascending: false });

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  if (typeof limit === 'number') {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  return { data: (data ?? []) as EstimationAuditLog[], error };
}

export async function createAuditLog(data: Partial<EstimationAuditLog>) {
  const { data: record, error } = await supabase
    .from('estimation_audit_log')
    .insert(data)
    .select()
    .single();
  return { data: record as EstimationAuditLog | null, error };
}

// =========================================================
// 13. Colour & Surface Conditions
// =========================================================

export async function fetchColourConditions() {
  const { data, error } = await supabase
    .from('estimation_colour_conditions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationColourCondition[], error };
}

export async function fetchSurfaceConditions() {
  const { data, error } = await supabase
    .from('estimation_surface_conditions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as EstimationSurfaceCondition[], error };
}
