// =========================================================
// ARCHIE NATIVE ENGINE — PERSISTENCE ADAPTERS
//
// Durable knowledge + outcome persistence for the native
// engine (tables frelux_archie_native_facts and
// frelux_archie_native_outcomes — RLS-guarded, service-role
// only, seeded by migration
// 20260912120000_archie_native_engine.sql). The adapter is
// structural: it accepts any Supabase-shaped client, so the
// same code serves edge functions and the app.
// =========================================================

import { table } from "../tables.ts";
import type { Fact, LearningOutcome } from "./types.ts";
import { HydrationStats, PersistenceLike, PersistedFactRow } from "./knowledge.ts";
import type { OutcomePersistence } from "./learning.ts";

/** Minimal structural shape of the Supabase client the
 *  adapter needs. supabase-js satisfies this structurally;
 *  call sites pass `db as unknown as SupabaseLike`. */
export interface SupabaseLike {
  from(table: string): {
    select(
      query: string,
      opts?: { count?: "exact"; head?: boolean },
    ): PromiseLike<{
      data: unknown[] | null;
      error: unknown;
      /** Present for { count: "exact" } selects (PostgREST
       *  exact total — metadata only, no rows over the wire). */
      count?: number | null;
    }> & {
      range(
        from: number,
        to: number,
      ): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      /** RESPONSE TIME (owner directive 2026-09-16): the real
       * supabase-js client chains order+limit so the hydrate
       * window is computed DATABASE-side. Optional because
       * minimal test doubles are thenable-only — loadFacts
       * degrades to the await path for them. */
      order?(
        column: string,
        opts: { ascending: boolean },
      ): {
        limit(
          n: number,
        ): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
      /** TASK-STATE LOOKUP (gap D-2, 2026-09-16): the real
       *  supabase-js client chains select→eq→limit so a single
       *  checkpoint row is fetched database-side. Optional
       *  because minimal test doubles are thenable-only. */
      eq?(
        column: string,
        value: unknown,
      ): {
        limit(
          n: number,
        ): PromiseLike<{ data: unknown[] | null; error: unknown }>;
      };
    };
    insert(rows: unknown): PromiseLike<{ error: unknown }>;
    update(patch: unknown): {
      eq(column: string, value: unknown): PromiseLike<{ error: unknown }>;
    };
    upsert(rows: unknown): PromiseLike<{ error: unknown }>;
  };
}

import { NATIVE_CONFIG } from "./config.ts";

/** Owner-taught vocabulary meanings write the living
 *  registry (self-evolving vocabulary, owner directive
 *  2026-09-13). The engine's teaching route calls this;
 *  a registry failure falls back to the native fact
 *  store path, so teaching never fails closed. */
import { teachTerm } from "../knowledge/vocabulary.ts";
import { researchTerm } from "../knowledge/vocabulary-research.ts";

export const FACTS_TABLE = table("archie_native_facts");
export const OUTCOMES_TABLE = table("archie_native_outcomes");
export const EPISODIC_TABLE = table("archie_episodic_turns");
export const COUNTERS_TABLE = table("archie_engine_counters");

/** A persisted episodic turn (plan P7): prior-session
 *  context grouped by conversation id. */
export interface EpisodicTurnRow {
  id: string;
  conversation_id: string;
  role: "owner" | "archie";
  text: string;
  turn_at: string;
}

function rowFromFact(fact: Fact): Record<string, unknown> {
  return {
    id: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    qualifiers: fact.qualifiers ?? null,
    confidence: fact.confidence,
    provenance: fact.provenance,
    status: fact.status,
    validated_count: fact.validatedCount,
    verified_by: fact.verifiedBy ?? [],
    created_at: fact.createdAt,
  };
}

/** Supabase-backed persistence for facts + outcomes. */
export class SupabasePersistence
  implements PersistenceLike, OutcomePersistence
{
  constructor(private db: SupabaseLike) {}

  /** VOCABULARY REVIEW (owner directive 2026-09-13): every
   *  NON-SEED registry row — researched meanings, owner-taught
   *  meanings, and words merely seen (meaning NULL) — for the
   *  owner's at-a-glance review. PostgREST caps a select at
   *  1000 rows: pages until the short page. */
  async listLearnedVocabulary(): Promise<
    Array<{
      term: string;
      meaning: string | null;
      source: string;
      confidence: number | null;
      times_seen: number | null;
    }>
  > {
    try {
      const rows: Array<{
        term: string;
        meaning: string | null;
        source: string;
        confidence: number | null;
        times_seen: number | null;
      }> = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await this.db
          .from(table("vocabulary"))
          .select("term,meaning,source,confidence,times_seen")
          .range(off, off + 999);
        if (error || !data) return rows;
        const page = (data as typeof rows).filter((r) => r.source !== "seed");
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows;
    } catch {
      return [];
    }
  }

  /** Owner asked ARCHIE to research a meaning on the web —
   *  write the registry row with RESEARCH provenance:
   *  cross-checked confidence, source domains named,
   *  honestly labeled as external knowledge (not
   *  owner-taught); teaching overwrites it anytime. */
  async researchVocabularyTerm(
    term: string,
    meaning: string,
    domains: string[],
    confidence: number,
  ): Promise<boolean> {
    try {
      return await researchTerm(
        this.db,
        null,
        term,
        meaning,
        domains,
        confidence,
      );
    } catch {
      return false;
    }
  }

  /** Owner taught a meaning in chat — write the registry
   *  row (term, meaning, owner-taught provenance, 0.9
   *  confidence). Learning is free; no authority gate. */
  async teachVocabularyTerm(term: string, meaning: string): Promise<boolean> {
    try {
      return await teachTerm(this.db, null, term, meaning);
    } catch {
      return false;
    }
  }

  /** HYDRATE CAP (owner upgrade 2026-09-16) — honest stats
   *  about the last loadFacts(): total persisted, how many
   *  actually hydrated, the cap, and whether rows were
   *  truncated by it. Read by FactStore.hydrate() and surfaced
   *  in engine diagnostics — a cap is REPORTED, never silent. */
  lastHydrationStats: HydrationStats | null = null;

  async loadFacts(): Promise<PersistedFactRow[]> {
    // RESPONSE TIME (owner directive 2026-09-16) + HYDRATE CAP
    // (owner upgrade 2026-09-16): the most-recent window is the
    // DATABASE's job — O(limit) over the wire — and the cap is
    // REPORTED, never silent: an exact head-count tells
    // diagnostics whether rows exist beyond the window.
    const base = this.db
      .from(FACTS_TABLE)
      .select(
        "id,subject,predicate,object,qualifiers,confidence,provenance,status,validated_count,verified_by,created_at",
      );
    const cap = NATIVE_CONFIG.factHydrateLimit;
    if (typeof base.order === "function") {
      // Real client: the window is the database's job —
      // O(limit) over the wire, same newest-first order.
      const { data, error } = await base
        .order("created_at", { ascending: false })
        .limit(cap);
      if (error) {
        this.lastHydrationStats = null;
        return [];
      }
      const native = (data ?? []) as PersistedFactRow[];
      // Honest cap accounting: exact head-count (metadata
      // only). A count failure reports NULL stats — never a
      // guessed total.
      let total: number | null = null;
      try {
        const counted = await this.db
          .from(FACTS_TABLE)
          .select("id", { count: "exact", head: true });
        if (!counted.error) total = counted.count ?? null;
      } catch {
        total = null;
      }
      this.lastHydrationStats = total === null
        ? null
        : {
          totalFacts: total,
          loadedFacts: native.length,
          cap,
          truncated: total > native.length,
        };
      return this.appendVocabularyFacts(native);
    }
    // Minimal thenable double (tests): await + client-side
    // window, exactly the pre-optimization behavior. Stats are
    // computed from what the double holds — honest within it.
    const { data, error } = await base;
    if (error) {
      this.lastHydrationStats = null;
      return [];
    }
    const rows = (data ?? []) as PersistedFactRow[];
    const native = rows
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, cap);
    this.lastHydrationStats = {
      totalFacts: rows.length,
      loadedFacts: native.length,
      cap,
      truncated: rows.length > cap,
    };
    return this.appendVocabularyFacts(native);
  }

  /** SELF-EVOLVING VOCABULARY (owner directive 2026-09-12):
   * registry terms WITH a taught or seeded meaning hydrate as
   * subject+means facts, so "what does X mean" answers
   * through the normal honest knowledge path with provenance.
   * Usage-only observations (meaning NULL) never become
   * facts — a word ARCHIE has merely seen is not knowledge,
   * and ARCHIE never invents a meaning. Additive only: a
   * vocabulary read failure never breaks fact hydration. */
  private async appendVocabularyFacts(
    native: PersistedFactRow[],
  ): Promise<PersistedFactRow[]> {
    try {
      // PostgREST caps a single select at 1000 rows — the
      // registry holds more, so hydration pages until the
      // short page or every definition silently vanishes.
      const rows: Array<{
        term: string;
        meaning: string | null;
        source: string;
        confidence: number | null;
        provenance: string | null;
      }> = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await this.db
          .from(table("vocabulary"))
          .select("term,meaning,source,confidence,provenance")
          .range(off, off + 999);
        if (error || !data) return native;
        const page = data as typeof rows;
        rows.push(...page);
        if (page.length < 1000) break;
      }
      const vocabFacts = (
        rows as Array<{
          term: string;
          meaning: string | null;
          source: string;
          confidence: number | null;
          provenance: string | null;
        }>
      )
        .filter((v) => v.meaning)
        .map((v) => ({
          id: `vocab:${v.term}`,
          subject: v.term,
          predicate: "means",
          object: v.meaning as string,
          qualifiers: null,
          confidence: v.confidence ?? 0.9,
          // Fact provenance sources are a closed union — map
          // the registry origin onto it; the exact registry
          // source travels in the note for the proof record.
          provenance: {
            source:
              v.source === "seed"
                ? ("seed" as const)
                : v.source.startsWith("owner")
                  ? ("owner-taught" as const)
                  : v.source === "research"
                    ? ("web-research" as const)
                    : (`cross-source:vocabulary-${v.source}` as const),
            note: `vocabulary registry (${v.source})`,
          },
          status: "ACTIVE",
          validated_count: 0,
          verified_by: [] as string[],
          created_at: new Date().toISOString(),
        }));
      return [...native, ...vocabFacts];
    } catch {
      return native;
    }
  }

  async saveFact(fact: Fact): Promise<void> {
    const { error } = await this.db
      .from(FACTS_TABLE)
      .insert([rowFromFact(fact)]);
    if (error) {
      // The row exists from a previous session — update instead.
      await this.db
        .from(FACTS_TABLE)
        .update({
          confidence: fact.confidence,
          status: fact.status,
          validated_count: fact.validatedCount,
          verified_by: fact.verifiedBy ?? [],
        })
        .eq("id", fact.id);
    }
  }

  async saveFacts(facts: Fact[]): Promise<void> {
    for (const fact of facts.slice(0, NATIVE_CONFIG.factHydrateLimit)) {
      await this.db
        .from(FACTS_TABLE)
        .update({
          confidence: fact.confidence,
          status: fact.status,
          validated_count: fact.validatedCount,
          verified_by: fact.verifiedBy ?? [],
        })
        .eq("id", fact.id);
    }
  }

  /** REMEDIATION batch 4 (2026-09-13): claim-based
   *  single-writer lock via DB RPC (pooled-connection safe).
   *  FAIL-OPEN by design: a client without rpc (in-memory
   *  mocks) or an errored claim keeps the historical unlocked
   *  behavior — locking is mutual exclusion between writers,
   *  never a reason consolidation stops happening. */
  async tryLock(
    scope: string,
    holder: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const rpc = (
      this.db as SupabaseLike & {
        rpc?: (
          fn: string,
          args?: Record<string, unknown>,
        ) => PromiseLike<{ data: unknown; error: unknown }>;
      }
    ).rpc;
    if (typeof rpc !== "function") return true;
    const { data, error } = await rpc.call(this.db, "frelux_try_engine_lock", {
      p_scope: scope,
      p_holder: holder,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) return true;
    return data !== false;
  }

  async releaseLock(scope: string, holder: string): Promise<void> {
    const rpc = (
      this.db as SupabaseLike & {
        rpc?: (
          fn: string,
          args?: Record<string, unknown>,
        ) => PromiseLike<{ data: unknown; error: unknown }>;
      }
    ).rpc;
    if (typeof rpc !== "function") return;
    await rpc.call(this.db, "frelux_release_engine_lock", {
      p_scope: scope,
      p_holder: holder,
    });
  }

  async loadOutcomes(): Promise<LearningOutcome[]> {
    const { data, error } = await this.db
      .from(OUTCOMES_TABLE)
      .select("id,kind,task,contributing,timestamp");
    if (error) return [];
    return ((data ?? []) as LearningOutcome[]).slice(
      0,
      NATIVE_CONFIG.outcomeLimit,
    );
  }

  async saveOutcome(outcome: LearningOutcome): Promise<void> {
    await this.db.from(OUTCOMES_TABLE).insert([
      {
        id: outcome.id,
        kind: outcome.kind,
        task: outcome.task,
        contributing: outcome.contributing,
        timestamp: outcome.timestamp,
      },
    ]);
  }
}

// ---------------------------------------------------------
// EPISODIC MEMORY + CROSS-ISOLATE COUNTERS (plan P7)
// ---------------------------------------------------------

/** Supabase-backed episodic-turn persistence. */
export class EpisodicPersistence {
  constructor(private db: SupabaseLike) {}

  /** Most recent turns across conversations (hydration
   *  happens once per isolate, at boot). */
  async loadEpisodicTurns(
    limit = NATIVE_CONFIG.episodicLimit,
  ): Promise<EpisodicTurnRow[]> {
    const { data, error } = await this.db
      .from(EPISODIC_TABLE)
      .select("id,conversation_id,role,text,turn_at");
    if (error) return [];
    const rows = (data ?? []) as EpisodicTurnRow[];
    return rows
      .sort((a, b) => (b.turn_at ?? "").localeCompare(a.turn_at ?? ""))
      .slice(0, limit);
  }

  /** Persist one turn. Best-effort: a failed write never
   *  breaks the conversation — the next turn retries. */
  async saveEpisodicTurn(turn: {
    conversationId: string;
    role: "owner" | "archie";
    text: string;
    at: number;
  }): Promise<void> {
    await this.db.from(EPISODIC_TABLE).insert([
      {
        id: `epi_${crypto.randomUUID()}`,
        conversation_id: turn.conversationId,
        role: turn.role,
        text: turn.text.slice(0, 4000),
        turn_at: new Date(turn.at).toISOString(),
      },
    ]);
  }
}

/** Cross-isolate engine counters. Read-modify-write upsert:
 *  under concurrent isolates the LAST write wins — the
 *  numbers are diagnostics, not accounting, and this is
 *  stated plainly rather than hidden behind an atomic RPC
 *  (which the structural adapter contract does not carry). */
export class CounterPersistence {
  constructor(private db: SupabaseLike) {}

  async loadCounters(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from(COUNTERS_TABLE)
      .select("key,value");
    if (error) return {};
    const out: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ key: string; value: number }>) {
      out[row.key] = Number(row.value) || 0;
    }
    return out;
  }

  async saveCounters(counters: Record<string, number>): Promise<void> {
    const rows = Object.entries(counters).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return;
    await this.db.from(COUNTERS_TABLE).upsert(rows);
  }
}
