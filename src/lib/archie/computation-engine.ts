// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — ADVANCED COMPUTATION (§7)
//
// A general-purpose high-throughput computation layer for
// very large batches of calculations and reasoning
// operations:
//
//  - priority-queued task scheduling
//  - bounded concurrency (parallelism without starvation)
//  - deterministic batching with retries
//  - LRU + TTL result cache with memoization
//  - asynchronous, non-blocking execution
//  - measured throughput — never claimed, always measured
//
// NO performance claims are hardcoded. Throughput is
// reported from actual measurements only (measure()).
// =========================================================

/** A computation task. `compute` must be pure — same input,
 *  same output — or caching is disabled for that task. */
export interface ComputeTask<TIn, TOut> {
  key: string;
  input: TIn;
  compute: (input: TIn) => TOut | Promise<TOut>;
  /** Cacheable only when compute is deterministic. */
  cacheable?: boolean;
  priority?: number; // higher = sooner
}

export interface TaskResult<TOut> {
  key: string;
  ok: boolean;
  output?: TOut;
  error?: string;
  durationMs: number;
  fromCache: boolean;
}

/** LRU + TTL cache. */
export class ResultCache<TOut> {
  private map = new Map<string, { value: TOut; expiresAt: number }>();
  constructor(
    private maxEntries: number,
    private ttlMs: number,
  ) {}

  get(key: string, now = Date.now()): TOut | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    // LRU: re-insert to refresh recency.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: TOut, now = Date.now()): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: now + this.ttlMs });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * The computation engine. Runs a queue of tasks with bounded
 * concurrency. In the browser this yields to the event loop
 * between workers (async), keeping the UI responsive while
 * saturating available parallelism.
 */
export class ComputationEngine<TIn, TOut> {
  private cache: ResultCache<TOut>;
  private concurrency: number;
  private retries: number;

  constructor(opts?: {
    concurrency?: number;
    cacheMaxEntries?: number;
    cacheTtlMs?: number;
    retries?: number;
  }) {
    this.concurrency = Math.max(1, opts?.concurrency ?? 8);
    this.retries = Math.max(0, opts?.retries ?? 1);
    this.cache = new ResultCache<TOut>(
      opts?.cacheMaxEntries ?? 1000,
      opts?.cacheTtlMs ?? 5 * 60 * 1000,
    );
  }

  /** Run a batch of tasks. Order of results follows input
   *  order; execution order follows priority then FIFO. */
  async run(
    tasks: readonly ComputeTask<TIn, TOut>[],
  ): Promise<TaskResult<TOut>[]> {
    const results = new Array<TaskResult<TOut>>(tasks.length);
    const pending: { idx: number; task: ComputeTask<TIn, TOut> }[] = tasks.map(
      (task, idx) => ({
        idx,
        task,
      }),
    );

    // Priority queue: higher priority first, FIFO within.
    pending.sort(
      (a, b) =>
        (b.task.priority ?? 0) - (a.task.priority ?? 0) || a.idx - b.idx,
    );

    let cursor = 0;
    const now = () => Date.now();

    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        const { idx, task } = item;

        // Cache check.
        if (task.cacheable) {
          const cached = this.cache.get(task.key);
          if (cached !== undefined) {
            results[idx] = {
              key: task.key,
              ok: true,
              output: cached,
              durationMs: 0,
              fromCache: true,
            };
            continue;
          }
        }

        const started = now();
        let attempt = 0;

        while (true) {
          try {
            const output = await task.compute(task.input);
            if (task.cacheable) this.cache.set(task.key, output);
            results[idx] = {
              key: task.key,
              ok: true,
              output,
              durationMs: now() - started,
              fromCache: false,
            };
            break;
          } catch (err) {
            attempt += 1;
            if (attempt > this.retries) {
              results[idx] = {
                key: task.key,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
                durationMs: now() - started,
                fromCache: false,
              };
              break;
            }
          }
        }
      }
    };

    // Bounded parallelism.
    const workers: Promise<void>[] = [];
    for (
      let i = 0;
      i < Math.min(this.concurrency, Math.max(1, tasks.length));
      i++
    ) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return results;
  }

  /** Memoized single computation. */
  async computeOne(task: ComputeTask<TIn, TOut>): Promise<TaskResult<TOut>> {
    const [res] = await this.run([task]);
    return res;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Measured throughput report — the honest performance
 * contract. ARCHIE NEVER claims speed it has not measured.
 */
export interface ThroughputMeasurement {
  tasks: number;
  cacheHits: number;
  cacheMisses: number;
  totalMs: number;
  tasksPerSecond: number;
  /** Present only when a baseline was measured first. */
  speedupVsBaseline?: number;
}

export function measure(
  results: readonly TaskResult<unknown>[],
  totalMs: number,
  baselineTasksPerSecond?: number,
): ThroughputMeasurement {
  const cacheHits = results.filter((r) => r.fromCache).length;
  const tasksPerSecond = totalMs > 0 ? (results.length / totalMs) * 1000 : 0;
  const measurement: ThroughputMeasurement = {
    tasks: results.length,
    cacheHits,
    cacheMisses: results.length - cacheHits,
    totalMs,
    tasksPerSecond,
  };
  if (baselineTasksPerSecond && baselineTasksPerSecond > 0) {
    measurement.speedupVsBaseline = tasksPerSecond / baselineTasksPerSecond;
  }
  return measurement;
}

/**
 * Deterministic numeric batch engine for math-heavy workloads
 * (the "specialized tool" path): computes with chunked async
 * batching so even very large arrays never block the main
 * thread, and every result is exact — math is COMPUTED, never
 * recalled (domains.ts DETERMINISTIC bar).
 */
export async function computeNumericBatch<I, O>(
  items: readonly I[],
  fn: (item: I, index: number) => O,
  opts?: { batchSize?: number },
): Promise<O[]> {
  const batchSize = Math.max(1, opts?.batchSize ?? 500);
  const out = new Array<O>(items.length);
  for (let start = 0; start < items.length; start += batchSize) {
    const end = Math.min(start + batchSize, items.length);
    for (let i = start; i < end; i++) {
      out[i] = fn(items[i], i);
    }
    // Yield to the event loop between batches.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return out;
}
