// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, SCENARIO ANALYSIS (§11)
//
// Explicit what-if scenarios over REAL recorded baselines:
//   - "What if material prices increase 10%?"
//   - "What if this task is delayed by 7 days?"
//   - "What if I change this material?"
//
// Every scenario shows baseline → changed assumption → result →
// difference → assumptions. All arithmetic is deterministic.
// A scenario is ALWAYS labelled hypothetical, it is NOT a
// prediction and never presented as one (§11/§18).
//
// For engine-comparison scenarios (e.g. two designs), the Phase 2
// scenario-engine (compareScenarios) remains the authoritative
// path; this module covers project-level cost/what-if questions.
// =========================================================

import type { ScenarioOutcome } from "./types";
import { estimatedShoppingTotal, unpurchasedEstimatedTotal } from "./spend";
import type { ShoppingRow } from "./internal-types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Scenario: a uniform percentage change in material prices applied
 *  to the remaining (unpurchased) material budget. */
export function materialPriceChangeScenario(input: {
  now: string;
  shoppingItems: ShoppingRow[];
  changePct: number;
}): ScenarioOutcome {
  const { now, shoppingItems, changePct } = input;
  const baseline = unpurchasedEstimatedTotal(shoppingItems);
  const changed = baseline * (1 + changePct);
  const label = `${changePct >= 0 ? "increase" : "decrease"} of ${(Math.abs(changePct) * 100).toFixed(1)}%`;

  if (shoppingItems.length === 0) {
    return {
      id: "scenario-price-change",
      question: `What happens if material prices change by ${label}?`,
      status: "insufficient_data",
      baseline: null,
      changedAssumption: null,
      result: null,
      difference: null,
      assumptions: [],
      hypothetical: true,
      missingData: ["shopping_list"],
      generatedAt: now,
    };
  }

  return {
    id: "scenario-price-change",
    question: `What happens if material prices change by ${label}?`,
    status: "ok",
    baseline: {
      label: "Remaining (unpurchased) material budget at recorded estimates",
      value: round2(baseline),
      basis: `Sum of estimated totals across ${shoppingItems.filter((i) => !i.is_purchased).length} unpurchased item(s)`,
    },
    changedAssumption: `All remaining material prices ${changePct >= 0 ? "rise" : "fall"} uniformly by ${(Math.abs(changePct) * 100).toFixed(1)}%`,
    result: {
      label: "Remaining material budget under the changed assumption",
      value: round2(changed),
      basis:
        "Deterministic multiplication of the recorded baseline by the assumed factor",
    },
    difference: {
      value: round2(changed - baseline),
      percent:
        baseline > 0 ? round2(((changed - baseline) / baseline) * 100) : 0,
    },
    assumptions: [
      "Only unpurchased items are affected, already-purchased materials are sunk cost and do not change.",
      "The price change applies uniformly to all remaining materials; individual materials may move differently.",
      "This is a hypothetical calculation, not a forecast of market prices.",
    ],
    hypothetical: true,
    missingData: [],
    generatedAt: now,
  };
}

/** Scenario: delay of the next pending stage by N days. Since the
 *  schedule records no planned dates, the honest deterministic
 *  result is the stall offset vs the measured sequencing, no
 *  invented cost-of-delay. */
export function taskDelayScenario(input: {
  now: string;
  nextPendingStage: string | null;
  dailySpendRate: number | null; // only when the caller has a measured rate
  delayDays: number;
}): ScenarioOutcome {
  const { now, nextPendingStage, dailySpendRate, delayDays } = input;

  if (!nextPendingStage) {
    return {
      id: "scenario-task-delay",
      question: `What happens if a task is delayed by ${delayDays} days?`,
      status: "insufficient_data",
      baseline: null,
      changedAssumption: null,
      result: null,
      difference: null,
      assumptions: [],
      hypothetical: true,
      missingData: ["pending_stage"],
      generatedAt: now,
    };
  }

  // A measured daily spend rate exists only when the caller derived
  // it from real records; otherwise we do NOT invent carrying costs.
  if (dailySpendRate === null || !Number.isFinite(dailySpendRate)) {
    return {
      id: "scenario-task-delay",
      question: `What happens if "${nextPendingStage}" is delayed by ${delayDays} days?`,
      status: "ok",
      baseline: {
        label: "Current recorded schedule state",
        value: 0,
        basis: `"${nextPendingStage}" is the next pending stage in the recorded sequence`,
      },
      changedAssumption: `"${nextPendingStage}" starts ${delayDays} days later than currently assumed`,
      result: {
        label: "Recorded schedule consequence",
        value: delayDays,
        basis:
          "The recorded completion of all later stages shifts by the same delay (sequencing arithmetic)",
      },
      difference: { value: delayDays, percent: 100 },
      assumptions: [
        "The recorded schedule has no planned dates, so no cost-of-delay can be computed without a measured daily spend rate.",
        "Downstream stages are assumed to follow the delayed stage in sequence, a deterministic ordering consequence, not a calendar forecast.",
        "This is a hypothetical calculation, not a prediction.",
      ],
      hypothetical: true,
      missingData: [],
      generatedAt: now,
    };
  }

  const cost = dailySpendRate * delayDays;
  return {
    id: "scenario-task-delay",
    question: `What happens if "${nextPendingStage}" is delayed by ${delayDays} days?`,
    status: "ok",
    baseline: {
      label: "Current estimated total project cost",
      value: round2(dailySpendRate),
      basis: "Measured daily spend rate derived from recorded expenditure",
    },
    changedAssumption: `"${nextPendingStage}" starts ${delayDays} days later`,
    result: {
      label: "Estimated carrying cost of the delay",
      value: round2(cost),
      basis: "Measured daily spend rate × assumed delay days",
    },
    difference: { value: round2(cost), percent: 0 },
    assumptions: [
      "The daily spend rate is derived from your recorded expenditure history and stays constant, real delays may change spend patterns.",
      "This is a hypothetical calculation, not a prediction.",
    ],
    hypothetical: true,
    missingData: [],
    generatedAt: now,
  };
}

/** Scenario: swapping one unpurchased material line at a different
 *  unit price, a pure recorded-line substitution. */
export function materialChangeScenario(input: {
  now: string;
  shoppingItems: ShoppingRow[];
  materialName: string;
  newUnitPrice: number;
}): ScenarioOutcome {
  const { now, shoppingItems, materialName, newUnitPrice } = input;
  const target = shoppingItems.find(
    (i) =>
      !i.is_purchased &&
      i.name.toLowerCase().trim() === materialName.toLowerCase().trim(),
  );

  if (!target) {
    return {
      id: "scenario-material-change",
      question: `What happens if I change "${materialName}"?`,
      status: "insufficient_data",
      baseline: null,
      changedAssumption: null,
      result: null,
      difference: null,
      assumptions: [],
      hypothetical: true,
      missingData: [
        `an unpurchased shopping-list line named "${materialName}"`,
      ],
      generatedAt: now,
    };
  }

  const lineEstimated =
    Number(target.total_price) > 0
      ? Number(target.total_price)
      : Number(target.quantity) * Number(target.estimated_price);
  const lineChanged = Number(target.quantity) * newUnitPrice;
  const budget = estimatedShoppingTotal(shoppingItems);

  return {
    id: "scenario-material-change",
    question: `What happens if I change "${materialName}" to a unit price of ${round2(newUnitPrice)}?`,
    status: "ok",
    baseline: {
      label: `Current material budget with "${materialName}" at its recorded estimate`,
      value: round2(budget),
      basis: "Sum of estimated line totals on the recorded shopping list",
    },
    changedAssumption: `"${materialName}" (qty ${target.quantity}) at a unit price of ${round2(newUnitPrice)} instead of ${round2(Number(target.estimated_price))}`,
    result: {
      label: "Material budget with the substituted line",
      value: round2(budget - lineEstimated + lineChanged),
      basis: "Deterministic line substitution on the recorded budget",
    },
    difference: {
      value: round2(lineChanged - lineEstimated),
      percent:
        lineEstimated > 0
          ? round2(((lineChanged - lineEstimated) / lineEstimated) * 100)
          : 0,
    },
    assumptions: [
      "Quantity stays the same; only the unit price changes.",
      "Labour and other material lines are unaffected.",
      "This is a hypothetical calculation, not a prediction.",
    ],
    hypothetical: true,
    missingData: [],
    generatedAt: now,
  };
}
