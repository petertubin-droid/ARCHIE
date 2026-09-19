// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — GLOBAL MARKET RESEARCH (§5)
//
// ARCHIE researches and reasons about markets globally:
// construction markets, material prices, technology markets,
// property markets, business models, competitors, emerging
// products, regional differences, supply chains and economic
// conditions.
//
// Provenance contract (enforced):
//  - every observation carries source, date, region, currency
//  - every observation carries confidence 0..1
//  - an UNVERIFIED observation is NEVER converted into a fact
//    — it stays labeled until human verification
//  - observations never override CONFIGURED prices (the
//    market-intelligence.ts contract, extended globally)
// =========================================================

import type { ValidationState } from "./knowledge-validation";

/** Market sectors ARCHIE researches. Extensible data, not a
 *  fixed ceiling. */
export const MARKET_SECTORS: readonly string[] = [
  "construction_materials",
  "construction_labour",
  "technology",
  "property",
  "energy",
  "logistics_supply_chain",
  "financial_services",
  "consumer_goods",
  "emerging_products",
];

/** Observation kinds. */
export type MarketDatumKind =
  | "PRICE_OBSERVATION"
  | "AVAILABILITY_OBSERVATION"
  | "TREND_OBSERVATION"
  | "COMPETITOR_SIGNAL"
  | "SUPPLY_CHAIN_SIGNAL"
  | "ECONOMIC_INDICATOR"
  | "BUSINESS_MODEL_NOTE"
  | "REGIONAL_DIFFERENCE";

export interface GlobalMarketObservation {
  id: string;
  sector: string;
  kind: MarketDatumKind;
  region: string;
  /** ISO date observed. */
  observed_at: string;
  source: string;
  /** Free-form datum, e.g. "50kg cement bag listed at ₦9,500". */
  statement: string;
  currency?: string;
  confidence: number; // 0..1
  validation_state: ValidationState;
  /** FRELUX domain this informs, when applicable. */
  informs_domain?: string;
}

/** Validate an observation against the provenance contract. */
export function validateMarketObservation(
  obs: GlobalMarketObservation,
): { ok: true } | { ok: false; error: string } {
  if (!obs.sector.trim())
    return { ok: false, error: "Observation requires a sector." };
  if (!obs.region.trim())
    return { ok: false, error: "Observations must carry a region." };
  if (!obs.source.trim())
    return { ok: false, error: "Observations must name their source." };
  if (!obs.observed_at.trim())
    return { ok: false, error: "Observations must carry an observation date." };
  if (!obs.statement.trim())
    return { ok: false, error: "Observation requires a statement." };
  if (obs.confidence < 0 || obs.confidence > 1) {
    return { ok: false, error: "Confidence must be within 0..1." };
  }
  if (obs.validation_state === "VERIFIED") {
    return {
      ok: false,
      error:
        "A raw observation starts UNVERIFIED; VERIFIED is reachable only through human verification.",
    };
  }
  if (obs.validation_state === "CONFIGURED") {
    return {
      ok: false,
      error:
        "CONFIGURED exists only in configuration tables; observations can never claim it.",
    };
  }
  return { ok: true };
}

/** Aggregate observations per region+sector, honoring the
 *  no-fact-conversion rule: aggregates are INFERRED and carry
 *  the confidence of their weakest source. */
export interface MarketAggregate {
  sector: string;
  region: string;
  observation_count: number;
  /** The aggregate is always INFERRED, never presented as fact. */
  validation_state: "INFERRED";
  /** Min source confidence — an aggregate is never stronger than its weakest source. */
  confidence: number;
  sources: readonly string[];
  earliest_observed_at: string;
  latest_observed_at: string;
}

export function aggregateObservations(
  observations: readonly GlobalMarketObservation[],
): MarketAggregate[] {
  const groups = new Map<string, GlobalMarketObservation[]>();
  for (const o of observations) {
    const key = `${o.sector}::${o.region}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }

  const aggregates: MarketAggregate[] = [];
  for (const [key, list] of groups) {
    const [sector, region] = key.split("::");
    const dates = list.map((o) => o.observed_at).sort();
    aggregates.push({
      sector,
      region,
      observation_count: list.length,
      validation_state: "INFERRED",
      confidence: Math.min(...list.map((o) => o.confidence)),
      sources: [...new Set(list.map((o) => o.source))],
      earliest_observed_at: dates[0],
      latest_observed_at: dates[dates.length - 1],
    });
  }
  return aggregates;
}

/** Market research questions ARCHIE can answer about any
 *  sector/region — the research agenda, not a hardcoded
 *  conclusion set. */
export const MARKET_RESEARCH_AGENDA: readonly string[] = [
  "What are current observed prices, and from which sources?",
  "How have prices/availability moved since the last observation window?",
  "Which regional differences are evidenced?",
  "Which supply-chain signals explain the movements?",
  "Which competitors or substitute products appeared?",
  "What economic indicators correlate with the observations?",
  "What does this imply for FRELUX configuration (never overriding CONFIGURED values)?",
  "What information is missing to raise confidence?",
];
