// ============================================================
// ARCHIE WORLD MODEL — TESTS
// Versioned relations, supersession, persistence round trips,
// point-in-time reconstruction, and DB-failure honesty.
// Uses an in-memory SupabaseLike double (no network).
// ============================================================

import { describe, expect, it } from "vitest";
import { WorldModel, WORLD_MODEL_TABLE, OWNER_SCOPE } from "./world-model.ts";

/** Minimal in-memory double of the subset of the Supabase
 *  client WorldModel uses: select / upsert / update().eq(). */
class FakeTable {
  rows = new Map<string, Record<string, unknown>>();
  failWrites = false;
  /** When true the double behaves like a thenable-only client
   *  (no .eq on select): the model must filter rows itself. */
  noEq = false;
  constructor(private name: string) {}
  select() {
    const self = this;
    const result = (list: Record<string, unknown>[]) => {
      const p = Promise.resolve({
        data: list.map((r) => ({ ...r })),
        error: null,
      });
      if (self.noEq) return p;
      return Object.assign(p, {
        eq: (col: string, val: unknown) =>
          result(list.filter((r) => r[col] === val)),
      });
    };
    return result([...this.rows.values()]);
  }
  upsert(row: Record<string, unknown>) {
    if (this.failWrites) return Promise.reject(new Error("db down"));
    this.rows.set(String(row.id), { ...(this.rows.get(String(row.id)) ?? {}), ...row });
    return Promise.resolve({ data: null, error: null });
  }
  update(patch: Record<string, unknown>) {
    const self = this;
    return {
      eq(col: string, val: unknown) {
        if (self.failWrites) return Promise.reject(new Error("db down"));
        for (const r of self.rows.values()) {
          if (r[col] === val) Object.assign(r, patch);
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }
}

class FakeDb {
  tables = new Map<string, FakeTable>();
  from(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new FakeTable(name));
    return this.tables.get(name)!;
  }
  get world() {
    return this.from(WORLD_MODEL_TABLE);
  }
}

const T = (iso: string) => iso;

describe("WorldModel — versioned relations", () => {
  it("creates a current relation with entities and provenance", async () => {
    const m = new WorldModel();
    const r = await m.relate({
      subject: "site",
      relation: "condition",
      object: "muddy",
      confidence: 0.6,
      provenance: "owner",
      observedAt: T("2026-10-01T00:00:00.000Z"),
    });
    expect(r.supersededBy).toBeNull();
    expect(m.currentView()).toHaveLength(1);
    expect(m.getEntity("site")?.name).toBe("site");
    expect(m.relationsCount()).toBe(1);
  });

  it("re-observing the same triple strengthens confidence without a new version", async () => {
    const m = new WorldModel();
    await m.relate({ subject: "a", relation: "is", object: "b", confidence: 0.5, provenance: "p", observedAt: T("2026-10-01T00:00:00.000Z") });
    const again = await m.relate({ subject: "a", relation: "is", object: "b", confidence: 0.5, provenance: "p", observedAt: T("2026-10-02T00:00:00.000Z") });
    expect(again.confidence).toBeGreaterThan(0.5);
    expect(m.allObservations()).toHaveLength(1);
    expect(m.history("a")[0].observedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("a contradicting object supersedes the old version and records a transition", async () => {
    const m = new WorldModel();
    await m.relate({ subject: "site", relation: "condition", object: "muddy", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-01T00:00:00.000Z") });
    await m.relate({ subject: "site", relation: "condition", object: "dry", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-05T00:00:00.000Z") });
    const current = m.currentView();
    expect(current.map((r) => r.object)).toEqual(["dry"]);
    const tr = m.transitions("site");
    expect(tr).toHaveLength(1);
    expect(tr[0].fromValue).toBe("muddy");
    expect(tr[0].toValue).toBe("dry");
    expect(tr[0].fromObservedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(tr[0].toObservedAt).toBe("2026-10-05T00:00:00.000Z");
  });

  it("point-in-time queries reconstruct the state that was current at each instant", async () => {
    const m = new WorldModel();
    await m.relate({ subject: "site", relation: "condition", object: "muddy", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-01T00:00:00.000Z") });
    await m.relate({ subject: "site", relation: "condition", object: "dry", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-05T00:00:00.000Z") });
    expect(m.aliveAt(new Date("2026-10-02T00:00:00.000Z")).map((r) => r.object)).toEqual(["muddy"]);
    expect(m.aliveAt(new Date("2026-10-06T00:00:00.000Z")).map((r) => r.object)).toEqual(["dry"]);
    expect(m.aliveAt(new Date("2026-09-30T00:00:00.000Z"))).toHaveLength(0);
    expect(m.stateAt("site", new Date("2026-10-02T00:00:00.000Z"))[0].object).toBe("muddy");
  });

  it("an A→B→C→B round trip keeps all three observations (no history overwrite)", async () => {
    const m = new WorldModel();
    await m.relate({ subject: "x", relation: "is", object: "B", confidence: 0.6, provenance: "p", observedAt: T("2026-10-01T00:00:00.000Z") });
    await m.relate({ subject: "x", relation: "is", object: "C", confidence: 0.6, provenance: "p", observedAt: T("2026-10-02T00:00:00.000Z") });
    await m.relate({ subject: "x", relation: "is", object: "B", confidence: 0.6, provenance: "p", observedAt: T("2026-10-03T00:00:00.000Z") });
    expect(m.allObservations()).toHaveLength(3);
    expect(m.transitions("x").map((t) => `${t.fromValue}->${t.toValue}`).sort()).toEqual(["B->C", "C->B"]);
  });

  it("persists every version as its own row, including after a round trip", async () => {
    const db = new FakeDb();
    const m = new WorldModel(db as unknown as ConstructorParameters<typeof WorldModel>[0]);
    await m.relate({ subject: "x", relation: "is", object: "B", confidence: 0.6, provenance: "p", observedAt: T("2026-10-01T00:00:00.000Z") });
    await m.relate({ subject: "x", relation: "is", object: "C", confidence: 0.6, provenance: "p", observedAt: T("2026-10-02T00:00:00.000Z") });
    await m.relate({ subject: "x", relation: "is", object: "B", confidence: 0.6, provenance: "p", observedAt: T("2026-10-03T00:00:00.000Z") });
    // Three distinct observations must be three distinct rows.
    expect(db.world.rows.size).toBe(3);
    const firstB = [...db.world.rows.values()].filter((r) => r.object === "B");
    expect(firstB.map((r) => r.observed_at).sort()).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-10-03T00:00:00.000Z",
    ]);
  });

  it("hydrate restores the current view and the full version history", async () => {
    const db = new FakeDb();
    const writer = new WorldModel(db as unknown as ConstructorParameters<typeof WorldModel>[0]);
    await writer.relate({ subject: "site", relation: "condition", object: "muddy", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-01T00:00:00.000Z") });
    await writer.relate({ subject: "site", relation: "condition", object: "dry", confidence: 0.6, provenance: "owner", observedAt: T("2026-10-05T00:00:00.000Z") });
    const reader = new WorldModel(db as unknown as ConstructorParameters<typeof WorldModel>[0]);
    const n = await reader.hydrate();
    expect(n).toBe(1);
    expect(reader.currentView().map((r) => r.object)).toEqual(["dry"]);
    expect(reader.allObservations()).toHaveLength(2);
    expect(reader.transitions("site")).toHaveLength(1);
  });

  it("a DB write failure does not throw and keeps the in-memory model", async () => {
    const db = new FakeDb();
    const m = new WorldModel(db as unknown as ConstructorParameters<typeof WorldModel>[0]);
    db.world.failWrites = true;
    const r = await m.relate({ subject: "a", relation: "is", object: "b", confidence: 0.5, provenance: "p", observedAt: T("2026-10-01T00:00:00.000Z") });
    expect(r.object).toBe("b");
    expect(m.currentView()).toHaveLength(1);
  });
});

describe("WorldModel — owner scope", () => {
  const CONST = { confidence: 0.6, provenance: "owner", observedAt: T("2026-10-01T00:00:00.000Z") };
  const dbOf = () => new FakeDb();
  const asDb = (db: FakeDb) => db as unknown as ConstructorParameters<typeof WorldModel>[0];

  it("defaults to the owner scope", () => {
    expect(new WorldModel().ownerScope).toBe(OWNER_SCOPE);
  });

  it("owner and visitor worlds are isolated in memory and in the database", async () => {
    const db = dbOf();
    const owner = new WorldModel(asDb(db));
    const visitor = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    await owner.relate({ subject: "site", relation: "condition", object: "muddy", ...CONST });
    await visitor.relate({ subject: "site", relation: "condition", object: "dry", ...CONST });
    expect(owner.currentView().map((r) => r.object)).toEqual(["muddy"]);
    expect(visitor.currentView().map((r) => r.object)).toEqual(["dry"]);
    // Same triple in two scopes must not overwrite each other.
    expect(db.world.rows.size).toBe(2);
    const stamps = [...db.world.rows.values()].map((r) => r.user_id).sort();
    expect(stamps).toEqual(["owner", "visitor-abc"]);
  });

  it("a visitor never hydrates owner rows, and the owner never hydrates visitor rows", async () => {
    const db = dbOf();
    const owner = new WorldModel(asDb(db));
    const visitor = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    await owner.relate({ subject: "site", relation: "condition", object: "muddy", ...CONST });
    await visitor.relate({ subject: "rate", relation: "is", object: "high", ...CONST });
    const freshVisitor = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    await freshVisitor.hydrate();
    expect(freshVisitor.currentView().map((r) => r.subject)).toEqual(["rate"]);
    const freshOwner = new WorldModel(asDb(db));
    await freshOwner.hydrate();
    expect(freshOwner.currentView().map((r) => r.subject)).toEqual(["site"]);
  });

  it("backfilled legacy rows hydrate for the owner only", async () => {
    const db = dbOf();
    // Pre-existing rows after the owner-scope migration backfill:
    // user_id is stamped 'owner' (the migration never leaves NULLs).
    await db.world.upsert({
      user_id: "owner",
      id: "site::condition::muddy",
      subject: "site",
      relation: "condition",
      object: "muddy",
      subject_kind: "Concept",
      object_kind: "Concept",
      confidence: 0.6,
      provenance: "legacy",
      created_at: T("2026-09-01T00:00:00.000Z"),
      observed_at: T("2026-09-01T00:00:00.000Z"),
      superseded_by: null,
    });
    const owner = new WorldModel(asDb(db));
    expect(await owner.hydrate()).toBe(1);
    const visitor = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    expect(await visitor.hydrate()).toBe(0);
  });

  it("filters rows in memory when the client cannot filter in the database", async () => {
    const db = dbOf();
    db.world.noEq = true;
    const owner = new WorldModel(asDb(db));
    const visitor = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    await owner.relate({ subject: "site", relation: "condition", object: "muddy", ...CONST });
    await visitor.relate({ subject: "site", relation: "condition", object: "dry", ...CONST });
    const reader = new WorldModel(asDb(db), { ownerScope: "visitor-abc" });
    await reader.hydrate();
    expect(reader.currentView().map((r) => r.object)).toEqual(["dry"]);
  });

  it("rejects an invalid scope string", () => {
    expect(() => new WorldModel(undefined, { ownerScope: "bad scope!" })).toThrow(
      "invalid world-model scope",
    );
    expect(() => new WorldModel(undefined, { ownerScope: "" })).toThrow();
  });
});
