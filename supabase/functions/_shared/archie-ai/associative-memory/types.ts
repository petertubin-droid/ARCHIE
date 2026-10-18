// =========================================================
// ARCHIE EPISODIC & LONG-TERM ASSOCIATIVE MEMORY ENGINE
// supabase/functions/_shared/archie-ai/associative-memory/types.ts
//
// Types for episode clustering, Hebbian associative networks,
// spreading activation, and long-term knowledge bridging.
// =========================================================

import type { Fact } from "../native-engine/types.ts";

export type MemoryRole = "owner" | "archie" | "system";

/** A single episodic turn captured in the episodic buffer. */
export interface EpisodicTurnRecord {
  id: string;
  conversationId: string;
  role: MemoryRole;
  text: string;
  timestamp: number;
  episodeId?: string;
  entities: string[];
  importance: number; // 0.0 - 1.0
  accessCount: number;
  lastAccessedAt: number;
}

/** An aggregated episode: a coherent event or conversational session segment. */
export interface Episode {
  id: string;
  title: string;
  summary: string;
  conversationId: string;
  startedAt: number;
  endedAt: number;
  turnIds: string[];
  primaryEntities: string[];
  topicTags: string[];
  importance: number; // 0.0 - 1.0
  retrievalCount: number;
  lastRetrievedAt: number;
  precedingEpisodeId?: string;
  succeedingEpisodeId?: string;
}

export type AssociativeNodeKind =
  | "concept"
  | "entity"
  | "episode"
  | "fact"
  | "turn";

export type AssociativeEdgeKind =
  | "co_occurrence"
  | "semantic_similarity"
  | "causal_temporal"
  | "context_sharing"
  | "entity_relation";

export interface AssociativeNode {
  id: string;
  label: string;
  kind: AssociativeNodeKind;
  activation: number;
  baselineActivation: number;
  lastActivatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface AssociativeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: AssociativeEdgeKind;
  weight: number; // 0.0 - 1.0
  coOccurrenceCount: number;
  lastReinforcedAt: number;
  decayRate: number;
}

export interface SpreadingActivationConfig {
  decayFactor: number; // e.g. 0.6 per hop
  activationThreshold: number; // e.g. 0.15
  maxHops: number; // e.g. 3 hops
  firingCap: number; // e.g. 30 nodes
  retentionWindowMs?: number;
}

export interface AssociativeRecallOptions {
  limitEpisodes?: number;
  limitFacts?: number;
  limitTurns?: number;
  minActivation?: number;
  maxHops?: number;
  now?: number;
  includeExplanations?: boolean;
}

export interface AssociatedEntity {
  entity: string;
  activation: number;
  path: string[];
}

export interface AssociatedEpisodeResult {
  episode: Episode;
  activation: number;
  explanation: string;
  turns: EpisodicTurnRecord[];
}

export interface AssociatedFactResult {
  fact: Fact;
  activation: number;
  explanation: string;
}

export interface AssociativeRecallResult {
  query: string;
  directTurnMatches: Array<{ turn: EpisodicTurnRecord; score: number }>;
  associatedEpisodes: AssociatedEpisodeResult[];
  associatedFacts: AssociatedFactResult[];
  associatedEntities: AssociatedEntity[];
  narrativeContext: string;
  diagnostics: {
    activatedNodesCount: number;
    spreadHops: number;
    executionTimeMs: number;
  };
}

export interface MemoryStabilityMetrics {
  retentionScore: number; // 0.0 - 1.0
  halfLifeDays: number;
  repetitionBoost: number;
}

export interface AssociativeNetworkStats {
  nodeCount: number;
  edgeCount: number;
  episodeCount: number;
  turnCount: number;
  averageDegree: number;
  mostConnectedEntities: Array<{ label: string; degree: number }>;
}
