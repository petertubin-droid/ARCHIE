// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, RISK REGISTER (§9, §10)
//
// Turns OK predictions with actual findings into structured
// RiskItems, and each risk into a recommendation with the
// explicit chain: Observation → Analysis → Recommendation.
//
// Rules enforced structurally:
//   - a risk exists ONLY when a deterministic analyzer found a
//     real finding in real rows (§18)
//   - probability is ONLY attached where it is a measured rate
//     from the data, never an invented likelihood
//   - no unsupported categories (e.g. Weather) are created just
//     to fill the dashboard, weather data sources do not exist
//     in this project, so no Weather risk can be produced
//   - recommendations are decision support, never guaranteed
//     outcomes (§10)
// =========================================================

import type {
  ConfidenceAssessment,
  Evidence,
  PredictionResult,
  Recommendation,
  RiskCategory,
  RiskItem,
  RiskSeverity,
} from "./types";
import type { CostOverrunResult } from "./cost-risk";
import type { ScheduleRiskResult } from "./schedule-risk";
import type { ProcurementRiskResult } from "./procurement-risk";
import type { MarketTrendResult } from "./market-trend";
import type { ProgressVarianceResult } from "./progress-intelligence";

function makeRisk(input: {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  probability: { value: number; basis: string } | null;
  title: string;
  evidence: Evidence[];
  affectedArea: string;
  recommendedAction: string;
  confidence: ConfidenceAssessment;
  now: string;
}): RiskItem {
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    probability: input.probability,
    title: input.title,
    evidence: input.evidence,
    affectedArea: input.affectedArea,
    recommendedAction: input.recommendedAction,
    confidence: input.confidence,
    status: "open",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * Build the risk register from prediction results. Deterministic:
 * every risk corresponds to a measured finding in one of the OK
 * predictions. Insufficient-data predictions contribute nothing :
 * a missing prediction can never be a risk, and produces no fake
 * severity either.
 */
export function buildRiskRegister(input: {
  now: string;
  cost: PredictionResult<CostOverrunResult>;
  schedule: PredictionResult<ScheduleRiskResult>;
  procurement: PredictionResult<ProcurementRiskResult>;
  market: PredictionResult<MarketTrendResult>;
  progress: PredictionResult<ProgressVarianceResult>;
}): { risks: RiskItem[]; recommendations: Recommendation[] } {
  const { now, cost, schedule, procurement, market, progress } = input;
  const risks: RiskItem[] = [];

  // ---- Cost risks -------------------------------------------------
  if (cost.status === "ok" && cost.result) {
    const r = cost.result;
    if (r.rating !== "low") {
      risks.push(
        makeRisk({
          id: "cost-pressure",
          category: "Cost",
          severity: r.rating === "high" ? "high" : "medium",
          // Measured rate: projected overrun share of the current estimate.
          probability:
            r.projectedOverrunPct > 0
              ? {
                  value: Math.min(1, r.projectedOverrunPct),
                  basis: `Projected final cost exceeds the current estimate by ${(r.projectedOverrunPct * 100).toFixed(1)}% (deterministic projection from recorded spend and progress)`,
                }
              : null,
          title: `Recorded expenditure is trending ${r.burnVariance > 0 ? "above" : "at variance with"} the pro-rata estimate`,
          evidence: cost.evidence,
          affectedArea: "Project budget",
          recommendedAction:
            r.rating === "high"
              ? "Review the largest recorded spend lines against the estimate and record any approved scope changes so the estimate reflects reality."
              : "Keep recording actual prices on purchases so the trend stays verifiable.",
          confidence: cost.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
    if (
      r.originalEstimate !== null &&
      r.estimateDriftPct !== null &&
      r.estimateDriftPct > 0.05
    ) {
      risks.push(
        makeRisk({
          id: "estimate-drift",
          category: "Cost",
          severity: "medium",
          probability: null,
          title: `The current estimate is ${(r.estimateDriftPct * 100).toFixed(1)}% above the original recorded estimate`,
          evidence: cost.evidence,
          affectedArea: "Project budget",
          recommendedAction:
            "Confirm whether the increase reflects approved changes, then keep the current estimate as the working baseline.",
          confidence: cost.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
  }

  // ---- Schedule risks ----------------------------------------------
  if (schedule.status === "ok" && schedule.result) {
    const r = schedule.result;
    if (r.sequencingViolations.length > 0) {
      risks.push(
        makeRisk({
          id: "sequence-violation",
          category: "Schedule",
          severity: "high",
          probability: null,
          title: `${r.sequencingViolations.length} later stage(s) recorded complete while earlier stage(s) remain incomplete`,
          evidence: schedule.evidence,
          affectedArea: "Construction sequence",
          recommendedAction:
            "Verify the earlier stage(s) status on site and correct the records, or confirm the out-of-order execution was intentional.",
          confidence: schedule.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
    if (r.stallDays !== null) {
      risks.push(
        makeRisk({
          id: "schedule-stall",
          category: "Schedule",
          severity: r.stallDays > 14 ? "high" : "medium",
          // Measured rate: share of recorded stall vs threshold.
          probability: {
            value: Math.min(1, r.stallDays / 28),
            basis: `No stage completion recorded for ${r.stallDays} days while the project is in progress`,
          },
          title: `No recorded stage completion for ${r.stallDays} days`,
          evidence: schedule.evidence,
          affectedArea: "Project timeline",
          recommendedAction: `Record the actual status of "${r.nextPendingStage ?? "the next stage"}", if work is ongoing, updating the records restores reliable tracking.`,
          confidence: schedule.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
  }

  // ---- Procurement risks -------------------------------------------
  if (procurement.status === "ok" && procurement.result) {
    const r = procurement.result;
    if (
      r.progressRemains &&
      r.unpurchasedCount > 0 &&
      r.missingSupplierNames.length > 0
    ) {
      risks.push(
        makeRisk({
          id: "procurement-unsourced",
          category: "Procurement",
          severity: r.missingSupplierNames.length >= 3 ? "medium" : "low",
          probability: null,
          title: `${r.missingSupplierNames.length} material(s) needed for remaining work have no recorded supplier`,
          evidence: procurement.evidence,
          affectedArea: "Material procurement",
          recommendedAction:
            "Record supplier commitments for these materials before the related work stages begin.",
          confidence: procurement.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
    const hotPriceLine = r.priceIncreasedLines.find(
      (l) => l.increasePct > 0.25,
    );
    if (hotPriceLine) {
      risks.push(
        makeRisk({
          id: "procurement-price-jump",
          category: "Procurement",
          severity: "high",
          // Measured rate: the recorded price increase itself.
          probability: {
            value: Math.min(1, hotPriceLine.increasePct),
            basis: `Recorded actual price for ${hotPriceLine.name} is ${(hotPriceLine.increasePct * 100).toFixed(0)}% above its recorded estimate`,
          },
          title: `Recorded price for ${hotPriceLine.name} is ${(hotPriceLine.increasePct * 100).toFixed(0)}% above its recorded estimate`,
          evidence: procurement.evidence,
          affectedArea: "Material procurement",
          recommendedAction:
            "Re-check the estimate for similarly-priced materials and record actual prices as purchases happen.",
          confidence: procurement.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
  }

  // ---- Market risks -------------------------------------------------
  if (market.status === "ok" && market.result) {
    const hot = market.result.trends.filter(
      (t) =>
        t.direction === "increasing" &&
        (t.changePct > 0.1 || t.volatility === "high"),
    );
    for (const t of hot) {
      risks.push(
        makeRisk({
          id: `market-${t.materialName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          category: "Market",
          severity: t.volatility === "high" ? "high" : "medium",
          probability: null,
          title: `${t.materialName} prices have moved ${(t.changePct * 100).toFixed(1)}% across ${t.dataPoints} recorded points (${t.volatility} volatility)`,
          evidence: market.evidence,
          affectedArea: "Material budget",
          recommendedAction:
            "If purchases of this material are still ahead, confirm the current market price before relying on the recorded estimate.",
          confidence: market.confidence as ConfidenceAssessment,
          now,
        }),
      );
    }
  }

  // ---- Data quality & progress risks --------------------------------
  if (
    progress.status === "ok" &&
    progress.result &&
    progress.result.userProgressDisagrees
  ) {
    risks.push(
      makeRisk({
        id: "progress-record-mismatch",
        category: "Data quality",
        severity: "medium",
        probability: null,
        title: `Stated project progress (${progress.result.userProgressPct}%) disagrees with recorded stage completion (${progress.result.stageCompletionPct}%)`,
        evidence: progress.evidence,
        affectedArea: "Project records",
        recommendedAction:
          "Reconcile the stated progress with the recorded stages, reliable prediction depends on accurate records.",
        confidence: progress.confidence as ConfidenceAssessment,
        now,
      }),
    );
  }

  // ---- Recommendations (§10): Observation → Analysis → Rec ---------
  const recommendations: Recommendation[] = risks.map((risk) => ({
    riskId: risk.id,
    basedOnRisk: risk.title,
    observation: risk.title,
    analysis: `${risk.affectedArea} is affected. Basis: ${risk.evidence.length} verified record(s) behind this risk, confidence ${risk.confidence.band} (${risk.confidence.score.toFixed(2)}).`,
    recommendation: risk.recommendedAction,
    confidence: risk.confidence,
  }));

  return { risks, recommendations };
}
