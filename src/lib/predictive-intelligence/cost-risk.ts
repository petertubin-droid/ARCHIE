// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, COST OVERRUN (§3)
//
// Compares the project's recorded estimates, recorded spend and
// recorded progress, deterministically. "Recorded material
// expenditure is trending above the original estimate" can only
// be said when the rows say so. Otherwise: insufficient data.
//
// Rating bands (documented, deterministic):
//   burnPct = (recordedSpend − currentEstimate × progress) / currentEstimate
//   burnPct >  10%  → HIGH cost pressure
//   burnPct >   0   → MEDIUM cost pressure
//   burnPct ≤   0   → LOW cost pressure
// =========================================================

import type { Evidence, PredictionResult } from "./types";
import { assessConfidence, verifiedShareOf, worstFreshness } from "./freshness";
import {
  currentEstimate,
  estimateTimeline,
  originalEstimate,
  linesWithRecordedPriceIncrease,
  purchasedLines,
  recordedSpend,
  recordedStageProgress,
} from "./spend";
import type { ShoppingRow } from "./internal-types";

export type CostPressureRating = "low" | "medium" | "high";

export interface CostOverrunResult {
  rating: CostPressureRating;
  currentEstimate: number;
  originalEstimate: number | null;
  estimateDriftPct: number | null;
  recordedSpend: number;
  progressFraction: number;
  expectedSpendAtProgress: number;
  burnVariance: number;
  burnPct: number;
  projectedFinalCost: number;
  projectedOverrunPct: number;
  priceIncreasedLines: Array<{
    name: string;
    estimated: number;
    actual: number;
    increasePct: number;
  }>;
}

const HIGH_BURN_PCT = 0.1;
const ESTIMATE_DRIFT_NOTABLE_PCT = 0.05;

export function analyzeCostOverrun(snapshot: {
  now: string;
  calculations: Parameters<typeof estimateTimeline>[0];
  shoppingItems: ShoppingRow[];
  stages: Parameters<typeof recordedStageProgress>[0];
  userProgressPct: number | null;
}): PredictionResult<CostOverrunResult> {
  const { now, calculations, shoppingItems, stages, userProgressPct } =
    snapshot;

  const evidence: Evidence[] = [];
  const inputs: PredictionResult["inputs"] = [];
  const assumptions: string[] = [];
  const limitations: string[] = [];

  const estimateTimelinePoints = estimateTimeline(calculations);
  const est = currentEstimate(calculations, shoppingItems);
  const est0 = originalEstimate(calculations);

  const stageProgress = recordedStageProgress(stages);
  const progressFraction =
    stageProgress ??
    (userProgressPct !== null &&
    Number.isFinite(userProgressPct) &&
    userProgressPct >= 0
      ? Math.min(100, userProgressPct) / 100
      : null);

  const spend = recordedSpend(shoppingItems);
  const purchased = purchasedLines(shoppingItems);
  const strictlyPriced = purchased.filter((i) => i.actual_price !== null);
  const priceIncreases = linesWithRecordedPriceIncrease(shoppingItems);

  // ---- Evidence from real rows -------------------------------------
  for (const p of estimateTimelinePoints) {
    evidence.push({
      kind: "calculation",
      id: p.id,
      label: `Saved estimate "${p.title}" (total ${p.total.toFixed(2)})`,
      recordedAt: p.createdAt,
      verification: "user_recorded",
    });
  }
  for (const line of strictlyPriced) {
    evidence.push({
      kind: "shopping_item",
      id: line.id,
      label: `Purchased ${line.name} at recorded actual price`,
      recordedAt: null,
      verification: "user_recorded",
    });
  }

  // ---- Sufficiency gate (§18) ---------------------------------------
  const hasEstimate = est !== null && est > 0;
  const hasSpend = spend > 0;
  const hasProgress = progressFraction !== null;
  if (!hasEstimate || (!hasSpend && !hasProgress)) {
    return {
      kind: "cost_overrun",
      status: "insufficient_data",
      prediction: "Insufficient project data to predict cost overrun.",
      result: null,
      evidence,
      inputs: [
        {
          key: "estimate_available",
          label: "Recorded estimate",
          value: hasEstimate,
        },
        { key: "spend_available", label: "Recorded spend", value: hasSpend },
        {
          key: "progress_available",
          label: "Recorded progress",
          value: hasProgress,
        },
      ],
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations: [
        "No cost prediction can be made until an estimate and either spend or progress records exist.",
      ],
      generatedAt: now,
      missingData: [
        ...(!hasEstimate ? ["recorded_estimate"] : []),
        ...(!hasSpend && !hasProgress ? ["recorded_spend_or_progress"] : []),
      ],
    };
  }

  const current = est as number;
  const progress = progressFraction ?? 0;
  const expectedAtProgress = current * progress;

  // Pro-rated burn comparison needs progress; without it we can still
  // compare recorded spend against the estimate honestly (bounded).
  if (!hasProgress && !hasSpend) {
    return {
      kind: "cost_overrun",
      status: "insufficient_data",
      prediction: "Insufficient project data to predict cost overrun.",
      result: null,
      evidence,
      inputs: [
        { key: "current_estimate", label: "Current estimate", value: current },
      ],
      assumptions,
      freshness: "unavailable",
      confidence: null,
      limitations: [],
      generatedAt: now,
      missingData: ["recorded_spend", "recorded_progress"],
    };
  }

  assumptions.push(
    "Cost is assumed to accrue evenly across completed stages (pro-rata). If large costs fall early or late in your build, the burn comparison shifts accordingly.",
  );
  if (purchased.length > strictlyPriced.length) {
    assumptions.push(
      `${purchased.length - strictlyPriced.length} purchased item(s) lack a recorded actual price and are counted at their estimated line total (a lower-bound proxy).`,
    );
  }
  limitations.push(
    "Projection assumes future costs track the current estimate; it cannot anticipate scope changes not yet recorded.",
  );

  const burnVariance = spend - expectedAtProgress;
  const burnPct = current > 0 ? burnVariance / current : 0;
  const projectedFinal = spend + current * (1 - progress);
  const projectedOverrunPct = current > 0 ? projectedFinal / current - 1 : 0;

  const rating: CostPressureRating =
    burnPct > HIGH_BURN_PCT ? "high" : burnPct > 0 ? "medium" : "low";

  const driftPct = est0 !== null && est0 > 0 ? (current - est0) / est0 : null;
  if (driftPct !== null && Math.abs(driftPct) >= ESTIMATE_DRIFT_NOTABLE_PCT) {
    assumptions.push(
      `The current estimate has ${driftPct > 0 ? "increased" : "decreased"} ${(Math.abs(driftPct) * 100).toFixed(1)}% from the original recorded estimate.`,
    );
  }

  inputs.push(
    { key: "current_estimate", label: "Current estimate", value: current },
    { key: "original_estimate", label: "Original estimate", value: est0 },
    { key: "recorded_spend", label: "Recorded spend", value: spend },
    {
      key: "progress_fraction",
      label: "Recorded progress (fraction)",
      value: progress,
    },
    {
      key: "expected_spend_at_progress",
      label: "Expected spend at this progress",
      value: expectedAtProgress,
    },
  );

  // Freshness from DATED records only: an uncompleted stage has no
  // completion date, which is "not yet", not stale data (§17).
  const freshness = worstFreshness(
    [
      ...estimateTimelinePoints.map((p) => p.createdAt),
      ...stages.filter((s) => s.isCompleted).map((s) => s.completedAt),
    ],
    now,
  );
  const confidence = assessConfidence({
    coverage: Math.min(
      1,
      (estimateTimelinePoints.length + purchased.length) / 4,
    ),
    freshness,
    verifiedShare: verifiedShareOf(evidence),
    context: "cost overrun",
  });

  const prediction =
    rating === "low"
      ? "Current project cost risk: LOW, recorded expenditure is at or below the pro-rata estimate for the recorded progress."
      : rating === "medium"
        ? "Current project cost risk: MEDIUM, recorded material expenditure is trending above the original estimate."
        : "Current project cost risk: HIGH, recorded expenditure is running well ahead of the pro-rata estimate for the recorded progress.";

  return {
    kind: "cost_overrun",
    status: "ok",
    prediction,
    result: {
      rating,
      currentEstimate: current,
      originalEstimate: est0,
      estimateDriftPct: driftPct,
      recordedSpend: spend,
      progressFraction: progress,
      expectedSpendAtProgress: expectedAtProgress,
      burnVariance,
      burnPct,
      projectedFinalCost: projectedFinal,
      projectedOverrunPct,
      priceIncreasedLines: priceIncreases.map((l) => ({
        name: l.item.name,
        estimated: l.estimated,
        actual: l.actual,
        increasePct: l.increasePct,
      })),
    },
    evidence,
    inputs,
    assumptions,
    freshness,
    confidence,
    limitations,
    generatedAt: now,
    missingData: [],
  };
}
