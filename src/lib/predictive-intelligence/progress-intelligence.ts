// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, PROGRESS VARIANCE (§7, §8)
//
// Expected state vs recorded/observed state:
//   expected: stages completed in template order at this point
//   recorded: stages marked complete (user records)
//   observed: dated visual observations (§8), supporting
//             evidence only, NEVER overriding verified records
//             without user confirmation.
//
// No exact physical completion percentage is claimed from photos
// unless the measurement methodology supports it. The only
// percentage reported is the deterministic stage-completion rate.
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import { assessConfidence, verifiedShareOf, worstFreshness } from "./freshness";

export type ProgressVarianceRating =
  "ahead" | "on_schedule" | "behind" | "insufficient_data";

export interface ProgressVarianceResult {
  rating: ProgressVarianceRating;
  completedStages: number;
  totalStages: number;
  stageCompletionPct: number;
  userProgressPct: number | null;
  userProgressDisagrees: boolean;
  supportingObservations: Array<{
    observation: string;
    observedAt: string;
    confidence: number;
    verification: "user_confirmed" | "unverified";
    sourceLabel: string;
  }>;
}

export function analyzeProgressVariance(snapshot: {
  now: string;
  stages: Array<{
    id: string;
    stageName: string;
    sortOrder: number;
    isCompleted: boolean;
    completedAt: string | null;
    updatedAt: string;
  }>;
  userProgressPct: number | null;
  visualObservations: Array<{
    id: string;
    observation: string;
    observedAt: string;
    confidence: number;
    verification: "user_confirmed" | "unverified";
    sourceLabel: string;
  }>;
}): PredictionResult<ProgressVarianceResult> {
  const { now, stages, userProgressPct, visualObservations } = snapshot;

  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [
    "The stage-completion rate counts every recorded stage equally, stages can differ in size, cost and duration.",
  ];
  const limitations: string[] = [
    "Physical completion percentage from photographs is NOT estimated, no measurement methodology supports it.",
  ];

  if (stages.length === 0) {
    return {
      kind: "progress_variance",
      status: "insufficient_data",
      prediction:
        "Insufficient evidence, no progress stages are recorded, so expected vs recorded state cannot be compared.",
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
  const stagePct = Math.round((completed.length / ordered.length) * 100);

  for (const s of ordered) {
    evidence.push({
      kind: "progress_stage",
      id: s.id,
      label: `Stage "${s.stageName}", ${s.isCompleted ? "recorded complete" : "not yet complete"}`,
      recordedAt: s.completedAt ?? s.updatedAt,
      verification: "user_recorded",
    });
  }

  // Visual observations (§8): supporting evidence with explicit
  // verification state, they never override the records above.
  for (const o of visualObservations) {
    evidence.push({
      kind: "visual_observation",
      id: o.id,
      label: `${o.observation} (${o.sourceLabel}, observed ${o.observedAt.slice(0, 10)})`,
      recordedAt: o.observedAt,
      verification: o.verification,
    });
  }
  if (visualObservations.length > 0) {
    assumptions.push(
      "Visual observations are supporting evidence only, they do not override the recorded stage data without user confirmation.",
    );
  }

  // Disagreement check: user-typed progress % vs recorded stages.
  const userPct =
    userProgressPct !== null &&
    Number.isFinite(userProgressPct) &&
    userProgressPct >= 0
      ? Math.min(100, Math.round(userProgressPct))
      : null;
  const disagrees = userPct !== null && Math.abs(userPct - stagePct) > 20;

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
    {
      key: "stage_completion_pct",
      label: "Stage completion rate (deterministic)",
      value: stagePct,
    },
    { key: "user_progress_pct", label: "User-stated progress", value: userPct },
  );

  const freshness = worstFreshness(
    [
      ...ordered.map((s) => s.completedAt ?? s.updatedAt),
      ...visualObservations.map((o) => o.observedAt),
    ],
    now,
  );
  const confidence = assessConfidence({
    coverage: ordered.length >= 3 ? 1 : ordered.length / 3,
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "progress variance",
  });

  const prediction = disagrees
    ? `Recorded stage completion is ${stagePct}%, while your stated project progress is ${userPct}%, the records disagree. FRELUX uses the recorded stages (${completed.length}/${ordered.length} complete) and flags the mismatch for your review.`
    : completed.length === ordered.length
      ? `All ${ordered.length} recorded stages are complete (100% stage completion).`
      : `On the recorded data: ${completed.length} of ${ordered.length} stages complete (${stagePct}% stage completion)${userPct !== null ? `, consistent with your stated progress of ${userPct}%` : ""}. Without planned dates, ahead/behind-schedule vs plan cannot be computed.`;

  return {
    kind: "progress_variance",
    status: "ok",
    prediction,
    result: {
      rating: disagrees ? "behind" : "on_schedule",
      completedStages: completed.length,
      totalStages: ordered.length,
      stageCompletionPct: stagePct,
      userProgressPct: userPct,
      userProgressDisagrees: disagrees,
      supportingObservations: visualObservations,
    },
    evidence,
    inputs,
    assumptions,
    limitations: [
      ...limitations,
      "Ahead/behind-schedule vs plan requires planned dates on stages, which the current architecture does not record.",
    ],
    freshness,
    confidence,
    generatedAt: now,
    missingData: [],
  };
}
