// =========================================================
// FRELUX PROPERTY INTELLIGENCE, INDICATIVE VALUE (§11, §12)
//
// Structured, comparable-based value estimation. Rules:
//   - ONLY verified/traceable comparables passing the deterministic
//     evaluateComparables screen can contribute
//   - asking prices and transaction prices are NEVER mixed
//   - every input value retains source, location, currency, date,
//     freshness and confidence
//   - output is labelled "Indicative estimate, not a professional
//     valuation", always
//   - inadequate evidence → NO estimate is produced (§12)
//   - stale data is labelled stale, never "current" (§19)
// =========================================================

import {
  evaluateComparables,
  isVerifiedTransaction,
  type ComparableCriteria,
  type PropertyListing,
} from "./market-data";

export const VALUE_LABEL = "Indicative estimate, not a professional valuation";

export type MarketFreshness =
  "current" | "recent" | "stale" | "outdated" | "unavailable";

const FRESH_MAX_AGE_DAYS = 30;
const RECENT_MAX_AGE_DAYS = 90;
const STALE_MAX_AGE_DAYS = 180;

/** §19 five-level freshness for market-sensitive values. */
export function classifyMarketFreshness(
  observedAt: string | null | undefined,
  nowIso: string,
): MarketFreshness {
  if (!observedAt) return "unavailable";
  const t = new Date(observedAt).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "unavailable";
  const days = Math.max(0, (now - t) / (1000 * 60 * 60 * 24));
  if (days <= FRESH_MAX_AGE_DAYS) return "current";
  if (days <= RECENT_MAX_AGE_DAYS) return "recent";
  if (days <= STALE_MAX_AGE_DAYS) return "stale";
  return "outdated";
}

export interface SubjectProperty {
  propertyType: string;
  country: string;
  region?: string;
  city?: string;
  currency: string;
  landSize?: { value: number; unit: string };
  buildingSize?: { value: number; unit: string };
}

export interface ValueBasis {
  kind: "asking_price" | "verified_transaction";
  /** Number of comparables contributing. */
  count: number;
  /** Which dimension prices were normalized on. */
  dimension: "land" | "building" | "whole_property";
  unitLabel: string;
}

export interface ValueEstimate {
  status: "estimated" | "insufficient_data";
  label: string;
  /** Present only when status is 'estimated'. */
  range?: { low: number; median: number; high: number; currency: string };
  basis?: ValueBasis;
  /** Evidence chain (§20): evidence → analysis → conclusion. */
  evidence: Array<{
    listingId: string;
    source: string;
    observedAt: string;
    freshness: MarketFreshness;
    note: string;
  }>;
  analysis: string;
  conclusion: string;
  assumptions: string[];
  limitations: string[];
  confidence: {
    score: number;
    band: "low" | "medium" | "high";
    method: string;
  };
  dataFreshness: MarketFreshness;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    s.length - 1,
    Math.max(0, Math.round((p / 100) * (s.length - 1))),
  );
  return s[idx];
}

function confidenceBand(score: number): "low" | "medium" | "high" {
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

/**
 * Indicative value estimation. Deterministic: median price-per-dimension
 * × subject size, with spread-derived range. No mixing of asking and
 * transaction prices; no invented adjustments; no estimate when the
 * comparable screen fails.
 */
export function estimateIndicativeValue(
  subject: SubjectProperty,
  candidates: PropertyListing[],
  criteria: ComparableCriteria,
  nowIso: string,
): ValueEstimate {
  const screen = evaluateComparables(
    {
      ...criteria,
      propertyType: subject.propertyType,
      country: subject.country,
      currency: subject.currency,
      subjectLandSize: subject.landSize,
      subjectBuildingSize: subject.buildingSize,
    },
    candidates,
  );

  const limitations: string[] = [
    "Asking prices are not completed transaction prices, they indicate listing levels only.",
    "This is an indicative estimate from recorded comparable data, not a professional valuation.",
  ];

  if (screen.status !== "sufficient" || screen.comparables.length === 0) {
    return {
      status: "insufficient_data",
      label: VALUE_LABEL,
      evidence: [],
      analysis: "Insufficient comparable data.",
      conclusion:
        "No value estimate was produced. Insufficient comparable data, FRELUX does not fabricate property values.",
      assumptions: [],
      limitations,
      confidence: {
        score: 0,
        band: "low",
        method: "insufficient comparables, no estimate",
      },
      dataFreshness: "unavailable",
    };
  }

  // Prefer verified transactions when at least the minimum number of
  // them exist; otherwise use asking prices, never a mixture.
  const tx = screen.comparables.filter((c) => isVerifiedTransaction(c.listing));
  const basisKind: ValueBasis["kind"] =
    tx.length >= (criteria.minComparables ?? 3)
      ? "verified_transaction"
      : "asking_price";
  const used =
    basisKind === "verified_transaction"
      ? tx.map((c) => c.listing)
      : screen.comparables.map((c) => c.listing);

  // Dimension: building size if subject and comparables carry it;
  // land size for land; otherwise whole-property median (disclosed).
  const hasBuilding =
    subject.buildingSize !== undefined &&
    used.every(
      (l) =>
        l.buildingSize !== undefined &&
        l.buildingSize.unit === subject.buildingSize!.unit,
    );
  const hasLand =
    subject.landSize !== undefined &&
    used.every(
      (l) =>
        l.landSize !== undefined && l.landSize.unit === subject.landSize!.unit,
    );

  let dimension: ValueBasis["dimension"] = "whole_property";
  let unitLabel = "per property";
  let pricesPerUnit: number[] = [];

  if (basisKind === "verified_transaction") {
    const amount = (l: PropertyListing) => l.transactionPrice!.amount;
    if (hasBuilding && subject.buildingSize) {
      dimension = "building";
      unitLabel = `per ${subject.buildingSize.unit}`;
      pricesPerUnit = used.map((l) => amount(l) / l.buildingSize!.value);
    } else if (hasLand && subject.landSize) {
      dimension = "land";
      unitLabel = `per ${subject.landSize.unit}`;
      pricesPerUnit = used.map((l) => amount(l) / l.landSize!.value);
    } else {
      pricesPerUnit = used.map(amount);
    }
  } else {
    const amount = (l: PropertyListing) => l.askingPrice!.amount;
    if (hasBuilding && subject.buildingSize) {
      dimension = "building";
      unitLabel = `per ${subject.buildingSize.unit}`;
      pricesPerUnit = used.map((l) => amount(l) / l.buildingSize!.value);
    } else if (hasLand && subject.landSize) {
      dimension = "land";
      unitLabel = `per ${subject.landSize.unit}`;
      pricesPerUnit = used.map((l) => amount(l) / l.landSize!.value);
    } else {
      pricesPerUnit = used.map(amount);
    }
  }

  const medianPerUnit = median(pricesPerUnit);
  const subjectSize =
    dimension === "building"
      ? subject.buildingSize!.value
      : dimension === "land"
        ? subject.landSize!.value
        : 1;
  const medianValue = medianPerUnit * subjectSize;

  // Spread-derived indicative range (25th–75th percentile of unit
  // prices applied to the subject size), disclosed as such.
  const low = percentile(pricesPerUnit, 25) * subjectSize;
  const high = percentile(pricesPerUnit, 75) * subjectSize;

  const freshnesses = used.map((l) =>
    classifyMarketFreshness(l.observedAt, nowIso),
  );
  const worst = freshnesses.reduce<MarketFreshness>((acc, f) => {
    const rank: Record<MarketFreshness, number> = {
      current: 0,
      recent: 1,
      stale: 2,
      outdated: 3,
      unavailable: 4,
    };
    return rank[f] > rank[acc] ? f : acc;
  }, "current");

  // Deterministic confidence: comparable count (up to 5), spread
  // tightness (unit-price spread), and freshness, all public.
  const spread =
    medianPerUnit > 0 ? (high - low) / Math.max(1, medianValue) : 1;
  const countScore = Math.min(1, used.length / 5);
  const tightnessScore = Math.max(0, 1 - spread);
  const freshnessScore: Record<MarketFreshness, number> = {
    current: 1,
    recent: 0.7,
    stale: 0.4,
    outdated: 0.15,
    unavailable: 0,
  };
  const score =
    Math.round(
      (countScore * 0.4 +
        tightnessScore * 0.35 +
        freshnessScore[worst] * 0.25) *
        100,
    ) / 100;

  const evidence = used.map((l, i) => ({
    listingId: l.id,
    source: l.source,
    observedAt: l.observedAt,
    freshness: freshnesses[i],
    note: `${basisKind === "verified_transaction" ? "Verified transaction" : "Asking price"} ${l.transactionPrice?.amount ?? l.askingPrice?.amount} ${l.currency}${dimension !== "whole_property" ? ` ÷ ${dimension === "building" ? l.buildingSize!.value : l.landSize!.value} ${dimension === "building" ? l.buildingSize!.unit : l.landSize!.unit}` : ""}`,
  }));

  const assumptions = [
    `Price basis: ${basisKind === "verified_transaction" ? "verified transaction prices only" : "asking prices only (no verified transactions were available)"}, the two are never mixed.`,
    dimension === "whole_property"
      ? "Prices were compared whole-property because consistent size data was unavailable, this is a weaker basis than price-per-area."
      : `Median ${unitLabel} × subject ${subject.buildingSize ? `${subject.buildingSize.value} ${subject.buildingSize.unit}` : `${subject.landSize!.value} ${subject.landSize!.unit}`}.`,
    "Range = 25th–75th percentile of comparable unit prices applied to the subject size, a spread indicator, not a valuation bracket.",
  ];

  if (basisKind === "asking_price") {
    assumptions.push(
      "Asking-price evidence was NOT treated as current market transaction data, the freshness label reflects its age.",
    );
  }

  const analysis = `${used.length} comparables passing the deterministic screen; median ${unitLabel} = ${medianPerUnit.toFixed(2)} ${subject.currency}.`;
  const conclusion = `${VALUE_LABEL}: ${Math.round(medianValue).toLocaleString()} ${subject.currency} (indicative range ${Math.round(low).toLocaleString()}–${Math.round(high).toLocaleString()} ${subject.currency}), based on ${basisKind === "verified_transaction" ? "verified transactions" : "asking prices"}. Confidence: ${confidenceBand(score)}.`;

  return {
    status: "estimated",
    label: VALUE_LABEL,
    range: {
      low: Math.round(low),
      median: Math.round(medianValue),
      high: Math.round(high),
      currency: subject.currency,
    },
    basis: { kind: basisKind, count: used.length, dimension, unitLabel },
    evidence,
    analysis,
    conclusion,
    assumptions,
    limitations,
    confidence: {
      score,
      band: confidenceBand(score),
      method: `confidence = comparable-count ${Math.round(countScore * 100)}%×0.4 + spread-tightness ${Math.round(tightnessScore * 100)}%×0.35 + freshness ${worst}×0.25 → ${score}`,
    },
    dataFreshness: worst,
  };
}
