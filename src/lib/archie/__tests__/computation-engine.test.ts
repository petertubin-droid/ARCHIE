// =========================================================
// COMPUTATION-ENGINE TESTS (batch 22, fix 78)
// LRU+TTL cache eviction, priority ordering, cache hits,
// retry-on-failure, exact numeric batching, throughput
// measurement — traced through actual execution.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ComputationEngine,
  computeNumericBatch,
  measure,
  ResultCache,
  type ComputeTask,
} from "@/lib/archie/computation-engine";

describe("ResultCache (LRU + TTL)", () => {
  it("evicts the least recently used entry past max entries", () => {
    const c = new ResultCache<number>(2, 60_000);
    c.set("a", 1, 0);
    c.set("b", 2, 0);
    c.get("a", 1); // a becomes most recent
    c.set("c", 3, 2); // evicts b (LRU)
    expect(c.get("b", 3)).toBeUndefined();
    expect(c.get("a", 3)).toBe(1);
    expect(c.size).toBe(2);
  });

  it("expires entries past their TTL", () => {
    const c = new ResultCache<number>(10, 100);
    c.set("x", 9, 0);
    expect(c.get("x", 50)).toBe(9);
    expect(c.get("x", 101)).toBeUndefined();
  });
});

describe("ComputationEngine.run", () => {
  it("returns results in input order regardless of priority", async () => {
    const engine = new ComputationEngine<number, number>({ concurrency: 2 });
    const tasks: ComputeTask<number, number>[] = [
      { key: "t0", input: 10, compute: async (i) => i, priority: 0 },
      { key: "t1", input: 20, compute: async (i) => i, priority: 5 },
      { key: "t2", input: 30, compute: async (i) => i, priority: 5 },
    ];
    const results = await engine.run(tasks);
    expect(results.map((r) => r.output)).toEqual([10, 20, 30]);
    expect(results.every((r) => r.ok && !r.fromCache)).toBe(true);
  });

  it("serves the second identical cacheable task from cache", async () => {
    const engine = new ComputationEngine<number, number>({ concurrency: 1 });
    let calls = 0;
    const task: ComputeTask<number, number> = {
      key: "double",
      input: 21,
      compute: async (i) => {
        calls++;
        return i * 2;
      },
      cacheable: true,
    };
    await engine.run([task]);
    const second = await engine.run([{ ...task }]);
    expect(second[0].fromCache).toBe(true);
    expect(second[0].durationMs).toBe(0);
    expect(calls).toBe(1);
  });

  it("retries failed compute calls then reports the error honestly", async () => {
    const engine = new ComputationEngine<number, number>({
      concurrency: 1,
      retries: 1,
    });
    let attempts = 0;
    const results = await engine.run([
      {
        key: "boom",
        input: 1,
        compute: async () => {
          attempts++;
          throw new Error("RPC down");
        },
      },
    ]);
    expect(attempts).toBe(2); // initial + 1 retry
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toMatch(/RPC down/);
  });
});

describe("computeNumericBatch", () => {
  it("computes every item exactly, preserving index and order", async () => {
    const out = await computeNumericBatch(
      [1, 2, 3, 4, 5],
      (n, i) => n * 10 + i,
      { batchSize: 2 },
    );
    expect(out).toEqual([10, 21, 32, 43, 54]);
  });

  it("handles empty input", async () => {
    expect(await computeNumericBatch([], (x) => x)).toEqual([]);
  });
});

describe("measure", () => {
  it("counts cache hits/misses and computes throughput + speedup", () => {
    const m = measure(
      [
        { key: "a", ok: true, durationMs: 1, fromCache: true },
        { key: "b", ok: true, durationMs: 2, fromCache: false },
      ] as never,
      100,
      50,
    );
    expect(m.tasks).toBe(2);
    expect(m.cacheHits).toBe(1);
    expect(m.cacheMisses).toBe(1);
    expect(m.tasksPerSecond).toBe(20);
    expect(m.speedupVsBaseline).toBe(0.4);
  });
});
