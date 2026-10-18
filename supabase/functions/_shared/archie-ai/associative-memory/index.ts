// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — PUBLIC EXPORTS
// supabase/functions/_shared/archie-ai/associative-memory/index.ts
// =========================================================

// Master unified memory engine
export { ArchieUnifiedMemoryEngine } from "./unified-engine.ts";

// Primary memory systems
export { WorkingMemoryEngine } from "./working-memory.ts";
export { EpisodicMemoryEngine } from "./episodic-memory.ts";
export { SemanticMemoryEngine } from "./semantic-memory.ts";
export { LongTermMemoryEngine } from "./long-term-memory.ts";

// Memory intelligence & lifecycle modules
export { MemoryFormationEngine } from "./memory-formation.ts";
export { MemoryVersioningEngine } from "./memory-versioning.ts";
export { MemoryContradictionEngine } from "./memory-contradiction.ts";
export { SessionContinuityEngine } from "./session-continuity.ts";
export { MemoryLearningBridge } from "./memory-learning-bridge.ts";
export { SemanticMemoryBridge } from "./semantic-memory-bridge.ts";
export { HybridMemoryRetriever } from "./hybrid-retriever.ts";
export { MemoryConsolidationEngine } from "./memory-consolidation.ts";
export { MemoryObservabilityEngine } from "./memory-observability.ts";

// Associative network & episodic segmenter (backwards-compatible)
export { EpisodicLongTermAssociativeMemoryEngine } from "./engine.ts";
export { AssociativeNetwork, DEFAULT_SPREADING_CONFIG } from "./associative-network.ts";
export {
  calculateRetention,
  calculateStability,
  computeStabilityMetrics,
  DEFAULT_BASE_HALF_LIFE_MS,
  MAX_HALF_LIFE_MS,
  MIN_RETENTION_FLOOR,
} from "./ebbinghaus-decay.ts";
export {
  extractSalientEntities,
  MAX_EPISODE_GAP_MS,
  rateTurnImportance,
  segmentTurnsIntoEpisodes,
} from "./episodic-segmenter.ts";
export { LongTermKnowledgeBridge } from "./long-term-bridge.ts";
export type * from "./types.ts";
