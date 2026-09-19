// =========================================================
// GLOBAL-MARKETS TESTS (batch 26, fix 108)
// Provenance contract enforced: sector/region/source/date/
// statement/confidence required; raw observations can never
// claim VERIFIED or CONFIGURED; aggregates are INFERRED with
// weakest-source confidence.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  aggregateObservations,
  MARKET_RESEARCH_AGENDA,
  MARKET_SECTORS,
  validateMarketObservation,
  type GlobalMarketObservation,
} from "@/lib/archie/global-markets";

function obs(
  over: Partial<GlobalMarketObservation> = {},
): GlobalMarketObservation {
  return {
    id: "obs1",
    sector: "construction_materials",
    kind: "PRICE_OBSERVATION",
    region: "Lagos",
    observed_at: "2026-09-10",
    source: "market survey",
    statement: "50kg cement bag listed at ₦9,500",
    confidence: 0.7,
    validation_state: "UNVERIFIED",
    ...over,
  };
}

describe("validateMarketObservation — the provenance contract", () => {
  it("accepts a fully-attributed UNVERIFIED observation", () => {
    expect(validateMarketObservation(obs())).toEqual({ ok: true });
  });

  it("requires sector, region, source, date, statement and 0..1 confidence", () => {
    expect(validateMarketObservation(obs({ sector: " " })).ok).toBe(false);
    expect(validateMarketObservation(obs({ region: "" })).ok).toBe(false);
    expect(validateMarketObservation(obs({ source: "" })).ok).toBe(false);
    expect(validateMarketObservation(obs({ observed_at: "" })).ok).toBe(false);
    expect(validateMarketObservation(obs({ statement: "" })).ok).toBe(false);
    expect(validateMarketObservation(obs({ confidence: 1.4 })).ok).toBe(false);
  });

  it("refuses raw observations claiming VERIFIED or CONFIGURED state", () => {
    expect(
      validateMarketObservation(obs({ validation_state: "VERIFIED" as never }))
        .ok,
    ).toBe(false);
    expect(
      validateMarketObservation(
        obs({ validation_state: "CONFIGURED" as never }),
      ).ok,
    ).toBe(false);
  });
});

describe("aggregateObservations — aggregates are never facts", () => {
  it("groups by sector+region, INFERRED, weakest-source confidence, deduped sources", () => {
    const aggs = aggregateObservations([
      obs({
        id: "a",
        confidence: 0.9,
        source: "survey A",
        observed_at: "2026-09-01",
      }),
      obs({
        id: "b",
        confidence: 0.4,
        source: "survey B",
        observed_at: "2026-09-10",
      }),
      obs({
        id: "c",
        confidence: 0.8,
        source: "survey A",
        observed_at: "2026-09-05",
      }),
      obs({
        id: "d",
        region: "Abuja",
        confidence: 0.9,
        source: "survey C",
        observed_at: "2026-09-03",
      }),
    ]);
    expect(aggs).toHaveLength(2);
    const lagos = aggs.find((a) => a.region === "Lagos")!;
    expect(lagos.observation_count).toBe(3);
    expect(lagos.validation_state).toBe("INFERRED");
    expect(lagos.confidence).toBe(0.4); // never stronger than the weakest source
    expect(lagos.sources).toEqual(["survey A", "survey B"]);
    expect(lagos.earliest_observed_at).toBe("2026-09-01");
    expect(lagos.latest_observed_at).toBe("2026-09-10");
  });
});

describe("the research vocabulary", () => {
  it("keeps sectors and the agenda extensible (no fixed ceiling)", () => {
    expect(MARKET_SECTORS.length).toBeGreaterThan(8);
    expect(MARKET_SECTORS).toContain("emerging_products");
    expect(
      MARKET_RESEARCH_AGENDA.some((q) =>
        /never overriding CONFIGURED/i.test(q),
      ),
    ).toBe(true);
  });
});
