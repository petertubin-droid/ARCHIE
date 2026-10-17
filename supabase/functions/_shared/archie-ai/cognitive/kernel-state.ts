// ============================================================
// ARCHIE KERNEL STATE — D-1 COUNTER CONTINUITY (audit 2026-10-17)
//
// The cognitive kernel's counters (cycles, unknownTopicHits,
// verificationFails) used to reset on every cold start —
// diagnostics reported per-isolate noise and the IMPROVE
// window (unknowns since the last drafted proposal) forgot
// itself across restarts.
//
// This store persists the kernel's counters in the SAME
// cross-isolate counter table the substrate engine already
// uses (frelux_archie_engine_counters), under KERNEL_-
// prefixed keys so the two never clobber each other:
//   kernel_cycles                — total cycles, monotonic
//   kernel_unknown_topic_hits    — unknowns since the last
//                                  drafted improvement proposal
//   kernel_verification_fails    — verification fails since
//                                  the last drafted proposal
//
// Honesty rules (same as the substrate's CounterPersistence):
//   * Hydration is best-effort — no table, no db → the
//     isolate counts from zero and says so in diagnostics.
//   * Concurrency is last-write-wins; these are diagnostics,
//     not accounting.
//   * The IMPROVE thresholds keep their semantics: a window
//     that reaches the threshold drafts a proposal and
//     persists the RESET window for every isolate to see.
// ============================================================

import type { SupabaseLike } from "../native-engine/persistence.ts";
import { COUNTERS_TABLE } from "../native-engine/persistence.ts";

/** The kernel's persisted counter window. */
export interface KernelCounters {
  cycles: number;
  unknownTopicHits: number;
  verificationFails: number;
}

export const EMPTY_KERNEL_COUNTERS: KernelCounters = {
  cycles: 0,
  unknownTopicHits: 0,
  verificationFails: 0,
};

/** Hydrate the kernel counters from the cross-isolate table.
 *  Best-effort: any error → empty window (honest cold start). */
export async function hydrateKernelCounters(
  db: SupabaseLike | null | undefined,
): Promise<KernelCounters> {
  if (!db) return { ...EMPTY_KERNEL_COUNTERS };
  try {
    // Unfiltered select + in-code filter: the shared chain
    // type guarantees only select/upsert, and the table is
    // small (counter keys only).
    const { data, error } = await db
      .from(COUNTERS_TABLE)
      .select("key,value");
    if (error) return { ...EMPTY_KERNEL_COUNTERS };
    const out = { ...EMPTY_KERNEL_COUNTERS };
    for (const row of (data ?? []) as Array<{ key: string; value: number }>) {
      if (row.key === "kernel_cycles") out.cycles = Number(row.value) || 0;
      if (row.key === "kernel_unknown_topic_hits")
        out.unknownTopicHits = Number(row.value) || 0;
      if (row.key === "kernel_verification_fails")
        out.verificationFails = Number(row.value) || 0;
    }
    return out;
  } catch {
    return { ...EMPTY_KERNEL_COUNTERS };
  }
}

/** Persist the kernel counters (read-modify-write upsert,
 *  last write wins — diagnostics, not accounting). */
export async function persistKernelCounters(
  db: SupabaseLike | null | undefined,
  counters: KernelCounters,
): Promise<void> {
  if (!db) return;
  try {
    const now = new Date().toISOString();
    await db.from(COUNTERS_TABLE).upsert([
      { key: "kernel_cycles", value: counters.cycles, updated_at: now },
      {
        key: "kernel_unknown_topic_hits",
        value: counters.unknownTopicHits,
        updated_at: now,
      },
      {
        key: "kernel_verification_fails",
        value: counters.verificationFails,
        updated_at: now,
      },
    ]);
  } catch {
    // Best-effort: a failed counter write never breaks a cycle.
  }
}
