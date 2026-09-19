// =========================================================
// MARKET-INTELLIGENCE TESTS (batch 25, fix 99)
// Observations are labeled kinds, NEVER merged into configured
// prices; raw observations can never claim FRELUX_CONFIGURED_
// PRICE; commentary refuses to speak on weak data.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  buildPriceIntelligence,
  compareObservedToConfigured,
  observationsForProfile,
  validateObservation,
} from "@/lib/archie/market-intelligence";
import type {
  MarketObservation,
  RegionalProfile,
} from "@/lib/archie/phase9-types";

function obs(over: Partial<MarketObservation> = {}): MarketObservation {
  return {
    kind: "MATERIAL_PRICE",
    region: "Lagos",
    item: "cement",
    value: 8500,
    currency: "NGN",
    unit: "bag",
    price_kind: "OBSERVED_MARKET_PRICE",
    observed_at: "2026-09-15T00:00:00Z",
    confidence: 0.8,
    ...over,
  };
}

describe("validateObservation", () => {
  it("refuses observations claiming to be configured prices", () => {
    expect(() =>
      validateObservation(obs({ price_kind: "FRELUX_CONFIGURED_PRICE" })),
    ).toThrow(/exists only in the calculator configuration/i);
  });

  it("requires confidence in 0..1 and a region", () => {
    expect(() => validateObservation(obs({ confidence: 1.5 }))).toThrow(
      /0\.\.1/i,
    );
    expect(() => validateObservation(obs({ region: "" }))).toThrow(/region/i);
  });
});

describe("buildPriceIntelligence — side by side, never merged", () => {
  it("returns the configured price labeled as authoritative next to observations", () => {
    const view = buildPriceIntelligence({
      item: "cement",
      configured: { value: 8000, currency: "NGN", unit: "bag" },
      observations: [obs()],
      region: "Lagos",
    });
    expect(view.configured.price_kind).toBe("FRELUX_CONFIGURED_PRICE");
    expect(view.configured.value).toBe(8000);
    expect(view.observed).toHaveLength(1);
    expect(view.observed[0].price_kind).toBe("OBSERVED_MARKET_PRICE");
    expect(view.observed[0].value).toBe(8500);
  });

  it("considers only the resolved region's observations", () => {
    const view = buildPriceIntelligence({
      item: "cement",
      configured: { value: 8000, currency: "NGN", unit: "bag" },
      observations: [obs(), obs({ region: "Abuja", value: 9100 })],
      region: "Lagos",
    });
    expect(view.observed).toHaveLength(1);
    expect(view.observed[0].value).toBe(8500);
  });
});

describe("compareObservedToConfigured — commentary only", () => {
  it("returns null when no high-confidence market prices exist", () => {
    expect(
      compareObservedToConfigured({
        configured_value: 8000,
        observations: [obs({ confidence: 0.3 })],
      }),
    ).toBeNull();
    expect(
      compareObservedToConfigured({
        configured_value: 8000,
        observations: [obs({ price_kind: "ACTUAL_PROJECT_PRICE" as never })],
      }),
    ).toBeNull();
  });

  it("computes an honest above/below percentage from usable observations", () => {
    const r = compareObservedToConfigured({
      configured_value: 8000,
      observations: [obs({ value: 8500 }), obs({ value: 7500 })],
    });
    // average 8000 → equal within ±0.5%
    expect(r).toMatchObject({ direction: "equal", percent: 0 });
    const above = compareObservedToConfigured({
      configured_value: 8000,
      observations: [obs({ value: 8500 })],
    });
    expect(above).toMatchObject({ direction: "above", percent: 6.3 });
  });
});

describe("observationsForProfile", () => {
  it("matches country context keys and city", () => {
    const profile = {
      country_code: "NG",
      country: "Nigeria",
      region: null,
      city: "Lagos",
      currency: "NGN",
      units: "metric",
      suggested_languages: ["en"],
      market_context_keys: ["country:NG"],
      climate_zone: null,
    } as RegionalProfile;
    const matched = observationsForProfile(
      [obs(), obs({ region: "Kano" })],
      profile,
    );
    expect(matched.map((o) => o.region)).toEqual(["Lagos", "Kano"]);
    const cityOnly = observationsForProfile([obs(), obs({ region: "Abuja" })], {
      ...profile,
      market_context_keys: [],
    });
    expect(cityOnly.map((o) => o.region)).toEqual(["Lagos"]);
  });
});
