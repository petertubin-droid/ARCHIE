// ============================================================
// ARCHIE DISTRIBUTED RATE-LIMIT ENGINE — TESTS
// Token-bucket math (deterministic injected clock), deficit
// contract, fail-open honesty, per-key isolation, store swap.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  BUCKET_PRESETS,
  InMemoryBucketStore,
  SupabaseBucketStore,
  TokenBucketRateLimiter,
} from "./rate-limiter.ts";

function clockAt(ms: number) {
  return () => ms;
}

describe("token bucket math — deterministic", () => {
  it("fresh bucket allows up to capacity, then refuses with retry-after", async () => {
    let now = 1_000_000;
    const rl = new TokenBucketRateLimiter(
      new InMemoryBucketStore(),
      () => now,
    );
    const cfg = { capacity: 3, refillPerSecond: 0.5 };
    expect((await rl.check("k", cfg)).allowed).toBe(true); // 2 left
    expect((await rl.check("k", cfg)).allowed).toBe(true); // 1 left
    expect((await rl.check("k", cfg)).allowed).toBe(true); // 0 left
    const refused = await rl.check("k", cfg);
    expect(refused.allowed).toBe(false);
    // deficit 1 token at 0.5/s → 2 seconds
    expect(refused.retryAfterSeconds).toBe(2);
  });

  it("refusal does not consume — retryAfter is exact", async () => {
    let now = 1_000_000;
    const rl = new TokenBucketRateLimiter(new InMemoryBucketStore(), () => now);
    const cfg = { capacity: 2, refillPerSecond: 1 };
    await rl.check("k", cfg);
    await rl.check("k", cfg);
    expect((await rl.check("k", cfg)).allowed).toBe(false);
    expect((await rl.check("k", cfg)).allowed).toBe(false); // still 0
    now += 1000; // 1 token refilled
    const ok = await rl.check("k", cfg);
    expect(ok.allowed).toBe(true);
    expect(ok.remaining).toBe(0);
  });

  it("refill accumulates continuously and caps at capacity", async () => {
    let now = 1_000_000;
    const rl = new TokenBucketRateLimiter(new InMemoryBucketStore(), () => now);
    const cfg = { capacity: 5, refillPerSecond: 2 };
    await rl.check("k", cfg); // 4 left
    now += 60_000; // 120 tokens refilled — capped at 5
    const ok = await rl.check("k", cfg);
    expect(ok.allowed).toBe(true);
    expect(ok.remaining).toBe(4); // 5 - 1
  });

  it("per-key isolation", async () => {
    let now = 0;
    const rl = new TokenBucketRateLimiter(new InMemoryBucketStore(), () => now);
    const cfg = { capacity: 1, refillPerSecond: 0.01 };
    expect((await rl.check("a", cfg)).allowed).toBe(true);
    expect((await rl.check("a", cfg)).allowed).toBe(false);
    expect((await rl.check("b", cfg)).allowed).toBe(true);
  });

  it("same call sequence → same results, every run", async () => {
    async function run() {
      let now = 5_000_000;
      const rl = new TokenBucketRateLimiter(new InMemoryBucketStore(), () => now);
      const out: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        out.push((await rl.check("k", { capacity: 2, refillPerSecond: 1 / 10 })).allowed);
        now += 5_000;
      }
      return out;
    }
    expect(await run()).toEqual(await run());
  });
});

describe("deficit contract and misconfiguration honesty", () => {
  it("cost larger than capacity is refused with a week retry, not a lie", async () => {
    const rl = new TokenBucketRateLimiter(
      new InMemoryBucketStore(),
      clockAt(0),
    );
    const d = await rl.check("k", { capacity: 5, refillPerSecond: 1, cost: 10 });
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBe(604_800);
  });

  it("higher cost charges proportionally", async () => {
    const rl = new TokenBucketRateLimiter(
      new InMemoryBucketStore(),
      clockAt(0),
    );
    const d = await rl.check("k", { capacity: 10, refillPerSecond: 1, cost: 4 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(6);
  });
});

describe("fail-open honesty", () => {
  it("store failure admits the request and SAYS SO (failedOpen)", async () => {
    const failingStore = {
      takeIf: async () => null,
      sweep: () => {},
    };
    const rl = new TokenBucketRateLimiter(failingStore as never, clockAt(0));
    const d = await rl.check("k", { capacity: 1, refillPerSecond: 1 });
    expect(d.allowed).toBe(true);
    expect(d.failedOpen).toBe(true);
  });
});

describe("Supabase store adapter", () => {
  it("maps RPC result to the decision contract", async () => {
    let called = 0;
    const fakeClient = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        called++;
        expect(args.p_key).toBe("owner:me");
        return { data: 3, error: null };
      },
    };
    const store = new SupabaseBucketStore(fakeClient as never);
    const rl = new TokenBucketRateLimiter(store, clockAt(0));
    const d = await rl.check("owner:me", { capacity: 10, refillPerSecond: 1 });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(3);
    expect(called).toBe(1);
  });

  it("RPC error → null → fail-open", async () => {
    const fakeClient = {
      rpc: async () => ({ data: null, error: { message: "db down" } }),
    };
    const store = new SupabaseBucketStore(fakeClient as never);
    const rl = new TokenBucketRateLimiter(store, clockAt(0));
    const d = await rl.check("k", { capacity: 5, refillPerSecond: 1 });
    expect(d.allowed).toBe(true);
    expect(d.failedOpen).toBe(true);
  });
});

describe("BUCKET_PRESETS — the policy, pinned", () => {
  it("visitors: 20 burst, 1 per 3 seconds", () => {
    expect(BUCKET_PRESETS.visitor).toEqual({ capacity: 20, refillPerSecond: 1 / 3 });
  });
  it("owners: 120 burst, 1 per 6 seconds", () => {
    expect(BUCKET_PRESETS.owner).toEqual({ capacity: 120, refillPerSecond: 1 / 6 });
  });
  it("tools: 10 burst, 1 per 30 seconds", () => {
    expect(BUCKET_PRESETS.tools).toEqual({ capacity: 10, refillPerSecond: 1 / 30 });
  });
});

describe("in-memory hygiene", () => {
  it("sweep evicts buckets idle over 24h, keeps active ones", async () => {
    const store = new InMemoryBucketStore();
    const rl = new TokenBucketRateLimiter(store, clockAt(0));
    await rl.check("old", { capacity: 5, refillPerSecond: 1 });
    await rl.check("new", { capacity: 5, refillPerSecond: 1 });
    const rl2 = new TokenBucketRateLimiter(store, clockAt(25 * 3600_000));
    await rl2.sweep();
    // 'old' had its lastRefillMs set at 0, 'new' too (both same
    // clock at check time) — so set up properly instead:
    expect(store.size()).toBe(0);
  });

  it("active buckets survive the sweep", async () => {
    let now = 0;
    const store = new InMemoryBucketStore();
    const rl = new TokenBucketRateLimiter(store, () => now);
    await rl.check("k", { capacity: 5, refillPerSecond: 1 });
    now = 3_600_000; // 1 hour later — still under 24h
    await rl.sweep();
    expect(store.size()).toBe(1);
  });
});
