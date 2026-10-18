// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — CLIENT INTERFACE
// src/lib/archie/advanced-learning.ts
//
// Client-side entry point and presentation adapter for the
// ARCHIE Advanced Unified Learning Engine. Exposes the
// 10-stage learning lifecycle, evidence validation, novelty
// detection, pattern recognition, procedural skills, error
// correction, temporal decay, cross-domain safety, and Owner Authority.
// =========================================================

import {
  AdvancedUnifiedLearningEngine,
  normalizeLearningInput,
  validateEvidence,
  assessNovelty,
  PatternRecognitionEngine,
  ProceduralSkillLearner,
  ErrorCorrectionLearner,
  TemporalKnowledgeManager,
  CrossDomainLearner,
  LearningEvaluator,
  OwnerAuthorityGuard,
  LearningPersistenceStore,
} from "@studio-shared/archie-ai/learning/index.ts";
import type {
  LearningInput,
  ExtractedKnowledgeItem,
  LearningBatchResult,
  EvaluationMetricReport,
  EvidenceState,
  LearnedPattern,
  ProceduralSkill,
  ErrorCorrectionRecord,
  LearningPersistenceStatus,
  RollbackResult,
} from "@studio-shared/archie-ai/learning/index.ts";

export {
  AdvancedUnifiedLearningEngine,
  normalizeLearningInput,
  validateEvidence,
  assessNovelty,
  PatternRecognitionEngine,
  ProceduralSkillLearner,
  ErrorCorrectionLearner,
  TemporalKnowledgeManager,
  CrossDomainLearner,
  LearningEvaluator,
  OwnerAuthorityGuard,
  LearningPersistenceStore,
};

export type {
  LearningInput,
  ExtractedKnowledgeItem,
  LearningBatchResult,
  EvaluationMetricReport,
  EvidenceState,
  LearnedPattern,
  ProceduralSkill,
  ErrorCorrectionRecord,
  LearningPersistenceStatus,
  RollbackResult,
};

/**
 * Convenience factory for instantiating the Unified Learning Engine.
 */
export function createAdvancedUnifiedLearningEngine(
  config?: Record<string, unknown>,
  persistenceStore?: LearningPersistenceStore,
): AdvancedUnifiedLearningEngine {
  return new AdvancedUnifiedLearningEngine(config, persistenceStore);
}
