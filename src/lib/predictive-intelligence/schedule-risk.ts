// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, SCHEDULE RISK (§4)
//
// Planned vs Actual vs Remaining, from project_progress_stages.
//
// HONESTY CONSTRAINT: the existing schedule architecture stores
// stage ORDER and completion timestamps but NO planned dates.
// Therefore date-based schedule prediction (e.g. "2 weeks late")
// is NOT SUPPORTABLE and this analyzer says so. What IS
// measurable from the real records:
//   - sequencing violations: a later stage completed while an
//     earlier one is not (evidence of out-of-order/rework)
//   - stalled progress: project in progress with stages and no
//     completion recorded for N days (measured from records)
//   - remaining work: uncompleted stages + their prerequisite
//     state
// Task completion percentages are NEVER invented (§4/§18).
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import {
  assessConfidence,
  classifyFreshness,
  verifiedShareOf,
  worstFreshness,
} from "./freshness";

export type SchedulePressureRating = "low" | "medium" | "high";

export interface ScheduleRiskResult {
  rating: SchedulePressureRating;
  totalStages: number;
  completedStages: number;
  sequencingViolations: Array<{ laterStage: string; earlierStage: string }>;
  daysSinceLastCompletion: number | null;
  stallDays: number | null;
  nextPendingStage: string | null;
  remainingStages: number;
}

/** A stage is considered "stalled" when the project is in progress
 *  and no completion has been recorded for this many days. */
export const STALL_THRESHOLD_DAYS = 14;

export function analyzeScheduleRisk(snapshot: {
  now: string;
  projectStatus: string;
  stages: Array<{
    id: string;
    stageName: string;
    sortOrder: number;
    isCompleted: boolean;
    completedAt: string | null;
    updatedAt: string;
  }>;
}): PredictionResult<ScheduleRiskResult> {
  const { now, projectStatus, stages } = snapshot;

  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [
    "The recorded schedule stores stage order and completion timestamps, but not planned start/end dates, so FRELUX measures sequencing, stalls and remaining work, and does NOT predict calendar completion dates.",
  ];
  const limitations: string[] = [
    "Completion-date prediction requires planned dates on each stage, which the current schedule does not record.",
  ];

  if (stages.length === 0) {
    return {
      kind: "schedule_risk",
      status: "insufficient_data",
      prediction:
        "Schedule prediction cannot be reliably made, no progress stages are recorded for this project.",
      result: null,
      evidence,
      inputs,
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations,
      generatedAt: now,
      missingData: ["progress_stages"],
    };
  }

  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const completed = ordered.filter((s) => s.isCompleted);
  const remaining = ordered.length - completed.length;

  for (const s of ordered) {
    evidence.push({
      kind: "progress_stage",
      id: s.id,
      label: `Stage "${s.stageName}", ${s.isCompleted ? `completed ${s.completedAt ?? "(no timestamp)"}` : "not completed"}`,
      recordedAt: s.completedAt ?? s.updatedAt,
      verification: "user_recorded",
    });
  }

  // ---- Sequencing violations (deterministic) ------------------------
  const violations: Array<{ laterStage: string; earlierStage: string }> = [];
  const firstIncompleteIdx = ordered.findIndex((s) => !s.isCompleted);
  if (firstIncompleteIdx !== -1) {
    for (let i = firstIncompleteIdx; i < ordered.length; i += 1) {
      if (ordered[i].isCompleted) {
        violations.push({
          laterStage: ordered[i].stageName,
          earlierStage: ordered[firstIncompleteIdx].stageName,
        });
      }
    }
  }

  // ---- Stall detection (measured, never invented) -------------------
  const lastCompletion =
    completed
      .map((s) => s.completedAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;
  const daysSinceLast = lastCompletion
    ? Math.round(
        (new Date(now).getTime() - new Date(lastCompletion).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const inProgress = projectStatus === "in_progress";
  const stalled =
    inProgress &&
    remaining > 0 &&
    daysSinceLast !== null &&
    daysSinceLast > STALL_THRESHOLD_DAYS;

  const nextPending =
    firstIncompleteIdx !== -1 ? ordered[firstIncompleteIdx].stageName : null;

  inputs.push(
    {
      key: "total_stages",
      label: "Total recorded stages",
      value: ordered.length,
    },
    {
      key: "completed_stages",
      label: "Completed stages",
      value: completed.length,
    },
    { key: "remaining_stages", label: "Remaining stages", value: remaining },
    {
      key: "sequencing_violations",
      label: "Out-of-order completions",
      value: violations.length,
    },
    {
      key: "days_since_last_completion",
      label: "Days since last recorded completion",
      value: daysSinceLast,
    },
  );

  // ---- Rating (documented bands) ------------------------------------
  // high: sequencing violation OR stalled (>14 days with no completion)
  // medium: next pending stage exists AND stall between 7–14 days
  // low: none of the above (steady or completed)
  const stallDays = stalled ? daysSinceLast : null;
  const rating: SchedulePressureRating =
    violations.length > 0 ||
    (stalled && (daysSinceLast as number) > STALL_THRESHOLD_DAYS)
      ? "high"
      : stalled
        ? "medium"
        : "low";

  const freshness = worstFreshness(
    ordered.map((s) => s.completedAt ?? s.updatedAt),
    now,
  );
  const confidence = assessConfidence({
    coverage: ordered.length >= 3 ? 1 : ordered.length / 3,
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "schedule risk",
  });

  const prediction =
    rating === "low"
      ? remaining === 0
        ? "All recorded stages are complete, no schedule risk detected in the recorded data."
        : "Schedule risk: LOW, recorded completions follow the planned order with no stall detected."
      : rating === "medium"
        ? `Schedule risk: MEDIUM, no stage completion recorded for ${daysSinceLast} days while the project is in progress.`
        : violations.length > 0
          ? `Schedule risk: HIGH, later stage(s) were recorded complete while earlier stage(s) remain incomplete, indicating rework or out-of-order execution.`
          : `Schedule risk: HIGH, no stage completion recorded for ${daysSinceLast} days while the project is in progress.`;

  return {
    kind: "schedule_risk",
    status: "ok",
    prediction,
    result: {
      rating,
      totalStages: ordered.length,
      completedStages: completed.length,
      sequencingViolations: violations,
      daysSinceLastCompletion: daysSinceLast,
      stallDays,
      nextPendingStage: nextPending,
      remainingStages: remaining,
    },
    evidence,
    inputs,
    assumptions,
    limitations,
    freshness,
    confidence,
    generatedAt: now,
    missingData: [],
  };
}

/** Freshness of the progress record as a whole, used by data quality. */
export function progressFreshness(
  stages: Array<{ completedAt: string | null; updatedAt: string }>,
  now: string,
): ReturnType<typeof classifyFreshness> {
  return worstFreshness(
    stages.map((s) => s.completedAt ?? s.updatedAt),
    now,
  );
}
