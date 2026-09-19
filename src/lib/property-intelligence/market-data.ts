/**
 * FRELUX PROPERTY INTELLIGENCE, MARKET DATA & COMPARABLES
 *
 * Prompt 4, Phases 8–10: data structures and evaluation architecture for
 * property market analysis. NO fabricated listings, NO fake comparables,
 * NO asking-price-as-transaction-price, and never "nearest = comparable".
 *
 * This module contains NO data source integration, records must come from
 * legitimate configured providers or verified user/admin input, each with
 * provenance. With no provider connected, evaluation returns
 * insufficient_data, never invented comparables.
 */

// =========================================================
// Listing records (Phase 8)
// =========================================================

export interface PropertyListing {
  id: string;
  propertyType: string;
  /** Country ISO code + optional region/city for location matching. */
  country: string;
  region?: string;
  city?: string;
  /** Asking price, displayed as ASKING, never as a transaction value. */
  askingPrice?: { amount: number; currency: string };
  /**
   * Transaction price, only for VERIFIED completed sales.
   * Its provenance must have verificationStatus 'verified'.
   */
  transactionPrice?: { amount: number; currency: string; provenanceVerified: boolean };
  landSize?: { value: number; unit: string };
  buildingSize?: { value: number; unit: string };
  bedrooms?: number;
  bathrooms?: number;
  condition?: string;
  constructionStatus?: string;
  /** ISO date the data was collected/the listing was observed. */
  observedAt: string;
  currency: string;
  source: string;
  confidence: number; // 0–1
  provenance: {
    sourceType: string;
    verificationStatus: "verified" | "unverified" | "requires_confirmation";
  };
}

export function isVerifiedTransaction(listing: PropertyListing): boolean {
  return (
    listing.transactionPrice !== undefined &&
    listing.transactionPrice.provenanceVerified === true &&
    listing.provenance.verificationStatus === "verified"
  );
}

/** Deterministic price-per-unit for a listing. Asking and transaction kept separate. */
export function askingPricePer(
  listing: PropertyListing,
  dimension: "land" | "building",
): number | undefined {
  const size = dimension === "land" ? listing.landSize : listing.buildingSize;
  if (!listing.askingPrice || !size || size.value <= 0) return undefined;
  return listing.askingPrice.amount / size.value;
}

export function transactionPricePer(
  listing: PropertyListing,
  dimension: "land" | "building",
): number | undefined {
  const size = dimension === "land" ? listing.landSize : listing.buildingSize;
  if (!listing.transactionPrice || !size || size.value <= 0) return undefined;
  if (!isVerifiedTransaction(listing)) return undefined;
  return listing.transactionPrice.amount / size.value;
}

// =========================================================
// Comparable evaluation (Phase 9)
// =========================================================

export interface ComparableCriteria {
  propertyType: string;
  country: string;
  region?: string;
  /** Max acceptable listing age in days. Default 180. */
  maxAgeDays?: number;
  /** Max land-size deviation from subject, percent. Default 40. */
  landSizeTolerancePercent?: number;
  /** Max building-size deviation from subject, percent. Default 40. */
  buildingSizeTolerancePercent?: number;
  /** Minimum acceptable comparables for an analysis. Default 3. */
  minComparables?: number;
  /** Subject land size for tolerance checks, if known. */
  subjectLandSize?: { value: number; unit: string };
  /** Subject building size for tolerance checks, if known. */
  subjectBuildingSize?: { value: number; unit: string };
  currency: string;
}

export interface ComparableEvaluation {
  status: "sufficient" | "insufficient_data";
  /** Included comparables, each with a TRACEABLE inclusion reason. */
  comparables: Array<{ listing: PropertyListing; inclusionReason: string }>;
  /** Excluded candidates, each with a traceable exclusion reason. */
  excluded: Array<{ listingId: string; exclusionReason: string }>;
  reason: string;
}

function ageInDays(observedAt: string): number | undefined {
  const t = new Date(observedAt).getTime();
  if (!Number.isFinite(t)) return undefined;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

/**
 * Evaluates candidate listings against the subject criteria. A listing is a
 * comparable only if it satisfies EVERY check, each inclusion/exclusion
 * carries a traceable reason. Insufficient candidates → insufficient_data.
 */
export function evaluateComparables(
  criteria: ComparableCriteria,
  candidates: PropertyListing[],
): ComparableEvaluation {
  const maxAge = criteria.maxAgeDays ?? 180;
  const landTol = criteria.landSizeTolerancePercent ?? 40;
  const bldgTol = criteria.buildingSizeTolerancePercent ?? 40;
  const minCount = criteria.minComparables ?? 3;

  const comparables: ComparableEvaluation["comparables"] = [];
  const excluded: ComparableEvaluation["excluded"] = [];

  for (const listing of candidates) {
    const reasons: string[] = [];

    if (listing.propertyType !== criteria.propertyType) {
      excluded.push({
        listingId: listing.id,
        exclusionReason: `Property type "${listing.propertyType}" does not match subject type "${criteria.propertyType}".`,
      });
      continue;
    }
    reasons.push(`same property type (${criteria.propertyType})`);

    if (listing.country.toUpperCase() !== criteria.country.toUpperCase()) {
      excluded.push({
        listingId: listing.id,
        exclusionReason: `Country ${listing.country} does not match subject country ${criteria.country}.`,
      });
      continue;
    }
    const locationNote = criteria.region && listing.region
      ? listing.region === criteria.region
        ? `same region (${criteria.region})`
        : `same country, region "${listing.region}" differs from subject region`
      : "same country";
    reasons.push(locationNote);

    if (listing.currency !== criteria.currency) {
      excluded.push({
        listingId: listing.id,
        exclusionReason: `Listing currency ${listing.currency} differs from analysis currency ${criteria.currency}. Cross-currency comparables are not mixed.`,
      });
      continue;
    }

    const age = ageInDays(listing.observedAt);
    if (age === undefined || age > maxAge) {
      excluded.push({
        listingId: listing.id,
        exclusionReason:
          age === undefined
            ? "Listing date is missing or invalid."
            : `Listing is ${age} days old (max ${maxAge}).`,
      });
      continue;
    }
    reasons.push(`data collected ${age} days ago (within ${maxAge}-day window)`);

    if (
      criteria.subjectLandSize &&
      listing.landSize &&
      listing.landSize.unit !== criteria.subjectLandSize.unit
    ) {
      excluded.push({
        listingId: listing.id,
        exclusionReason: `Land size unit "${listing.landSize.unit}" differs from subject unit "${criteria.subjectLandSize.unit}" and was not silently converted.`,
      });
      continue;
    }
    if (criteria.subjectLandSize && listing.landSize) {
      const delta =
        Math.abs(listing.landSize.value - criteria.subjectLandSize.value) /
        criteria.subjectLandSize.value;
      if (delta * 100 > landTol) {
        excluded.push({
          listingId: listing.id,
          exclusionReason: `Land size deviates ${Math.round(delta * 100)}% from the subject (max ${landTol}%).`,
        });
        continue;
      }
      reasons.push(`land size within ${Math.round(delta * 100)}% of subject`);
    }

    if (
      criteria.subjectBuildingSize &&
      listing.buildingSize &&
      listing.buildingSize.unit !== criteria.subjectBuildingSize.unit
    ) {
      excluded.push({
        listingId: listing.id,
        exclusionReason: `Building size unit differs from subject and was not silently converted.`,
      });
      continue;
    }
    if (criteria.subjectBuildingSize && listing.buildingSize) {
      const delta =
        Math.abs(listing.buildingSize.value - criteria.subjectBuildingSize.value) /
        criteria.subjectBuildingSize.value;
      if (delta * 100 > bldgTol) {
        excluded.push({
          listingId: listing.id,
          exclusionReason: `Building size deviates ${Math.round(delta * 100)}% from the subject (max ${bldgTol}%).`,
        });
        continue;
      }
      reasons.push(`building size within ${Math.round(delta * 100)}% of subject`);
    }

    comparables.push({
      listing,
      inclusionReason: reasons.join("; "),
    });
  }

  if (comparables.length < minCount) {
    return {
      status: "insufficient_data",
      comparables,
      excluded,
      reason: `Insufficient data for reliable comparison: ${comparables.length} comparable listing(s) passed all checks (${minCount} required). No comparison was fabricated.`,
    };
  }

  return {
    status: "sufficient",
    comparables,
    excluded,
    reason: `${comparables.length} comparables passed all checks (type, location, currency, data age, size tolerances).`,
  };
}
