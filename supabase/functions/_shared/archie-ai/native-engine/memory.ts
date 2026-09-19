// =========================================================
// ARCHIE NATIVE ENGINE — CONTEXT & WORKING MEMORY
//
// Real context management: conversation turns are vectorized
// with the shared TF-IDF index and retrieved by salience
// (relevance × recency). No external embedding API — the
// vectors are computed in-engine.
// =========================================================

import { TfIdfIndex, cosine, memoryTurnFromText, tokenize } from "./nlu.ts";
import type { Fact, RetrievedContext } from "./types.ts";
import { FACT_RELEVANCE_FLOOR } from "./knowledge.ts";

/** Validated-fact salience source (benchmark mr-3, reopened
 *  by owner directive 2026-09-16). ContextMemory NEVER mints
 *  fact candidates from turns — the old G-1 removal reason
 *  stands. Instead, when a real (gated-path) fact store is
 *  attached, retrieval surfaces its VALIDATED facts that
 *  clear the measured relevance floor. No minting, no
 *  validation-skirting: only knowledge that already earned
 *  "validated" status through owner teaching, research
 *  ingestion, or verified inference is surfaced. */
export interface FactSalienceSource {
  rankScored(query: string, k?: number): Array<{ fact: Fact; score: number }>;
}

export class ContextMemory {
  // Three buffers prevent DUPLICATE memories: `seeded` is the
  // authoritative conversation history and is REPLACED
  // wholesale on every seedFromTurns call (the engine
  // re-seeds each request); `live` holds turns added during
  // this session; `episodic` (plan P7) holds turns hydrated
  // ONCE from the episodic persistence table — prior-session
  // context that survives isolates and is never replaced by
  // per-request seeding. Retrieval ranks all three.
  private seeded: MemoryTurnInternal[] = [];
  private live: MemoryTurnInternal[] = [];
  private episodic: MemoryTurnInternal[] = [];
  private index = new TfIdfIndex();
  private factSource: FactSalienceSource | null = null;

  /** Attach the real FactStore (engine wiring). Only
   *  validated, floor-clearing facts surface in salientFacts
   *  — see FactSalienceSource. */
  attachFactSource(source: FactSalienceSource): void {
    this.factSource = source;
  }

  /** Hydrate prior-session turns (plan P7). Called once at
   *  boot; idempotent — a second call replaces the episodic
   *  buffer wholesale (it is external state, not session
   *  accumulation), never duplicates. */
  hydrateEpisodic(
    turns: Array<{ role: "owner" | "archie"; text: string; at: number }>,
  ): void {
    this.episodic = turns.map((t) =>
      memoryTurnFromText(t.role, t.text, this.index, t.at),
    );
  }

  episodicSize(): number {
    return this.episodic.length;
  }

  addTurn(role: "owner" | "archie", text: string, at = Date.now()): void {
    this.live.push(memoryTurnFromText(role, text, this.index, at));
  }

  /** The last n turns across seeded + live history, in
   *  chronological order (oldest → newest). Feeds the NLU
   *  anaphora resolver (audit L.5). */
  recentTurns(n: number): Array<{ role: "owner" | "archie"; text: string }> {
    const all = [...this.seeded, ...this.live];
    return all.slice(Math.max(0, all.length - n)).map((t) => ({
      role: t.role,
      text: t.text,
    }));
  }

  /** Seed from provider-neutral conversation turns. Replaces
   *  the previous seed — never accumulates duplicates when
   *  the caller re-seeds the same history each request. */
  seedFromTurns(
    turns: Array<{ role: "owner" | "archie"; text: string }>,
  ): void {
    const now = Date.now();
    this.seeded = turns.map((t, i) =>
      memoryTurnFromText(
        t.role,
        t.text,
        this.index,
        now - (turns.length - i) * 60_000,
      ),
    );
  }

  size(): number {
    return this.seeded.length + this.live.length;
  }

  /** Count including hydrated episodic context — used by
   *  diagnostics to report system-wide memory, not just the
   *  current isolate's buffers (plan P7). */
  sizeWithEpisodic(): number {
    return this.seeded.length + this.live.length + this.episodic.length;
  }

  /** Salience = cosine(relevance) + recency decay. Real math. */
  retrieve(query: string, k = 4, now = Date.now()): RetrievedContext {
    const qv = this.index.vectorize(tokenize(query));
    // Session turns (seeded/live) decay over 24h; episodic
    // turns from PRIOR sessions use a 30-day horizon — the
    // whole point of episodic persistence is that context
    // survives across sessions (plan P7).
    const sessionHorizon = 1000 * 60 * 60 * 24;
    const episodicHorizon = 1000 * 60 * 60 * 24 * 30;
    const weight = (turn: MemoryTurnInternal, horizon: number) => {
      const relevance = cosine(qv, turn.vector);
      const ageMs = Math.max(0, now - turn.at);
      const recency = Math.max(0, 1 - ageMs / horizon);
      return { turn, relevance, salience: relevance * 0.7 + recency * 0.3 };
    };
    const ranked = [
      ...this.seeded.map((t) => weight(t, sessionHorizon)),
      ...this.live.map((t) => weight(t, sessionHorizon)),
      ...this.episodic.map((t) => weight(t, episodicHorizon)),
    ]
      .filter((r) => r.salience > 0)
      .sort((a, b) => b.salience - a.salience);
    // VALIDATED-FACT SALIENCE (G-1 reopened by owner
    // directive 2026-09-16, benchmark mr-3): the old minting
    // path stays dead — memory NEVER promotes turns into
    // knowledge. When the engine attaches the real FactStore,
    // retrieval surfaces VALIDATED facts that clear the
    // measured relevance floor (knowledge that earned its
    // status through the gated paths: owner teaching,
    // cross-checked research ingestion, verified inference).
    // salientFacts stays [] for a store-less ContextMemory —
    // the honest no-facts case.
    const salientFacts: Fact[] = this.factSource
      ? this.factSource
          .rankScored(query, k)
          .filter(
            (r) =>
              r.fact.status === "validated" && r.score >= FACT_RELEVANCE_FLOOR,
          )
          .slice(0, Math.max(1, Math.floor(k / 2)))
          .map((r) => r.fact)
      : [];

    return {
      salientTurns: ranked
        .slice(0, k)
        .map((r) => ({ ...r.turn, relevance: r.relevance })),
      salientFacts,
    };
  }
}

interface MemoryTurnInternal {
  role: "owner" | "archie";
  text: string;
  at: number;
  vector: Map<string, number>;
}

// Re-export for the engine's public typing.
export type { MemoryTurnInternal };

/** Rank knowledge facts against a query — TF-IDF over the
 *  fact's textual surface.
 *
 * FIX 46 (batch 14, Level 10 audit 2026-09-13): this was a
 * SECOND, independent TF-IDF ranking implementation beside
 * the production FactRankIndex (cached, inverted-index
 * narrowed, fused scoring). rankFacts itself has no
 * production callers — but the forensic ranking tests
 * validated THIS copy while converse() ranked through the
 * OTHER one: the tests could stay green while the two
 * rankers drifted apart. It now delegates to the exact
 * production implementation, so tests exercise what runs. */
import { FactRankIndex } from "./knowledge.ts";
import { NATIVE_CONFIG } from "./config.ts";

export function rankFacts(
  query: string,
  facts: Fact[],
  k = NATIVE_CONFIG.rankK,
): Fact[] {
  const index = new FactRankIndex();
  index.rebuild(facts);
  return index.rank(query, k);
}
