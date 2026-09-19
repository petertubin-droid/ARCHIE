// =========================================================
// FRELUX PHASE 6.5 ALPHA, EXTERNAL WEB INTELLIGENCE TYPES
//
// Controlled crawling of Admin-approved sources feeding the
// EXISTING learning pipeline. Webpage content is DATA, never
// instructions. No hardcoded website-specific crawler logic.
// =========================================================

export type IntelligenceSourceType =
  | "PRICE"
  | "PRODUCT"
  | "MANUFACTURER"
  | "SUPPLIER"
  | "CONSTRUCTION_KNOWLEDGE"
  | "STANDARD_CODE"
  | "MARKET"
  | "COMPETITOR"
  | "GENERAL_REFERENCE";

export type SourceReliability =
  "AUTHORITATIVE" | "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";

export type CrawlFrequency =
  "MANUAL" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface IntelligenceSource {
  id: string;
  name: string;
  base_url: string;
  source_type: IntelligenceSourceType;
  country: string;
  region: string | null;
  language: string;
  purpose: string | null;
  allowed_paths: string[];
  crawl_frequency: CrawlFrequency;
  max_pages: number;
  enabled: boolean;
  is_price_source: boolean;
  is_product_source: boolean;
  is_knowledge_source: boolean;
  learning_eligible: boolean;
  reliability: SourceReliability;
  notes: string | null;
  created_date: string;
  updated_date: string;
  last_crawl: string | null;
  next_crawl: string | null;
}

export interface CrawlRun {
  id: string;
  source_id: string;
  trigger_kind: "MANUAL" | "SCHEDULED";
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED" | "BLOCKED";
  started_at: string;
  finished_at: string | null;
  pages_attempted: number;
  pages_processed: number;
  pages_rejected: number;
  pages_unchanged: number;
  new_facts: number;
  changed_facts: number;
  candidates_generated: number;
  knowledge_promoted: number;
  errors: unknown[];
  failure_reason: string | null;
  triggered_by: string | null;
}

export interface ExtractedProduct {
  product_name: string | null;
  manufacturer: string | null;
  product_category: string | null;
  package_size: string | null;
  unit: string | null;
  specification: string | null;
  coverage: string | null;
  application_info: string | null;
  material_info: string | null;
  price: number | null;
  currency: string | null;
  availability: string | null;
  location: string | null;
  supplier: string | null;
  terminology: string[];
  methods: string[];
  standards_refs: string[];
  published_at: string | null;
  retrieved_at: string;
  url: string;
  uncertain_fields: string[];
  confidence: number | null;
}

export interface PriceObservation {
  product_name: string;
  price: number;
  currency: string;
  unit_package: string | null;
  region: string | null;
  country: string;
  supplier: string | null;
  url: string;
  retrieved_at: string;
  published_at: string | null;
  source_reliability: SourceReliability;
  evidence: Record<string, unknown>;
  confidence: number;
  verification_status: "PENDING" | "VERIFIED" | "REJECTED";
}

/** Structured search result from an approved provider adapter. */
export interface SearchCandidate {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  retrieved_at: string;
}

/** The three kinds of price, never conflated. */
export type PriceKind =
  "OBSERVED_MARKET" | "FRELUX_CONFIGURED" | "VERIFIED_ACTUAL";
