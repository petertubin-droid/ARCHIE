// =========================================================
// ARCHIE ASSOCIATIVE MEMORY — LONG-TERM KNOWLEDGE BRIDGE
// supabase/functions/_shared/archie-ai/associative-memory/long-term-bridge.ts
//
// Bridges episodic memory records with the verified FactStore
// (SPO facts). Enables bi-directional association between
// conversational episodes and established long-term knowledge.
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import { AssociativeNetwork } from "./associative-network.ts";
import type { Episode, EpisodicTurnRecord } from "./types.ts";

export class LongTermKnowledgeBridge {
  constructor(private network: AssociativeNetwork) {}

  /**
   * Projects validated long-term facts into the associative graph.
   * Only ACTIVE and VALIDATED facts are mapped; uncertain or refuted
   * facts are excluded from associative activation.
   */
  indexFacts(facts: Fact[]): void {
    for (const fact of facts) {
      if (fact.status !== "validated") continue;

      const factNodeId = `fact:${fact.id}`;
      this.network.addOrGetNode(factNodeId, `${fact.subject} ${fact.predicate} ${fact.object}`, "fact", {
        factId: fact.id,
        confidence: fact.confidence,
        provenance: fact.provenance,
      });

      // Index subject and object entity nodes
      const subjNodeId = `entity:${fact.subject.toLowerCase()}`;
      const objStr = String(fact.object).toLowerCase();
      const objNodeId = `concept:${objStr}`;

      this.network.addOrGetNode(subjNodeId, fact.subject.toLowerCase(), "entity");
      this.network.addOrGetNode(objNodeId, objStr, "concept");

      // Reinforce links
      this.network.reinforceEdge(factNodeId, subjNodeId, "entity_relation", 0.85);
      this.network.reinforceEdge(subjNodeId, objNodeId, "semantic_similarity", 0.75);

      // If qualifiers contain relevant entities, link them too
      if (fact.qualifiers && typeof fact.qualifiers === "object") {
        for (const [k, v] of Object.entries(fact.qualifiers)) {
          if (v && typeof v === "string") {
            const qualNodeId = `concept:${v.toLowerCase()}`;
            this.network.addOrGetNode(qualNodeId, v.toLowerCase(), "concept");
            this.network.reinforceEdge(subjNodeId, qualNodeId, "context_sharing", 0.6);
          }
        }
      }
    }
  }

  /**
   * Projects episodes and their contained turns into the associative network.
   */
  indexEpisodes(episodes: Episode[], turns: EpisodicTurnRecord[]): void {
    const turnsById = new Map(turns.map((t) => [t.id, t]));

    for (const ep of episodes) {
      const epNodeId = `episode:${ep.id}`;
      this.network.addOrGetNode(epNodeId, ep.title, "episode", {
        episodeId: ep.id,
        startedAt: ep.startedAt,
        importance: ep.importance,
      });

      // Link episode to its primary entities
      for (const ent of ep.primaryEntities) {
        const entNodeId = `entity:${ent.toLowerCase()}`;
        this.network.addOrGetNode(entNodeId, ent.toLowerCase(), "entity");
        this.network.reinforceEdge(epNodeId, entNodeId, "co_occurrence", 0.8);
      }

      // Link consecutive episodes (causal / temporal flow)
      if (ep.precedingEpisodeId) {
        const precNodeId = `episode:${ep.precedingEpisodeId}`;
        if (this.network.getNode(precNodeId)) {
          this.network.reinforceEdge(precNodeId, epNodeId, "causal_temporal", 0.7);
        }
      }

      // Link turns within episode
      for (const turnId of ep.turnIds) {
        const turn = turnsById.get(turnId);
        if (!turn) continue;

        const turnNodeId = `turn:${turn.id}`;
        this.network.addOrGetNode(turnNodeId, turn.text.slice(0, 60), "turn", {
          turnId: turn.id,
          role: turn.role,
          timestamp: turn.timestamp,
        });

        this.network.reinforceEdge(epNodeId, turnNodeId, "context_sharing", 0.75);

        // Link turn to entities it mentions
        for (const ent of turn.entities) {
          const entNodeId = `entity:${ent.toLowerCase()}`;
          this.network.reinforceEdge(turnNodeId, entNodeId, "co_occurrence", 0.65);
        }
      }
    }
  }
}
