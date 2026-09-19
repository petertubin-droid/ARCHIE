/**
 * FRELUX PROPERTY INTELLIGENCE, PROPERTY RISK FLAGS
 *
 * Prompt 4, Phase 12: transparent, evidence-based property risk flags.
 * Same rules as construction-intelligence/risk-flags: no arbitrary risk
 * scores; every flag explains exactly why it exists, from the data given.
 */

import type { PropertyProfile } from "./types";
import { resolveRegionalContext } from "./location";
import type { ComparableEvaluation } from "./market-data";

// =========================================================
// Types
// =========================================================

export type PropertyRiskSeverity = "info" | "warning" | "critical";

export type PropertyRiskCode =
  | "missing_location" // no usable location at all
  | "location_requires_confirmation" // country unknown, profile pending
  | "region_unsupported" // no regional profile, no fallback applied
  | "unverified_property_info" // profile values awaiting verification
  | "low_confidence_ai_data" // AI-extracted values below threshold
  | "missing_documents" // no supporting documents attached
  | "missing_dimensions" // no building/land dimensions anywhere
  | "insufficient_comparables" // comparable analysis says insufficient
  | "no_market_data" // no market data for the region
  | "outdated_market_data" // comparable data older than the window
  | "unpriced_construction_items" // construction cost has unpriced items
  | "condition_unverified"; // condition claims not from authoritative source

export const PROPERTY_RISK_LABELS: Record<PropertyRiskCode, string> = {
  missing_location: "Missing location",
  location_requires_confirmation: "Location needs confirmation",
  region_unsupported: "Region not supported",
  unverified_property_info: "Unverified property information",
  low_confidence_ai_data: "Low confidence AI data",
  missing_documents: "Missing documents",
  missing_dimensions: "Missing dimensions",
  insufficient_comparables: "Insufficient comparables",
  no_market_data: "No market data for this region",
  outdated_market_data: "Outdated market data",
  unpriced_construction_items: "Unpriced construction items",
  condition_unverified: "Building condition unverified",
};

export interface PropertyRiskFlag {
  code: PropertyRiskCode;
  severity: PropertyRiskSeverity;
  title: string;
  reason: string;
  /** Phase 5 §15: where the risk bites (which analysis is affected). */
  affectedArea: string;
  /** Phase 5 §15: what the risk is evidenced by. */
  evidence: string;
  /** Phase 5 §15: deterministic recommended verification/action. */
  recommendedAction: string;
  /** Phase 5 §15: current handling status. */
  status: "open" | "mitigated_by_disclosure" | "requires_user_action";
}

export interface PropertyRiskInput {
  profile: PropertyProfile;
  /** Comparable evaluation result, if one was run. */
  comparables?: ComparableEvaluation;
  /** Unpriced construction item names (from Construction Intelligence). */
  unpricedConstructionItems?: string[];
  /**
   * Is any building condition value present WITHOUT authoritative
   * verification? FRELUX never claims condition from photographs alone.
   */
  conditionClaimedWithoutSource?: boolean;
  /** Max comparable data age in days, default 180 (used for the outdated flag). */
  comparableMaxAgeDays?: number;
  /** Oldest comparable observation date actually used, if any. */
  oldestComparableDate?: string;
}

// =========================================================
// Evaluation
// =========================================================

type DraftRiskFlag = Omit<
  PropertyRiskFlag,
  "affectedArea" | "evidence" | "recommendedAction" | "status"
>;

export function evaluatePropertyRisks(
  input: PropertyRiskInput,
): PropertyRiskFlag[] {
  const flags: DraftRiskFlag[] = [];
  const { profile } = input;

  // --- Location ---
  const hasAnyLocation =
    Boolean(profile.location.address) ||
    Boolean(profile.location.city) ||
    Boolean(profile.location.coordinates);
  if (!hasAnyLocation) {
    flags.push({
      code: "missing_location",
      severity: "critical",
      title: "No location information",
      reason:
        "The property has no address, city or coordinates. Location analysis and regional pricing cannot proceed.",
    });
  } else {
    const resolution = resolveRegionalContext({
      country: profile.location.country,
      region: profile.location.region,
      city: profile.location.city,
      coordinates: profile.location.coordinates,
    });
    if (resolution.status === "requires_confirmation") {
      flags.push({
        code: "location_requires_confirmation",
        severity: "warning",
        title: "Location requires confirmation",
        reason: resolution.reason,
      });
    } else if (resolution.status === "unsupported") {
      flags.push({
        code: "region_unsupported",
        severity: "info",
        title: "Property market data unavailable for this region",
        reason: `${resolution.reason} Universal building analysis remains available.`,
      });
    }
  }

  // --- Unverified / low-confidence profile values ---
  const unverifiedFields: string[] = [];
  const lowConfidenceFields: string[] = [];
  const checkProvenance = (
    label: string,
    p?: { confidence?: number; verificationStatus: string },
  ) => {
    if (!p) return;
    if (
      p.verificationStatus === "requires_confirmation" ||
      p.verificationStatus === "unverified"
    ) {
      unverifiedFields.push(label);
    }
    if (p.confidence !== undefined && p.confidence < 0.7) {
      lowConfidenceFields.push(
        `${label} (${Math.round(p.confidence * 100)}% confidence)`,
      );
    }
  };
  checkProvenance("location", profile.location.provenance);
  checkProvenance("land information", profile.land?.provenance);
  if (profile.provenance)
    checkProvenance("property details", profile.provenance);

  if (unverifiedFields.length > 0) {
    flags.push({
      code: "unverified_property_info",
      severity: "warning",
      title: "Unverified property information",
      reason: `The following information has not been verified: ${unverifiedFields.join(", ")}. Confirm it before relying on analysis results.`,
    });
  }
  if (lowConfidenceFields.length > 0) {
    flags.push({
      code: "low_confidence_ai_data",
      severity: "warning",
      title: "Low confidence AI-detected data",
      reason: `AI-detected values below the 70% confidence threshold need your confirmation: ${lowConfidenceFields.join(", ")}.`,
    });
  }

  // --- Documents ---
  if (!profile.documents || profile.documents.length === 0) {
    flags.push({
      code: "missing_documents",
      severity: "info",
      title: "No supporting documents",
      reason:
        "No property documents (title documents, plans, survey) are attached. FRELUX makes no ownership, title or planning claims.",
    });
  }

  // --- Dimensions ---
  if (profile.land?.size === undefined && !profile.constructionProjectId) {
    flags.push({
      code: "missing_dimensions",
      severity: "warning",
      title: "Missing dimensions",
      reason:
        "No land size is recorded and no Construction Intelligence project is linked, so no size-based analysis (price per m², development quantities) can be produced.",
    });
  }

  // --- Comparables / market data ---
  if (input.comparables) {
    if (input.comparables.status === "insufficient_data") {
      flags.push({
        code: "insufficient_comparables",
        severity: "warning",
        title: "Insufficient data for reliable comparison",
        reason: input.comparables.reason,
      });
    }
    const maxAge = input.comparableMaxAgeDays ?? 180;
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    if (
      input.oldestComparableDate &&
      new Date(input.oldestComparableDate).getTime() < cutoff
    ) {
      flags.push({
        code: "outdated_market_data",
        severity: "info",
        title: "Outdated market data",
        reason: `The oldest comparable used was observed on ${input.oldestComparableDate}, older than the ${maxAge}-day freshness window. Treat comparison results with caution.`,
      });
    }
  }

  // --- Construction cost gaps ---
  if (
    input.unpricedConstructionItems &&
    input.unpricedConstructionItems.length > 0
  ) {
    flags.push({
      code: "unpriced_construction_items",
      severity: "warning",
      title: "Unpriced construction items",
      reason: `The construction cost estimate excludes unpriced items: ${input.unpricedConstructionItems.join(", ")}. The true cost is higher than the shown total.`,
    });
  }

  // --- Condition claims ---
  if (input.conditionClaimedWithoutSource) {
    flags.push({
      code: "condition_unverified",
      severity: "warning",
      title: "Building condition unverified",
      reason:
        "A building condition value is present without an authoritative source. FRELUX does not claim structural condition from photographs, a professional inspection is required.",
    });
  }

  return flags.map((flag) => ({
    ...flag,
    ...RISK_FLAG_META[flag.code],
  }));
}

/**
 * Phase 5 §15: deterministic metadata for every risk code, evidence,
 * affected area, recommended action and status. No risk is given a
 * score merely to populate the interface; each entry maps to the
 * concrete condition that raised it.
 */
export const RISK_FLAG_META: Record<
  PropertyRiskCode,
  {
    affectedArea: string;
    evidence: string;
    recommendedAction: string;
    status: PropertyRiskFlag["status"];
  }
> = {
  missing_location: {
    affectedArea: "Location Intelligence, market context, regional pricing",
    evidence: "The profile contains no address, city or coordinates.",
    recommendedAction: "Add at least an address, city or coordinates.",
    status: "requires_user_action",
  },
  location_requires_confirmation: {
    affectedArea: "Regional construction and market profiles",
    evidence:
      "The recorded country/region could not be resolved to a regional profile.",
    recommendedAction:
      "Confirm the property country so the correct regional profile applies.",
    status: "requires_user_action",
  },
  region_unsupported: {
    affectedArea: "Region-specific market data",
    evidence: "No regional profile exists for this location.",
    recommendedAction:
      "Property intelligence for this region is unavailable; universal building analysis still works.",
    status: "mitigated_by_disclosure",
  },
  unverified_property_info: {
    affectedArea: "All analyses that use the affected fields",
    evidence:
      "Field-level provenance records an unverified or requires-confirmation status.",
    recommendedAction:
      "Review and confirm the listed values before relying on the analyses that use them.",
    status: "requires_user_action",
  },
  low_confidence_ai_data: {
    affectedArea: "Analyses built on AI-extracted values",
    evidence: "AI extraction confidence below the 70% threshold.",
    recommendedAction: "Confirm the AI-extracted values or correct them.",
    status: "requires_user_action",
  },
  missing_documents: {
    affectedArea: "Document-based verification",
    evidence: "No documents are attached to the property profile.",
    recommendedAction:
      "Attach relevant documents if available. FRELUX makes no ownership, title or planning claims either way.",
    status: "mitigated_by_disclosure",
  },
  missing_dimensions: {
    affectedArea: "Price-per-area analysis, development quantities",
    evidence:
      "No land size recorded and no linked Construction Intelligence project.",
    recommendedAction:
      "Record the plot size or link a construction project with the relevant dimensions.",
    status: "requires_user_action",
  },
  insufficient_comparables: {
    affectedArea: "Comparable analysis, indicative value estimation",
    evidence:
      "The deterministic comparable screen rejected too many candidates.",
    recommendedAction:
      "Add more traceable listings/transactions for the location, or accept that no comparison can be produced.",
    status: "mitigated_by_disclosure",
  },
  outdated_market_data: {
    affectedArea: "Market context and indicative value freshness",
    evidence: "At least one comparable is older than the freshness window.",
    recommendedAction:
      "Treat market-derived results as dated; refresh listings where possible.",
    status: "mitigated_by_disclosure",
  },
  unpriced_construction_items: {
    affectedArea: "Total cost, margin and investment analysis",
    evidence: "Construction estimate explicitly excludes unpriced items.",
    recommendedAction:
      "Price the listed items before treating the total as complete.",
    status: "requires_user_action",
  },
  no_market_data: {
    affectedArea: "Market context, comparable analysis",
    evidence: "No market listings/transactions are recorded for the location.",
    recommendedAction:
      "Record traceable listings (with source and observation date) to enable market context.",
    status: "requires_user_action",
  },
  condition_unverified: {
    affectedArea: "Condition assessment",
    evidence: "Condition value present without an authoritative source.",
    recommendedAction:
      "Obtain a professional inspection before decisions that depend on condition.",
    status: "requires_user_action",
  },
};
