// =========================================================
// FRELUX PROPERTY INTELLIGENCE, REPORT ORCHESTRATOR (§2–§20)
//
// Builds the single canonical Property Intelligence report from:
//   property profile (verified/user/AI-extracted, provenance-tracked)
//   + location / regional context (§4, §18)
//   + observable condition assessment (§6)
//   + development scenarios (§7, §8)
//   + property cost view (§9)
//   + comparable evidence / indicative value (§11, §12)
//   + investment analysis (§13)
//   + structured risks (§15)
//   + freshness + trust chain (§19, §20)
//
// The report separates, for every value:
//   VERIFIED → USER-PROVIDED → AI-EXTRACTED → ESTIMATED →
//   ASSUMPTION → AI ANALYSIS → UNAVAILABLE
// Never is an assumption presented as a fact.
// =========================================================

import type { PropertyProfile } from "./types";
import { validatePropertyProfile } from "./types";
import {
  assessCondition,
  type ConditionObservation,
  type ConditionAssessment,
  CONDITION_CATEGORY_LABELS,
} from "./property-condition";
import {
  estimateIndicativeValue,
  type ValueEstimate,
  classifyMarketFreshness,
} from "./property-value";
import type { PropertyListing, ComparableCriteria } from "./market-data";
import {
  compareDevelopmentScenarios,
  requiredInformationFor,
  type PropertyDevelopmentScenario,
  type ScenarioComparison,
  type InvestmentAnalysisInput,
  type InvestmentAnalysis,
  analyseInvestment,
  STRUCTURAL_FEASIBILITY_NOTE,
} from "./development-investment";
import {
  evaluatePropertyRisks,
  type PropertyRiskFlag,
} from "./property-risk-flags";

export const PROPERTY_INTELLIGENCE_DISCLAIMER =
  "FRELUX provides decision support built on recorded data and deterministic calculations, not professional property valuation, legal, financial or engineering advice.";

export const REGION_UNAVAILABLE_MESSAGE =
  "Property intelligence unavailable for this region. No regional market profile exists for this location, and FRELUX does not substitute another region’s data.";

// =========================================================
// Input bundle, everything the report may legitimately use
// =========================================================

export interface PropertyIntelligenceInput {
  profile: PropertyProfile;
  /** §6 observable conditions (user / document / AI observations). */
  conditionObservations?: ConditionObservation[];
  /** §7/§8 development scenarios with engine/user estimates. */
  developmentScenarios?: PropertyDevelopmentScenario[];
  /** §13 investment inputs (costs, sale/rent, all user-supplied or
   *  deterministically derived, each with stated provenance). */
  investment?: InvestmentAnalysisInput;
  /** §10 market listings for comparable evidence. */
  marketListings?: PropertyListing[];
  comparableCriteria?: ComparableCriteria;
  /** Analysis time (ISO), freshness is computed against this. */
  nowIso: string;
  /** §4/§18: regional profile status resolved via location-intelligence.
   *  Omitted → 'needs_confirmation' when the country is unknown,
   *  'available' otherwise. 'unavailable' → REGION_UNAVAILABLE_MESSAGE. */
  regionalStatus?: "available" | "needs_confirmation" | "unavailable";
}

// =========================================================
// Report
// =========================================================

export interface DataAvailability {
  field: string;
  dataClass:
    | "verified"
    | "user_provided"
    | "ai_extracted"
    | "estimated"
    | "assumption"
    | "ai_analysis"
    | "unavailable";
  note?: string;
}

export interface PropertyIntelligenceReport {
  propertyId: string;
  generatedAt: string;
  disclaimer: string;
  /** §2–§3: profile completeness + building/project connection. */
  profile: {
    valid: boolean;
    issues: string[];
    connectedConstructionProject: boolean;
    dataAvailability: DataAvailability[];
  };
  /** §4/§18: location + regional context availability. */
  location: {
    country?: string;
    region?: string;
    city?: string;
    status: "available" | "needs_confirmation" | "unavailable";
    message?: string;
  };
  /** §6 */
  condition: ConditionAssessment;
  /** §7/§8 */
  development: {
    scenarios?: ScenarioComparison;
    requiredInformation: Record<string, string[]>;
  };
  /** §9 */
  costView?: InvestmentAnalysis["costView"];
  /** §11/§12 */
  value?: ValueEstimate;
  /** §13 */
  investment?: InvestmentAnalysis;
  /** §15 */
  risks: PropertyRiskFlag[];
  /** §19 */
  freshness: { dataFreshness: string; note: string };
  /** §20: evidence → analysis → conclusion for headline conclusions. */
  trustChain: Array<{
    evidence: string;
    analysis: string;
    conclusion: string;
    confidence: string;
  }>;
}

function profileDataAvailability(profile: PropertyProfile): DataAvailability[] {
  const rows: DataAvailability[] = [];
  const loc = profile.location;
  rows.push({
    field: "Location",
    dataClass: loc.country
      ? loc.provenance?.verificationStatus === "verified"
        ? "verified"
        : "user_provided"
      : "unavailable",
    note:
      loc.address ??
      loc.city ??
      (loc.provenance ? undefined : "no address, city or coordinates recorded"),
  });
  rows.push({
    field: "Property type",
    dataClass: profile.propertyType
      ? profile.provenance?.verificationStatus === "verified"
        ? "verified"
        : "user_provided"
      : "unavailable",
    note: profile.propertyType,
  });
  rows.push({
    field: "Floors",
    dataClass:
      profile.numberOfFloors !== undefined ? "user_provided" : "unavailable",
  });
  rows.push({
    field: "Rooms",
    dataClass:
      profile.numberOfRooms !== undefined ? "user_provided" : "unavailable",
  });
  rows.push({
    field: "Land / site size",
    dataClass:
      profile.land?.size !== undefined ? "user_provided" : "unavailable",
    note:
      profile.land?.size !== undefined
        ? `${profile.land.size} ${profile.land.unit ?? ""}`.trim()
        : undefined,
  });
  rows.push({
    field: "Existing condition",
    dataClass: profile.existingCondition ? "user_provided" : "unavailable",
    note: "observable description only, not a certified condition survey",
  });
  rows.push({
    field: "Construction status",
    dataClass:
      profile.constructionStatus && profile.constructionStatus !== "unknown"
        ? "user_provided"
        : "unavailable",
  });
  if (profile.constructionProjectId) {
    rows.push({
      field: "Construction project (Building Model connection)",
      dataClass: "verified",
      note: `linked project ${profile.constructionProjectId}, deterministic FRELUX estimates flow through it (§3, §17)`,
    });
  }
  return rows;
}

/** Build the canonical Property Intelligence report (pure). */
export function buildPropertyIntelligenceReport(
  input: PropertyIntelligenceInput,
): PropertyIntelligenceReport {
  const { profile, nowIso } = input;
  const validation = validatePropertyProfile(profile);

  // §4/§18: location + regional availability. The regional profile
  // lookup itself is async (location-intelligence); the report
  // records the resolved status the caller supplies via
  // regionalStatus (or 'needs_confirmation' when unknown).
  const country = profile.location.country;
  const location: PropertyIntelligenceReport["location"] = {
    country,
    region: profile.location.region,
    city: profile.location.city,
    status:
      input.regionalStatus ?? (country ? "available" : "needs_confirmation"),
    message:
      input.regionalStatus === "unavailable"
        ? REGION_UNAVAILABLE_MESSAGE
        : input.regionalStatus === "needs_confirmation"
          ? "Location country is not confirmed. Regional market and construction profiles apply only once the location is confirmed."
          : undefined,
  };

  // §6: with no observations the assessment is a pure gap list :
  // unassessed categories are explicit, nothing is inferred.
  const condition = assessCondition(input.conditionObservations ?? []);

  const development: PropertyIntelligenceReport["development"] = {
    requiredInformation: {},
  };
  if (input.developmentScenarios && input.developmentScenarios.length > 0) {
    development.scenarios = compareDevelopmentScenarios(
      input.developmentScenarios,
    );
    for (const scenario of input.developmentScenarios) {
      development.requiredInformation[scenario.kind] = requiredInformationFor(
        scenario.kind,
        {
          hasBuildingSize: profile.land?.size !== undefined,
          hasFloorCount: profile.numberOfFloors !== undefined,
          hasLandSize: profile.land?.size !== undefined,
          hasConstructionEstimate:
            scenario.construction?.totalCost !== undefined,
          hasMarketData: (input.marketListings?.length ?? 0) > 0,
        },
      );
    }
  } else {
    development.requiredInformation["as_is"] = requiredInformationFor("as_is", {
      hasMarketData: (input.marketListings?.length ?? 0) > 0,
    });
  }

  let investment: InvestmentAnalysis | undefined;
  if (input.investment) {
    investment = analyseInvestment(input.investment);
  }

  let value: ValueEstimate | undefined;
  if (
    input.marketListings &&
    input.marketListings.length > 0 &&
    input.comparableCriteria &&
    country
  ) {
    value = estimateIndicativeValue(
      {
        propertyType: profile.propertyType ?? "other",
        country,
        region: profile.location.region,
        city: profile.location.city,
        currency: input.comparableCriteria.currency,
        landSize:
          profile.land?.size !== undefined
            ? { value: profile.land.size, unit: profile.land.unit ?? "m²" }
            : undefined,
        buildingSize: undefined,
      },
      input.marketListings,
      input.comparableCriteria,
      nowIso,
    );
  }

  const risks = evaluatePropertyRisks({
    profile,
    conditionClaimedWithoutSource: condition.findings.some(
      (f) => f.source === "ai_vision",
    ),
    oldestComparableDate: input.marketListings?.length
      ? input.marketListings.map((l) => l.observedAt).sort()[0]
      : undefined,
  });

  const trustChain: PropertyIntelligenceReport["trustChain"] = [];
  if (value) {
    trustChain.push({
      evidence: `${value.basis?.count ?? 0} comparable ${value.basis?.kind === "verified_transaction" ? "verified transactions" : "listings (asking prices)"} passing the deterministic screen.`,
      analysis: value.analysis,
      conclusion:
        value.status === "estimated"
          ? value.conclusion
          : "Insufficient comparable data, no value estimate produced.",
      confidence: `${value.confidence.band} (${value.confidence.score}), ${value.dataFreshness}`,
    });
  }
  if (investment?.totalKnownCost !== undefined) {
    trustChain.push({
      evidence: `Known costs: ${investment.costView.cost.knownCostBreakdown.map((b) => `${b.label} ${b.amount}`).join("; ")}.`,
      analysis: `Total known cost ${investment.totalKnownCost} ${investment.currency} (unpriced items excluded: ${investment.costView.cost.unpricedItems.join(", ") || "none"}).`,
      conclusion: `Total known development cost: ${investment.totalKnownCost} ${investment.currency}. Contingency, if any, is shown separately as an assumption.`,
      confidence: "high (deterministic sum of recorded figures)",
    });
  }
  if (condition.findings.length > 0) {
    trustChain.push({
      evidence: condition.findings.map((f) => f.finding).join(" "),
      analysis: `${condition.findings.length} observable condition finding(s); ${condition.unassessedCategories.length} of ${Object.keys(CONDITION_CATEGORY_LABELS).length} categories have no recorded observation.`,
      conclusion:
        "Potential issues recorded for user review. " +
        STRUCTURAL_FEASIBILITY_NOTE,
      confidence: "observations only, no condition is certified",
    });
  }

  return {
    propertyId: profile.id,
    generatedAt: nowIso,
    disclaimer: PROPERTY_INTELLIGENCE_DISCLAIMER,
    profile: {
      valid: validation.valid,
      issues: validation.issues,
      connectedConstructionProject: Boolean(profile.constructionProjectId),
      dataAvailability: profileDataAvailability(profile),
    },
    location,
    condition,
    development,
    costView: investment?.costView,
    value,
    investment,
    risks,
    freshness: {
      dataFreshness:
        value?.dataFreshness ??
        classifyMarketFreshness(profile.updatedAt, nowIso),
      note: "Freshness labels reflect recorded data age. Stale or outdated market information is never presented as current.",
    },
    trustChain,
  };
}
