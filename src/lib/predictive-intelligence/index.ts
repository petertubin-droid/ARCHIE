// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, PUBLIC API
//
// Phase 4: Predictive Construction Intelligence.
// "What is required?" → "What is likely to happen?", with
// evidence, confidence, freshness and honest INSUFFICIENT DATA.
// =========================================================

export * from "./types";
export {
  classifyFreshness,
  worstFreshness,
  assessConfidence,
  daysBetween,
  FRESH_MAX_AGE_DAYS,
  STALE_MAX_AGE_DAYS,
} from "./freshness";
export {
  analyzeCostOverrun,
  type CostOverrunResult,
  type CostPressureRating,
} from "./cost-risk";
export {
  analyzeScheduleRisk,
  STALL_THRESHOLD_DAYS,
  type ScheduleRiskResult,
  type SchedulePressureRating,
} from "./schedule-risk";
export {
  analyzeProcurementRisk,
  type ProcurementRiskResult,
  type ProcurementPressureRating,
} from "./procurement-risk";
export {
  analyzeMarketTrends,
  computeMaterialTrends,
  MIN_TREND_POINTS,
  TREND_THRESHOLD_PCT,
  type MarketTrendResult,
  type MaterialTrend,
  type PriceTrendDirection,
} from "./market-trend";
export {
  analyzeProgressVariance,
  type ProgressVarianceResult,
  type ProgressVarianceRating,
} from "./progress-intelligence";
export { analyzeCashflow, type CashflowResult } from "./cashflow";
export { buildRiskRegister } from "./risk-register";
export { buildProjectHealth, type HealthInput } from "./project-health";
export {
  materialPriceChangeScenario,
  taskDelayScenario,
  materialChangeScenario,
} from "./scenario-analysis";
export { analyzeProject } from "./analysis";
export { snapshotInputHash } from "./snapshot-hash";
export { buildProjectSnapshot } from "./snapshot";
export {
  getProjectAnalysis,
  CACHE_MAX_AGE_MS,
  type CachedAnalysis,
} from "./persistence";
export {
  classifyRiskQuestion,
  answerRiskQuestion,
  buildPredictiveContextForAi,
  type RiskQuestionKind,
} from "./copilot-integration";
