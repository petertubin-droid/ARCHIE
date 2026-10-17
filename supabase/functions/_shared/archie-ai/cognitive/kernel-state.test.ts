// ============================================================
// ARCHIE KERNEL STATE (D-1) — TESTS
// Counter continuity across isolates: hydration on boot,
// persistence at cycle close, honest unwired behavior,
// IMPROVE-window reset semantics preserved.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  EMPTY_KERNEL_COUNTERS,
  hydrateKernelCounters,
  persistKernelCounters,
} from "./kernel-state.ts";

/** Minimal thenable test double mirroring the SupabaseLike
 *  select/upsert chain used by the counter table. */
function makeDb(rows: Array<{ key: string; value: number }>) {
  let upserted: Array<{ key: string; value: number }> = [];
  let failSelect = false;
  const db = {
    from(_table: string) {
      return {
        select: () => {
          if (failSelect) return Promise.resolve({ data: null, error: { message: "table missing" } });
          return Promise.resolve({ data: [...rows], error: null });
        },
        upsert: (payload: Array<{ key: string; value: number }>) => {
          upserted = payload;
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    __upserted: () => upserted,
    __failSelect: (v: boolean) => (failSelect = v),
  };
  return db;
}

describe("kernel-state — hydration", () => {
  it("hydrates the kernel counter keys from the shared table", async () => {
    const db = makeDb([
      { key: "kernel_cycles", value: 42 },
      { key: "kernel_unknown_topic_hits", value: 2 },
      { key: "kernel_verification_fails", value: 1 },
      { key: "substrate_other_key", value: 999 },
    ]);
    const c = await hydrateKernelCounters(db as never);
    expect(c).toEqual({ cycles: 42, unknownTopicHits: 2, verificationFails: 1 });
  });

  it("ignores other engines' keys — kernel never reads substrate counters", async () => {
    const db = makeDb([
      { key: "inferences", value: 500 },
      { key: "unknown_topic_hits", value: 7 },
    ]);
    const c = await hydrateKernelCounters(db as never);
    expect(c).toEqual(EMPTY_KERNEL_COUNTERS);
  });

  it("no db → empty window, honest cold start", async () => {
    expect(await hydrateKernelCounters(null)).toEqual(EMPTY_KERNEL_COUNTERS);
    expect(await hydrateKernelCounters(undefined)).toEqual(EMPTY_KERNEL_COUNTERS);
  });

  it("select error → empty window, never a throw", async () => {
    const db = makeDb([]);
    db.__failSelect(true);
    expect(await hydrateKernelCounters(db as never)).toEqual(EMPTY_KERNEL_COUNTERS);
  });
});

describe("kernel-state — persistence", () => {
  it("upserts all three kernel keys with values", async () => {
    const db = makeDb([]);
    await persistKernelCounters(db as never, {
      cycles: 10,
      unknownTopicHits: 0,
      verificationFails: 2,
    });
    const up = db.__upserted();
    expect(up).toHaveLength(3);
    expect(up.find((r) => r.key === "kernel_cycles")?.value).toBe(10);
    expect(up.find((r) => r.key === "kernel_unknown_topic_hits")?.value).toBe(0);
    expect(up.find((r) => r.key === "kernel_verification_fails")?.value).toBe(2);
    for (const row of up) expect(row.updated_at).toBeTruthy();
  });

  it("no db → no-op, never a throw", async () => {
    await expect(persistKernelCounters(null, { cycles: 1, unknownTopicHits: 1, verificationFails: 1 })).resolves.toBeUndefined();
  });

  it("upsert error → swallowed, never breaks the cycle", async () => {
    const db = {
      from() {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          upsert: () => Promise.reject(new Error("network gone")),
        };
      },
    };
    await expect(
      persistKernelCounters(db as never, EMPTY_KERNEL_COUNTERS),
    ).resolves.toBeUndefined();
  });
});
