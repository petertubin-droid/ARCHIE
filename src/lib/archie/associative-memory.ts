// =========================================================
// ARCHIE ASSOCIATIVE MEMORY ENGINE — FRONTEND & SHARED EXPORT
// src/lib/archie/associative-memory.ts
//
// Client facade and direct exports for the Episodic & Long-Term
// Associative Memory Engine.
// =========================================================

export {
  EpisodicLongTermAssociativeMemoryEngine,
  AssociativeNetwork,
  DEFAULT_SPREADING_CONFIG,
  calculateRetention,
  calculateStability,
  computeStabilityMetrics,
  DEFAULT_BASE_HALF_LIFE_MS,
  MAX_HALF_LIFE_MS,
  MIN_RETENTION_FLOOR,
  extractSalientEntities,
  MAX_EPISODE_GAP_MS,
  rateTurnImportance,
  segmentTurnsIntoEpisodes,
  LongTermKnowledgeBridge,
} from "../../../supabase/functions/_shared/archie-ai/associative-memory/index.ts";

export type * from "../../../supabase/functions/_shared/archie-ai/associative-memory/types.ts";
