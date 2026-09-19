import { describe, expect, it } from "vitest";
// =========================================================
// FORENSIC PASS §8 — LEARNING INTEGRITY, PIPELINE DEPTH
// H1 (gratitude-as-validation) and H2 (repetition-as-
// validation) are covered by learning-gates.test.ts; the
// single-isolate H3 id race by fact-id-concurrency.test.ts.
// This file attacks what those do NOT:
//   * H3 across SIMULATED ISOLATES (independent FactStore
//     instances = independent execution contexts) with
//     identical timestamps — primary-key collision behavior
//   * promotion gate BOUNDARY conditions (exactly 2
//     validations, exactly 0.6 confidence, zero vs one
//     verification events)
//   * verifiedBy ledger integrity under reinforcement
//   * consolidation honesty: candidates with zero evidence
//     are never promoted, consolidation is idempotent
//   * IMPORT integrity: a persisted row cannot smuggle in
//     "validated" status without validation history
// =========================================================

import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

async function taught(
  store: FactStore,
  subject: string,
  predicate: string,
  object: string,
  source:
    | "seed"
    | "inferred"
    | "owner-taught"
    | "web-research"
    | `cross-source:${string}` = "owner-taught",
  confidence = 0.9,
) {
  return store.assert({
    subject,
    predicate,
    object,
    confidence,
    provenance: { source },
    // facts await promotion as candidates — the gate decides
    status: "candidate",
  });
}

describe("H3 across simulated isolates (independent execution contexts)", () => {
  it("8 independent FactStores asserting the same fact simultaneously produce 8 unique ids", async () => {
    const stores = Array.from({ length: 8 }, () => new FactStore());
    const results = await Promise.all(
      stores.map((s) => taught(s, "cement", "cures-in", "28 days")),
    );
    const ids = results.map((r) => r.fact.id);
    expect(new Set(ids).size).toBe(8);
  });

  it("50 rapid asserts across stores never produce duplicate ids", async () => {
    const stores = Array.from({ length: 50 }, () => new FactStore());
    const results = await Promise.all(
      stores.map((s, i) => taught(s, `material-${i % 5}`, "known", "true")),
    );
    const ids = new Set(results.map((r) => r.fact.id));
    expect(ids.size).toBe(50);
  });
});

describe("isolate hand-off through shared persistence (the real cross-context path)", () => {
  it("store B hydrating store A's rows, then asserting the same fact, MERGES — never duplicates", async () => {
    // maps Fact -> PersistedFactRow the same way the real
    // persistence layer does (field names differ: verified_by
    // vs verifiedBy, validated_count vs validatedCount)
    const rows: Record<string, unknown>[] = [];
    const toRow = (f: Record<string, unknown>) => ({
      id: f.id,
      subject: f.subject,
      predicate: f.predicate,
      object: f.object,
      qualifiers: f.qualifiers,
      confidence: f.confidence,
      provenance: f.provenance,
      status: f.status,
      validated_count: f.validatedCount,
      verified_by: f.verifiedBy,
      created_at: f.createdAt,
    });
    const mem = {
      async loadFacts() {
        return [...rows];
      },
      async saveFact(f: Record<string, unknown>) {
        rows.push(toRow(f));
      },
      async saveFacts(fs: Record<string, unknown>[]) {
        rows.push(...fs.map(toRow));
      },
    };
    const a = new FactStore(mem as never);
    await taught(a, "mortar", "ratio", "1:4", "owner-taught", 0.8);
    expect(rows.length).toBe(1);
    // isolate B boots from the same persisted state
    const b = new FactStore(mem as never);
    await b.hydrate();
    expect(b.count()).toBe(1);
    const result = await taught(
      b,
      "mortar",
      "ratio",
      "1:4",
      "cross-source:field-guide",
      0.7,
    );
    // twin was found and reinforced, not duplicated
    expect(b.count()).toBe(1);
    expect(result.fact.validatedCount).toBe(1);
    expect(result.fact.verifiedBy).toEqual([
      "owner-taught",
      "cross-source:field-guide",
    ]);
    expect(result.fact.id).toBe((rows[0] as { id: string }).id);
  });
});

describe("promotion gate boundary conditions", () => {
  it("validatedCount 2 + confidence >= 0.6 + one corroborating source is exactly the gate", async () => {
    const store = new FactStore();
    const first = await taught(
      store,
      "screeding",
      "sets-in",
      "48 hours",
      "owner-taught",
      0.6,
    );
    // creation seeds the ledger ["owner-taught"] but is NOT
    // itself a reinforcement (validatedCount 0)
    expect(first.fact.verifiedBy).toEqual(["owner-taught"]);
    expect(first.fact.validatedCount).toBe(0);
    // two independent corroborations reach validatedCount 2
    await taught(
      store,
      "screeding",
      "sets-in",
      "48 hours",
      "cross-source:field-guide",
      0.7,
    );
    const twin = await taught(
      store,
      "screeding",
      "sets-in",
      "48 hours",
      "cross-source:catalog",
      0.65,
    );
    expect(twin.fact.validatedCount).toBe(2);
    expect(twin.fact.verifiedBy).toEqual([
      "owner-taught",
      "cross-source:field-guide",
      "cross-source:catalog",
    ]);
    expect(twin.fact.status).toBe("validated");
  });

  it("validatedCount 2 but confidence below 0.6 does NOT promote", async () => {
    const store = new FactStore();
    await taught(
      store,
      "sand",
      "costs",
      "little",
      "cross-source:field-guide",
      0.4,
    );
    await taught(
      store,
      "sand",
      "costs",
      "little",
      "cross-source:catalog",
      0.45,
    );
    const twin = await taught(
      store,
      "sand",
      "costs",
      "little",
      "cross-source:website",
      0.45,
    );
    expect(twin.fact.validatedCount).toBe(2);
    expect(twin.fact.confidence).toBeLessThan(0.6);
    expect(twin.fact.status).not.toBe("validated");
  });

  it("same-source repetition fills no ledger slot and can never promote alone (H2)", async () => {
    const store = new FactStore();
    await taught(
      store,
      "gravel",
      "sold-in",
      "tonnes",
      "cross-source:field-guide",
      0.8,
    );
    await taught(
      store,
      "gravel",
      "sold-in",
      "tonnes",
      "cross-source:field-guide",
      0.8,
    );
    await taught(
      store,
      "gravel",
      "sold-in",
      "tonnes",
      "cross-source:field-guide",
      0.8,
    );
    const f = store.list().find((x) => x.subject === "gravel")!;
    // 3 same-source asserts → 2 reinforcements, 0 ledger entries
    expect(f.validatedCount).toBe(2);
    expect(f.verifiedBy).toEqual([]);
    expect(f.status).not.toBe("validated");
    // even pushed past the confidence bar, repetition alone
    // still cannot promote
    await taught(
      store,
      "gravel",
      "sold-in",
      "tonnes",
      "cross-source:field-guide",
      0.8,
    );
    await taught(
      store,
      "gravel",
      "sold-in",
      "tonnes",
      "cross-source:field-guide",
      0.8,
    );
    const f2 = store.list().find((x) => x.subject === "gravel")!;
    expect(f2.confidence).toBeGreaterThan(0.6);
    expect(f2.status).not.toBe("validated");
  });

  it("consolidation is idempotent — running it twice changes nothing", async () => {
    const store = new FactStore();
    await taught(store, "blocks", "come-in", "450mm", "owner-taught", 0.8);
    await taught(
      store,
      "blocks",
      "come-in",
      "450mm",
      "cross-source:catalog",
      0.7,
    );
    const snapshot = () =>
      JSON.stringify(
        store
          .list()
          .map((f) => [f.subject, f.predicate, f.status, f.validatedCount]),
      );
    const before = snapshot();
    await store.consolidate();
    await store.consolidate();
    expect(snapshot()).toBe(before);
  });

  it("hydrate TRUSTS persisted rows verbatim — status is not recomputed from evidence (design note, LOW)", async () => {
    // The assert-path gates cannot be bypassed by assertion, but
    // the storage layer is trusted: a row written directly to
    // the table (behind RLS) hydrates as-is. If the persistence
    // table is ever writable by anything less than owner-only,
    // this becomes a privilege boundary. Recorded in report D-L1.
    const rows = [
      {
        id: "smuggle-1",
        subject: "fake",
        predicate: "fact",
        object: "true",
        confidence: 0.99,
        provenance: { source: "mystery" },
        status: "validated",
        validated_count: 999,
        verified_by: [],
        created_at: new Date().toISOString(),
      },
    ];
    const store = new FactStore({
      async loadFacts() {
        return [...rows];
      },
      async saveFact() {},
      async saveFacts() {},
    } as never);
    await store.hydrate();
    const f = store.get("smuggle-1");
    expect(f?.status).toBe("validated");
    expect(f?.verifiedBy).toEqual([]);
  });
});
