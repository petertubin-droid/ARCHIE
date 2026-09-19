// =========================================================
// FRELUX AI FOUNDATION, public entry point
//
// One import surface for every AI capability:
//   import { aiFoundation } from '@/lib/ai-foundation';
//
// Everything else in this folder is internal. The orchestration
// layer (orchestrator.ts) is the single coordinator, do not add
// parallel AI systems for individual features.
// =========================================================

export * from "./types";
export * from "./trust";
export {
  executeEngine,
  listEngines,
  getEngineDescriptor,
  EngineNotRegisteredError,
  defaultBuildToRoofInput,
  type EngineDescriptor,
} from "./engines-registry";
export {
  resolveRequirements,
  buildEngineInput,
  TASK_REQUIREMENTS,
  engineExistsForTask,
  type RequirementResolution,
} from "./requirements";
export {
  interpretRequest,
  planTask,
  runTask,
  type TaskRunOutcome,
} from "./orchestrator";
export { compareScenarios } from "./scenario-engine";
export {
  AGENT_REGISTRY,
  FORBIDDEN_AGENT_ACTIONS,
  evaluateAgentAction,
  getAgent,
  recordAgentEvent,
  flushLocalAuditQueue,
} from "./agents";
export {
  assessPredictionReadiness,
  assertPredictionAllowed,
  predictionReadinessMessage,
  PREDICTION_REQUIREMENTS,
} from "./predictions";
export { interpretWithAi } from "./copilot-client";
export {
  answerProjectRiskQuestion,
  type RiskAnswer,
  type RiskAnswerResult,
  type RiskAnswerUnavailable,
} from "./risk-answers";
export {
  classifyPropertyQuestion,
  answerPropertyQuestion,
  comparePropertyReports,
  type PropertyQuestionKind,
} from "./property-answers";

import { interpretRequest, planTask, runTask } from "./orchestrator";
import { compareScenarios } from "./scenario-engine";
import { executeEngine } from "./engines-registry";
import { evaluateAgentAction, recordAgentEvent } from "./agents";
import {
  assessPredictionReadiness,
  assertPredictionAllowed,
  predictionReadinessMessage,
} from "./predictions";
import { interpretWithAi } from "./copilot-client";

/**
 * The single AI orchestration surface of FRELUX.
 * AI features never talk to engines or the database directly.
 */
export const aiFoundation = {
  interpret: interpretRequest,
  interpretWithAi,
  plan: planTask,
  run: runTask,
  compareScenarios,
  executeEngine,
  agents: {
    evaluate: evaluateAgentAction,
    record: recordAgentEvent,
  },
  predictions: {
    readiness: assessPredictionReadiness,
    assertAllowed: assertPredictionAllowed,
    message: predictionReadinessMessage,
  },
} as const;
