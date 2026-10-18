// =========================================================
// ARCHIE ASSOCIATIVE MEMORY ENGINE — PUBLIC EXPORTS
// supabase/functions/_shared/archie-ai/associative-memory/index.ts
// =========================================================

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
