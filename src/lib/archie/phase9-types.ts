// =========================================================
// FRELUX PHASE 9, ARCHIE GLOBAL GENERAL INTELLIGENCE — TYPES
//
// Shared types for the Phase 9 evolution:
//  - Global / location-aware context resolution
//  - Multilingual language intelligence
//  - Regional market & price observation separation
//  - Weather/environmental intelligence
//  - Cross-domain reasoning
//  - Reusable knowledge core
//  - Open-ended domain discovery/registration
//
// Phase 8 foundation contracts (domains, pipeline, provenance,
// evidence states, scopes, cost governance, authority) are
// REUSED, never redefined here.
// =========================================================

import type { ArchieDomain, ArchieRiskClass } from "./types";
import type { FreluxLocation } from "@/lib/location-intelligence/model";

/** Where a location came from, for precedence resolution. */
export type LocationAuthoritySource =
  | "USER_PROJECT_LOCATION" // explicitly supplied project/property location — highest
  | "USER_SELECTED_LOCATION" // user-picked map pin / search
  | "DEVICE_LOCATION"; // device geolocation, consent-gated

/** Resolved location authority. Project location ALWAYS wins. */
export interface LocationAuthorityResolution {
  effective_location: FreluxLocation;
  source: LocationAuthoritySource;
  /** Human-readable reason for audit trails. */
  reason: string;
}

/** Regional conventions resolved from a location. */
export interface RegionalProfile {
  country_code: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  currency: string;
  units: "metric";
  /** Suggested language codes (BCP-47), suggestion only. */
  suggested_languages: string[];
  /** Market/climate context keys, resolved at runtime from
   *  existing market_profiles / weather architecture. */
  market_context_keys: string[];
  climate_zone: string | null;
}

/** Consent model: location permission grants LOCATION ONLY. */
export interface LocationConsent {
  location_granted: boolean;
  /** Explicit OS/browser permission for unrelated device data. */
  private_device_data_granted: boolean;
}

/** A single language in the registry (DB row / seed shape). */
export interface ArchieLanguage {
  /** BCP-47 code, e.g. en, fr, ha, yo, ig, pcm, es. */
  code: string;
  label: string;
  /** English label for admin UI. */
  native_label: string;
  /** Regions where the language is commonly used (hints). */
  common_regions: string[];
  active: boolean;
}

/** How a language was resolved for a session. */
export type LanguageResolutionSource =
  | "USER_SELECTION" // authoritative
  | "LOCATION_SUGGESTION"; // advisory only

export interface LanguageResolution {
  language_code: string;
  source: LanguageResolutionSource;
  /** True when this came from the user, never overridable. */
  authoritative: boolean;
}

/** Multilingual terminology entry (LEARN → VERIFY → VERSION → USE). */
export interface TerminologyEntry {
  domain: string;
  language_code: string;
  /** Canonical English/architecture term (the anchor). */
  canonical_term: string;
  /** Regional expression in the target language. */
  regional_term: string;
  meaning_note?: string;
  /** Mirrors the evidence states; UNVERIFIED is never used
   *  as authoritative terminology in outputs. */
  verification_status: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  version: number;
  provenance: {
    source_ref?: string;
    contributor_id?: string;
    learned_at: string;
  };
}

/** The four price kinds, ALWAYS distinguishable. */
export type PriceKind =
  | "OBSERVED_MARKET_PRICE"
  | "FRELUX_CONFIGURED_PRICE"
  | "ACTUAL_PROJECT_PRICE"
  | "ESTIMATE_ASSUMPTION";

/** An observed market data point. NEVER authoritative for
 *  calculator math; calculators read FRELUX configuration only. */
export interface MarketObservation {
  kind:
    | "MATERIAL_PRICE"
    | "LABOUR_RATE"
    | "PACKAGE_SIZE"
    | "AVAILABILITY"
    | "TREND";
  region: string;
  item: string;
  value: number;
  currency: string;
  unit: string;
  price_kind: PriceKind;
  observed_at: string;
  confidence: number; // 0..1
  source_ref?: string;
}

/** Weather-sensitive work categories. */
export type WeatherSensitiveWork =
  | "EXTERIOR_PAINTING"
  | "INTERIOR_PAINTING"
  | "SCREEDING"
  | "CONCRETE_POURING"
  | "ROOFING"
  | "TILING"
  | "EXCAVATION";

export interface WeatherWorkAdvisory {
  work: WeatherSensitiveWork;
  /** suitability today, from deterministic thresholds. */
  rating: "SUITABLE" | "CAUTION" | "UNSUITABLE";
  reason: string;
  /** Weather only influences recommendations where technically
   *  relevant; irrelevant work returns NO_WEATHER_DEPENDENCY. */
  relevant: boolean;
}

/** Registered relation between two domains. Relations must be
 *  EXPLICIT; the reasoner never fabricates them. */
export interface DomainRelation {
  from_domain: string;
  to_domain: string;
  relation: string;
  /** Why the relation exists — kept for audit/explanation. */
  rationale: string;
}

/** Result of selecting domains relevant to a question/context. */
export interface DomainSelectionResult {
  selected: string[];
  /** Domains considered but excluded, with reasons. */
  excluded: Array<{ domain: string; reason: string }>;
}

/** Knowledge-core access grant for an authorized application. */
export interface KnowledgeCoreGrant {
  application_id: string;
  application_label: string;
  /** Which knowledge scopes this app may read. */
  scopes: Array<"GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER">;
  /** Which domains this app may consume; empty = none. */
  domains: string[];
  /** Explicit USER-scope access requires end-user consent. */
  user_scope_requires_consent: true;
}

/** A reusable knowledge-core query. */
export interface KnowledgeCoreQuery {
  application_id: string;
  scopes: Array<"GLOBAL" | "REGIONAL" | "PROJECT" | "PROPERTY" | "USER">;
  domains: string[];
  region?: string;
  /** Present and true only when USER scope is requested. */
  user_consent?: boolean;
}

/** Phase 9 domain-registration lifecycle (§2, §16). */
export const DOMAIN_DISCOVERY_LIFECYCLE = [
  "DISCOVERED",
  "CLASSIFIED",
  "ACQUIRED",
  "STRUCTURED",
  "VERIFIED",
  "EVALUATED",
  "VERSIONED",
  "REGISTERED",
  "REJECTED",
] as const;
export type DomainDiscoveryState = (typeof DOMAIN_DISCOVERY_LIFECYCLE)[number];

/** A new-domain registration request flowing to approval. */
export interface DomainRegistrationRequest {
  proposed_key: string;
  label: string;
  description: string;
  rationale: string;
  /** §16: every domain carries its governance metadata. */
  knowledge_sources: string[];
  learning_rules: string[];
  verification_requirements: string[];
  regional_scope: string[];
  language_scope: string[];
  risk_class: ArchieRiskClass;
  permissions: string[];
  provenance: {
    discovered_by: string;
    discovered_at: string;
    source_ref?: string;
  };
}

/** A planning assistance proposal (never an irreversible action). */
export interface PlanningProposal {
  plan_type:
    | "DAILY_ROUTINE"
    | "TASK_PLAN"
    | "PROJECT_PLAN"
    | "STUDY_PLAN"
    | "FITNESS_PLAN"
    | "TRAVEL_PLAN"
    | "HOUSEHOLD_PLAN"
    | "SHOPPING_PLAN"
    | "CONTENT_PLAN"
    | "LEARNING_PLAN";
  title: string;
  steps: Array<{ order: number; description: string }>;
  assumptions: string[];
  /** High-consequence areas always carry their disclaimers. */
  disclaimers: string[];
}

/** Extended ARCHIE domain shape (Phase 9 §16 columns). */
export interface ArchieDomainPhase9 extends ArchieDomain {
  domain_version: number;
  knowledge_sources: string[];
  learning_rules: string[];
  verification_requirements: string[];
  regional_scope: string[];
  language_scope: string[];
  permissions: string[];
  retrieval_config: Record<string, unknown>;
  application_mappings: Record<string, string[]>;
}
