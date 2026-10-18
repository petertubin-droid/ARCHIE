// =========================================================
// ARCHIE EPISODIC & LONG-TERM ASSOCIATIVE MEMORY ENGINE
// supabase/functions/_shared/archie-ai/associative-memory/engine.ts
//
// Unifies:
//   1. Episodic segmentation & temporal event clustering
//   2. Ebbinghaus memory stability & retention curves
//   3. Hebbian associative link reinforcement
//   4. Multi-hop spreading activation retrieval
//   5. Long-term verified FactStore bridging
//
// 100% deterministic, provider-independent, zero external LLMs.
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import { tokenize } from "../native-engine/nlu.ts";
import { AssociativeNetwork } from "./associative-network.ts";
import { computeStabilityMetrics } from "./ebbinghaus-decay.ts";
import {
  extractSalientEntities,
  rateTurnImportance,
  segmentTurnsIntoEpisodes,
} from "./episodic-segmenter.ts";
import { LongTermKnowledgeBridge } from "./long-term-bridge.ts";
import type {
  AssociatedEntity,
  AssociatedEpisodeResult,
  AssociatedFactResult,
  AssociativeRecallOptions,
  AssociativeRecallResult,
  Episode,
  EpisodicTurnRecord,
  MemoryRole,
} from "./types.ts";

/** Secret detection patterns to prevent storing keys in memory */
const SENSITIVE_PATTERN =
  /\b(sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|bearer\s+[a-zA-Z0-9._-]{20,}|password\s*[:=]\s*[^\s]+)\b/i;

export class EpisodicLongTermAssociativeMemoryEngine {
  private network = new AssociativeNetwork();
  private bridge: LongTermKnowledgeBridge;
  private turns: EpisodicTurnRecord[] = [];
  private episodes: Episode[] = [];
  private factsById = new Map<string, Fact>();
  private turnsById = new Map<string, EpisodicTurnRecord>();
  private episodesById = new Map<string, Episode>();

  constructor() {
    this.bridge = new LongTermKnowledgeBridge(this.network);
  }

  /**
   * Hydrates memory in bulk from episodic turns and long-term facts.
   * Can be called repeatedly; rebuilds clean associative graph.
   */
  hydrate(
    rawTurns: Array<{
      id?: string;
      conversationId?: string;
      role: MemoryRole;
      text: string;
      timestamp?: number;
      turn_at?: string;
    }>,
    facts: Fact[] = [],
  ): void {
    this.network.clear();
    this.turns = [];
    this.turnsById.clear();
    this.episodesById.clear();
    this.factsById.clear();

    for (const f of facts) {
      this.factsById.set(f.id, f);
    }

    // Convert raw turns
    for (let i = 0; i < rawTurns.length; i++) {
      const r = rawTurns[i];
      if (SENSITIVE_PATTERN.test(r.text)) continue; // Never store secrets

      const ts =
        r.timestamp ??
        (r.turn_at ? Date.parse(r.turn_at) : Date.now() - (rawTurns.length - i) * 60_000);

      const turnId = r.id || `turn_${ts}_${i}`;
      const entities = extractSalientEntities(r.text);
      const importance = rateTurnImportance(r.text);

      const record: EpisodicTurnRecord = {
        id: turnId,
        conversationId: r.conversationId || "default",
        role: r.role,
        text: r.text,
        timestamp: ts,
        entities,
        importance,
        accessCount: 1,
        lastAccessedAt: ts,
      };

      this.turns.push(record);
      this.turnsById.set(turnId, record);
    }

    // Segment into episodes
    this.episodes = segmentTurnsIntoEpisodes(this.turns);
    for (const ep of this.episodes) {
      this.episodesById.set(ep.id, ep);
    }

    // Build associative graph
    this.bridge.indexFacts(facts);
    this.bridge.indexEpisodes(this.episodes, this.turns);

    // Hebbian entity co-occurrence reinforcement across turns
    this.reinforceEntityAssociations();
  }

  /**
   * Ingests a single conversation turn into episodic memory.
   */
  ingestTurn(turn: {
    id?: string;
    conversationId?: string;
    role: MemoryRole;
    text: string;
    timestamp?: number;
  }): { recorded: boolean; reason?: string } {
    if (SENSITIVE_PATTERN.test(turn.text)) {
      return { recorded: false, reason: "refused: input contains sensitive secrets/credentials" };
    }

    const ts = turn.timestamp ?? Date.now();
    const turnId = turn.id || `turn_${ts}_${crypto.randomUUID().slice(0, 8)}`;
    const entities = extractSalientEntities(turn.text);
    const importance = rateTurnImportance(turn.text);

    const record: EpisodicTurnRecord = {
      id: turnId,
      conversationId: turn.conversationId || "default",
      role: turn.role,
      text: turn.text,
      timestamp: ts,
      entities,
      importance,
      accessCount: 1,
      lastAccessedAt: ts,
    };

    this.turns.push(record);
    this.turnsById.set(turnId, record);

    // Re-segment and update network
    this.episodes = segmentTurnsIntoEpisodes(this.turns, turn.conversationId || "default");
    this.episodesById.clear();
    for (const ep of this.episodes) {
      this.episodesById.set(ep.id, ep);
    }

    // Re-index into associative network
    this.bridge.indexEpisodes(this.episodes, this.turns);
    this.reinforceEntityAssociations();

    return { recorded: true };
  }

  /**
   * Performs multi-hop Associative Recall:
   * 1. Query entity and concept extraction
   * 2. Direct lexical / TF-IDF turn matching
   * 3. Spreading activation through the associative graph
   * 4. Ebbinghaus retention weighting
   * 5. Synthesis of narrative context
   */
  recall(
    query: string,
    options: AssociativeRecallOptions = {},
  ): AssociativeRecallResult {
    const startTime = Date.now();
    const now = options.now ?? Date.now();
    const maxHops = options.maxHops ?? 3;
    const minActivation = options.minActivation ?? 0.15;
    const limitEpisodes = options.limitEpisodes ?? 3;
    const limitFacts = options.limitFacts ?? 3;
    const limitTurns = options.limitTurns ?? 4;

    const queryTokens = tokenize(query);
    const queryEntities = extractSalientEntities(query);

    // 1. Direct turn matches based on token overlap + recency
    const directTurnMatches = this.findDirectTurnMatches(queryTokens, queryEntities, limitTurns, now);

    // 2. Identify seed nodes for spreading activation
    const seedNodes: Array<{ nodeId: string; initialActivation: number }> = [];

    for (const ent of queryEntities) {
      const entNodeId = `entity:${ent.toLowerCase()}`;
      if (this.network.getNode(entNodeId)) {
        seedNodes.push({ nodeId: entNodeId, initialActivation: 1.0 });
      }
    }

    for (const tok of queryTokens) {
      if (tok.length > 3) {
        const conceptNodeId = `concept:${tok.toLowerCase()}`;
        if (this.network.getNode(conceptNodeId)) {
          seedNodes.push({ nodeId: conceptNodeId, initialActivation: 0.8 });
        }
      }
    }

    // If direct turns matched strongly, add them as seeds too
    for (const match of directTurnMatches.slice(0, 2)) {
      seedNodes.push({ nodeId: `turn:${match.turn.id}`, initialActivation: 0.75 });
    }

    // 3. Spread activation
    const activationMap = this.network.spreadActivation(seedNodes, {
      maxHops,
      activationThreshold: minActivation,
    });

    // 4. Collect and rank associated episodes
    const associatedEpisodes: AssociatedEpisodeResult[] = [];
    for (const [nodeId, data] of activationMap.entries()) {
      if (nodeId.startsWith("episode:")) {
        const episodeId = nodeId.slice("episode:".length);
        const ep = this.episodesById.get(episodeId);
        if (ep) {
          // Modulate activation by Ebbinghaus retention and episode importance
          const stability = computeStabilityMetrics(ep.endedAt, ep.retrievalCount + 1, ep.importance, now);
          const finalScore = data.activation * 0.7 + stability.retentionScore * 0.3;

          const episodeTurns = ep.turnIds
            .map((tid) => this.turnsById.get(tid))
            .filter(Boolean) as EpisodicTurnRecord[];

          associatedEpisodes.push({
            episode: ep,
            activation: Math.round(finalScore * 100) / 100,
            explanation: `Recalled via association path: ${data.path.join(" → ")}`,
            turns: episodeTurns,
          });

          // Mark access
          ep.retrievalCount += 1;
          ep.lastRetrievedAt = now;
        }
      }
    }
    associatedEpisodes.sort((a, b) => b.activation - a.activation);

    // 5. Collect and rank associated facts
    const associatedFacts: AssociatedFactResult[] = [];
    for (const [nodeId, data] of activationMap.entries()) {
      if (nodeId.startsWith("fact:")) {
        const factId = nodeId.slice("fact:".length);
        const fact = this.factsById.get(factId);
        if (fact && fact.status === "validated") {
          associatedFacts.push({
            fact,
            activation: Math.round(data.activation * 100) / 100,
            explanation: `Connected via knowledge path: ${data.path.join(" → ")}`,
          });
        }
      }
    }
    associatedFacts.sort((a, b) => b.activation - a.activation);

    // 6. Collect associated entities
    const associatedEntities: AssociatedEntity[] = [];
    for (const [nodeId, data] of activationMap.entries()) {
      if (nodeId.startsWith("entity:") || nodeId.startsWith("concept:")) {
        const node = this.network.getNode(nodeId);
        if (node && !queryEntities.includes(node.label)) {
          associatedEntities.push({
            entity: node.label,
            activation: Math.round(data.activation * 100) / 100,
            path: data.path,
          });
        }
      }
    }
    associatedEntities.sort((a, b) => b.activation - a.activation);

    // 7. Synthesize narrative memory context
    const narrativeContext = this.synthesizeNarrativeContext(
      directTurnMatches.map((m) => m.turn),
      associatedEpisodes.slice(0, limitEpisodes),
      associatedFacts.slice(0, limitFacts),
      associatedEntities.slice(0, 4),
    );

    const executionTimeMs = Date.now() - startTime;

    return {
      query,
      directTurnMatches: directTurnMatches.slice(0, limitTurns),
      associatedEpisodes: associatedEpisodes.slice(0, limitEpisodes),
      associatedFacts: associatedFacts.slice(0, limitFacts),
      associatedEntities: associatedEntities.slice(0, 6),
      narrativeContext,
      diagnostics: {
        activatedNodesCount: activationMap.size,
        spreadHops: maxHops,
        executionTimeMs,
      },
    };
  }

  getDiagnostics() {
    return {
      networkStats: this.network.getStats(),
      totalTurns: this.turns.length,
      totalEpisodes: this.episodes.length,
      totalFactsIndexed: this.factsById.size,
    };
  }

  private findDirectTurnMatches(
    queryTokens: string[],
    queryEntities: string[],
    limit: number,
    now: number,
  ): Array<{ turn: EpisodicTurnRecord; score: number }> {
    const qTokenSet = new Set(queryTokens);
    const qEntitySet = new Set(queryEntities.map((e) => e.toLowerCase()));
    const scored: Array<{ turn: EpisodicTurnRecord; score: number }> = [];

    for (const turn of this.turns) {
      let matchCount = 0;
      const turnTokens = tokenize(turn.text);

      for (const t of turnTokens) {
        if (qTokenSet.has(t)) matchCount += 1;
      }
      for (const ent of turn.entities) {
        if (qEntitySet.has(ent.toLowerCase())) matchCount += 3;
      }

      if (matchCount > 0) {
        const relevance = Math.min(1.0, matchCount / Math.max(3, queryTokens.length));
        const stability = computeStabilityMetrics(turn.timestamp, turn.accessCount, turn.importance, now);
        const score = relevance * 0.7 + stability.retentionScore * 0.3;

        scored.push({ turn, score });
        turn.accessCount += 1;
        turn.lastAccessedAt = now;
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private reinforceEntityAssociations(): void {
    // Entities that co-occur in the same turn or episode form Hebbian associations
    for (const turn of this.turns) {
      if (turn.entities.length >= 2) {
        for (let i = 0; i < turn.entities.length; i++) {
          for (let j = i + 1; j < turn.entities.length; j++) {
            const idA = `entity:${turn.entities[i].toLowerCase()}`;
            const idB = `entity:${turn.entities[j].toLowerCase()}`;
            if (idA !== idB && this.network.getNode(idA) && this.network.getNode(idB)) {
              this.network.reinforceEdge(idA, idB, "co_occurrence", 0.15, turn.timestamp);
            }
          }
        }
      }
    }
  }

  private synthesizeNarrativeContext(
    directTurns: EpisodicTurnRecord[],
    episodes: AssociatedEpisodeResult[],
    facts: AssociatedFactResult[],
    entities: AssociatedEntity[],
  ): string {
    const sections: string[] = [];

    if (facts.length > 0) {
      const factLines = facts.map((f) => `- ${f.fact.subject} ${f.fact.predicate} ${f.fact.object} (provenance: ${f.fact.provenance?.source ?? "verified"})`);
      sections.push(`[Verified Long-Term Knowledge]\n${factLines.join("\n")}`);
    }

    if (episodes.length > 0) {
      const epLines = episodes.map((e) => `- ${e.episode.title}: "${e.episode.summary}" [${e.explanation}]`);
      sections.push(`[Relevant Conversational Episodes]\n${epLines.join("\n")}`);
    }

    if (directTurns.length > 0) {
      const turnLines = directTurns.slice(0, 2).map((t) => `- (${t.role}): "${t.text}"`);
      sections.push(`[Direct Memory Recalls]\n${turnLines.join("\n")}`);
    }

    if (entities.length > 0) {
      const entStr = entities.map((e) => `${e.entity} (${e.activation.toFixed(2)})`).join(", ");
      sections.push(`[Associated Concepts]: ${entStr}`);
    }

    return sections.join("\n\n");
  }
}
