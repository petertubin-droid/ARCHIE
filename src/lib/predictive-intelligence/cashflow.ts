// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, CASH-FLOW / BUDGET (§12)
//
// Planned spending vs recorded spending vs remaining estimated
// cost, all from real rows. Estimates are ALWAYS labelled as
// estimates; only rows with recorded actual prices count as
// recorded spend. No financial transactions, ever.
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import { assessConfidence, verifiedShareOf, worstFreshness } from "./freshness";
import {
  currentEstimate,
  estimatedShoppingTotal,
  purchasedLines,
  recordedSpend,
  unpurchasedEstimatedTotal,
} from "./spend";
import type { ShoppingRow } from "./internal-types";

export interface CashflowResult {
  plannedSpending: number;
  recordedSpending: number;
  /** Purchased lines counted at estimate because no actual price recorded. */
  proxiedLineCount: number;
  remainingEstimatedCost: number;
  spendingVariance: number;
  upcomingRequirements: Array<{ name: string; estimated: number }>;
}

export function analyzeCashflow(snapshot: {
  now: string;
  calculations: Array<{
    id: string;
    title: string;
    createdAt: string;
    estimatedTotal: number | null;
    calculatorType: string;
  }>;
  shoppingItems: ShoppingRow[];
}): PredictionResult<CashflowResult> {
  const { now, calculations, shoppingItems } = snapshot;

  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [];
  const limitations: string[] = [
    "FRELUX performs no financial transactions, this is recorded data plus deterministic arithmetic only.",
  ];

  if (shoppingItems.length === 0) {
    return {
      kind: "cashflow",
      status: "insufficient_data",
      prediction:
        "Insufficient data, no budget or expenditure records exist for this project.",
      result: null,
      evidence,
      inputs,
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations,
      generatedAt: now,
      missingData: ["shopping_list", "recorded_expenditure"],
    };
  }

  const planned = estimatedShoppingTotal(shoppingItems);
  const recorded = recordedSpend(shoppingItems);
  const purchased = purchasedLines(shoppingItems);
  const proxied = purchased.filter(
    (i) => i.actual_price === null || !Number.isFinite(i.actual_price),
  );
  const remaining = Math.max(0, planned - recorded);
  const upcoming = shoppingItems
    .filter((i) => !i.is_purchased)
    .map((i) => ({
      name: i.name,
      estimated:
        Number(i.total_price) > 0
          ? Number(i.total_price)
          : Number(i.quantity) * Number(i.estimated_price),
    }));

  for (const i of shoppingItems) {
    evidence.push({
      kind: "shopping_item",
      id: i.id,
      label: `${i.name}, estimated ${Number(i.estimated_price)}${i.actual_price !== null ? `, recorded actual ${Number(i.actual_price)}` : ""}, ${i.is_purchased ? "purchased" : "unpurchased"}`,
      recordedAt: null,
      verification: "user_recorded",
    });
  }
  for (const c of calculations) {
    if (c.estimatedTotal !== null) {
      evidence.push({
        kind: "calculation",
        id: c.id,
        label: `Saved estimate "${c.title}" (total ${c.estimatedTotal.toFixed(2)})`,
        recordedAt: c.createdAt,
        verification: "user_recorded",
      });
    }
  }

  if (proxied.length > 0) {
    assumptions.push(
      `${proxied.length} purchased line(s) have no recorded actual price and are counted at their estimated total, the recorded spending figure is therefore a lower bound for those lines.`,
    );
  }
  const est = currentEstimate(calculations, shoppingItems);
  if (est !== null && Math.abs(est - planned) > 0.01) {
    assumptions.push(
      "Planned spending uses the current shopping-list budget; the latest saved calculation estimate may differ.",
    );
  }

  inputs.push(
    {
      key: "planned_spending",
      label: "Planned spending (shopping-list budget)",
      value: planned,
    },
    {
      key: "recorded_spending",
      label: "Recorded spending (purchased lines)",
      value: recorded,
    },
    {
      key: "remaining_estimated_cost",
      label: "Remaining estimated cost",
      value: remaining,
    },
    {
      key: "upcoming_items",
      label: "Unpurchased items (upcoming requirement)",
      value: upcoming.length,
    },
  );

  const freshness = worstFreshness(
    calculations.map((c) => c.createdAt),
    now,
  );
  const confidence = assessConfidence({
    coverage: Math.min(1, shoppingItems.length / 5),
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "cash-flow",
  });

  const prediction =
    `Planned spending: ${planned.toFixed(2)}. Recorded spending: ${recorded.toFixed(2)} (estimate, lines without recorded actual prices are counted at their recorded estimate). ` +
    `Remaining estimated cost: ${remaining.toFixed(2)}. Upcoming financial requirement: ${unpurchasedEstimatedTotal(shoppingItems).toFixed(2)} across ${upcoming.length} unpurchased item(s).`;

  return {
    kind: "cashflow",
    status: "ok",
    prediction,
    result: {
      plannedSpending: planned,
      recordedSpending: recorded,
      proxiedLineCount: proxied.length,
      remainingEstimatedCost: remaining,
      spendingVariance: recorded - planned,
      upcomingRequirements: upcoming,
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
