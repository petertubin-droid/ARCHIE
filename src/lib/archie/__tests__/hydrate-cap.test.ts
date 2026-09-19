import { describe, expect, it } from "vitest";
// =========================================================
// HYDRATE CAP (owner upgrade 2026-09-16, merged with the
// RESPONSE TIME directive): the hydrate window is computed
// DATABASE-side — O(limit) over the wire — and the cap is
// REPORTED honestly via an exact head-count. A capped
// hydration is never silent; a failed count reports NULL
// stats rather than a guessed total. All network stubbed.
// =========================================================

import { SupabasePersistence } from "@studio-shared/archie-ai/native-engine/persistence.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";
import { NATIVE_CONFIG } from "@studio-shared/archie-ai/native-engine/config.ts";

interface FakeRow {
  id: string;
  subject: string;
  predicate: string;
  object: unknown;
  qualifiers: unknown;
  confidence: number;
  provenance: unknown;
  status: string;
  validated_count: number;
  verified_by: string[];
  created_at: string;
}

function factRow(i: number): FakeRow {
  return {
    id: `f${i}`,
    subject: `subject ${i}`,
    predicate: "is",
    object: `value ${i}`,
    qualifiers: null,
    confidence: 0.9,
    provenance: { source: "owner-taught", note: "test fixture" },
    status: "owner-asserted",
    validated_count: 0,
    verified_by: [],
    // ascending timestamps — row 0 oldest
    created_at: new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString(),
  };
}

/** Real-client-shaped fake: select chains order().limit() (the
 *  DB-side window) and supports exact head-counts. Records
 *  every chained call for contract assertions. */
function windowDb(facts: FakeRow[], opts: { failCount?: boolean } = {}) {
  const calls: string[] = [];
  // Structural test double — cast at the call site like production
  // does (db as unknown as SupabaseLike).
  const db = {
    from(table: string) {
      return {
        select(_q: string, selOpts?: { count?: string; head?: boolean }) {
          if (selOpts?.count) {
            calls.push("count");
            const res = {
              data: null,
              error: opts.failCount ? { message: "nope" } : null,
              count: opts.failCount ? null : facts.length,
            };
            return {
              // shape-complete for the structural contract
              range: () =>
                Promise.resolve({ data: [], error: null }),
              then: (resolve: (v: unknown) => unknown) =>
                Promise.resolve(resolve(res)) as never,
            };
          }
          calls.push("select");
          return {
            range: () => Promise.resolve({ data: [], error: null }),
            order(column: string, o: { ascending: boolean }) {
              calls.push(`order:${column}:${o.ascending}`);
              return {
                limit(n: number) {
                  calls.push(`limit:${n}`);
                  const sorted = [...facts].sort((a, b) =>
                    o.ascending
                      ? a.created_at.localeCompare(b.created_at)
                      : b.created_at.localeCompare(a.created_at),
                  );
                  return Promise.resolve({
                    data: sorted.slice(0, n),
                    error: null,
                  });
                },
              };
            },
            // thenable fallback never taken in this fake
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve(
                resolve({ data: [...facts], error: null }),
              ) as never;
            },
          } as never;
        },
        insert(_r: unknown) {
          return Promise.resolve({ error: null });
        },
        update(_p: unknown) {
          return {
            eq(_c: string, _v: unknown) {
              return Promise.resolve({ error: null });
            },
          };
        },
        upsert(_r: unknown) {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { db, calls };
}

/** Minimal thenable-only fake (legacy test doubles): no
 *  order()/limit() chain — loadFacts degrades to the await +
 *  client-side window path. */
function thenableDb(facts: FakeRow[], opts: { failFirst?: boolean } = {}) {
  const db: SupabaseLike = {
    from(_table: string) {
      return {
        select: () => ({
          range: (_f: number, _t: number) =>
            Promise.resolve({ data: facts.slice(_f, _t + 1), error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              resolve(
                opts.failFirst
                  ? { data: null, error: { message: "boom" } }
                  : { data: [...facts], error: null },
              ),
            ) as never,
        }),
        insert: (_r: unknown) => Promise.resolve({ error: null }),
        update: (_p: unknown) => ({
          eq: (_c: string, _v: unknown) => Promise.resolve({ error: null }),
        }),
        upsert: (_r: unknown) => Promise.resolve({ error: null }),
      } as never;
    },
  };
  return db;
}

describe("hydrate cap — real-client window path (order + limit)", () => {
  it("loads only the newest cap window O(limit) and reports truncation via exact head-count", async () => {
    const facts = Array.from({ length: 1500 }, (_, i) => factRow(i));
    const { db, calls } = windowDb(facts);
    const p = new SupabasePersistence(db as unknown as SupabaseLike);
    const rows = await p.loadFacts();
    // the window: newest-first, exactly cap rows over the wire
    expect(rows).toHaveLength(NATIVE_CONFIG.factHydrateLimit);
    expect(rows[0].id).toBe("f1499");
    expect(rows[rows.length - 1].id).toBe(
      `f${1500 - NATIVE_CONFIG.factHydrateLimit}`,
    );
    expect(calls).toContain("order:created_at:false");
    expect(calls).toContain(`limit:${NATIVE_CONFIG.factHydrateLimit}`);
    expect(calls).toContain("count");
    // honest stats from the exact head-count
    expect(p.lastHydrationStats).toEqual({
      totalFacts: 1500,
      loadedFacts: NATIVE_CONFIG.factHydrateLimit,
      cap: NATIVE_CONFIG.factHydrateLimit,
      truncated: true,
    });
  });

  it("reports no truncation when the table fits inside the window", async () => {
    const facts = Array.from({ length: 236 }, (_, i) => factRow(i));
    const { db } = windowDb(facts);
    const p = new SupabasePersistence(db as unknown as SupabaseLike);
    const rows = await p.loadFacts();
    expect(rows).toHaveLength(236);
    expect(p.lastHydrationStats).toEqual({
      totalFacts: 236,
      loadedFacts: 236,
      cap: NATIVE_CONFIG.factHydrateLimit,
      truncated: false,
    });
  });

  it("a failed head-count reports NULL stats — never a guessed total", async () => {
    const facts = Array.from({ length: 600 }, (_, i) => factRow(i));
    const { db } = windowDb(facts, { failCount: true });
    const p = new SupabasePersistence(db as unknown as SupabaseLike);
    const rows = await p.loadFacts();
    // hydration still works — only the accounting degrades
    expect(rows).toHaveLength(NATIVE_CONFIG.factHydrateLimit);
    expect(p.lastHydrationStats).toBeNull();
  });
});

describe("hydrate cap — thenable-double path (legacy fakes)", () => {
  it("windows client-side and reports stats from what the double holds", async () => {
    const facts = Array.from({ length: 505 }, (_, i) => factRow(i));
    const p = new SupabasePersistence(thenableDb(facts));
    const rows = await p.loadFacts();
    expect(rows).toHaveLength(NATIVE_CONFIG.factHydrateLimit);
    expect(rows[0].id).toBe("f504");
    expect(p.lastHydrationStats).toEqual({
      totalFacts: 505,
      loadedFacts: NATIVE_CONFIG.factHydrateLimit,
      cap: NATIVE_CONFIG.factHydrateLimit,
      truncated: true,
    });
  });

  it("returns [] and NULL stats when the select errors", async () => {
    const p = new SupabasePersistence(thenableDb([], { failFirst: true }));
    const rows = await p.loadFacts();
    expect(rows).toEqual([]);
    expect(p.lastHydrationStats).toBeNull();
  });
});

describe("hydrate cap — FactStore honest account", () => {
  it("exposes hydration stats through FactStore.hydrationAccount()", async () => {
    const facts = Array.from({ length: 505 }, (_, i) => factRow(i));
    const { db } = windowDb(facts);
    const store = new FactStore(
      new SupabasePersistence(db as unknown as SupabaseLike),
    );
    const n = await store.hydrate();
    expect(n).toBe(NATIVE_CONFIG.factHydrateLimit);
    const acct = store.hydrationAccount();
    expect(acct).not.toBeNull();
    expect(acct?.totalFacts).toBe(505);
    expect(acct?.loadedFacts).toBe(NATIVE_CONFIG.factHydrateLimit);
    expect(acct?.truncated).toBe(true);
  });

  it("hydrationAccount is null before the first hydrate (in-memory stores)", () => {
    const store = new FactStore(); // no persistence
    expect(store.hydrationAccount()).toBeNull();
  });
});
