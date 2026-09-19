import { describe, expect, it } from "vitest";
// =========================================================
// Strategy-backed answers (plan P5 Batch C): comparative,
// constraint and temporal questions answered from REAL stored
// evidence — with honest refusals when the store lacks the
// needed predicates. Never a fabricated comparison or bound.
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { extractComparisonSubjects } from "@studio-shared/archie-ai/native-engine/strategies.ts";

/** Seed a validated fact directly into the engine's store. */
async function seed(
  engine: ArchieNativeEngine,
  fact: { subject: string; predicate: string; object: unknown },
) {
  await engine.store().assert({
    ...fact,
    confidence: 0.9,
    provenance: { source: "owner-taught" },
    status: "validated",
  });
}

describe("comparative subject extraction", () => {
  it("extracts pairs from the common comparison phrasings", () => {
    expect(extractComparisonSubjects("compare granite vs sand prices")).toEqual(
      { a: "granite", b: "sand" },
    );
    expect(
      extractComparisonSubjects("difference between screeding and tiling"),
    ).toEqual({ a: "screeding", b: "tiling" });
    expect(
      extractComparisonSubjects("which is cheaper, granite or sand"),
    ).toEqual({ a: "granite", b: "sand" });
    expect(extractComparisonSubjects("what is screeding")).toBeNull();
    // plain conjunction is not a comparison request
    expect(extractComparisonSubjects("what about cement and sand")).toBeNull();
  });
});

describe("comparative answers (dimension extraction from stored objects)", () => {
  it("compares numeric fields inside object-valued facts — granite vs sand", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    await seed(engine, {
      subject: "granite",
      predicate: "market-price",
      object: { price: 5500, unit: "per tonne", region: "Lagos" },
    });
    await seed(engine, {
      subject: "sand",
      predicate: "market-price",
      object: { price: 4500, unit: "per tonne", region: "Lagos" },
    });
    const res = await engine.converse("compare granite vs sand prices");
    expect(res.responseText).toMatch(/sand has lower price/i);
    expect(res.responseText).toMatch(/4500 vs 5500/);
    // both sides cited as real evidence
    expect(res.citedFactIds.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses honestly when there is no shared predicate to compare on", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("compare granite vs sand prices");
    expect(res.responseText).toMatch(
      /no shared predicate|nothing real to compare/i,
    );
    expect(res.responseText).toMatch(/will not invent/i);
    expect(res.citedFactIds).toHaveLength(0);
  });
});

describe("constraint answers (bound-checking over stored values)", () => {
  it("checks a numeric fact against an explicit bound", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    await seed(engine, {
      subject: "cement",
      predicate: "price",
      object: "9200",
    });
    const res = await engine.converse(
      "is the cement price at most 10000 in my market",
    );
    expect(res.responseText).toMatch(/satisfies the constraint/i);
    expect(res.citedFactIds.length).toBeGreaterThan(0);
  });

  it("refuses honestly when no numeric fact exists to check the bound", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("is the granite price at most 10000");
    expect(res.responseText).toMatch(/no numeric facts|will not guess/i);
  });
});

describe("temporal answers (dated facts, chronological order)", () => {
  it("orders dated facts into a timeline", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    await seed(engine, {
      subject: "cement",
      predicate: "price",
      object: "8600 on 2026-06-01",
    });
    await seed(engine, {
      subject: "cement",
      predicate: "price",
      object: "9200 on 2026-09-08",
    });
    const res = await engine.converse("what is the history of cement");
    expect(res.responseText).toMatch(/chronological/i);
    // earliest before latest in the composed answer
    const i1 = res.responseText.indexOf("2026-06-01");
    const i2 = res.responseText.indexOf("2026-09-08");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThan(i2);
  });

  it("refuses to reconstruct history it does not hold", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse(
      "what is the history of the mortar price",
    );
    expect(res.responseText).toMatch(
      /no dated facts|will not reconstruct/i,
    );
  });
});
