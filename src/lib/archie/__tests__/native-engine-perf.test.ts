import { describe, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ReasoningEngine,
  DEFAULT_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import {
  ContextMemory,
  rankFacts,
} from "@studio-shared/archie-ai/native-engine/memory.ts";

// =========================================================
// ARCHIE NATIVE ENGINE — PERFORMANCE HARNESS
// src/lib/archie/__tests__/native-engine-perf.test.ts
//
// Owner directive (2026-09-11): every optimization must show a
// MEASURABLE before/after gain — never "the code is nicer now".
// This harness measures speed + resource usage on a fixed,
// deterministic workload and prints one BENCH_PERF JSON line
// for the performance ledger (docs/archie-performance-ledger.md).
//
// It never fails the test run: it measures. Heavy measurement
// tests carry explicit generous timeouts so a SLOW CI runner
// (shared, loaded) measures instead of dying at vitest's
// default 20s — a timeout failure would contradict the
// harness's own never-fails contract. Conditions are
// identical between runs (same seed, same workload, same warmup)
// so numbers are comparable. Absolute values vary by machine —
// the LEDGER records before/after on the same machine, run in
// the same session, minutes apart.
// =========================================================

interface Metrics {
  workload: string;
  ops: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  heapDeltaMb: number;
}

const results: Metrics[] = [];

/** Deterministic PRNG (mulberry32) — identical workload every run. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stats(
  samples: number[],
): Omit<Metrics, "workload" | "ops" | "heapDeltaMb"> {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return {
    meanMs: +mean.toFixed(3),
    p50Ms: +p50.toFixed(3),
    p95Ms: +p95.toFixed(3),
  };
}

function record(workload: string, samples: number[], heapDeltaMb = 0) {
  results.push({
    workload,
    ops: samples.length,
    ...stats(samples),
    heapDeltaMb: +heapDeltaMb.toFixed(2),
  });
}

function heapMb(): number {
  return (
    (
      globalThis as { process?: { memoryUsage(): { heapUsed: number } } }
    ).process!.memoryUsage().heapUsed /
    (1024 * 1024)
  );
}

// ---------------------------------------------------------
// Fixed workload generators (deterministic)
// ---------------------------------------------------------

const CONVERSE_WORKLOAD: string[] = [
  "remember that screed sets in 48 hours",
  "what is screeding?",
  "how do I level a floor?",
  "remember that primer coverage multiplier is 1.3",
  "what is the primer coverage multiplier?",
  "how much sand do I need?",
  "remember that mortar ratio is 1:4",
  "compare screed and mortar",
  "what is the price of sand?",
  "remember that cement costs 5500 naira per bag",
  "what is the cement price?",
  "when does screed set?",
  "is screeding expensive?",
  "remember that leveling compound costs 7000 naira per 25kg bag",
  "how long does screed take to dry?",
  "what did I tell you about mortar?",
  "calculate 15 * 24",
  "what is the mortar ratio?",
  "teach me about bonding agents",
  "which is cheaper, sand or cement?",
];

/** Build a store with N facts deterministically. */
async function bigStore(n: number): Promise<FactStore> {
  const store = new FactStore();
  const rnd = mulberry32(42);
  for (let i = 0; i < n; i++) {
    await store.assert({
      subject: `material-${Math.floor(rnd() * 500)}`,
      predicate: i % 3 === 0 ? "costs" : i % 3 === 1 ? "sets-in" : "sold-in",
      object: `value-${i}`,
      confidence: 0.5 + (i % 50) / 100,
      provenance: { source: "web-research" },
      status: "candidate",
    });
  }
  return store;
}

describe("ARCHIE Native Engine — Performance harness (baseline measurement)", () => {
  it(
    "measures converse latency on the fixed 20-utterance workload",
    { timeout: 120000 },
    async () => {
      // warmup: JIT + module init outside the measured window
      const warm = new ArchieNativeEngine({ persistence: null });
      await warm.converse("hello");

      const engine = new ArchieNativeEngine({ persistence: null });
      const samples: number[] = [];
      for (const utt of CONVERSE_WORKLOAD) {
        const t0 = performance.now();
        await engine.converse(utt);
        samples.push(performance.now() - t0);
      }
      // repeat 4x over the same engine to get stable per-turn numbers
      for (let round = 0; round < 4; round++) {
        for (const utt of CONVERSE_WORKLOAD) {
          const t0 = performance.now();
          await engine.converse(utt);
          samples.push(performance.now() - t0);
        }
      }
      record("converse-per-turn", samples);
    },
  );

  it(
    "measures fact-store retrieval latency at 10k facts",
    { timeout: 120000 },
    async () => {
      const h0 = heapMb();
      const store = await bigStore(10_000);
      const h1 = heapMb();

      const samples: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const t0 = performance.now();
        const found = store.query({ subject: `material-${i % 500}` });
        samples.push(performance.now() - t0);
        if (found.length === 0) throw new Error("workload must match");
      }
      record("store-query-subject@10k", samples, h1 - h0);

      const samplesSP: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const t0 = performance.now();
        const found = store.query({
          subject: `material-${i % 500}`,
          predicate: "costs",
        });
        samplesSP.push(performance.now() - t0);
        if (found.length === 0) throw new Error("workload must match");
      }
      record("store-query-subj-pred@10k", samplesSP);
    },
  );

  it(
    "measures fact ranking (rankFacts) latency at 10k facts",
    { timeout: 180000 },
    async () => {
      const store = await bigStore(10_000);
      const facts = store.list();
      const queries = [
        "what does material-12 cost",
        "when does material-88 set",
        "how is material-250 sold",
        "material-401 value",
        "compare material-77 and material-3",
      ];
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const q = queries[i % queries.length];
        const t0 = performance.now();
        const got = rankFacts(q, facts, 6);
        samples.push(performance.now() - t0);
        if (got.length === 0)
          throw new Error("workload must match at least one fact");
      }
      record("rankFacts@10k", samples);
    },
  );

  it(
    "measures fact ranking via the persistent index (store.rank) at 10k facts",
    { timeout: 120000 },
    async () => {
      const store = await bigStore(10_000);
      const queries = [
        "what does material-12 cost",
        "when does material-88 set",
        "how is material-250 sold",
        "material-401 value",
        "compare material-77 and material-3",
      ];
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const q = queries[i % queries.length];
        const t0 = performance.now();
        const got = store.rank(q, 6);
        samples.push(performance.now() - t0);
        if (got.length === 0)
          throw new Error("workload must match at least one fact");
      }
      record("store-rank@10k", samples);
    },
  );

  it(
    "measures forward-chaining latency (200 facts through the rule set)",
    { timeout: 120000 },
    async () => {
      const store = new FactStore();
      const engine = new ReasoningEngine(store, DEFAULT_RULES);
      const rnd = mulberry32(7);
      for (let i = 0; i < 200; i++) {
        await store.assert({
          subject: `b-${i}`,
          predicate: "is-a",
          object: `a-${Math.floor(rnd() * 40)}`,
          confidence: 0.8,
          provenance: { source: "owner-taught" },
          status: "candidate",
        });
      }
      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const t0 = performance.now();
        await engine.forwardChain();
        samples.push(performance.now() - t0);
        // note: chain over the same fixed facts — measures per-chain cost
      }
      record("reasoning-forward-chain@200facts", samples);
    },
  );

  it(
    "measures context-memory retrieval latency at 500 turns",
    { timeout: 120000 },
    () => {
      const mem = new ContextMemory();
      const rnd = mulberry32(11);
      for (let i = 0; i < 500; i++) {
        const topics = ["screed", "mortar", "primer", "cement", "sand"];
        mem.addTurn(
          "owner",
          `tell me about ${topics[Math.floor(rnd() * topics.length)]} option ${i}`,
        );
        mem.addTurn(
          "archie",
          `answer ${i} about screeding levels and mortar mixes`,
        );
      }
      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        const t0 = performance.now();
        const got = mem.retrieve(`screed level ${i % 50}`, 4);
        samples.push(performance.now() - t0);
        if (got.salientTurns.length === 0) throw new Error("recall must match");
      }
      record("memory-recall@500turns", samples);
    },
  );

  it("prints the perf report", () => {
    const report = {
      suite: "archie-native-engine-perf",
      date: new Date().toISOString(),
      node: (globalThis as { process?: { version: string } }).process?.version,
      metrics: results,
    };
    console.log(`BENCH_PERF: ${JSON.stringify(report)}`);
  });
});
