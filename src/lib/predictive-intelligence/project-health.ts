// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, PROJECT HEALTH (§13)
//
// Dashboard rollup. Missing data produces "Insufficient data" :
// NEVER a reassuring status (§13/§18).
// =========================================================

import type {
  ProjectHealth,
  PredictionResult,
  DataQualityRating,
} from "./types";
import type { CostOverrunResult } from "./cost-risk";
import type { ScheduleRiskResult } from "./schedule-risk";
import type { ProcurementRiskResult } from "./procurement-risk";
import type { ProgressVarianceResult } from "./progress-intelligence";

export interface HealthInput {
  cost: PredictionResult<CostOverrunResult>;
  schedule: PredictionResult<ScheduleRiskResult>;
  procurement: PredictionResult<ProcurementRiskResult>;
  progress: PredictionResult<ProgressVarianceResult>;
  dataQuality: { rating: DataQualityRating; reason: string };
}

export function buildProjectHealth(input: HealthInput): ProjectHealth {
  const { cost, schedule, procurement, progress, dataQuality } = input;

  const costRating =
    cost.status === "ok" && cost.result
      ? ({ low: "low", medium: "medium", high: "high" } as const)[
          cost.result.rating
        ]
      : "insufficient_data";
  const costReason =
    cost.status === "ok" && cost.result
      ? cost.result.rating === "low"
        ? "Recorded expenditure is at or below the pro-rata estimate for recorded progress."
        : `Recorded expenditure is trending above the pro-rata estimate (burn ${(cost.result.burnPct * 100).toFixed(1)}%).`
      : "Insufficient data, no estimate with spend or progress records.";

  const scheduleRating =
    schedule.status === "ok" && schedule.result
      ? ({ low: "low", medium: "medium", high: "high" } as const)[
          schedule.result.rating
        ]
      : "insufficient_data";
  const scheduleReason =
    schedule.status === "ok" && schedule.result
      ? schedule.result.sequencingViolations.length > 0
        ? "Out-of-order stage completions recorded."
        : schedule.result.stallDays !== null
          ? `No stage completion recorded for ${schedule.result.stallDays} days while in progress.`
          : "Recorded completions follow the planned order."
      : "Insufficient data, no progress stages recorded.";

  const procurementRating =
    procurement.status === "ok" && procurement.result
      ? ({ low: "low", medium: "medium", high: "high" } as const)[
          procurement.result.rating
        ]
      : "insufficient_data";
  const procurementReason =
    procurement.status === "ok" && procurement.result
      ? procurement.result.rating === "low"
        ? "Remaining material needs are covered on the recorded data."
        : `${procurement.result.unpurchasedCount} unpurchased item(s) for remaining work${procurement.result.missingSupplierNames.length > 0 ? `, ${procurement.result.missingSupplierNames.length} without supplier` : ""}.`
      : "Insufficient data, no shopping list recorded.";

  const progressRating =
    progress.status !== "ok" || !progress.result
      ? "insufficient_data"
      : progress.result.userProgressDisagrees
        ? "at_risk"
        : progress.result.stageCompletionPct === 100
          ? "on_track"
          : "on_track";
  const progressReason =
    progress.status === "ok" && progress.result
      ? progress.result.userProgressDisagrees
        ? `Stated progress (${progress.result.userProgressPct}%) disagrees with recorded stages (${progress.result.stageCompletionPct}%).`
        : `${progress.result.completedStages}/${progress.result.totalStages} recorded stages complete. Without planned dates, ahead/behind-plan cannot be computed.`
      : "Insufficient data, no progress records.";

  return {
    cost: { rating: costRating, reason: costReason },
    schedule: { rating: scheduleRating, reason: scheduleReason },
    procurement: { rating: procurementRating, reason: procurementReason },
    progress: { rating: progressRating, reason: progressReason },
    dataQuality: { rating: dataQuality.rating, reason: dataQuality.reason },
  };
}
