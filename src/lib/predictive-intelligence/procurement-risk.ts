// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, PROCUREMENT RISK (§5)
//
// From the project's REAL shopping list and verified price data:
//   - materials still needed (unpurchased) while work remains
//   - lines with no supplier information
//   - lines whose recorded actual price rose vs estimate
//   - market price points gone stale/unavailable for needed items
//
// FRELUX never claims a material is "unavailable", availability
// is not recorded anywhere and is therefore never asserted (§18).
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import {
  assessConfidence,
  classifyFreshness,
  verifiedShareOf,
  worstFreshness,
} from "./freshness";
import {
  linesWithRecordedPriceIncrease,
  unpurchasedEstimatedTotal,
} from "./spend";
import type { ShoppingRow, MarketPriceRow } from "./internal-types";

export type ProcurementPressureRating = "low" | "medium" | "high";

export interface ProcurementRiskResult {
  rating: ProcurementPressureRating;
  unpurchasedCount: number;
  unpurchasedEstimatedTotal: number;
  missingSupplierNames: string[];
  priceIncreasedLines: Array<{
    name: string;
    estimated: number;
    actual: number;
    increasePct: number;
  }>;
  staleMarketPriceNames: string[];
  progressRemains: boolean;
}

export function analyzeProcurementRisk(snapshot: {
  now: string;
  shoppingItems: ShoppingRow[];
  marketPrices: MarketPriceRow[];
  remainingWork: boolean; // uncompleted stages OR project in progress
}): PredictionResult<ProcurementRiskResult> {
  const { now, shoppingItems, marketPrices, remainingWork } = snapshot;

  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [];
  const limitations: string[] = [
    "Supplier availability is not recorded by any FRELUX data source, this analysis never claims a material is unavailable.",
  ];

  if (shoppingItems.length === 0) {
    return {
      kind: "procurement_risk",
      status: "insufficient_data",
      prediction:
        "Insufficient data, no shopping list is recorded for this project.",
      result: null,
      evidence,
      inputs,
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations,
      generatedAt: now,
      missingData: ["shopping_list"],
    };
  }

  const unpurchased = shoppingItems.filter((i) => !i.is_purchased);
  const missingSupplier = unpurchased.filter(
    (i) => !i.supplier || i.supplier.trim() === "",
  );
  const priceIncreases = linesWithRecordedPriceIncrease(shoppingItems);

  for (const item of shoppingItems) {
    evidence.push({
      kind: "shopping_item",
      id: item.id,
      label: `${item.name}, ${item.is_purchased ? "purchased" : "not yet purchased"}${item.supplier ? `, supplier: ${item.supplier}` : ", no supplier recorded"}`,
      recordedAt: null,
      verification: "user_recorded",
    });
  }

  // Materials needed soon: unpurchased items while work remains.
  const neededSoon = remainingWork ? unpurchased : [];

  // Market price staleness for needed items, only a claim the data supports.
  const staleMarketNames: string[] = [];
  for (const item of neededSoon) {
    const points = marketPrices.filter((p) =>
      p.label.toLowerCase().includes(item.name.toLowerCase()),
    );
    if (points.length === 0) continue; // no data ≠ stale claim
    const worst = worstFreshness(
      points.map((p) => p.collectedAt),
      now,
    );
    if (worst === "outdated" || worst === "stale")
      staleMarketNames.push(item.name);
  }

  inputs.push(
    {
      key: "shopping_items",
      label: "Recorded shopping items",
      value: shoppingItems.length,
    },
    {
      key: "unpurchased",
      label: "Unpurchased items",
      value: unpurchased.length,
    },
    {
      key: "missing_supplier",
      label: "Unpurchased items without supplier",
      value: missingSupplier.length,
    },
    {
      key: "remaining_work",
      label: "Remaining work recorded",
      value: remainingWork,
    },
  );

  assumptions.push(
    "Unpurchased items are treated as material needs of the remaining work, procurement urgency follows from the recorded progress state.",
  );
  if (!remainingWork) {
    assumptions.push(
      "All recorded stages are complete, so no procurement is flagged as urgent.",
    );
  }

  // Rating bands (deterministic):
  //   high:   any recorded price increase > 25% on a needed item
  //   medium: unpurchased needed items missing supplier info, or
  //           price increases 5–25%, or needed items with stale prices
  //   low:    needs are covered (all purchased, or no remaining work)
  const neededIncreases = priceIncreases.filter((l) =>
    neededSoon.some((n) => n.id === l.item.id),
  );
  const bigIncrease = neededIncreases.some((l) => l.increasePct > 0.25);
  const moderateIncrease = neededIncreases.some((l) => l.increasePct > 0.05);
  const rating: ProcurementPressureRating = bigIncrease
    ? "high"
    : (neededSoon.length > 0 &&
          (missingSupplier.length > 0 || staleMarketNames.length > 0)) ||
        moderateIncrease
      ? "medium"
      : "low";

  // Freshness of the price evidence backing the analysis (§17).
  const freshness =
    marketPrices.length > 0
      ? worstFreshness(
          marketPrices.map((p) => p.collectedAt),
          now,
        )
      : classifyFreshness(null, now);

  const confidence = assessConfidence({
    coverage: Math.min(1, shoppingItems.length / 5),
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "procurement risk",
  });

  const unpurchasedTotal = unpurchasedEstimatedTotal(shoppingItems);
  const prediction =
    rating === "low"
      ? neededSoon.length === 0
        ? "Procurement risk: LOW, all recorded materials are purchased (or no work remains)."
        : "Procurement risk: LOW, remaining material needs have supplier information and stable recorded prices."
      : rating === "medium"
        ? `Procurement risk: MEDIUM, ${neededSoon.length} material(s) still needed for remaining work${missingSupplier.length > 0 ? `, ${missingSupplier.length} without a recorded supplier` : ""}.`
        : "Procurement risk: HIGH, a material needed for remaining work has a recorded price increase above 25%.";

  return {
    kind: "procurement_risk",
    status: "ok",
    prediction,
    result: {
      rating,
      unpurchasedCount: unpurchased.length,
      unpurchasedEstimatedTotal: unpurchasedTotal,
      missingSupplierNames: missingSupplier.map((i) => i.name),
      priceIncreasedLines: priceIncreases.map((l) => ({
        name: l.item.name,
        estimated: l.estimated,
        actual: l.actual,
        increasePct: l.increasePct,
      })),
      staleMarketPriceNames: staleMarketNames,
      progressRemains: remainingWork,
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
