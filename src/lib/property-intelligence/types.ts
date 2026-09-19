/**
 * FRELUX PROPERTY INTELLIGENCE, TYPES
 *
 * Prompt 4 foundation: a unified property profile built on the Global
 * Foundation (Prompt 2). Every externally sourced data point retains
 * provenance. Nothing is invented: unknown fields stay undefined and are
 * surfaced by the risk-flag layer as explicit gaps.
 *
 * FRELUX is NOT a licensed valuer, surveyor or structural engineer. The
 * data-class taxonomy below is how the UI must label every value.
 */

// =========================================================
// Data classification (Prompt 4, Phase 1)
// =========================================================

export type PropertyDataClass =
  | "fact" // authoritative / verified source
  | "source_derived" // derived from a legitimate external source
  | "ai_detected" // extracted by the Prompt 1 AI layer, needs verification
  | "user_provided" // entered by the user, not independently verified
  | "calculated" // deterministic FRELUX engine output
  | "estimated" // modelled from available inputs
  | "unverified" // present but awaiting confirmation
  | "data_unavailable"; // explicitly missing

export const DATA_CLASS_LABELS: Record<PropertyDataClass, string> = {
  fact: "Fact",
  source_derived: "Source derived",
  ai_detected: "AI detected",
  user_provided: "User provided",
  calculated: "Calculated",
  estimated: "Estimated",
  unverified: "Unverified",
  data_unavailable: "Data unavailable",
};

/** Every externally sourced value carries provenance. */
export interface Provenance {
  /** Where the value came from (e.g. "User input", "Land registry extract"). */
  source: string;
  sourceType:
    | "user"
    | "document"
    | "ai_extraction"
    | "provider"
    | "admin_verified"
    | "engine";
  /** ISO date the value was collected/observed. */
  collectedAt?: string;
  /** ISO date the value is effective for (e.g. a price's effective date). */
  effectiveAt?: string;
  /** 0–1 confidence where applicable (AI extraction). */
  confidence?: number;
  verificationStatus:
    "verified" | "unverified" | "requires_confirmation" | "rejected";
}

export function provenanceClass(p: Provenance): PropertyDataClass {
  if (p.verificationStatus === "rejected") return "unverified";
  if (p.verificationStatus === "verified") {
    return p.sourceType === "ai_extraction"
      ? "fact"
      : p.sourceType === "user"
        ? "user_provided"
        : "source_derived";
  }
  if (p.sourceType === "ai_extraction") return "ai_detected";
  return "unverified";
}

// =========================================================
// Location
// =========================================================

export interface PropertyLocation {
  address?: string;
  country?: string; // ISO 3166-1 alpha-2
  region?: string; // state/province
  city?: string;
  district?: string;
  coordinates?: { lat: number; lng: number };
  provenance?: Provenance;
}

// =========================================================
// Property profile (Prompt 4, Phase 2)
// =========================================================

export type PropertyType =
  | "detached"
  | "semi_detached"
  | "terraced"
  | "apartment"
  | "duplex"
  | "bungalow"
  | "commercial"
  | "land"
  | "other";

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  detached: "Detached house",
  semi_detached: "Semi detached",
  terraced: "Terraced",
  apartment: "Apartment",
  duplex: "Duplex",
  bungalow: "Bungalow",
  commercial: "Commercial",
  land: "Land",
  other: "Other",
};

export type ConstructionStatus =
  | "planned"
  | "under_construction"
  | "completed"
  | "renovating"
  | "derelict"
  | "unknown";

export interface LandInfo {
  size?: number;
  unit?: string; // e.g. "m²", "sq ft", "hectares", regional units
  provenance?: Provenance;
}

export interface PropertyProfile {
  id: string;
  name?: string;
  location: PropertyLocation;
  propertyType?: PropertyType;
  buildingType?: string;
  numberOfBuildings?: number;
  numberOfFloors?: number;
  /** Phase 5: rooms where reliably known. */
  numberOfRooms?: number;
  land?: LandInfo;
  constructionStatus?: ConstructionStatus;
  /** Phase 5 §6: user-observed existing condition summary (free text,
   *  user_provided, never AI-certified). */
  existingCondition?: string;
  /** Phase 5: development stage of the property itself. */
  developmentStatus?:
    "greenfield" | "existing" | "developing" | "redeveloping" | "unknown";
  /** Reference to the linked Construction Intelligence project, if any. */
  constructionProjectId?: string;
  /** Document/image attachment ids (storage keys), with provenance. */
  documents?: Array<{ id: string; kind: string; provenance: Provenance }>;
  createdAt: string;
  updatedAt: string;
  /** Provenance of the profile as a whole. */
  provenance?: Provenance;
}

/** Required vs optional, only location identity is required. */
export function validatePropertyProfile(profile: PropertyProfile): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!profile.id) issues.push("Property id is required.");
  if (
    !profile.location.address &&
    !profile.location.city &&
    !profile.location.coordinates
  ) {
    issues.push("At least an address, city or coordinates are required.");
  }
  return { valid: issues.length === 0, issues };
}
