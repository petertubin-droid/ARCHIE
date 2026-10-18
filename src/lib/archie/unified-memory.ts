// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — FRONTEND EXPORT
// src/lib/archie/unified-memory.ts
//
// Client facade for ARCHIE's Unified Memory Engine across all four
// cognitive systems: Working, Episodic, Semantic, and Long-Term.
// =========================================================

export {
  ArchieUnifiedMemoryEngine,
  WorkingMemoryEngine,
  EpisodicMemoryEngine,
  SemanticMemoryEngine,
  LongTermMemoryEngine,
  MemoryFormationEngine,
  MemoryVersioningEngine,
  MemoryContradictionEngine,
  SessionContinuityEngine,
  MemoryLearningBridge,
  SemanticMemoryBridge,
  HybridMemoryRetriever,
  MemoryConsolidationEngine,
  MemoryObservabilityEngine,
  EpisodicLongTermAssociativeMemoryEngine,
  AssociativeNetwork,
  DEFAULT_SPREADING_CONFIG,
  calculateRetention,
  calculateStability,
  computeStabilityMetrics,
  extractSalientEntities,
  rateTurnImportance,
  segmentTurnsIntoEpisodes,
  LongTermKnowledgeBridge,
} from "../../../supabase/functions/_shared/archie-ai/associative-memory/index.ts";

export type * from "../../../supabase/functions/_shared/archie-ai/associative-memory/types.ts";
