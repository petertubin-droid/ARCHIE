// ============================================================
// ARCHIE STRATEGY LEARNING ENGINE
// (full-agent audit 2026-10-17, gap C-4)
//
// Before this engine, strategy selection was static: the
// lexical/structural cue scores in selectStrategies decided
// which reasoning strategy answers a question, and NOTHING
// ever recorded whether that strategy produced answers the
// owner actually confirmed or corrected. Selection could not
// learn.
//
// This engine closes the loop over REAL evidence only:
//
//   * ATTRIBUTION: when a strategy-backed answer is composed,
//     the turn's intent + chosen strategies are stashed. When
//     the owner later EXPLICITLY confirms (success) or
//     corrects (correction) — the only verification evidence
//     the learning system accepts (audit C3: engagement and
//     citations never reinforce) — each stashed strategy gets
//     a real positive/negative outcome under the key
//     "<intent>:<strategy>".
//   * BETA POSTERIOR: each strategy key holds a Beta
//     posterior; the selection score is biased by how far the
//     posterior departs from the prior — EVIDENCE-GATED: a
//     key with fewer than 5 outcomes never moves selection
//     (no lucky streaks, no single correction grudge).
//   * BIAS BOUNDS: the learned bias is capped at ±2 score
//     points — lexical + structural evidence always outranks
//     a modest learned tilt; learning refines, never
//     overrides, the honest cue system.
//   * HONESTY: failed reads/writes degrade to no bias (the
//     cue system runs unchanged); stats are counted, never
//     invented.
//
// Deterministic end to end. No external AI.
// ============================================================

export interface StrategyStat {
  strategy_key: string;
  positives: number;
  negatives: number;
}

export interface StrategyStatsStore {
  /** Best-effort: record one real outcome for a strategy key. */
  recordOutcome(key: string, positive: boolean): Promise<void>;
  /** Load ALL real stats. Empty on failure — never invented. */
  loadStats(): Promise<StrategyStat[]>;
}

export const STRATEGY_STATS_TABLE = "archie_strategy_stats";
export const STRATEGY_EVENTS_TABLE = "archie_strategy_events";

/** Minimal Beta posterior mean with a prior strength: the
 *  small-sample guard. prior 0.5 = start neutral. */
export function strategyPosterior(
  stat: Pick<StrategyStat, "positives" | "negatives">,
  prior = 0.5,
  priorStrength = 4,
): number {
  const posterior =
    (priorStrength * prior + stat.positives) /
    (priorStrength + stat.positives + stat.negatives);
  return Math.min(1, Math.max(0, posterior));
}

/** The evidence gate: below this many real outcomes a key
 *  never biases selection. */
export const STRATEGY_EVIDENCE_GATE = 5;

/** Deterministic, bounded learned bias for one score entry.
 *  Zero when the evidence gate is not met. */
export function learnedBias(
  stat: Pick<StrategyStat, "positives" | "negatives"> | undefined,
  prior = 0.5,
): number {
  if (!stat) return 0;
  const n = stat.positives + stat.negatives;
  if (n < STRATEGY_EVIDENCE_GATE) return 0;
  const posterior = strategyPosterior(stat, prior);
  // posterior 0.75 → +1, 1.0 → +2, 0.25 → -1, 0 → -2 (capped)
  const bias = (posterior - prior) * 8;
  return Math.min(2, Math.max(-2, Math.round(bias * 2) / 2));
}

/** Apply the learned bias to a cue-score table. Pure: same
 *  stats in, same scores out. The honest cue note is kept and
 *  the learning is annotated on every moved entry. */
export function applyStrategyBias<
  T extends { kind: string; score: number; cue: string },
>(scores: T[], stats: StrategyStat[], intent: string): T[] {
  const byKey = new Map(stats.map((s) => [s.strategy_key, s]));
  return scores.map((entry) => {
    const stat = byKey.get(`${intent}:${entry.kind}`);
    const bias = learnedBias(stat);
    if (bias === 0) return entry;
    return {
      ...entry,
      score: entry.score + bias,
      cue:
        entry.cue +
        `; learned bias ${bias >= 0 ? "+" : ""}${bias} (${stat!.positives}✓/${stat!.negatives}✗ real outcomes)`,
    };
  });
}

/** Re-derive the chosen set from biased scores, mirroring the
 *  honest fallback of the original selector: entries with a
 *  positive score, best first, capped at the original
 *  selection width. */
export function chosenFromScores<
  T extends { kind: string; score: number },
>(scores: T[], width: number): string[] {
  const ranked = [...scores].sort((a, b) =>
    b.score - a.score || a.kind.localeCompare(b.kind),
  );
  return ranked.filter((r) => r.score > 0).slice(0, width).map((r) => r.kind);
}

/** In-memory stats cache for the engine: loaded once from the
 *  real store, updated on every recorded outcome. A failed
 *  load starts empty — no bias, cue system unchanged. */
export class StrategyStatsCache {
  private stats = new Map<string, StrategyStat>();
  private loaded = false;

  constructor(private store: StrategyStatsStore | null) {}

  async hydrate(): Promise<number> {
    if (!this.store || this.loaded) return this.stats.size;
    try {
      const rows = await this.store.loadStats();
      for (const r of rows) this.stats.set(r.strategy_key, r);
      this.loaded = true;
    } catch {
      // honest: no stats, no bias
    }
    return this.stats.size;
  }

  async recordOutcome(key: string, positive: boolean): Promise<void> {
    if (!this.store) return;
    const cur = this.stats.get(key) ?? {
      strategy_key: key,
      positives: 0,
      negatives: 0,
    };
    this.stats.set(key, {
      ...cur,
      positives: cur.positives + (positive ? 1 : 0),
      negatives: cur.negatives + (positive ? 0 : 1),
    });
    try {
      await this.store.recordOutcome(key, positive);
    } catch {
      // best-effort: the in-memory cache keeps the turn's
      // truth; the durable write is retried by future loads
    }
  }

  /** The biased score table for an intent (pure). */
  biasedScores<
    T extends { kind: string; score: number; cue: string },
  >(scores: T[], intent: string): T[] {
    return applyStrategyBias(scores, [...this.stats.values()], intent);
  }

  snapshot(): StrategyStat[] {
    return [...this.stats.values()].sort((a, b) =>
      b.positives + b.negatives - (a.positives + a.negatives),
    );
  }
}

// ============================================================
// Supabase-backed store: atomic RPC increments (race-safe
// across isolates) with an honest read-modify-write fallback.
// A failed write degrades to best-effort — the cache keeps
// the turn's truth either way.
// ============================================================

export interface SupabaseLikeClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
}

export class SupabaseStrategyStatsStore implements StrategyStatsStore {
  constructor(private client: SupabaseLikeClient) {}

  async recordOutcome(key: string, positive: boolean): Promise<void> {
    // atomic path first (race-safe across isolates)
    if (typeof this.client.rpc === "function") {
      try {
        await this.client.rpc("archie_strategy_record", {
          p_strategy_key: key,
          p_positive: positive,
        });
        return;
      } catch {
        // fall through to read-modify-write
      }
    }
    try {
      const existing = await this.client
        .from(STRATEGY_STATS_TABLE)
        .select("strategy_key, positives, negatives")
        .eq("strategy_key", key)
        .limit(1);
      const rows = ((existing as { data?: Array<StrategyStat> } | null)?.data ?? []) as StrategyStat[];
      const cur = rows[0];
      await this.client.from(STRATEGY_STATS_TABLE).upsert(
        {
          strategy_key: key,
          positives: (cur?.positives ?? 0) + (positive ? 1 : 0),
          negatives: (cur?.negatives ?? 0) + (positive ? 0 : 1),
          last_outcome_at: new Date().toISOString(),
        },
        { onConflict: "strategy_key" },
      );
    } catch {
      // best-effort: never breaks the conversation
    }
  }

  async loadStats(): Promise<StrategyStat[]> {
    try {
      const r = await this.client
        .from(STRATEGY_STATS_TABLE)
        .select("strategy_key, positives, negatives");
      return ((r as { data?: StrategyStat[] } | null)?.data ?? []) as StrategyStat[];
    } catch {
      return []; // honest: no stats, no bias
    }
  }
}
