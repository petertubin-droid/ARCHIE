import { beforeEach, describe, expect, it } from "vitest";
// =========================================================
// CROSS-ISOLATE COUNTER PERSISTENCE (plan P7 batch 2)
//
// Acceptance: diagnostics report system-wide numbers, not
// per-isolate noise. Engine instance #2 (a fresh isolate)
// must continue the counters engine #1 accumulated, and the
// calibration mean stays THIS isolate's (honest denominator).
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import type { SupabaseLike } from "@studio-shared/archie-ai/native-engine/persistence.ts";

interface Row {
  [k: string]: unknown;
}

/** Durable fake shared by all "isolates". */
class FakeCounterDb implements SupabaseLike {
  counters: Record<string, number> = {};
  otherRows: Record<string, Row[]> = {};
  counterWrites = 0;

  from(table: string) {
    return {
      select: (_q: string) => {
        const data =
          table === "frelux_archie_engine_counters"
            ? Object.entries(this.counters).map(([key, value]) => ({
                key,
                value,
              }))
            : [];
        return Object.assign(Promise.resolve({ data, error: null }), {
          range: (from: number, to: number) =>
            Promise.resolve({
              data: data.slice(from, to + 1),
              error: null,
            }),
        });
      },
      insert: async (rs: unknown) => {
        for (const r of rs as Row[]) {
          (this.otherRows[table] ??= []).push({ ...r });
        }
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async (rs: unknown) => {
        this.counterWrites++;
        for (const r of rs as Array<{ key: string; value: number }>) {
          this.counters[r.key] = Number(r.value) || 0;
        }
        return { error: null };
      },
    };
  }
}

let db: FakeCounterDb;
beforeEach(() => {
  db = new FakeCounterDb();
});

describe("counter persistence — cross-isolate", () => {
  it("a fresh isolate continues system-wide inference counts", async () => {
    const first = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await first.converse("what is screeding");
    await first.converse("hello");
    expect(db.counters["inferences"]).toBe(2);

    const second = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await second.boot(); // cold boot: loads the persisted base
    const d0 = second.diagnostics();
    expect(d0.counts.inferences).toBe(2); // system-wide, not 0
    await second.converse("hi again");
    const d1 = second.diagnostics();
    expect(d1.counts.inferences).toBe(3);
    expect(db.counters["inferences"]).toBe(3);
  });

  it("an unknown-topic question increments unknownTopicHits and persists", async () => {
    const engine = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await engine.converse("what is the snozzlewomp function of the blorptastic matrix");
    const d = engine.diagnostics();
    expect(d.counts.unknownTopicHits).toBeGreaterThanOrEqual(1);
    expect(db.counters["unknown_topic_hits"]).toBeGreaterThanOrEqual(1);
  });

  it("consent revoked (persistence null) → in-memory counters only, zero writes", async () => {
    const engine = new ArchieNativeEngine();
    await engine.converse("what is the snozzlewomp function of the blorptastic matrix");
    const d = engine.diagnostics();
    expect(d.counts.unknownTopicHits).toBeGreaterThanOrEqual(1);
    expect(db.counters["inferences"]).toBeUndefined();
    expect(db.counterWrites).toBe(0);
  });

  it("meanConfidence denominator is session inferences, not system-wide", async () => {
    const first = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await first.converse("hello");
    const second = new ArchieNativeEngine({
      persistence: db as unknown as SupabaseLike,
    });
    await second.boot(); // system-wide inferences = 1, session = 0
    const d = second.diagnostics();
    // counts are system-wide...
    expect(d.counts.inferences).toBe(1);
    // ...but calibration is honest: no local inferences → 0,
    // never a diluted mean from another isolate's turns.
    expect(d.calibration.meanConfidence).toBe(0);
  });
});
