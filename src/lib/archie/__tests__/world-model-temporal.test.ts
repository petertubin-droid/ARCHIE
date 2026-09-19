// =========================================================
// WORLD MODEL — TEMPORAL AXIS (audit phase 7, 2026-09-11)
//
// Versioned relations: observations are stamped; contradictions
// SUPERSEDE (old version points at its replacement — nothing
// silently overwritten); currentView() projects the present;
// history() returns the full versioned past. Backward
// compatible: pre-migration rows (no observed_at) default to
// their created_at.
// =========================================================

import { describe, it, expect } from "vitest";
import { WorldModel } from "@studio-shared/archie-ai/cognitive/world-model.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";

class TemporalMockDb implements SupabaseLike {
  public tables: Record<string, Array<Record<string, unknown>>> = {
    frelux_archie_world_model: [],
  };
  public updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  from(table: string) {
    const rows = () => this.tables[table] ?? (this.tables[table] = []);
    return {
      select: () => {
        const data = [...rows()];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({ data: data.slice(from, to + 1), error: null }),
        });
      },
      insert: async (row: unknown) => {
        for (const r of (Array.isArray(row) ? row : [row]) as Array<Record<string, unknown>>) {
          rows().push(r);
        }
        return { error: null };
      },
      update: (patch: unknown) => ({
        eq: async (column: string, value: unknown) => {
          const list = rows();
          const idx = list.findIndex((r) => r[column] === value || r.id === value);
          if (idx >= 0) {
            this.updates.push({ id: String(value), patch: { ...(patch as object) } });
            list[idx] = { ...list[idx], ...(patch as object) };
          }
          return { error: null };
        },
      }),
      upsert: async (row: unknown) => {
        const r = row as Record<string, unknown>;
        const list = rows();
        const idx = list.findIndex((x) => x.id === r.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...r }; // PostgREST-style merge
        else list.push(r);
        return { error: null };
      },
    };
  }
}

describe("world model temporal axis — observation stamping", () => {
  it("stamps every new observation with observed_at", async () => {
    const world = new WorldModel();
    const before = Date.now();
    const rel = await world.relate({
      subject: "archie",
      relation: "runs-on",
      object: "supabase",
      confidence: 0.9,
      provenance: "test",
    });
    expect(rel.observedAt).toBeTruthy();
    expect(new Date(rel.observedAt!).getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(rel.supersededBy).toBeNull();
  });

  it("re-observation of the same triple strengthens and refreshes observed_at — no supersession", async () => {
    const world = new WorldModel();
    await world.relate({
      subject: "a", relation: "r", object: "b",
      confidence: 0.5, provenance: "t",
    });
    // deterministically age the first observation stamp
    const current = world.currentView()[0];
    current.observedAt = new Date(Date.now() - 60_000).toISOString();
    const strengthened = await world.relate({
      subject: "a", relation: "r", object: "b",
      confidence: 0.5, provenance: "t",
    });
    expect(strengthened.supersededBy).toBeNull();
    expect(strengthened.confidence).toBeGreaterThan(0.5);
    expect(world.currentView()).toHaveLength(1);
    expect(world.history("a")).toHaveLength(1);
    expect(new Date(strengthened.observedAt!).getTime()).toBeGreaterThan(
      new Date(current.observedAt!).getTime(),
    );
  });
});

describe("world model temporal axis — supersession", () => {
  it("a contradicting observation supersedes the old version, never overwrites it", async () => {
    const world = new WorldModel();
    await world.relate({
      subject: "anthony",
      relation: "works-on",
      object: "marketplace",
      confidence: 0.9,
      provenance: "t1",
    });
    const replacement = await world.relate({
      subject: "anthony",
      relation: "works-on",
      object: "archie-audit",
      confidence: 0.9,
      provenance: "t2",
    });

    // current view: only the newest object
    const view = world.currentView();
    expect(view).toHaveLength(1);
    expect(view[0].object).toBe("archie-audit");
    expect(view[0].supersededBy).toBeNull();

    // history: BOTH versions, superseded one points at its replacement
    const hist = world.history("anthony");
    expect(hist).toHaveLength(2);
    const superseded = hist.find((h) => h.object === "marketplace")!;
    expect(superseded.supersededBy).toBe(replacement.id);
    expect(hist[0].object).toBe("archie-audit"); // newest first
  });

  it("supersedes ALL current rows for the same subject+relation pair (pre-migration multi-row hydration)", async () => {
    const db = new TemporalMockDb();
    // pre-migration style: two unsuperseded rows for the same pair
    db.tables.frelux_archie_world_model.push(
      {
        id: "anthony::works-on::marketplace",
        subject: "anthony", relation: "works-on", object: "marketplace",
        subject_kind: "Person", object_kind: "Project",
        confidence: 0.9, provenance: "t1",
        created_at: "2026-09-01T00:00:00Z",
        observed_at: "2026-09-01T00:00:00Z", superseded_by: null,
      },
      {
        id: "anthony::works-on::livechat",
        subject: "anthony", relation: "works-on", object: "livechat",
        subject_kind: "Person", object_kind: "Project",
        confidence: 0.9, provenance: "t2",
        created_at: "2026-09-02T00:00:00Z",
        observed_at: "2026-09-02T00:00:00Z", superseded_by: null,
      },
    );
    const world = new WorldModel(db);
    await world.hydrate();
    expect(world.currentView()).toHaveLength(2); // both current pre-migration

    const replacement = await world.relate({
      subject: "anthony", relation: "works-on", object: "seo",
      confidence: 0.9, provenance: "t3",
    });
    expect(world.currentView()).toHaveLength(1);
    expect(world.currentView()[0].object).toBe("seo");
    expect(world.history("anthony")).toHaveLength(3);
    // both old versions point at the replacement
    for (const old of world.history("anthony")) {
      if (old.id !== replacement.id) {
        expect(old.supersededBy).toBe(replacement.id);
      }
    }
    // persistence: both rows were marked superseded in the DB
    const supersededRows = db.tables.frelux_archie_world_model.filter(
      (r) => r.superseded_by === replacement.id,
    );
    expect(supersededRows).toHaveLength(2);
  });

  it("persistence marks the superseded row and writes the replacement", async () => {
    const db = new TemporalMockDb();
    const world = new WorldModel(db);
    await world.relate({
      subject: "s", relation: "r", object: "old",
      confidence: 0.8, provenance: "t",
    });
    const replacement = await world.relate({
      subject: "s", relation: "r", object: "new",
      confidence: 0.8, provenance: "t",
    });
    // old row in DB points at its replacement
    const oldRow = db.tables.frelux_archie_world_model.find(
      (r) => r.id === "s::r::old",
    )!;
    expect(oldRow.superseded_by).toBe(replacement.id);
    // replacement row is current and observation-stamped
    const newRow = db.tables.frelux_archie_world_model.find(
      (r) => r.id === replacement.id,
    )!;
    expect(newRow.superseded_by).toBeNull();
    expect(newRow.observed_at).toBeTruthy();
  });

  it("a superseded triple can be re-observed — it becomes current again", async () => {
    const world = new WorldModel();
    await world.relate({ subject: "a", relation: "r", object: "b", confidence: 0.9, provenance: "t" });
    await world.relate({ subject: "a", relation: "r", object: "c", confidence: 0.9, provenance: "t" });
    // b was superseded; observing b again returns it to the current view
    const again = await world.relate({ subject: "a", relation: "r", object: "b", confidence: 0.9, provenance: "t" });
    expect(again.supersededBy).toBeNull();
    expect(world.currentView().map((r) => r.object)).toEqual(["b"]);
    // full history is retained: b, c(current→now superseded), b(new)
    expect(world.history("a").length).toBeGreaterThanOrEqual(3);
  });
});

describe("world model temporal axis — hydration and backward compatibility", () => {
  it("hydrates superseded rows as history only, not the current view", async () => {
    const db = new TemporalMockDb();
    const now = new Date().toISOString();
    db.tables.frelux_archie_world_model.push(
      {
        id: "archie::status::healthy",
        subject: "archie", relation: "status", object: "healthy",
        subject_kind: "System", object_kind: "Concept",
        confidence: 0.9, provenance: "probe-1",
        created_at: "2026-09-10T00:00:00Z",
        observed_at: "2026-09-10T00:00:00Z",
        superseded_by: "archie::status::degraded",
      },
      {
        id: "archie::status::degraded",
        subject: "archie", relation: "status", object: "degraded",
        subject_kind: "System", object_kind: "Concept",
        confidence: 0.9, provenance: "probe-2",
        created_at: now, observed_at: now, superseded_by: null,
      },
    );
    const world = new WorldModel(db);
    const count = await world.hydrate();
    expect(count).toBe(1); // only the current view
    expect(world.currentView()[0].object).toBe("degraded");
    const hist = world.history("archie");
    expect(hist).toHaveLength(2);
    expect(hist.find((h) => h.object === "healthy")!.supersededBy).toBe(
      "archie::status::degraded",
    );
    expect(hist[0].object).toBe("degraded"); // newest first
  });

  it("pre-migration rows without observed_at default to created_at (history preserved, not reset)", async () => {
    const db = new TemporalMockDb();
    db.tables.frelux_archie_world_model.push({
      id: "old::row::id",
      subject: "legacy", relation: "predates", object: "temporal-axis",
      subject_kind: "Concept", object_kind: "Concept",
      confidence: 0.9, provenance: "2026",
      created_at: "2026-09-01T12:00:00Z",
      observed_at: null, superseded_by: null, // raw pre-migration shape
    });
    const world = new WorldModel(db);
    await world.hydrate();
    const view = world.currentView();
    expect(view).toHaveLength(1);
    expect(view[0].observedAt).toBe("2026-09-01T12:00:00Z");
  });
});
