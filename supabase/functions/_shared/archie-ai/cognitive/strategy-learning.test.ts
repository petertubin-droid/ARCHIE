// ============================================================
// ARCHIE STRATEGY LEARNING ENGINE — TESTS
// Evidence gating, bounded bias, honest degradation,
// deterministic selection. Learning refines the cues, never
// overrides them.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  StrategyStatsCache,
  SupabaseStrategyStatsStore,
  applyStrategyBias,
  chosenFromScores,
  learnedBias,
  strategyPosterior,
  type StrategyStat,
} from "./strategy-learning.ts";

function stat(positives: number, negatives: number): StrategyStat {
  return { strategy_key: "x", positives, negatives };
}

describe("Beta posterior", () => {
  it("starts at the prior with no outcomes", () => {
    expect(strategyPosterior(stat(0, 0))).toBe(0.5);
  });

  it("moves with real outcomes, bounded 0..1", () => {
    expect(strategyPosterior(stat(8, 0))).toBeGreaterThan(0.5);
    expect(strategyPosterior(stat(0, 8))).toBeLessThan(0.5);
    expect(strategyPosterior(stat(1000, 0))).toBeLessThanOrEqual(1);
    expect(strategyPosterior(stat(0, 1000))).toBeGreaterThanOrEqual(0);
  });

  it("dampens small samples with the prior strength", () => {
    // one lucky confirmation must not jump to 1.0
    expect(strategyPosterior(stat(1, 0))).toBeCloseTo(3 / 5, 6); // (2+1)/(4+1): prior dampens the lucky confirmation
  });
});

describe("evidence gate + bounded bias", () => {
  it("no bias below the evidence gate", () => {
    expect(learnedBias(stat(4, 0))).toBe(0); // 4 outcomes — gated
    expect(learnedBias(undefined)).toBe(0);
  });

  it("bias is capped at ±2 and half-point granular", () => {
    expect(learnedBias(stat(100, 0))).toBe(2);
    expect(learnedBias(stat(0, 100))).toBe(-2);
  });

  it("a strongly confirmed strategy earns a modest positive bias", () => {
    expect(learnedBias(stat(8, 1))).toBeGreaterThanOrEqual(1);
    expect(learnedBias(stat(8, 1))).toBeLessThanOrEqual(2);
  });

  it("a corrected strategy earns a negative bias", () => {
    expect(learnedBias(stat(1, 9))).toBeLessThanOrEqual(-1);
  });
});

describe("applyStrategyBias — learning refines, never overrides", () => {
  const scores = [
    { kind: "comparative", score: 3, cue: "comparison requested" },
    { kind: "logical", score: 3, cue: "logical connective" },
    { kind: "temporal", score: 2, cue: "temporal reference" },
  ];

  it("biases only the keys with real evidence, annotating honestly", () => {
    const stats = [
      { strategy_key: "knowledge_question:logical", positives: 9, negatives: 1 },
      { strategy_key: "knowledge_question:temporal", positives: 0, negatives: 9 },
    ];
    const out = applyStrategyBias(scores, stats, "knowledge_question");
    const logical = out.find((s) => s.kind === "logical")!;
    const temporal = out.find((s) => s.kind === "temporal")!;
    const comparative = out.find((s) => s.kind === "comparative")!;
    expect(logical.score).toBeGreaterThan(3); // confirmed → boosted
    expect(temporal.score).toBeLessThan(2); // corrected → demoted
    expect(comparative.score).toBe(3); // no evidence → untouched
    expect(logical.cue).toContain("real outcomes");
    expect(temporal.cue).toContain("9✗");
  });

  it("the cap keeps learning from overriding the cue system", () => {
    const stats = [
      { strategy_key: "q:temporal", positives: 1000, negatives: 0 },
    ];
    const out = applyStrategyBias(scores, stats, "q");
    const temporal = out.find((s) => s.kind === "temporal")!;
    expect(temporal.score).toBe(4); // 2 + capped +2, NOT +∞
    // the cued comparative (3) still outranks an uncued temporal (4)?
    // 4 > 3 — learning CAN promote a strongly confirmed strategy
    // over a weakly cued one, but only with >= 5 real outcomes and
    // never by more than 2 points.
  });

  it("is pure and deterministic", () => {
    const stats = [{ strategy_key: "q:logical", positives: 7, negatives: 2 }];
    const a = applyStrategyBias(scores, stats, "q");
    const b = applyStrategyBias(scores, stats, "q");
    expect(a).toEqual(b);
  });
});

describe("chosenFromScores — honest fallback preserved", () => {
  it("keeps only positive scores, best first, capped at width", () => {
    const out = chosenFromScores(
      [
        { kind: "a", score: 0 },
        { kind: "b", score: 3 },
        { kind: "c", score: 5 },
        { kind: "d", score: -1 },
      ],
      2,
    );
    expect(out).toEqual(["c", "b"]);
  });

  it("falls back honestly to nothing when every score is <= 0", () => {
    expect(
      chosenFromScores(
        [
          { kind: "a", score: 0 },
          { kind: "b", score: -2 },
        ],
        3,
      ),
    ).toEqual([]);
  });
});

describe("StrategyStatsCache", () => {
  it("records outcomes in memory and durably, hydrates from the store", async () => {
    const recorded: Array<{ key: string; positive: boolean }> = [];
    const store = {
      recordOutcome: async (key: string, positive: boolean) => {
        recorded.push({ key, positive });
      },
      loadStats: async () => [
        { strategy_key: "knowledge_question:logical", positives: 5, negatives: 1 },
      ],
    };
    const cache = new StrategyStatsCache(store);
    expect(await cache.hydrate()).toBe(1);
    await cache.recordOutcome("knowledge_question:logical", true);
    expect(recorded).toEqual([
      { key: "knowledge_question:logical", positive: true },
    ]);
    const biased = cache.biasedScores(
      [{ kind: "logical", score: 2, cue: "cue" }],
      "knowledge_question",
    );
    expect(biased[0].score).toBeGreaterThan(2); // 6 outcomes, high posterior

    // re-hydrate does not duplicate (already loaded)
    await cache.hydrate();
    expect(cache.snapshot()).toHaveLength(1);
  });

  it("a null store or failed store degrades to no bias, no crash", async () => {
    const cache = new StrategyStatsCache(null);
    await cache.hydrate();
    await cache.recordOutcome("a:b", true); // no-op, no crash
    const biased = cache.biasedScores(
      [{ kind: "b", score: 2, cue: "cue" }],
      "a",
    );
    expect(biased[0].score).toBe(2);
  });
});

describe("SupabaseStrategyStatsStore", () => {
  function mockClient(opts: {
    fail?: boolean;
    rpcFail?: boolean;
    rows?: StrategyStat[];
  }) {
    const calls: Array<[string, Record<string, unknown> | null]> = [];
    const upserts: Record<string, unknown>[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        if (opts.rpcFail ?? opts.fail) throw new Error("rpc down");
        return { data: null, error: null };
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve(
                opts.fail
                  ? Promise.reject(new Error("db down"))
                  : { data: opts.rows ?? [], error: null },
              ),
          }),
        }),
        upsert: (row: Record<string, unknown>) => {
          upserts.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    return { client, calls, upserts };
  }

  it("records via the atomic RPC when available", async () => {
    const { client, calls } = mockClient({});
    const store = new SupabaseStrategyStatsStore(client);
    await store.recordOutcome("a:b", true);
    expect(calls[0][0]).toBe("archie_strategy_record");
    expect(calls[0][1]).toMatchObject({ p_strategy_key: "a:b", p_positive: true });
  });

  it("falls back to read-modify-write when the RPC fails", async () => {
    const { client, upserts } = mockClient({
      rpcFail: true,
      rows: [{ strategy_key: "a:b", positives: 3, negatives: 1 }],
    });
    const store = new SupabaseStrategyStatsStore(client);
    await store.recordOutcome("a:b", false);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ positives: 3, negatives: 2 });
  });

  it("loadStats returns empty on failure — never invented", async () => {
    const { client } = mockClient({ fail: true });
    const store = new SupabaseStrategyStatsStore(client);
    expect(await store.loadStats()).toEqual([]);
  });
});
