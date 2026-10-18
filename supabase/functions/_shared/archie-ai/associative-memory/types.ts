// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — TYPES
// supabase/functions/_shared/archie-ai/associative-memory/types.ts
//
// Unifies the four primary cognitive memory systems:
//   1. Working Memory (active context, task state, constraints)
//   2. Episodic Memory (meaningful experiences, events, outcomes)
//   3. Semantic Memory (established knowledge, concepts, lexicon)
//   4. Long-Term Memory (durable preferences, rules, durable facts)
//
// Plus memory intelligence, versioning, contradiction handling,
// session continuity, security boundaries, and observability.
// =========================================================

import type { Fact } from "../native-engine/types.ts";
import type { KnowledgeLink, KnowledgeNode, KnowledgeRelation } from "../../../../../src/lib/archie/knowledge-graph.ts";

export type MemoryRole = "owner" | "archie" | "system";

/** Four primary memory system classifications */
export type MemorySystemType = "working" | "episodic" | "semantic" | "long_term";

// ---------------------------------------------------------
// 1. WORKING MEMORY TYPES
// ---------------------------------------------------------

export type WorkingMemoryKind =
  | "instruction"
  | "active_task"
  | "constraint"
  | "intermediate_result"
  | "pending_question"
  | "decision_context";

export interface WorkingMemoryItem {
  id: string;
  kind: WorkingMemoryKind;
  content: string;
  priority: number; // 0.0 - 1.0 (1.0 = protected instruction, never evicted during task)
  taskContextId?: string;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface WorkingMemorySnapshot {
  taskContextId?: string;
  currentTask?: string;
  activeConstraints: string[];
  pendingQuestions: string[];
  instructions: string[];
  intermediateResults: Array<{ task: string; result: unknown }>;
  decisionContext: string[];
  itemCount: number;
  capacity: number;
}

// ---------------------------------------------------------
// 2. EPISODIC MEMORY TYPES
// ---------------------------------------------------------

export type EpisodicEventType =
  | "conversation"
  | "task_completion"
  | "user_decision"
  | "project_milestone"
  | "error_resolution"
  | "action_outcome";

export type MemoryProvenanceState =
  | "USER_PROVIDED"
  | "SYSTEM_OBSERVED"
  | "EXTERNALLY_VERIFIED"
  | "INFERRED"
  | "EXPERIMENTALLY_VERIFIED"
  | "ACTUAL_OUTCOME";

export type MemoryPrivacyClass =
  | "private_owner"
  | "project_shared"
  | "workspace_global"
  | "ephemeral";

export type MemoryRetentionPolicy =
  | "permanent"
  | "project_lifetime"
  | "session_only"
  | "expiring_30d"
  | "rolling_lru";

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
  userId?: string;
  projectId?: string;
  provenance?: MemoryProvenanceState;
  privacy?: MemoryPrivacyClass;
  retentionPolicy?: MemoryRetentionPolicy;
}

/** Rich episodic event with verified outcome tracking */
export interface EpisodicEventRecord {
  id: string;
  userId: string;
  projectId: string;
  conversationId: string;
  eventType: EpisodicEventType;
  timestamp: number;
  source: string;
  participants: string[];
  description: string;
  associatedEntities: string[];
  outcome?: string;
  lessonsLearned?: string[];
  confidence: number; // calibrated 0.0 - 1.0
  verificationStatus: MemoryProvenanceState;
  privacy: MemoryPrivacyClass;
  retentionPolicy: MemoryRetentionPolicy;
  metadata?: Record<string, unknown>;
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
  userId?: string;
  projectId?: string;
}

// ---------------------------------------------------------
// 3. SEMANTIC MEMORY TYPES (Knowledge Graph & Lexicon Integration)
// ---------------------------------------------------------

export type SemanticConceptCategory =
  | "concept"
  | "definition"
  | "procedure"
  | "technical_standard"
  | "relationship"
  | "user_preference";

export interface SemanticConceptRecord {
  id: string;
  name: string;
  domain: string;
  category: SemanticConceptCategory;
  definition: string;
  attributes: Record<string, unknown>;
  confidence: number;
  verificationStatus: MemoryProvenanceState;
  source: string;
  provenance: {
    createdBy: string;
    verifiedBy?: string;
    verifiedAt?: string;
  };
  relatedConceptIds: string[];
  lexiconWordId?: string;
  knowledgeNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface SemanticRelationLink {
  sourceId: string;
  targetId: string;
  relationType: KnowledgeRelation | "CONSTRAINED_BY";
  confidence: number;
  provenance: {
    createdBy: string;
    reason: string;
  };
}

// ---------------------------------------------------------
// 4. LONG-TERM MEMORY TYPES
// ---------------------------------------------------------

export type LongTermMemoryKind =
  | "user_preference"
  | "project_context"
  | "long_term_goal"
  | "operational_rule"
  | "durable_knowledge";

export interface LongTermMemoryRecord {
  id: string;
  userId: string;
  projectId: string;
  kind: LongTermMemoryKind;
  key: string;
  value: unknown;
  summary: string;
  importance: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  provenance: MemoryProvenanceState;
  privacy: MemoryPrivacyClass;
  retentionPolicy: MemoryRetentionPolicy;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------
// 5. VERSIONING & MIGRATION HISTORY
// ---------------------------------------------------------

export interface MemoryVersionRecord {
  id: string;
  memoryId: string;
  version: number;
  previousValue: unknown;
  newValue: unknown;
  changeReason: string;
  updatedBy: string;
  updatedAt: number;
  isHistoricalChange: boolean; // true = historical evolution (e.g. migration from Netlify to Vercel), false = correction
}

// ---------------------------------------------------------
// 6. CONTRADICTION & CONFLICT RESOLUTION
// ---------------------------------------------------------

export type MemoryConflictType =
  | "update"
  | "correction"
  | "historical_difference"
  | "genuine_contradiction"
  | "unreliable_source";

export interface MemoryContradictionRecord {
  id: string;
  memoryIdA: string;
  memoryIdB?: string;
  statementA: string;
  statementB: string;
  conflictType: MemoryConflictType;
  detectedAt: number;
  resolutionState: "FLAGGED_NEEDS_CLARIFICATION" | "RESOLVED_SUPERSEDED" | "RESOLVED_HISTORICAL";
  clarificationPrompt?: string;
}

// ---------------------------------------------------------
// 7. MEMORY FORMATION & DIRECTIVES
// ---------------------------------------------------------

export type ExplicitDirectiveKind =
  | "REMEMBER_THIS"
  | "FORGET_THIS"
  | "UPDATE_REMEMBERED"
  | "NO_LONGER_CORRECT"
  | "NONE";

export interface ExplicitMemoryDirective {
  kind: ExplicitDirectiveKind;
  subject?: string;
  content?: string;
  reason?: string;
  targetKey?: string;
  newValue?: string;
}

export interface MemoryFormationEvaluation {
  shouldRemember: boolean;
  system: MemorySystemType;
  importance: number;
  confidence: number;
  provenance: MemoryProvenanceState;
  privacy: MemoryPrivacyClass;
  retentionPolicy: MemoryRetentionPolicy;
  directive: ExplicitMemoryDirective;
  entities: string[];
  reasons: string[];
  sanitizedContent: string;
  isSensitiveRefused: boolean;
  refusalReason?: string;
}

// ---------------------------------------------------------
// 8. SESSION CONTINUITY
// ---------------------------------------------------------

export interface SessionContinuityState {
  userId: string;
  projectId: string;
  conversationId: string;
  lastMilestone?: string;
  unresolvedTasks: string[];
  activeConstraints: string[];
  lastCompletedWork: string[];
  proposedWork: string[];
  continuitySummary: string;
  needsClarification: boolean;
  candidateProjects?: string[];
  recoveredAt: number;
}

// ---------------------------------------------------------
// 9. HYBRID RETRIEVAL & OBSERVABILITY
// ---------------------------------------------------------

export interface HybridRetrievalFilter {
  userId?: string;
  projectId?: string;
  systems?: MemorySystemType[];
  privacyLevels?: MemoryPrivacyClass[];
  minConfidence?: number;
  minImportance?: number;
  since?: number;
  until?: number;
  now?: number;
}

export interface HybridRecallOptions extends AssociativeRecallOptions {
  userId?: string;
  projectId?: string;
  filter?: HybridRetrievalFilter;
  taskContextId?: string;
}

export interface MemoryMatch<T> {
  item: T;
  score: number;
  system: MemorySystemType;
  matchReasons: string[];
}

export interface UnifiedRecallResult {
  query: string;
  workingContext: WorkingMemorySnapshot;
  matchedTurns: Array<{ turn: EpisodicTurnRecord; score: number }>;
  matchedEvents: Array<{ event: EpisodicEventRecord; score: number }>;
  associatedEpisodes: AssociatedEpisodeResult[];
  semanticConcepts: Array<{ concept: SemanticConceptRecord; score: number }>;
  associatedFacts: AssociatedFactResult[];
  longTermMemories: Array<{ record: LongTermMemoryRecord; score: number }>;
  narrativeContext: string;
  sanitizedContextBoundary: string;
  diagnostics: {
    activatedNodesCount: number;
    spreadHops: number;
    executionTimeMs: number;
    systemsQueried: MemorySystemType[];
  };
}

export interface UnifiedMemoryDiagnostics {
  counts: {
    workingItems: number;
    episodicTurns: number;
    episodicEvents: number;
    episodes: number;
    semanticConcepts: number;
    longTermRecords: number;
    contradictions: number;
    versions: number;
  };
  storageFootprintBytes: number;
  retrievalLatencyMs: {
    min: number;
    max: number;
    avg: number;
  };
  consolidationStats: {
    duplicatesMerged: number;
    conflictsDetected: number;
    prunedExpired: number;
    lastConsolidatedAt?: number;
  };
  securityStats: {
    secretSanitizations: number;
    promptInjectionsBlocked: number;
    unauthorizedAccessBlocked: number;
  };
}

// ---------------------------------------------------------
// 10. ASSOCIATIVE GRAPH TYPES (Backward compatible)
// ---------------------------------------------------------

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
