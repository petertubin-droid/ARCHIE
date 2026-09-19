/**
 * FRELUX MARKET INTELLIGENCE, Supabase Queries
 *
 * CRUD operations for all market intelligence tables.
 * Used by admin pages and the price resolver.
 */

import { supabase } from '@/lib/supabase';
import type {
  MiProvider,
  MiSource,
  MiProductAlias,
  MiPriceObservation,
  MiApprovedPrice,
  MiCrawlLog,
  MiProviderUsage,
  MiAnomalyFlag,
  ValidationStatus,
  MatchConfidence,
  Freshness,
  CrawlEventType,
  AnomalyType,
  AnomalyResolution,
} from '@/types/market-intelligence';

// ============================================================
// PROVIDERS
// ============================================================

export async function fetchProviders(): Promise<MiProvider[]> {
  const { data, error } = await supabase.from('mi_providers').select('*').order('priority', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MiProvider[];
}

export async function upsertProvider(provider: Partial<MiProvider>): Promise<MiProvider> {
  const { data, error } = await supabase.from('mi_providers').upsert(provider).select().single();
  if (error) throw error;
  return data as unknown as MiProvider;
}

export async function toggleProvider(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('mi_providers').update({ is_enabled: enabled }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// SOURCES
// ============================================================

export async function fetchSources(countryCode?: string): Promise<MiSource[]> {
  let query = supabase.from('mi_sources').select('*').order('source_name', { ascending: true });
  if (countryCode) query = query.eq('country_code', countryCode);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiSource[];
}

export async function upsertSource(source: Partial<MiSource>): Promise<MiSource> {
  const { data, error } = await supabase.from('mi_sources').upsert(source).select().single();
  if (error) throw error;
  return data as unknown as MiSource;
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from('mi_sources').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// PRODUCT ALIASES
// ============================================================

export async function fetchProductAliases(marketCode?: string): Promise<MiProductAlias[]> {
  let query = supabase.from('mi_product_aliases').select('*').order('raw_name', { ascending: true });
  if (marketCode) query = query.eq('market_code', marketCode);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiProductAlias[];
}

export async function upsertProductAlias(alias: Partial<MiProductAlias>): Promise<MiProductAlias> {
  const { data, error } = await supabase.from('mi_product_aliases').upsert(alias).select().single();
  if (error) throw error;
  return data as unknown as MiProductAlias;
}

export async function verifyProductAlias(id: string, verifiedBy: string): Promise<void> {
  const { error } = await supabase
    .from('mi_product_aliases')
    .update({ is_verified: true, verified_by: verifiedBy, verified_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProductAlias(id: string): Promise<void> {
  const { error } = await supabase.from('mi_product_aliases').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// PRICE OBSERVATIONS
// ============================================================

export async function fetchObservations(filters?: {
  marketCode?: string;
  validationStatus?: ValidationStatus;
  sourceId?: string;
  limit?: number;
}): Promise<MiPriceObservation[]> {
  let query = supabase.from('mi_price_observations').select('*').order('collected_at', { ascending: false });
  if (filters?.marketCode) query = query.eq('market_code', filters.marketCode);
  if (filters?.validationStatus) query = query.eq('validation_status', filters.validationStatus);
  if (filters?.sourceId) query = query.eq('source_id', filters.sourceId);
  const limit = filters?.limit ?? 100;
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiPriceObservation[];
}

export async function insertObservation(obs: Partial<MiPriceObservation>): Promise<MiPriceObservation> {
  const { data, error } = await supabase.from('mi_price_observations').insert(obs).select().single();
  if (error) throw error;
  return data as unknown as MiPriceObservation;
}

export async function updateObservationStatus(
  id: string,
  status: ValidationStatus,
  reviewerId?: string,
  action?: string,
): Promise<void> {
  const update: Record<string, unknown> = { validation_status: status };
  if (reviewerId) {
    update.reviewed_by = reviewerId;
    update.reviewed_at = new Date().toISOString();
    update.review_action = action ?? status;
  }
  const { error } = await supabase.from('mi_price_observations').update(update).eq('id', id);
  if (error) throw error;
}

export async function setObservationFreshness(id: string, freshness: Freshness): Promise<void> {
  const { error } = await supabase.from('mi_price_observations').update({ freshness }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// APPROVED PRICES
// ============================================================

export async function fetchApprovedPrices(marketCode?: string): Promise<MiApprovedPrice[]> {
  let query = supabase.from('mi_approved_prices').select('*').order('last_updated', { ascending: false });
  if (marketCode) query = query.eq('market_code', marketCode);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiApprovedPrice[];
}

export async function upsertApprovedPrice(price: Partial<MiApprovedPrice>): Promise<MiApprovedPrice> {
  const { data, error } = await supabase
    .from('mi_approved_prices')
    .upsert(price, { onConflict: 'market_code,canonical_product_id,package_size,package_unit' })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as MiApprovedPrice;
}

export async function deactivateApprovedPrice(id: string): Promise<void> {
  const { error } = await supabase.from('mi_approved_prices').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ============================================================
// CRAWL LOGS
// ============================================================

export async function fetchCrawlLogs(limit = 100, sourceId?: string): Promise<MiCrawlLog[]> {
  let query = supabase.from('mi_crawl_logs').select('*').order('created_at', { ascending: false });
  if (sourceId) query = query.eq('source_id', sourceId);
  query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiCrawlLog[];
}

export async function insertCrawlLog(
  eventType: CrawlEventType,
  message: string,
  details?: Record<string, unknown>,
  refs?: { sourceId?: string; providerId?: string; observationId?: string },
): Promise<void> {
  const { error } = await supabase.from('mi_crawl_logs').insert({
    event_type: eventType,
    message,
    details: details ?? {},
    ...refs,
  });
  if (error) throw error;
}

// ============================================================
// PROVIDER USAGE
// ============================================================

export async function fetchProviderUsage(providerId?: string): Promise<MiProviderUsage[]> {
  let query = supabase.from('mi_provider_usage').select('*').order('usage_date', { ascending: false });
  if (providerId) query = query.eq('provider_id', providerId);
  query = query.limit(30);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MiProviderUsage[];
}

// ============================================================
// ANOMALY FLAGS
// ============================================================

export async function fetchAnomalies(resolution?: AnomalyResolution): Promise<MiAnomalyFlag[]> {
  let query = supabase.from('mi_anomaly_flags').select('*').order('created_at', { ascending: false });
  if (resolution) query = query.eq('resolution', resolution);
  const { data, error } = await query.limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as MiAnomalyFlag[];
}

export async function resolveAnomaly(
  id: string,
  resolution: AnomalyResolution,
  resolvedBy: string,
  notes?: string,
): Promise<void> {
  const { error } = await supabase
    .from('mi_anomaly_flags')
    .update({
      resolution,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function insertAnomalyFlag(
  observationId: string,
  anomalyType: AnomalyType,
  details: {
    expectedRange?: { min?: number; max?: number; median?: number };
    actualValue?: number;
    deviationPercent?: number;
    description?: string;
  },
): Promise<void> {
  const { error } = await supabase.from('mi_anomaly_flags').insert({
    observation_id: observationId,
    anomaly_type: anomalyType,
    expected_range: details.expectedRange ?? null,
    actual_value: details.actualValue ?? null,
    deviation_percent: details.deviationPercent ?? null,
    description: details.description ?? null,
  });
  if (error) throw error;
}

// ============================================================
// MANUAL PRICE ENTRY (admin creates observation + approves in one step)
// ============================================================

/**
 * Admin manually enters a price.
 * Creates an observation with validation_status = 'approved' and
 * creates/updates the approved price record.
 */
export async function manuallyEnterPrice(
  marketCode: string,
  countryCode: string,
  sourceId: string,
  productInfo: {
    originalName: string;
    canonicalProductId?: string;
    normalizedName: string;
    normalizedBrand?: string;
    normalizedCategory?: string;
    packageSize?: number;
    packageUnit?: string;
  },
  priceInfo: {
    price: number;
    currency: string;
    region?: string;
    city?: string;
  },
  adminUserId: string,
): Promise<{ observation: MiPriceObservation; approved: MiApprovedPrice }> {
  // Create observation as approved (manual entry)
  const observation = await insertObservation({
    market_code: marketCode,
    country_code: countryCode,
    region: priceInfo.region,
    city: priceInfo.city,
    source_id: sourceId,
    original_product_name: productInfo.originalName,
    canonical_product_id: productInfo.canonicalProductId ?? null,
    normalized_brand: productInfo.normalizedBrand ?? null,
    normalized_name: productInfo.normalizedName,
    normalized_category: productInfo.normalizedCategory ?? null,
    package_size: productInfo.packageSize ?? null,
    package_unit: productInfo.packageUnit ?? null,
    price: priceInfo.price,
    currency_code: priceInfo.currency,
    match_confidence: 'high' as MatchConfidence,
    validation_status: 'approved' as ValidationStatus,
    freshness: 'fresh' as Freshness,
    reviewed_by: adminUserId,
    reviewed_at: new Date().toISOString(),
    review_action: 'approved',
  });

  // Create/update approved price
  const approved = await upsertApprovedPrice({
    market_code: marketCode,
    canonical_product_id: productInfo.canonicalProductId ?? null,
    product_name: productInfo.normalizedName,
    brand: productInfo.normalizedBrand ?? null,
    category: productInfo.normalizedCategory ?? 'uncategorized',
    package_size: productInfo.packageSize ?? 1,
    package_unit: productInfo.packageUnit ?? 'unit',
    price: priceInfo.price,
    currency_code: priceInfo.currency,
    source_count: 1,
    confidence: 'high' as MatchConfidence,
    freshness: 'fresh' as Freshness,
    source_observations: [observation.id],
    approved_by: adminUserId,
    approved_at: new Date().toISOString(),
    auto_approved: false,
    region: priceInfo.region,
    city: priceInfo.city,
    is_active: true,
  });

  return { observation, approved };
}
