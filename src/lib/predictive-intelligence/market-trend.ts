// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, MARKET PRICE TREND (§6)
//
// Analyses REAL price records only:
//   - the project's material_price_history (user-entered changes)
//   - market observations/approved prices for the project region
//
// Trend = direction + volatility over dated, region-matched points.
// Requirements to say anything at all: ≥ 3 dated points for one
// material in the SAME region. Otherwise: "Price trend unavailable."
// Never synthetic history, never another region's data (§16/§18).
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import { assessConfidence, verifiedShareOf, worstFreshness } from "./freshness";

export type PriceTrendDirection = "increasing" | "decreasing" | "stable";
export type PriceVolatility = "low" | "moderate" | "high";

export interface MaterialTrend {
  materialName: string;
  direction: PriceTrendDirection;
  volatility: PriceVolatility;
  firstPrice: number;
  lastPrice: number;
  firstDate: string;
  lastDate: string;
  dataPoints: number;
  changePct: number;
  /** Coefficient of variation of the point series. */
  cv: number;
  region: string | null;
  currency: string | null;
  sourceLabels: string[];
}

export interface MarketTrendResult {
  region: string;
  trends: MaterialTrend[];
  unavailableMaterials: string[];
}

/** Minimum dated price points for one material before a trend exists. */
export const MIN_TREND_POINTS = 3;

/** changePct ≥ +5% → increasing; ≤ −5% → decreasing; else stable. */
export const TREND_THRESHOLD_PCT = 0.05;
/** Coefficient of variation bands for volatility. */
export const CV_MODERATE = 0.05;
export const CV_HIGH = 0.15;

interface PricePoint {
  price: number;
  date: string;
  source: string | null;
  currency: string | null;
  region: string | null;
  verified: boolean;
}

/**
 * Group dated price points per material (exact name match, same
 * region) and compute the deterministic trend for each group that
 * has enough points. Pure, testable, no data invented.
 */
export function computeMaterialTrends(
  points: Array<{
    materialName: string;
    price: number;
    date: string;
    source: string | null;
    currency: string | null;
    region: string | null;
    verified: boolean;
  }>,
): { trends: MaterialTrend[]; insufficient: string[] } {
  const byMaterial = new Map<string, PricePoint[]>();
  for (const p of points) {
    if (!Number.isFinite(p.price) || p.price <= 0) continue;
    const list = byMaterial.get(p.materialName) ?? [];
    list.push({
      price: p.price,
      date: p.date,
      source: p.source,
      currency: p.currency,
      region: p.region,
      verified: p.verified,
    });
    byMaterial.set(p.materialName, list);
  }

  const trends: MaterialTrend[] = [];
  const insufficient: string[] = [];
  for (const [materialName, list] of byMaterial) {
    if (list.length < MIN_TREND_POINTS) {
      if (list.length > 0) insufficient.push(materialName);
      continue;
    }
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const mean = sorted.reduce((s, p) => s + p.price, 0) / sorted.length;
    const variance =
      sorted.reduce((s, p) => s + (p.price - mean) ** 2, 0) / sorted.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    const changePct = first.price > 0 ? last.price / first.price - 1 : 0;
    const direction: PriceTrendDirection =
      changePct >= TREND_THRESHOLD_PCT
        ? "increasing"
        : changePct <= -TREND_THRESHOLD_PCT
          ? "decreasing"
          : "stable";
    const volatility: PriceVolatility =
      cv > CV_HIGH ? "high" : cv > CV_MODERATE ? "moderate" : "low";

    trends.push({
      materialName,
      direction,
      volatility,
      firstPrice: first.price,
      lastPrice: last.price,
      firstDate: first.date,
      lastDate: last.date,
      dataPoints: sorted.length,
      changePct,
      cv,
      region: last.region,
      currency: last.currency,
      sourceLabels: Array.from(
        new Set(
          sorted.map((p) => p.source).filter((s): s is string => Boolean(s)),
        ),
      ),
    });
  }
  return { trends, insufficient };
}

export function analyzeMarketTrends(snapshot: {
  now: string;
  region: {
    marketCode: string | null;
    countryCode: string | null;
    city: string | null;
  };
  projectPriceHistory: Array<{
    materialName: string;
    oldPrice: number | null;
    newPrice: number;
    changedAt: string;
    priceSource: string | null;
  }>;
  marketPrices: Array<{
    label: string;
    price: number;
    currencyCode: string;
    marketCode: string;
    region: string | null;
    collectedAt: string;
    verified: boolean;
  }>;
}): PredictionResult<MarketTrendResult> {
  const { now, region, projectPriceHistory, marketPrices } = snapshot;
  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [
    "Trends are computed only from dated price records of the SAME region, never from another region and never synthesised.",
  ];
  const limitations: string[] = [
    "A trend describes recorded price movement to date, it is not a forecast of future prices.",
  ];

  // Region gate (§16): market observations are only usable when they
  // belong to the project's own region.
  const regionKey = region.marketCode ?? region.countryCode;
  if (!regionKey) {
    return {
      kind: "material_price_trend",
      status: "unsupported_region",
      prediction:
        "Prediction unavailable for this region, no regional market profile is recorded for this project.",
      result: null,
      evidence,
      inputs,
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations,
      generatedAt: now,
      missingData: ["region_profile"],
      regionNote: "No market profile is linked to this project.",
    };
  }

  // Region-matched market points.
  const regionPoints = marketPrices.filter((p) => p.marketCode === regionKey);
  const points = [
    // user-entered project price history (the project's own region by definition)
    ...projectPriceHistory.map((h) => ({
      materialName: h.materialName,
      price: h.newPrice,
      date: h.changedAt,
      source: h.priceSource ?? "project price history",
      currency: null as string | null,
      region: regionKey,
      verified: true, // entered by a verified user in their own project
    })),
    ...regionPoints.map((p) => ({
      materialName: p.label,
      price: p.price,
      date: p.collectedAt,
      source: "market intelligence observations",
      currency: p.currencyCode,
      region: regionKey,
      verified: p.verified,
    })),
  ];

  for (const h of projectPriceHistory) {
    evidence.push({
      kind: "price_record",
      label: `${h.materialName}: price change to ${h.newPrice} recorded ${h.changedAt.slice(0, 10)}${h.priceSource ? ` (source: ${h.priceSource})` : ""}`,
      recordedAt: h.changedAt,
      verification: "user_recorded",
    });
  }
  for (const p of regionPoints) {
    evidence.push({
      kind: "market_observation",
      id: p.label,
      label: `Market price for ${p.label} (${p.marketCode}${p.region ? `, ${p.region}` : ""}) collected ${p.collectedAt.slice(0, 10)}${p.verified ? ", verified" : ", unverified"}`,
      recordedAt: p.collectedAt,
      verification: p.verified ? "admin_verified" : "unverified",
    });
  }

  inputs.push(
    { key: "region", label: "Region (market profile)", value: regionKey },
    {
      key: "project_price_history_points",
      label: "Project price history entries",
      value: projectPriceHistory.length,
    },
    {
      key: "region_market_points",
      label: "Region-matched market observations",
      value: regionPoints.length,
    },
  );

  const { trends, insufficient } = computeMaterialTrends(points);

  if (trends.length === 0) {
    return {
      kind: "material_price_trend",
      status: "insufficient_data",
      prediction: "Price trend unavailable.",
      result: null,
      evidence,
      inputs,
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations,
      generatedAt: now,
      missingData: [
        `at least ${MIN_TREND_POINTS} dated price points per material in region ${regionKey}`,
        ...insufficient.map((m) => `more price history for ${m}`),
      ],
    };
  }

  const freshness = worstFreshness(
    trends.map((t) => t.lastDate),
    now,
  );
  const confidence = assessConfidence({
    coverage: Math.min(
      1,
      trends.reduce((sum, t) => sum + t.dataPoints, 0) /
        (trends.length * MIN_TREND_POINTS * 2),
    ),
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "market price trend",
  });

  const summary = trends
    .map(
      (t) =>
        `${t.materialName} price trend: ${t.direction} (${(t.changePct * 100).toFixed(1)}% over ${t.dataPoints} recorded points, ${t.firstDate.slice(0, 10)} → ${t.lastDate.slice(0, 10)}).`,
    )
    .join(" ");

  return {
    kind: "material_price_trend",
    status: "ok",
    prediction: summary,
    result: {
      region: regionKey,
      trends,
      unavailableMaterials: insufficient,
    },
    evidence,
    inputs,
    assumptions,
    limitations,
    freshness,
    confidence,
    generatedAt: now,
    missingData: [],
  };
}
