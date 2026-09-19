// =========================================================
// FRELUX PROPERTY INTELLIGENCE, DEVELOPMENT & INVESTMENT (§7–9, §13–14)
//
// Deterministic development-scenario and investment analysis over
// existing FRELUX engines. Rules:
//   - construction quantities/costs come ONLY from deterministic
//     engines or user-supplied values with provenance (§8, §17)
//   - every missing input is a named gap, never a guess
//   - financial results use deterministic formulas; the AI may not
//     invent them (§13)
//   - hypothetical scenarios are labelled hypothetical, never
//     presented as predictions (§14)
//   - structural feasibility is always subject to qualified
//     professional assessment (§7)
// =========================================================

import {
  totalDevelopmentCost,
  grossRentalYield,
  netRentalYield,
  developmentMargin,
} from "./metrics";
import type { DevelopmentCostResult, MetricResult } from "./metrics";

export const STRUCTURAL_FEASIBILITY_NOTE =
  "Structural feasibility (foundations, load paths, permits) is subject to assessment by a qualified professional. FRELUX does not certify structures.";

export const NOT_FINANCIAL_ADVICE =
  "This is a deterministic calculation of user-supplied figures, not personalized financial advice.";

// =========================================================
// Development scenarios (§7, §8)
// =========================================================

export type DevelopmentScenarioKind =
  "as_is" | "renovation" | "extension" | "new_construction" | "redevelopment";

export const SCENARIO_KIND_LABELS: Record<DevelopmentScenarioKind, string> = {
  as_is: "Existing property (as is)",
  renovation: "Renovation",
  extension: "Extension",
  new_construction: "New construction",
  redevelopment: "Redevelopment (demolish & rebuild)",
};

/** Where a scenario cost came from, engine, user, or nowhere. */
export type ScenarioCostSource =
  | { kind: "engine"; engineId: string; source: string }
  | { kind: "user"; source: string }
  | { kind: "unavailable"; reason: string };

export interface ScenarioConstructionEstimate {
  currency: string;
  totalCost?: number;
  costSource: ScenarioCostSource;
  /** Material quantities when a deterministic engine produced them. */
  materialSummary?: Array<{ item: string; quantity: number; unit: string }>;
  /** Estimated duration, only when a deterministic basis exists. */
  duration?: { weeks: number; basis: string };
}

export interface PropertyDevelopmentScenario {
  kind: DevelopmentScenarioKind;
  /** Free-text scope, e.g. "Add another floor (3-bedroom bungalow)". */
  scope: string;
  construction?: ScenarioConstructionEstimate;
  assumptions: string[];
  knownRisks: string[];
}

export interface ScenarioAnalysis {
  kind: DevelopmentScenarioKind;
  label: string;
  scope: string;
  /** 'engine' | 'user' estimates are usable; 'unavailable' is a gap. */
  cost: {
    status: "estimated" | "unavailable";
    totalCost?: number;
    currency?: string;
    source?: ScenarioCostSource;
  };
  duration?: { weeks: number; basis: string };
  materialSummary?: Array<{ item: string; quantity: number; unit: string }>;
  assumptions: string[];
  knownRisks: string[];
  limitations: string[];
}

export interface ScenarioComparison {
  baselineKind: DevelopmentScenarioKind;
  scenarios: Array<
    ScenarioAnalysis & {
      deltaVsBaseline?: { totalCostDifference?: number; currency?: string };
    }
  >;
  note: string;
}

/** Information required to assess a scenario, deterministically derived
 *  from what is present vs missing in the supplied inputs (§7). */
export function requiredInformationFor(
  kind: DevelopmentScenarioKind,
  input: {
    hasBuildingSize?: boolean;
    hasFloorCount?: boolean;
    hasLandSize?: boolean;
    hasConstructionEstimate?: boolean;
    hasMarketData?: boolean;
  },
): string[] {
  const required: string[] = [];
  if (kind === "as_is") {
    if (!input.hasMarketData)
      required.push(
        "Verified market data for the property location, to indicate current market context.",
      );
    return required;
  }
  if (!input.hasBuildingSize)
    required.push(
      "Building size (floor area) of the existing and proposed structure, in a consistent unit.",
    );
  if (
    !input.hasFloorCount &&
    (kind === "extension" ||
      kind === "new_construction" ||
      kind === "redevelopment")
  )
    required.push("Floor count of the proposed structure.");
  if (
    !input.hasLandSize &&
    (kind === "extension" ||
      kind === "redevelopment" ||
      kind === "new_construction")
  )
    required.push("Plot/site size, to check the proposal fits the site.");
  if (!input.hasConstructionEstimate)
    required.push(
      "A deterministic FRELUX construction estimate (run the relevant calculator or Build-to-Roof with the proposed dimensions) or a user-supplied estimate with provenance.",
    );
  if (!input.hasMarketData)
    required.push(
      "Verified market data (comparables / listings) for the location, to indicate market context.",
    );
  required.push(
    "Structural feasibility assessment by a qualified professional (FRELUX cannot provide this).",
  );
  return required;
}

/**
 * Analyse one development scenario. Deterministic: costs appear only
 * when an engine/user estimate is supplied; otherwise the scenario
 * lists exactly what is missing. No scenario cost is ever invented.
 */
export function analyseScenario(
  scenario: PropertyDevelopmentScenario,
): ScenarioAnalysis {
  const limitations: string[] = [];
  if (scenario.kind !== "as_is") limitations.push(STRUCTURAL_FEASIBILITY_NOTE);

  const c = scenario.construction;
  const cost: ScenarioAnalysis["cost"] = c
    ? c.totalCost !== undefined
      ? {
          status: "estimated",
          totalCost: c.totalCost,
          currency: c.currency,
          source: c.costSource,
        }
      : { status: "unavailable", source: c.costSource }
    : {
        status: "unavailable",
        source: {
          kind: "unavailable",
          reason: "No construction estimate was supplied for this scenario.",
        },
      };

  if (cost.status === "unavailable") {
    limitations.push(
      "No construction cost estimate is available for this scenario, none was invented. Run the deterministic FRELUX calculators with the proposed dimensions or supply an estimate with provenance.",
    );
  }
  if (c && c.costSource.kind === "engine" && c.materialSummary === undefined) {
    limitations.push("The engine estimate did not include a material summary.");
  }

  return {
    kind: scenario.kind,
    label: SCENARIO_KIND_LABELS[scenario.kind],
    scope: scenario.scope,
    cost,
    duration: c?.duration,
    materialSummary: c?.materialSummary,
    assumptions: scenario.assumptions,
    knownRisks: scenario.knownRisks,
    limitations,
  };
}

/**
 * Compare development scenarios (§8). The FIRST scenario is the
 * baseline (normally 'as_is'); deltas are computed only between
 * priced scenarios. Nothing is extrapolated from unpriced ones.
 */
export function compareDevelopmentScenarios(
  scenarios: PropertyDevelopmentScenario[],
): ScenarioComparison {
  if (scenarios.length === 0) {
    return {
      baselineKind: "as_is",
      scenarios: [],
      note: "No scenarios were supplied.",
    };
  }
  const analyses = scenarios.map(analyseScenario);
  const baseline = analyses[0];
  const baselineCost =
    baseline.cost.status === "estimated" ? baseline.cost.totalCost : undefined;
  const currency = scenarios.find((s) => s.construction)?.construction
    ?.currency;

  return {
    baselineKind: baseline.kind,
    scenarios: analyses.map((a, i) => {
      if (
        i === 0 ||
        baselineCost === undefined ||
        a.cost.status !== "estimated"
      )
        return a;
      return {
        ...a,
        deltaVsBaseline: {
          totalCostDifference: (a.cost.totalCost ?? 0) - baselineCost,
          currency,
        },
      };
    }),
    note:
      baselineCost === undefined
        ? "The baseline scenario has no priced construction estimate, so cost differences between scenarios were not computed. Each scenario shows only its own verified inputs."
        : "Cost differences are computed between scenarios that carry priced, provenance-backed estimates. Hypothetical scenarios are not predictions.",
  };
}

// =========================================================
// Property cost view (§9), over the deterministic cost engine
// =========================================================

export interface PropertyCostViewInput {
  currency: string;
  /** Acquisition cost, only where the user supplied it (§9). */
  acquisitionCost?: { amount: number; currency: string };
  constructionCost?: { amount: number; currency: string; source: string };
  renovationCost?: { amount: number; currency: string; source: string };
  professionalCosts?: Array<{
    label: string;
    amount: number;
    currency: string;
    source: string;
  }>;
  /** Contingency as an explicit user assumption. */
  contingencyPercent?: number;
  otherKnownCosts?: Array<{ label: string; amount: number; currency: string }>;
  unknownCosts?: string[];
}

export interface PropertyCostView {
  cost: DevelopmentCostResult;
  /** Contingency amount implied by the user's assumption, if any. */
  contingency?: { amount: number; percent: number; note: string };
  unknownCosts: string[];
  notes: string[];
}

export function buildPropertyCostView(
  input: PropertyCostViewInput,
): PropertyCostView {
  const otherKnown = [
    ...(input.renovationCost
      ? [
          {
            label: `Renovation cost (${input.renovationCost.source})`,
            amount: input.renovationCost.amount,
            currency: input.renovationCost.currency,
          },
        ]
      : []),
    ...(input.professionalCosts ?? []).map((p) => ({
      label: `${p.label} (${p.source})`,
      amount: p.amount,
      currency: p.currency,
    })),
    ...(input.otherKnownCosts ?? []),
  ];
  const unpriced = [
    ...(input.professionalCosts && input.professionalCosts.length === 0
      ? ["professional fees (not supplied, not invented)"]
      : []),
    ...(input.unknownCosts ?? []),
  ];

  const cost = totalDevelopmentCost({
    currency: input.currency,
    purchaseCost: input.acquisitionCost,
    constructionCost: input.constructionCost,
    otherKnownCosts: otherKnown,
    unpricedItems: unpriced.length > 0 ? unpriced : undefined,
  });

  const notes: string[] = [];
  let contingency: PropertyCostView["contingency"];
  if (input.contingencyPercent !== undefined) {
    if (cost.totalKnownCost !== undefined && input.contingencyPercent >= 0) {
      const amount =
        Math.round(
          cost.totalKnownCost * (input.contingencyPercent / 100) * 100,
        ) / 100;
      contingency = {
        amount,
        percent: input.contingencyPercent,
        note: `Contingency is a user-supplied assumption (${input.contingencyPercent}% of known costs = ${amount} ${input.currency}). It is shown separately, NOT added to the total, because it is an assumption rather than a verified cost.`,
      };
    } else {
      notes.push(
        "A contingency percentage was supplied but there are no known costs to apply it to.",
      );
    }
  } else {
    notes.push(
      "No contingency assumption was supplied. The total excludes contingency.",
    );
  }
  if (cost.status === "insufficient_data") {
    notes.push(
      "No priced costs were available, no total was produced. FRELUX does not invent missing costs.",
    );
  }

  return { cost, contingency, unknownCosts: unpriced, notes };
}

// =========================================================
// Investment / development analysis (§13)
// =========================================================

export interface InvestmentAnalysisInput {
  currency: string;
  acquisitionCost?: { amount: number; currency: string };
  constructionCost?: { amount: number; currency: string; source: string };
  renovationCost?: { amount: number; currency: string; source: string };
  professionalCosts?: Array<{
    label: string;
    amount: number;
    currency: string;
    source: string;
  }>;
  contingencyPercent?: number;
  otherKnownCosts?: Array<{ label: string; amount: number; currency: string }>;
  /** Estimated sale value, user-supplied or from the indicative value
   *  estimate. Its provenance must be stated. */
  estimatedSaleValue?: {
    amount: number;
    currency: string;
    source: string;
    sourceKind: "user" | "indicative_estimate";
  };
  /** Monthly gross rent, user-supplied only. */
  monthlyGrossRent?: { amount: number; currency: string };
  /** Annual operating costs for net yield, user-supplied only. */
  annualOperatingCosts?: { amount: number; currency: string };
  /** Known floor area, for cost-per-area metrics. */
  floorArea?: { value: number; unit: string };
}

export interface InvestmentAnalysis {
  costView: PropertyCostView;
  totalKnownCost?: number;
  currency: string;
  /** Cost per unit area, only when both cost and area are known. */
  costPerArea?: { value: number; unit: string; note: string };
  grossDevelopmentMargin?: MetricResult;
  grossYield?: MetricResult;
  netYield?: MetricResult;
  /** Simple total return if the property is sold at the estimated value. */
  saleScenario?: {
    netProceeds?: number;
    simpleReturnPercent?: number;
    formula: string;
    sourceNote: string;
  };
  rentScenario?: {
    annualGrossRent: number;
    formula: string;
    sourceNote: string;
  };
  assumptions: string[];
  limitations: string[];
}

export function analyseInvestment(
  input: InvestmentAnalysisInput,
): InvestmentAnalysis {
  const costView = buildPropertyCostView(input);
  const limitations: string[] = [NOT_FINANCIAL_ADVICE];
  const assumptions: string[] = [];

  const sale = input.estimatedSaleValue;
  if (sale) {
    assumptions.push(
      `Estimated sale value ${sale.amount} ${sale.currency}, source: ${sale.sourceKind === "indicative_estimate" ? "indicative comparable-based estimate (not a professional valuation)" : "user-supplied"}.`,
    );
  } else {
    limitations.push(
      "No estimated sale value was supplied, so sale-based metrics were not calculated. FRELUX does not assume one.",
    );
  }
  if (input.monthlyGrossRent) {
    assumptions.push(
      `Monthly gross rent ${input.monthlyGrossRent.amount} ${input.monthlyGrossRent.currency}, user-supplied.`,
    );
  }

  const analysis: InvestmentAnalysis = {
    costView,
    totalKnownCost: costView.cost.totalKnownCost,
    currency: input.currency,
    assumptions,
    limitations,
  };

  if (
    input.floorArea &&
    costView.cost.totalKnownCost !== undefined &&
    input.floorArea.value > 0
  ) {
    analysis.costPerArea = {
      value:
        Math.round(
          (costView.cost.totalKnownCost / input.floorArea.value) * 100,
        ) / 100,
      unit: input.floorArea.unit,
      note: `Known costs ÷ ${input.floorArea.value} ${input.floorArea.unit}, excludes unpriced items${costView.cost.unpricedItems.length > 0 ? " (see unknown costs)" : ""}.`,
    };
  }

  if (costView.cost.status === "calculated") {
    analysis.grossDevelopmentMargin = developmentMargin(
      costView.cost,
      sale && sale.currency === input.currency
        ? { amount: sale.amount, currency: sale.currency }
        : undefined,
    );
    if (sale && sale.currency === input.currency) {
      const totalKnown = costView.cost.totalKnownCost as number;
      const proceeds = sale.amount - totalKnown;
      analysis.saleScenario = {
        netProceeds: proceeds,
        simpleReturnPercent:
          totalKnown > 0
            ? Math.round((proceeds / totalKnown) * 10000) / 100
            : undefined,
        formula:
          "net proceeds = estimated sale value − total known cost; simple return = net proceeds ÷ total known cost × 100",
        sourceNote: `Sale value source: ${sale.source} (${sale.sourceKind}). Contingency is NOT included in the total.`,
      };
    }
  } else {
    limitations.push(
      "No total known cost could be computed, so cost-based metrics (margin, return, cost per area) were not calculated.",
    );
  }

  if (
    input.monthlyGrossRent &&
    input.monthlyGrossRent.currency === input.currency
  ) {
    const annualRent = input.monthlyGrossRent.amount * 12;
    // Yield is computed against the acquisition cost when supplied :
    // otherwise against the estimated sale value. Both are labelled.
    const yieldPrice =
      input.acquisitionCost && input.acquisitionCost.currency === input.currency
        ? {
            amount: input.acquisitionCost.amount,
            currency: input.acquisitionCost.currency,
          }
        : sale && sale.currency === input.currency
          ? { amount: sale.amount, currency: sale.currency }
          : undefined;
    if (yieldPrice) {
      analysis.grossYield = grossRentalYield({
        rent: {
          amount: input.monthlyGrossRent.amount,
          period: "monthly",
          currency: input.monthlyGrossRent.currency,
        },
        propertyPrice: yieldPrice,
        priceLabel:
          input.acquisitionCost &&
          input.acquisitionCost.currency === input.currency
            ? "acquisition cost (user-supplied)"
            : "estimated sale value (indicative, not a professional valuation)",
      });
      if (
        input.annualOperatingCosts &&
        input.annualOperatingCosts.currency === input.currency
      ) {
        analysis.netYield = netRentalYield({
          rent: {
            amount: input.monthlyGrossRent.amount,
            period: "monthly",
            currency: input.monthlyGrossRent.currency,
          },
          propertyPrice: yieldPrice,
          priceLabel: "see gross yield price label",
          annualOperatingExpenses: {
            amount: input.annualOperatingCosts.amount,
            currency: input.annualOperatingCosts.currency,
          },
        });
      }
    } else {
      limitations.push(
        "No property price (acquisition cost or estimated sale value) was available to compute rental yield against.",
      );
    }
    analysis.rentScenario = {
      annualGrossRent: annualRent,
      formula: "annual gross rent = monthly rent × 12",
      sourceNote:
        "Rent figures are user-supplied; they are not verified market data.",
    };
  }

  return analysis;
}

// =========================================================
// Scenario simulation (§14), what-if over the SAME formulas
// =========================================================

export type InvestmentOverride =
  | { kind: "construction_cost_factor"; percent: number }
  | { kind: "sale_value_override"; amount: number }
  | { kind: "rent_instead_of_sale"; monthlyGrossRent: number }
  | { kind: "added_rooms_extension"; additionalConstructionCost: number };

export interface InvestmentScenarioSimulation {
  label: string;
  changedAssumption: string;
  /** True, hypothetical scenarios are never predictions. */
  hypothetical: true;
  baseline: InvestmentAnalysis;
  scenario: InvestmentAnalysis;
  difference: {
    totalKnownCostDifference?: number;
    simpleReturnDifferencePercent?: number;
    note: string;
  };
}

/** Simulate a what-if on an investment analysis by RE-RUNNING the same
 *  deterministic formulas with one changed assumption (§14). */
export function simulateInvestmentScenario(
  baselineInput: InvestmentAnalysisInput,
  override: InvestmentOverride,
): InvestmentScenarioSimulation {
  const baseline = analyseInvestment(baselineInput);
  const scenarioInput: InvestmentAnalysisInput = JSON.parse(
    JSON.stringify(baselineInput),
  );

  let changedAssumption = "";
  let label = "";
  switch (override.kind) {
    case "construction_cost_factor": {
      const f = 1 + override.percent / 100;
      if (scenarioInput.constructionCost)
        scenarioInput.constructionCost.amount =
          Math.round(scenarioInput.constructionCost.amount * f * 100) / 100;
      if (scenarioInput.renovationCost)
        scenarioInput.renovationCost.amount =
          Math.round(scenarioInput.renovationCost.amount * f * 100) / 100;
      changedAssumption = `Construction/renovation costs changed by ${override.percent}%.`;
      label = `Construction costs ${override.percent > 0 ? "increase" : "decrease"} by ${Math.abs(override.percent)}%`;
      break;
    }
    case "sale_value_override":
      if (scenarioInput.estimatedSaleValue)
        scenarioInput.estimatedSaleValue.amount = override.amount;
      else
        scenarioInput.estimatedSaleValue = {
          amount: override.amount,
          currency: baselineInput.currency,
          source: "hypothetical what-if",
          sourceKind: "user",
        };
      changedAssumption = `Estimated sale value set to ${override.amount} ${baselineInput.currency}.`;
      label = `Sale value = ${override.amount.toLocaleString()} ${baselineInput.currency}`;
      break;
    case "rent_instead_of_sale":
      scenarioInput.monthlyGrossRent = {
        amount: override.monthlyGrossRent,
        currency: baselineInput.currency,
      };
      scenarioInput.estimatedSaleValue = undefined;
      changedAssumption = `Property rented at ${override.monthlyGrossRent} ${baselineInput.currency}/month instead of sold.`;
      label = "Rented instead of sold";
      break;
    case "added_rooms_extension":
      scenarioInput.constructionCost = scenarioInput.constructionCost
        ? {
            ...scenarioInput.constructionCost,
            amount:
              Math.round(
                (scenarioInput.constructionCost.amount +
                  override.additionalConstructionCost) *
                  100,
              ) / 100,
          }
        : {
            amount: override.additionalConstructionCost,
            currency: baselineInput.currency,
            source: "hypothetical extension estimate",
          };
      changedAssumption = `Extension construction cost of ${override.additionalConstructionCost} ${baselineInput.currency} added.`;
      label = "Add rooms (extension)";
      break;
  }

  const scenario = analyseInvestment(scenarioInput);
  const costDiff =
    baseline.totalKnownCost !== undefined &&
    scenario.totalKnownCost !== undefined
      ? Math.round((scenario.totalKnownCost - baseline.totalKnownCost) * 100) /
        100
      : undefined;
  const returnDiff =
    baseline.saleScenario?.simpleReturnPercent !== undefined &&
    scenario.saleScenario?.simpleReturnPercent !== undefined
      ? Math.round(
          (scenario.saleScenario.simpleReturnPercent -
            baseline.saleScenario.simpleReturnPercent) *
            100,
        ) / 100
      : undefined;

  return {
    label,
    changedAssumption,
    hypothetical: true,
    baseline,
    scenario,
    difference: {
      totalKnownCostDifference: costDiff,
      simpleReturnDifferencePercent: returnDiff,
      note: "Hypothetical scenario computed with the same deterministic formulas, it is not a prediction of what will happen.",
    },
  };
}
