import { describe, expect, it } from "vitest";
// =========================================================
// Fact-ID concurrency safety (audit H3, plan Phase 0).
// The legacy id scheme (Date.now + per-isolate counter)
// collided across concurrent isolates. New ids must be
// globally unique under heavy parallel assertion, and no
// fact may be lost.
// =========================================================

import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

function mkFact(subject: string, i: number) {
  return {
    subject: `concurrency-${subject}`,
    predicate: "stress",
    object: `value-${i}`,
    confidence: 0.5,
    provenance: { source: "seed" as const },
    status: "candidate" as const,
  };
}

describe("fact-id concurrency (H3)", () => {
  it("500 parallel asserts produce 500 unique ids and 500 stored facts", async () => {
    const store = new FactStore();
    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        store.assert(mkFact("a", i)),
      ),
    );
    const ids = results.map((r) => r.fact.id);
    expect(new Set(ids).size).toBe(500);
    expect(store.count()).toBe(500);
    expect(store.list().every((f) => f.id.startsWith("fact_"))).toBe(true);
  });

  it("ids are not timestamp+counter derived (collision-proof format)", async () => {
    const store = new FactStore();
    const r = await store.assert(mkFact("b", 0));
    // UUID v4 shape: 8-4-4-4-12 hex, version nibble 4.
    expect(r.fact.id).toMatch(
      /^fact_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });


  it("same-source repetition is weak (+0.02) and never promotes without a verification event (H2)", async () => {
    const store = new FactStore();
    const research = {
      subject: "market-price",
      predicate: "per-bag",
      object: "8500 naira",
      confidence: 0.55,
      provenance: { source: "web-research" as const },
      status: "candidate" as const,
    };
    // Same-source research repeated 5 times: repetition alone.
    for (let i = 0; i < 5; i++) {
      await store.assert({ ...research });
    }
    let fact = store.list()[0];
    // 1 create + 4 twin reinforcements, confidence now past the
    // old 0.6 threshold — but repetition is not verification.
    expect(fact.validatedCount).toBe(4);
    expect((fact.verifiedBy ?? []).length).toBe(0);
    expect(fact.confidence).toBeGreaterThan(0.6);
    expect(fact.status).toBe("candidate"); // NOT validated by repetition

    // Cross-source corroboration + owner confirmation promote.
    await store.assert({ ...research, provenance: { source: "owner-taught" } });
    fact = store.list()[0];
    expect(fact.confidence).toBeGreaterThan(0.55);
    expect(fact.verifiedBy).toContain("owner-taught");
    expect(fact.status).toBe("validated"); // real verification event present
  });

  it("consolidation does not promote candidates with zero verification events (H1/H2)", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "rumor",
      predicate: "is",
      object: "cheap",
      confidence: 0.9,
      provenance: { source: "web-research" },
      status: "candidate",
    });
    const before = store.list()[0];
    before.validatedCount = 3; // simulate heavy repetition
    const result = await store.consolidate();
    const after = store.get(before.id)!;
    expect(after.status).toBe("candidate");
    expect(result.promoted).toBe(0);
  });
});
