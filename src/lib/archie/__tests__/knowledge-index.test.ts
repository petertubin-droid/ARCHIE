import { describe, expect, it } from "vitest";
// =========================================================
// KNOWLEDGE INDEX — LEGACY EQUIVALENCE (perf-pass 2026-09-11)
//
// FactStore.rank() now scores through a fused cosine with
// generation-cached doc norms and streaming top-k selection
// (was: per-candidate weight Map allocation + full sort per
// query — measured p50 15.32ms → 4.14ms at 10k facts; see
// docs/archie-performance-ledger.md). This file pins the
// correctness contract: the optimized index must return the
// IDENTICAL fact sequence as the legacy full-rebuild ranker
// across stable corpora AND under write churn (cached norms
// must recompute with fresh idf after every mutation), and
// must never regress the legacy ranker's forensic guarantees
// (k cap, zero-candidate, empty-query safety).
// =========================================================

import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import { rankFacts } from "@studio-shared/archie-ai/native-engine/memory.ts";

async function assertFact(
  store: FactStore,
  subject: string,
  predicate: string,
  object: string,
) {
  await store.assert({
    subject,
    predicate,
    object,
    confidence: 0.9,
    provenance: { source: "seed" },
    status: "validated",
  });
}

const QUERIES = [
  "what does material-12 cost",
  "material-401 value",
  "compare material-77 and material-3",
  "how is material-250 sold",
  "when does material-88 set",
  "grade of material-9",
  "zzz-no-match-term",
  "cost",
  "material",
  "naira per unit",
  "",
];

function idsOf(store: FactStore, q: string, k = 6): string {
  return store
    .rank(q, k)
    .map((f) => f.id)
    .join(",");
}

function legacyIds(store: FactStore, q: string, k = 6): string {
  return rankFacts(q, store.list(), k)
    .map((f) => f.id)
    .join(",");
}

describe("knowledge index — legacy equivalence", () => {
  it("returns identical sequences to the legacy ranker on a stable corpus", async () => {
    const store = new FactStore();
    const predicates = ["cost", "set", "sold", "value", "grade", "weight"];
    for (let i = 0; i < 300; i++) {
      await assertFact(
        store,
        `material-${i}`,
        predicates[i % predicates.length],
        `${(i % 900) + 100} naira per unit ${i}`,
      );
    }
    for (const q of QUERIES) {
      expect(idsOf(store, q)).toBe(legacyIds(store, q));
    }
  });

  it("stays equivalent under write churn — cached norms recompute with fresh idf", async () => {
    const store = new FactStore();
    for (let i = 0; i < 120; i++) {
      await assertFact(store, `material-${i}`, "cost", `${100 + i} naira`);
    }
    // Teach, reinforce (twin path), and query after EACH
    // mutation — the norm cache is invalidated per generation
    // and must never serve a stale-idf ranking.
    for (let round = 0; round < 8; round++) {
      await assertFact(store, `churn-${round}`, "cost", `${round} naira`);
      for (const q of QUERIES) {
        expect(idsOf(store, q)).toBe(legacyIds(store, q));
      }
      // Reinforce an existing fact (twin path mutates confidence,
      // not the index surface — still must stay equivalent).
      await assertFact(
        store,
        `material-${round}`,
        "cost",
        `${100 + round} naira`,
      );
      for (const q of QUERIES) {
        expect(idsOf(store, q)).toBe(legacyIds(store, q));
      }
    }
  });

  it("respects the k cap and never returns more than k facts", async () => {
    const store = new FactStore();
    for (let i = 0; i < 50; i++) {
      await assertFact(
        store,
        `material-${i}`,
        "cost",
        `${100 + i} naira per unit ${i}`,
      );
    }
    expect(store.rank("material cost", 3).length).toBeLessThanOrEqual(3);
    expect(store.rank("material cost", 1).length).toBeLessThanOrEqual(1);
  });

  it("is safe on empty store and empty/whitespace query", () => {
    const store = new FactStore();
    expect(store.rank("anything", 6)).toEqual([]);
    expect(store.rank("", 6)).toEqual([]);
    expect(store.rank("   ", 6)).toEqual([]);
  });

  it("is deterministic across repeated calls", async () => {
    const store = new FactStore();
    for (let i = 0; i < 60; i++) {
      await assertFact(store, `material-${i}`, "cost", `${100 + i} naira`);
    }
    const first = idsOf(store, "material cost");
    for (let i = 0; i < 10; i++) {
      expect(idsOf(store, "material cost")).toBe(first);
    }
  });
});
