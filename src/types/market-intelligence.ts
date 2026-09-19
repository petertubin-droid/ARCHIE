/**
 * FRELUX MARKET INTELLIGENCE & PRICE ENGINE, Types
 *
 * All types for the provider-independent price intelligence system.
 * Strictly additive, existing types are not modified.
 */

// ============================================================
// PROVIDERS
// ============================================================

export type ProviderType = 'crawler' | 'scraper_api' | 'price_api' | 'supplier_api' | 'manual' | 'hybrid';

export interface MiProvider {
  id: string;
  provider_name: string;
  provider_type: ProviderType;
  api_endpoint: string | null;
  has_api_key: boolean;
  secret_name: string | null;
  monthly_request_limit: number | null;
  daily_request_limit: number | null;
  credit_limit: number | null;
  priority: number;
  is_fallback: boolean;
  supported_countries: string[] | null;
  is_enabled: boolean;
  is_free: boolean;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// SOURCES
// ============================================================

export type SourceType =
  | 'supplier' | 'retailer' | 'manufacturer' | 'marketplace'
  | 'distributor' | 'public_price_database' | 'government' | 'manual' | 'api';

export type CrawlFrequency = 'daily' | 'weekly' | 'monthly' | 'manual' | 'on_demand';

export interface MiSource {
  id: string;
  source_name: string;
  domain: string | null;
  source_url: string | null;
  country_code: string;
  region: string | null;
  city: string | null;
  source_type: SourceType;
  provider_id: string | null;
  reliability_tier: 1 | 2 | 3 | 4;
  robots_status: string | null;
  access_notes: string | null;
  crawl_frequency: CrawlFrequency;
  is_active: boolean;
  is_verified: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PRODUCT ALIASES (Normalisation)
// ============================================================

export type MatchConfidence = 'high' | 'medium' | 'low' | 'review_required';

export interface MiProductAlias {
  id: string;
  raw_name: string;
  canonical_product_id: string | null;
  normalized_brand: string | null;
  normalized_name: string;
  normalized_category: string | null;
  normalized_package_size: number | null;
  normalized_package_unit: string | null;
  match_confidence: MatchConfidence;
  match_score: number;
  source_id: string | null;
  market_code: string | null;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// PRICE OBSERVATIONS
// ============================================================

export type ValidationStatus = 'collected' | 'validating' | 'review_required' | 'approved' | 'rejected' | 'anomaly';
export type Freshness = 'fresh' | 'recent' | 'stale' | 'expired';

export interface MiPriceObservation {
  id: string;
  market_code: string;
  country_code: string;
  region: string | null;
  city: string | null;
  source_id: string;
  provider_id: string | null;
  original_product_name: string;
  canonical_product_id: string | null;
  normalized_brand: string | null;
  normalized_name: string | null;
  normalized_category: string | null;
  package_size: number | null;
  package_unit: string | null;
  package_size_confidence: MatchConfidence | 'unknown';
  price: number;
  currency_code: string;
  unit_price_per_kg: number | null;
  unit_price_per_litre: number | null;
  unit_price_calculable: boolean;
  collected_at: string;
  source_publication_date: string | null;
  stock_status: string | null;
  match_confidence: MatchConfidence;
  validation_status: ValidationStatus;
  freshness: Freshness;
  source_url: string | null;
  raw_extraction_ref: Record<string, unknown> | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_action: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// APPROVED PRICES (Calculator-facing)
// ============================================================

export interface MiApprovedPrice {
  id: string;
  market_code: string;
  canonical_product_id: string | null;
  product_name: string;
  brand: string | null;
  category: string;
  package_size: number;
  package_unit: string;
  price: number;
  currency_code: string;
  unit_price_per_kg: number | null;
  unit_price_per_litre: number | null;
  unit_price_calculable: boolean;
  median_price: number | null;
  min_price: number | null;
  max_price: number | null;
  source_count: number;
  confidence: MatchConfidence;
  freshness: Freshness;
  last_updated: string;
  effective_from: string;
  source_observations: string[];
  approved_by: string | null;
  approved_at: string | null;
  auto_approved: boolean;
  region: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// CRAWL LOGS (Observability)
// ============================================================

export type CrawlEventType =
  | 'crawl_started' | 'crawl_completed' | 'crawl_failed'
  | 'product_matched' | 'product_mismatch'
  | 'price_collected' | 'price_rejected' | 'price_approved'
  | 'provider_error' | 'source_unavailable'
  | 'api_limit_reached' | 'anomaly_detected'
  | 'validation_started' | 'validation_completed';

export interface MiCrawlLog {
  id: string;
  event_type: CrawlEventType;
  source_id: string | null;
  provider_id: string | null;
  observation_id: string | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// PROVIDER USAGE (Cost Control)
// ============================================================

export interface MiProviderUsage {
  id: string;
  provider_id: string;
  usage_date: string;
  usage_month: number;
  usage_year: number;
  requests_today: number;
  requests_this_month: number;
  credits_used_today: number;
  credits_used_this_month: number;
  daily_limit_reached: boolean;
  monthly_limit_reached: boolean;
  error_count_today: number;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ANOMALY FLAGS
// ============================================================

export type AnomalyType =
  | 'price_deviation' | 'currency_mismatch' | 'package_mismatch'
  | 'market_mismatch' | 'duplicate_suspicious' | 'stale_data' | 'unusual_source';

export type AnomalyResolution = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface MiAnomalyFlag {
  id: string;
  observation_id: string;
  anomaly_type: AnomalyType;
  expected_range: { min?: number; max?: number; median?: number } | null;
  actual_value: number | null;
  deviation_percent: number | null;
  description: string | null;
  resolution: AnomalyResolution;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

// ============================================================
// PROVIDER ADAPTER INTERFACE
// ============================================================

/**
 * Interface that all providers must implement.
 * Adding a new provider = implementing this interface + registering it.
 * No calculator code needs to change.
 */
export interface PriceProviderAdapter {
  readonly name: string;
  readonly type: ProviderType;
  readonly isFree: boolean;

  /** Check if the provider is configured and ready to use */
  isConfigured(): boolean;

  /** Check if the provider has remaining quota */
  hasQuota(usage: MiProviderUsage | null): boolean;

  /** Record a request (for cost tracking) */
  recordRequest(): void;

  /** Fetch a single page from a source URL */
  fetchPage(url: string): Promise<RawPageContent | null>;

  /** Extract product + price data from raw content */
  extractPriceData(raw: RawPageContent, source: MiSource): Promise<ExtractedPriceData | null>;

  /** Get provider health status */
  getHealthStatus(): ProviderHealthStatus;
}

export interface RawPageContent {
  html: string;
  url: string;
  statusCode: number;
  fetchedAt: string;
}

export interface ExtractedPriceData {
  productName: string;
  price: number;
  currency: string;
  packageSize?: number;
  packageUnit?: string;
  brand?: string;
  stockStatus?: string;
  sourceUrl?: string;
  publicationDate?: string;
  rawExtractionRef?: Record<string, unknown>;
}

export interface ProviderHealthStatus {
  isHealthy: boolean;
  lastError: string | null;
  remainingQuota: number | null;  // null = unlimited
  message: string;
}

// ============================================================
// CALCULATOR PRICE RESOLUTION
// ============================================================

/**
 * What calculators receive when they request a price.
 * The calculator does NOT know which provider collected it.
 */
export interface ResolvedCalculatorPrice {
  found: boolean;
  price: number | null;
  currency: string;
  freshness: Freshness;
  confidence: MatchConfidence;
  sourceCount: number;
  lastUpdated: string | null;
  isStale: boolean;
  isEstimated: boolean;
  message: string;  // human-readable status
}

export const NO_PRICE_AVAILABLE: ResolvedCalculatorPrice = {
  found: false,
  price: null,
  currency: 'NGN',
  freshness: 'expired',
  confidence: 'review_required',
  sourceCount: 0,
  lastUpdated: null,
  isStale: false,
  isEstimated: false,
  message: 'Price data unavailable',
};

// ============================================================
// LABELS
// ============================================================

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  crawler: 'FRELUX Crawler',
  scraper_api: 'Scraper API',
  price_api: 'Price Intelligence API',
  supplier_api: 'Supplier API',
  manual: 'Manual Entry',
  hybrid: 'Hybrid',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  supplier: 'Supplier',
  retailer: 'Retailer',
  manufacturer: 'Manufacturer',
  marketplace: 'Marketplace',
  distributor: 'Distributor',
  public_price_database: 'Public Price Database',
  government: 'Government',
  manual: 'Manual',
  api: 'API',
};

export const CRAWL_FREQUENCY_LABELS: Record<CrawlFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual',
  on_demand: 'On Demand',
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  collected: 'Collected',
  validating: 'Validating',
  review_required: 'Review Required',
  approved: 'Approved',
  rejected: 'Rejected',
  anomaly: 'Anomaly Detected',
};

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  fresh: 'Fresh',
  recent: 'Recent',
  stale: 'Stale',
  expired: 'Expired',
};

export const ANOMALY_TYPE_LABELS: Record<AnomalyType, string> = {
  price_deviation: 'Price Deviation',
  currency_mismatch: 'Currency Mismatch',
  package_mismatch: 'Package Mismatch',
  market_mismatch: 'Market Mismatch',
  duplicate_suspicious: 'Suspicious Duplicate',
  stale_data: 'Stale Data',
  unusual_source: 'Unusual Source',
};

export const CONFIDENCE_LABELS: Record<MatchConfidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  review_required: 'Review Required',
};
