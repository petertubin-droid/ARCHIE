// =========================================================
// FRELUX PHASE 9, ARCHIE REGIONAL MARKET & PRICE INTELLIGENCE
//
// ARCHIE may learn market observations (material prices, labour
// rates, package sizes, availability, trends) from approved
// public sources. Those observations are ALWAYS labeled and
// are NEVER silently merged into FRELUX's deterministic
// calculator prices or rules (spec §5, §18.6):
//
//   OBSERVED_MARKET_PRICE  — what the market shows
//   FRELUX_CONFIGURED_PRICE — the calculator's authoritative input
//   ACTUAL_PROJECT_PRICE   — a verified project outcome
//   ESTIMATE_ASSUMPTION    — an assumption, never data
//
// Calculators read FRELUX configuration only. Observations
// inform ARCHIE's commentary/recommendations, never the math.
// =========================================================

import type {
  MarketObservation,
  PriceKind,
  RegionalProfile,
} from "./phase9-types";

/** Price kinds valid for a raw observation (§5). */
export const OBSERVABLE_PRICE_KINDS: ReadonlySet<PriceKind> = new Set([
  "OBSERVED_MARKET_PRICE",
  "ACTUAL_PROJECT_PRICE",
  "ESTIMATE_ASSUMPTION",
]);

/**
 * Structural rule: a raw observation can NEVER claim to be a
 * FRELUX_CONFIGURED_PRICE. Configured prices exist only in the
 * FRELUX configuration tables, written through admin config.
 */
export function validateObservation(obs: MarketObservation): void {
  if (!OBSERVABLE_PRICE_KINDS.has(obs.price_kind)) {
    throw new Error(
      `Market observations cannot carry price_kind "${obs.price_kind}". ` +
        `FRELUX_CONFIGURED_PRICE exists only in the calculator configuration.`,
    );
  }
  if (obs.confidence < 0 || obs.confidence > 1) {
    throw new Error("Observation confidence must be within 0..1.");
  }
  if (!obs.region) {
    throw new Error("Market observations must carry a region.");
  }
}

/** A labeled price view: value + kind + provenance, never bare. */
export interface LabeledPriceView {
  item: string;
  value: number;
  currency: string;
  unit: string;
  price_kind: PriceKind;
  source: string;
  observed_at?: string;
  confidence?: number;
}

/**
 * Build the separated price intelligence view for an item.
 * The configured price (from the calculator configuration) and
 * any observations are returned SIDE BY SIDE, clearly labeled.
 * No value ever crosses from one kind to another.
 */
export function buildPriceIntelligence(input: {
  item: string;
  configured: { value: number; currency: string; unit: string };
  observations: MarketObservation[];
  region: string;
}): { configured: LabeledPriceView; observed: LabeledPriceView[] } {
  const regional = input.observations.filter((o) => o.region === input.region);
  for (const o of regional) validateObservation(o);

  return {
    configured: {
      item: input.item,
      value: input.configured.value,
      currency: input.configured.currency,
      unit: input.configured.unit,
      price_kind: "FRELUX_CONFIGURED_PRICE",
      source: "FRELUX configuration (authoritative for calculators)",
    },
    observed: regional.map((o) => ({
      item: o.item,
      value: o.value,
      currency: o.currency,
      unit: o.unit,
      price_kind: o.price_kind,
      source: o.source_ref ?? "market observation",
      observed_at: o.observed_at,
      confidence: o.confidence,
    })),
  };
}

/**
 * Sanity comparator used ONLY for commentary ("market shows X%
 * above/below configured price"). Never mutates the configured
 * value; returns null when observations are too sparse/weak
 * (confidence < 0.5) to say anything.
 */
export function compareObservedToConfigured(input: {
  configured_value: number;
  observations: MarketObservation[];
  min_confidence?: number;
}): { direction: "above" | "below" | "equal"; percent: number } | null {
  const usable = input.observations.filter(
    (o) =>
      o.price_kind === "OBSERVED_MARKET_PRICE" &&
      o.confidence >= (input.min_confidence ?? 0.5),
  );
  if (usable.length === 0) return null;
  const avg = usable.reduce((s, o) => s + o.value, 0) / usable.length;
  if (input.configured_value === 0) return null;
  const pct = ((avg - input.configured_value) / input.configured_value) * 100;
  return {
    direction: pct > 0.5 ? "above" : pct < -0.5 ? "below" : "equal",
    percent: Math.round(pct * 10) / 10,
  };
}

/**
 * Region filter helper: only observations matching the resolved
 * regional profile are considered for that user's analysis.
 */
export function observationsForProfile(
  observations: MarketObservation[],
  profile: RegionalProfile,
): MarketObservation[] {
  const key = `country:${profile.country_code}`;
  return observations.filter(
    (o) =>
      profile.market_context_keys.includes(key) ||
      profile.market_context_keys.includes(`region:${o.region}`) ||
      o.region === profile.city,
  );
}
