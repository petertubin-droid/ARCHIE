// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, ANALYSIS ORCHESTRATOR
//
// The single entry point: a project snapshot in, one complete,
// explainable, deterministic analysis out. No AI calls (§15) :
// the Copilot summarizes this output; it never recomputes it.
//
// The full bundle answers: prediction, evidence, inputs,
// assumptions, freshness, confidence, limitations, risks,
// recommendations, health and scenarios (§14).
// =========================================================

import type {
  PredictionResult,
  ProjectPredictiveAnalysis,
  PredictiveProjectSnapshot,
} from "./types";
import { analyzeCostOverrun, type CostOverrunResult } from "./cost-risk";
import { analyzeScheduleRisk, type ScheduleRiskResult } from "./schedule-risk";
import {
  analyzeProcurementRisk,
  type ProcurementRiskResult,
} from "./procurement-risk";
import { analyzeMarketTrends, type MarketTrendResult } from "./market-trend";
import {
  analyzeProgressVariance,
  type ProgressVarianceResult,
} from "./progress-intelligence";
import { analyzeCashflow } from "./cashflow";
import { buildRiskRegister } from "./risk-register";
import { buildProjectHealth } from "./project-health";
import { materialPriceChangeScenario } from "./scenario-analysis";
import { recordedStageProgress } from "./spend";
import { snapshotInputHash } from "./snapshot-hash";

/** Measured data quality, coverage of the six analysis areas. */
function assessDataQuality(
  snapshot: PredictiveProjectSnapshot,
  predictions: PredictionResult[],
): {
  rating: "high" | "medium" | "low";
  reason: string;
  coverage: Array<{ area: string; available: boolean; note: string }>;
} {
  const coverage = [
    {
      area: "Project record",
      available: true,
      note: "Project exists and is readable",
    },
    {
      area: "Progress stages",
      available: snapshot.stages.length > 0,
      note:
        snapshot.stages.length > 0
          ? `${snapshot.stages.length} stage(s) recorded`
          : "No stages recorded",
    },
    {
      area: "Shopping list",
      available: snapshot.shoppingItems.length > 0,
      note:
        snapshot.shoppingItems.length > 0
          ? `${snapshot.shoppingItems.length} item(s) recorded`
          : "No shopping list recorded",
    },
    {
      area: "Estimates",
      available: snapshot.calculations.some((c) => c.estimatedTotal !== null),
      note: snapshot.calculations.some((c) => c.estimatedTotal !== null)
        ? `${snapshot.calculations.filter((c) => c.estimatedTotal !== null).length} estimate(s) saved`
        : "No saved estimates",
    },
    {
      area: "Price history",
      available: snapshot.priceHistory.length >= 3,
      note: `${snapshot.priceHistory.length} price record(s) (3+ needed for trend analysis)`,
    },
    {
      area: "Region profile",
      available: Boolean(
        snapshot.region.marketCode ?? snapshot.region.countryCode,
      ),
      note:
        snapshot.region.marketCode ??
        snapshot.region.countryCode ??
        "No region recorded",
    },
  ];
  const availableCount = coverage.filter((c) => c.available).length;
  const okPredictions = predictions.filter((p) => p.status === "ok").length;
  const rating =
    availableCount >= 5 && okPredictions >= 3
      ? "high"
      : availableCount >= 3
        ? "medium"
        : "low";
  const reason = `${availableCount}/6 data areas available, ${okPredictions}/${predictions.length} analyses supported.`;
  return { rating, reason, coverage };
}

export function analyzeProject(
  snapshot: PredictiveProjectSnapshot,
): ProjectPredictiveAnalysis {
  const {
    now,
    stages,
    shoppingItems,
    calculations,
    priceHistory,
    marketPrices,
    visualObservations,
    region,
  } = snapshot;

  const stageProgress = recordedStageProgress(stages);
  const remainingWork =
    snapshot.project.status === "in_progress" ||
    (stageProgress !== null && stageProgress < 1);

  // ---- Deterministic analyzers (pure functions) ---------------------
  const cost = analyzeCostOverrun({
    now,
    calculations,
    shoppingItems,
    stages,
    userProgressPct: snapshot.project.progressPercentage,
  });
  const schedule = analyzeScheduleRisk({
    now,
    projectStatus: snapshot.project.status,
    stages,
  });
  const procurement = analyzeProcurementRisk({
    now,
    shoppingItems,
    marketPrices: marketPrices.map((p) => ({
      id: p.id,
      label: p.label,
      price: p.price,
      currencyCode: p.currencyCode,
      marketCode: p.marketCode,
      region: p.region,
      collectedAt: p.collectedAt,
      verified: p.verified,
    })),
    remainingWork,
  });
  const market = analyzeMarketTrends({
    now,
    region,
    projectPriceHistory: priceHistory,
    marketPrices,
  });
  const progress = analyzeProgressVariance({
    now,
    stages,
    userProgressPct: snapshot.project.progressPercentage,
    visualObservations,
  });
  const cashflow = analyzeCashflow({ now, calculations, shoppingItems });

  const predictions: PredictionResult[] = [
    cost,
    schedule,
    procurement,
    market,
    progress,
    cashflow,
  ];

  const dataQuality = assessDataQuality(snapshot, predictions);

  const { risks, recommendations } = buildRiskRegister({
    now,
    cost: cost as PredictionResult<CostOverrunResult>,
    schedule: schedule as PredictionResult<ScheduleRiskResult>,
    procurement: procurement as PredictionResult<ProcurementRiskResult>,
    market: market as PredictionResult<MarketTrendResult>,
    progress: progress as PredictionResult<ProgressVarianceResult>,
  });

  const health = buildProjectHealth({
    cost: cost as PredictionResult<CostOverrunResult>,
    schedule: schedule as PredictionResult<ScheduleRiskResult>,
    procurement: procurement as PredictionResult<ProcurementRiskResult>,
    progress: progress as PredictionResult<ProgressVarianceResult>,
    dataQuality,
  });

  // Default scenario: the most common question, computed from real
  // rows. Custom scenarios are added by the API layer on demand.
  const scenarios = [
    materialPriceChangeScenario({ now, shoppingItems, changePct: 0.1 }),
  ];

  const limitations = Array.from(
    new Set(
      predictions.flatMap((p) => [
        ...(p.status === "ok" ? p.limitations : []),
        ...(p.status !== "ok" ? p.missingData.map((m) => `Missing: ${m}`) : []),
      ]),
    ),
  );

  return {
    projectId: snapshot.projectId,
    generatedAt: now,
    inputHash: snapshotInputHash(snapshot),
    dataQuality,
    predictions,
    risks,
    recommendations,
    health,
    scenarios,
    limitations,
  };
}
