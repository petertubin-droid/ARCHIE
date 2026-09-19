/**
 * FRELUX PROPERTY INTELLIGENCE, INVESTMENT METRICS
 *
 * Prompt 4, Phases 11 + 17: deterministic decision-support metrics.
 *
 * Safety rules enforced here:
 * - Currency consistency: inputs in different currencies are REJECTED,
 *   never silently mixed.
 * - Period consistency: monthly vs annual rent is converted explicitly
 *   and the conversion is recorded as an assumption.
 * - Missing inputs → insufficient_data. Never substituted or guessed.
 * - Every metric carries its formula, inputs and assumptions.
 * - These are analytical calculations, NOT financial advice or guarantees.
 */

// =========================================================
// Result shape
// =========================================================

export type MetricStatus = "calculated" | "insufficient_data" | "invalid_input";

export interface MetricInput {
  label: string;
  value: number | undefined;
  currency?: string;
}

export interface MetricResult {
  status: MetricStatus;
  /** The value, only present when status is 'calculated'. */
  value?: number;
  unit: "percent" | "currency";
  currency?: string;
  formula: string;
  inputs: MetricInput[];
  assumptions: string[];
  /** Present for insufficient_data/invalid_input, the traceable reason. */
  reason?: string;
}

function validPositive(n: number | undefined): n is number {
  return n !== undefined && Number.isFinite(n) && n > 0;
}

// =========================================================
// Rental yield (Phase 11)
// =========================================================

export interface RentalYieldInput {
  /** Verified rental income. */
  rent: { amount: number; period: "monthly" | "annual"; currency: string };
  /**
   * Property price to yield against. Which price this is (asking /
   * verified transaction / FRELUX estimate) is the caller's responsibility :
   * it must be labelled in the UI and must be in the same currency.
   */
  propertyPrice: { amount: number; currency: string };
  /** Provenance of the price, recorded in assumptions, not invented. */
  priceLabel?: string;
}

/**
 * Gross rental yield = (annual rent ÷ property price) × 100.
 * Monthly rent is converted ×12 with the conversion recorded as an assumption.
 */
export function grossRentalYield(input: RentalYieldInput): MetricResult {
  const { rent, propertyPrice } = input;
  const assumptions: string[] = [];

  if (rent.currency !== propertyPrice.currency) {
    return {
      status: "invalid_input",
      unit: "percent",
      formula: "gross yield = (annual rent ÷ property price) × 100",
      inputs: [
        { label: "Rent", value: rent.amount, currency: rent.currency },
        { label: "Property price", value: propertyPrice.amount, currency: propertyPrice.currency },
      ],
      assumptions,
      reason: `Rent currency (${rent.currency}) differs from price currency (${propertyPrice.currency}). FRELUX does not silently convert currencies.`,
    };
  }

  if (!validPositive(rent.amount) || !validPositive(propertyPrice.amount)) {
    return {
      status: "insufficient_data",
      unit: "percent",
      formula: "gross yield = (annual rent ÷ property price) × 100",
      inputs: [
        { label: "Rent", value: rent.amount, currency: rent.currency },
        { label: "Property price", value: propertyPrice.amount, currency: propertyPrice.currency },
      ],
      assumptions,
      reason: "A positive, finite rent and property price are both required.",
    };
  }

  let annualRent = rent.amount;
  if (rent.period === "monthly") {
    annualRent = rent.amount * 12;
    assumptions.push(`Rent was provided monthly and converted to annual (× 12) = ${annualRent} ${rent.currency}/yr.`);
  }
  if (input.priceLabel) {
    assumptions.push(`Yield is calculated against the ${input.priceLabel}, this is NOT a market valuation.`);
  }

  const value = (annualRent / propertyPrice.amount) * 100;
  return {
    status: "calculated",
    value,
    unit: "percent",
    currency: rent.currency,
    formula: "gross yield = (annual rent ÷ property price) × 100",
    inputs: [
      { label: "Annual rent", value: annualRent, currency: rent.currency },
      { label: "Property price", value: propertyPrice.amount, currency: propertyPrice.currency },
    ],
    assumptions: [...assumptions, "Gross yield excludes operating expenses, vacancy and taxes."],
  };
}

/**
 * Net yield = ((annual rent − operating expenses) ÷ property price) × 100.
 * Only available when operating expenses are actually provided.
 */
export function netRentalYield(input: RentalYieldInput & {
  annualOperatingExpenses?: { amount: number; currency: string };
}): MetricResult {
  const { annualOperatingExpenses } = input;
  if (!annualOperatingExpenses) {
    return {
      status: "insufficient_data",
      unit: "percent",
      formula: "net yield = ((annual rent − annual operating expenses) ÷ property price) × 100",
      inputs: [{ label: "Annual operating expenses", value: undefined }],
      assumptions: [],
      reason: "Net yield requires annual operating expenses. They were not provided, so net yield is unavailable, not guessed.",
    };
  }
  if (annualOperatingExpenses.currency !== input.rent.currency) {
    return {
      status: "invalid_input",
      unit: "percent",
      formula: "net yield = ((annual rent − annual operating expenses) ÷ property price) × 100",
      inputs: [{ label: "Operating expenses", value: annualOperatingExpenses.amount, currency: annualOperatingExpenses.currency }],
      assumptions: [],
      reason: "Operating expenses currency does not match rent currency.",
    };
  }
  const gross = grossRentalYield(input);
  if (gross.status !== "calculated" || gross.value === undefined) {
    return {
      ...gross,
      formula: "net yield = ((annual rent − annual operating expenses) ÷ property price) × 100",
      inputs: [...gross.inputs, { label: "Annual operating expenses", value: annualOperatingExpenses.amount, currency: annualOperatingExpenses.currency }],
    };
  }
  const annualRent = gross.inputs[0].value!;
  const value =
    ((annualRent - annualOperatingExpenses.amount) / input.propertyPrice.amount) * 100;
  return {
    status: "calculated",
    value,
    unit: "percent",
    currency: input.rent.currency,
    formula: "net yield = ((annual rent − annual operating expenses) ÷ property price) × 100",
    inputs: [
      { label: "Annual rent", value: annualRent, currency: input.rent.currency },
      { label: "Annual operating expenses", value: annualOperatingExpenses.amount, currency: annualOperatingExpenses.currency },
      { label: "Property price", value: input.propertyPrice.amount, currency: input.propertyPrice.currency },
    ],
    assumptions: [
      ...(gross.assumptions ?? []),
      "Net yield assumes the provided operating expenses are complete and annual.",
    ],
  };
}

// =========================================================
// Development cost & margin (Phase 7 + 11)
// =========================================================

export interface DevelopmentCostInput {
  currency: string;
  purchaseCost?: { amount: number; currency: string };
  constructionCost?: { amount: number; currency: string; /** e.g. "Construction Intelligence estimate" */ source: string };
  otherKnownCosts?: Array<{ label: string; amount: number; currency: string }>;
  /** Cost items that exist but are UNPRICED, tracked, never guessed. */
  unpricedItems?: string[];
}

export interface DevelopmentCostResult {
  status: MetricStatus;
  /** Total of KNOWN costs only. */
  totalKnownCost?: number;
  currency: string;
  knownCostBreakdown: Array<{ label: string; amount: number }>;
  unpricedItems: string[];
  formula: string;
  reason?: string;
}

/** Sums KNOWN costs in one currency. Cross-currency items are rejected. */
export function totalDevelopmentCost(input: DevelopmentCostInput): DevelopmentCostResult {
  const breakdown: DevelopmentCostResult["knownCostBreakdown"] = [];
  const rejected: string[] = [];
  const unpriced = [...(input.unpricedItems ?? [])];

  if (input.purchaseCost) {
    if (input.purchaseCost.currency !== input.currency) {
      rejected.push(`purchase cost (in ${input.purchaseCost.currency})`);
    } else if (validPositive(input.purchaseCost.amount)) {
      breakdown.push({ label: "Purchase cost", amount: input.purchaseCost.amount });
    } else {
      unpriced.push("purchase cost (missing or invalid amount)");
    }
  } else {
    unpriced.push("purchase cost (not provided)");
  }

  if (input.constructionCost) {
    if (input.constructionCost.currency !== input.currency) {
      rejected.push(`construction cost (in ${input.constructionCost.currency})`);
    } else if (validPositive(input.constructionCost.amount)) {
      breakdown.push({ label: `Construction cost (${input.constructionCost.source})`, amount: input.constructionCost.amount });
    } else {
      unpriced.push("construction cost (missing or invalid amount)");
    }
  } else {
    unpriced.push("construction cost (not provided)");
  }

  for (const other of input.otherKnownCosts ?? []) {
    if (other.currency !== input.currency) {
      rejected.push(`${other.label} (in ${other.currency})`);
    } else if (validPositive(other.amount)) {
      breakdown.push({ label: other.label, amount: other.amount });
    } else {
      unpriced.push(other.label);
    }
  }

  if (rejected.length > 0) {
    return {
      status: "invalid_input",
      currency: input.currency,
      knownCostBreakdown: breakdown,
      unpricedItems: unpriced,
      formula: "total = purchase + construction + other known costs",
      reason: `Costs in other currencies were not mixed into the ${input.currency} total: ${rejected.join(", ")}. Convert them first.`,
    };
  }

  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return {
    status: breakdown.length > 0 ? "calculated" : "insufficient_data",
    totalKnownCost: breakdown.length > 0 ? total : undefined,
    currency: input.currency,
    knownCostBreakdown: breakdown,
    unpricedItems: unpriced,
    formula: "total = purchase + construction + other known costs",
    reason:
      breakdown.length === 0
        ? "No valid priced cost items were available, so no total was produced."
        : unpriced.length > 0
          ? `Total covers only KNOWN priced costs. Not included: ${unpriced.join(", ")}. The true total is at least as high.`
          : undefined,
  };
}

/**
 * Development margin = ((expected sale value − total cost) ÷ total cost) × 100.
 * Requires a total cost from totalDevelopmentCost with status 'calculated'.
 */
export function developmentMargin(
  costResult: DevelopmentCostResult,
  expectedSaleValue: { amount: number; currency: string } | undefined,
): MetricResult {
  if (!expectedSaleValue) {
    return {
      status: "insufficient_data",
      unit: "percent",
      formula: "margin = ((expected sale value − total cost) ÷ total cost) × 100",
      inputs: [{ label: "Expected sale value", value: undefined }],
      assumptions: [],
      reason: "Expected sale value was not provided. FRELUX does not assume one.",
    };
  }
  if (expectedSaleValue.currency !== costResult.currency) {
    return {
      status: "invalid_input",
      unit: "percent",
      formula: "margin = ((expected sale value − total cost) ÷ total cost) × 100",
      inputs: [{ label: "Expected sale value", value: expectedSaleValue.amount, currency: expectedSaleValue.currency }],
      assumptions: [],
      reason: `Sale value currency (${expectedSaleValue.currency}) differs from cost currency (${costResult.currency}).`,
    };
  }
  if (!validPositive(expectedSaleValue.amount)) {
    return {
      status: "insufficient_data",
      unit: "percent",
      formula: "margin = ((expected sale value − total cost) ÷ total cost) × 100",
      inputs: [{ label: "Expected sale value", value: expectedSaleValue.amount, currency: expectedSaleValue.currency }],
      assumptions: [],
      reason: "Expected sale value must be a positive, finite number. It is an assumption the user provides, FRELUX does not invent or accept invalid ones.",
    };
  }
  if (costResult.status !== "calculated" || costResult.totalKnownCost === undefined) {
    return {
      status: "insufficient_data",
      unit: "percent",
      formula: "margin = ((expected sale value − total cost) ÷ total cost) × 100",
      inputs: [{ label: "Expected sale value", value: expectedSaleValue.amount, currency: expectedSaleValue.currency }],
      assumptions: [],
      reason: "A priced total development cost is required before a margin can be calculated.",
    };
  }
  const value =
    ((expectedSaleValue.amount - costResult.totalKnownCost) / costResult.totalKnownCost) * 100;
  return {
    status: "calculated",
    value,
    unit: "percent",
    currency: costResult.currency,
    formula: "margin = ((expected sale value − total cost) ÷ total cost) × 100",
    inputs: [
      { label: "Expected sale value", value: expectedSaleValue.amount, currency: expectedSaleValue.currency },
      { label: "Total known development cost", value: costResult.totalKnownCost, currency: costResult.currency },
    ],
    assumptions: [
      "Expected sale value is an ASSUMPTION provided to the system, not a FRELUX valuation.",
      ...(costResult.unpricedItems.length > 0
        ? [`Margin ignores unpriced items: ${costResult.unpricedItems.join(", ")}. Actual margin would be lower.`]
        : []),
      "Analytical calculation only, not financial advice or a guarantee.",
    ],
  };
}
