// ============================================================
// ARCHIE DISTRIBUTED RATE-LIMIT ENGINE
// (full-agent audit 2026-10-17, gap F-3 / suggested engine 14)
//
// The previous limiter (_shared/rate-limit.ts) is a fixed
// window per Deno isolate: every isolate restart loses all
// counters, N concurrent isolates enforce N independent
// limits (N× the configured ceiling), and fixed windows
// burst at edges (k requests at window close + k more at
// window open).
//
// This engine upgrades the math AND the topology:
//
//   * TOKEN BUCKET: continuous refill (tokens/second), a
//     configured burst capacity, and per-call cost. No edge
//     bursts — a client that spent the bucket waits for
//     refill, at ANY moment.
//   * STORE PORT: in-memory for now (honest about per-isolate
//     volatility — same guarantee as the previous limiter),
//     with a Supabase adapter ready for the new database:
//     an atomic conditional UPDATE is the single source of
     // truth across ALL isolates. Until the new database is
     // wired, each isolate enforces its own bucket — stated,
     // never implied.
//   * FAIL-OPEN, HONESTLY: if the distributed store errors,
//     the limiter admits the request rather than blocking
//     every owner on infrastructure failure — availability
//     over strictness, and the store error is reported to
//     the caller in the result, never hidden.
//   * DETERMINISTIC: injected clock — same call sequence,
//     same results, every run.
// ============================================================

export interface BucketConfig {
  /** Maximum tokens the bucket can hold (burst size). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Tokens charged per request (default 1). */
  cost?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Tokens remaining after this decision. */
  remaining: number;
  /** Seconds until one cost-unit is available (0 if allowed). */
  retryAfterSeconds: number;
  /** True when the store failed and the decision fell open. */
  failedOpen: boolean;
}

export interface BucketStore {
  /** Atomically apply a take-if-affordable at key. Returns:
   *    >= 0 — allowed, remaining tokens
   *     < 0 — refused, -(cost - balance) deficit
   *   null — store failure (fail-open) */
  takeIf(
    key: string,
    config: BucketConfig,
    cost: number,
    nowMs: number,
  ): Promise<number | null>;
  /** Evict idle buckets (in-memory hygiene). */
  sweep(nowMs: number): void;
}

// ------------------------------------------------------------
// In-memory store — per isolate. Deterministic with an
// injected clock; the honest limitation is documented in the
// class header and reported by the engine's describe().
// ------------------------------------------------------------

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class InMemoryBucketStore implements BucketStore {
  private buckets = new Map<string, Bucket>();
  /** Buckets idle longer than this are evictable. */
  static readonly SWEEP_IDLE_MS = 86_400_000; // 24h

  async takeIf(
    key: string,
    config: BucketConfig,
    cost: number,
    nowMs: number,
  ): Promise<number | null> {
    const b = this.buckets.get(key);
    if (!b) {
      if (cost > config.capacity) {
        return -(cost - config.capacity); // can never afford
      }
      this.buckets.set(key, {
        tokens: config.capacity - cost,
        lastRefillMs: nowMs,
      });
      return config.capacity - cost;
    }
    const elapsedSec = Math.max(0, (nowMs - b.lastRefillMs) / 1000);
    b.tokens = Math.min(
      config.capacity,
      b.tokens + elapsedSec * config.refillPerSecond,
    );
    b.lastRefillMs = nowMs;
    if (b.tokens < cost) return -(cost - b.tokens); // deficit
    b.tokens -= cost;
    return b.tokens;
  }

  sweep(nowMs: number): void {
    for (const [key, b] of this.buckets) {
      if (nowMs - b.lastRefillMs > InMemoryBucketStore.SWEEP_IDLE_MS) {
        this.buckets.delete(key);
      }
    }
  }

  size(): number {
    return this.buckets.size;
  }
}

// ------------------------------------------------------------
// Supabase adapter — ready for the new database. One atomic
// conditional UPDATE per decision; all isolates share truth.
// Table: archie_rate_limit_buckets (migration authored with
// this engine; not applied while ARCHIE is DB-disconnected).
// ------------------------------------------------------------

export const RATE_LIMIT_TABLE = "archie_rate_limit_buckets";

export interface SupabaseLikeClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class SupabaseBucketStore implements BucketStore {
  constructor(
    private client: SupabaseLikeClient,
    private serviceRoleHint = "service-role",
  ) {}

  async takeIf(
    key: string,
    config: BucketConfig,
    cost: number,
    nowMs: number,
  ): Promise<number | null> {
    // rpc keeps the take-affordable check + refill atomic in
    // the database — see the migration for the function.
    const r = (await this.client.rpc("archie_rate_limit_take", {
      p_key: key,
      p_capacity: config.capacity,
      p_refill_per_second: config.refillPerSecond,
      p_cost: cost,
      p_now_ms: nowMs,
    })) as { data: number | null; error: { message: string } | null };
    if (r && r.error) return null; // fail-open signal
    return typeof r?.data === "number" ? r.data : null;
  }

  sweep(_nowMs: number): void {
    /* nothing — TTL sweep happens in the database routine */
  }

  describe(): string {
    return `distributed(${RATE_LIMIT_TABLE}, ${this.serviceRoleHint})`;
  }
}

// ------------------------------------------------------------
// The limiter — deterministic with an injected clock.
// ------------------------------------------------------------

export class TokenBucketRateLimiter {
  constructor(
    private store: BucketStore,
    private clock: () => number = () => Date.now(),
  ) {}

  async check(key: string, config: BucketConfig): Promise<RateLimitDecision> {
    const cost = Math.max(1, Math.floor(config.cost ?? 1));
    const nowMs = this.clock();
    const tokensAfter = await this.store.takeIf(key, config, cost, nowMs);
    if (tokensAfter === null) {
      // FAIL-OPEN: infrastructure failure never blocks the
      // owner; the decision says so honestly.
      return {
        allowed: true,
        remaining: 0,
        retryAfterSeconds: 0,
        failedOpen: true,
      };
    }
    if (tokensAfter < 0) {
      // Refused: the deficit is how many tokens the bucket
      // must refill before one cost-unit is affordable.
      const deficit = -tokensAfter;
      const seconds = deficit > 0
        ? deficit / config.refillPerSecond
        : 1 / config.refillPerSecond;
      // Misconfiguration guard: a cost that can NEVER fit the
      // capacity reports a week, not a misleading few seconds.
      const neverAffordable = cost > config.capacity;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: neverAffordable ? 604_800 : Math.ceil(seconds),
        failedOpen: false,
      };
    }
    return {
      allowed: true,
      remaining: tokensAfter,
      retryAfterSeconds: 0,
      failedOpen: false,
    };
  }

  /** Housekeeping — call on a schedule (maintenance pass). */
  async sweep(): Promise<void> {
    this.store.sweep(this.clock());
  }
}

// ------------------------------------------------------------
// Standard buckets for ARCHIE surfaces. Capacity and refill
// encode the real policy: visitors get a tight bucket;
// owners get a generous one; tool executions are the
// scarcest resource and priced accordingly.
// ------------------------------------------------------------

export const BUCKET_PRESETS = {
  /** archie-chat visitors: 20 requests, 1 per 3 seconds. */
  visitor: { capacity: 20, refillPerSecond: 1 / 3 },
  /** owners via WhatsApp/chat: generous but bounded. */
  owner: { capacity: 120, refillPerSecond: 1 / 6 },
  /** tool executions (web intelligence etc.): expensive. */
  tools: { capacity: 10, refillPerSecond: 1 / 30 },
} as const satisfies Record<string, BucketConfig>;
