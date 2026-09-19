// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, COPILOT INTEGRATION (§20)
//
// Lets the Phase 2 Copilot answer risk questions from the ACTUAL
// predictive analysis, retrieval, never invention. The
// deterministic facts below are handed to the AI as pre-computed
// context; the AI summarizes/recommends, it never recomputes.
//
// AI vs deterministic boundary (§15): every number in the
// retrieved context was computed by the deterministic analyzers.
// =========================================================

import type { ProjectPredictiveAnalysis, PredictionResult } from "./types";

export type RiskQuestionKind =
  | "biggest_risks"
  | "budget_exceeded"
  | "materials_next"
  | "behind_schedule"
  | "what_changed"
  | "why_cost_increasing";

/** Deterministic intent routing for risk questions. */
export function classifyRiskQuestion(text: string): RiskQuestionKind | null {
  const t = text.toLowerCase();
  if (
    /(biggest|main|top|major).*(risk|issue|problem)|what.*(risks|wrong)/.test(t)
  )
    return "biggest_risks";
  if (
    /(exceed|over|above).*(budget)|budget.*(exceed|over)|likely.*(budget)/.test(
      t,
    )
  )
    return "budget_exceeded";
  if (
    /which material|materials.*secure|materials.*next|buy.*next|secure.*material/.test(
      t,
    )
  )
    return "materials_next";
  if (/behind schedule|on schedule|delay|delayed|schedule.*status/.test(t))
    return "behind_schedule";
  if (
    /what changed|since.*(last|previous).*(update|report)|any changes/.test(t)
  )
    return "what_changed";
  if (/why.*(cost|price|spend).*(increas|ris|go?ing up)/.test(t))
    return "why_cost_increasing";
  return null;
}

/** Deterministic, evidence-anchored answers assembled from the
 *  ACTUAL analysis. The Copilot relays/summarizes these, any AI
 *  answer must trace back to this context. */
export function answerRiskQuestion(
  kind: RiskQuestionKind,
  analysis: ProjectPredictiveAnalysis,
): { answer: string; supportsAiSummary: boolean; basedOn: string[] } {
  const insufficient = (area: string) => ({
    answer: `Insufficient data to answer this reliably, ${area}. FRELUX will not guess.`,
    supportsAiSummary: true,
    basedOn: [`${area} records are missing`],
  });

  switch (kind) {
    case "biggest_risks": {
      if (analysis.risks.length === 0) {
        return {
          answer:
            "No measurable risks were detected in your current project records. This can also mean the records are thin, data quality is " +
            analysis.dataQuality.rating +
            ".",
          supportsAiSummary: true,
          basedOn: ["Risk register built from the deterministic analyzers"],
        };
      }
      const sorted = [...analysis.risks].sort(
        (a, b) =>
          ({ high: 3, medium: 2, low: 1 })[b.severity] -
          { high: 3, medium: 2, low: 1 }[a.severity],
      );
      const lines = sorted
        .slice(0, 3)
        .map(
          (r) =>
            `${r.severity.toUpperCase()} (${r.category}): ${r.title}, confidence ${r.confidence.band}. Recommended: ${r.recommendedAction}`,
        );
      return {
        answer: `Your biggest detected risks:\n${lines.join("\n")}`,
        supportsAiSummary: true,
        basedOn: sorted.slice(0, 3).map((r) => r.id),
      };
    }
    case "budget_exceeded": {
      const cost = find(analysis, "cost_overrun");
      if (!cost || cost.status !== "ok" || !cost.result) {
        return insufficient("estimate and recorded spend");
      }
      const r = cost.result as {
        rating: string;
        projectedOverrunPct: number;
        burnPct: number;
        recordedSpend: number;
        projectedFinalCost: number;
      };
      return {
        answer:
          r.rating === "low"
            ? `On the recorded data, cost risk is LOW, recorded spend ${r.recordedSpend.toFixed(2)} is at or below the pro-rata estimate.`
            : `Cost risk is ${r.rating.toUpperCase()}. Recorded spend ${r.recordedSpend.toFixed(2)} is running ${(r.burnPct * 100).toFixed(1)}% ahead of the pro-rata estimate; the deterministic projection puts the final cost ${(r.projectedOverrunPct * 100).toFixed(1)}% ${r.projectedOverrunPct >= 0 ? "above" : "below"} the current estimate (${r.projectedFinalCost.toFixed(2)}).`,
        supportsAiSummary: true,
        basedOn: [`${cost.evidence.length} evidence records`],
      };
    }
    case "materials_next": {
      const procurement = find(analysis, "procurement_risk");
      if (!procurement || procurement.status !== "ok" || !procurement.result) {
        return insufficient("shopping list");
      }
      const r = procurement.result as {
        unpurchasedCount: number;
        missingSupplierNames: string[];
        unpurchasedEstimatedTotal: number;
      };
      if (r.unpurchasedCount === 0) {
        return {
          answer: "All materials on your recorded shopping list are purchased.",
          supportsAiSummary: true,
          basedOn: ["shopping list rows"],
        };
      }
      return {
        answer: `Materials still needed for remaining work (${r.unpurchasedCount} item(s), estimated ${r.unpurchasedEstimatedTotal.toFixed(2)}): ${r.missingSupplierNames.length > 0 ? `priority, no supplier recorded for ${r.missingSupplierNames.join(", ")}` : "all have suppliers recorded"}. Confirm availability with your suppliers before the related stages begin.`,
        supportsAiSummary: true,
        basedOn: ["shopping list rows", "progress stages"],
      };
    }
    case "behind_schedule": {
      const schedule = find(analysis, "schedule_risk");
      if (!schedule || schedule.status !== "ok" || !schedule.result) {
        return insufficient("progress stages");
      }
      const r = schedule.result as {
        rating: string;
        completedStages: number;
        totalStages: number;
        daysSinceLastCompletion: number | null;
        sequencingViolations: unknown[];
      };
      return {
        answer:
          r.rating === "low"
            ? `Schedule risk is LOW, ${r.completedStages}/${r.totalStages} recorded stages complete, no stalls or out-of-order completions detected.`
            : `Schedule risk is ${r.rating.toUpperCase()}: ${r.completedStages}/${r.totalStages} stages complete${r.daysSinceLastCompletion !== null ? `, last completion ${r.daysSinceLastCompletion} day(s) ago` : ""}${r.sequencingViolations.length > 0 ? `, ${r.sequencingViolations.length} out-of-order completion(s)` : ""}. Note: the recorded schedule has no planned dates, so a calendar-based delay prediction is not possible.`,
        supportsAiSummary: true,
        basedOn: ["progress stage records"],
      };
    }
    case "what_changed": {
      // The cache is invalidated by input-hash change; we cannot
      // diff previous vs current without storing history, so the
      // honest answer is what the analysis can and cannot compare.
      return {
        answer:
          "FRELUX compares against your recorded baseline, not a history of past analyses. The current analysis reflects every recorded change (estimates, purchases, stage completions and price records). A dated history of analyses is a future capability.",
        supportsAiSummary: true,
        basedOn: ["analysis cache is keyed by input hash"],
      };
    }
    case "why_cost_increasing": {
      const cost = find(analysis, "cost_overrun");
      const market = find(analysis, "material_price_trend");
      const reasons: string[] = [];
      if (cost && cost.status === "ok" && cost.result) {
        const r = cost.result as {
          priceIncreasedLines: Array<{ name: string; increasePct: number }>;
        };
        for (const l of r.priceIncreasedLines.slice(0, 3)) {
          reasons.push(
            `Recorded actual price for ${l.name} is ${(l.increasePct * 100).toFixed(0)}% above its recorded estimate`,
          );
        }
        if (r.priceIncreasedLines.length > 0) {
          reasons.push(
            `in total, ${r.priceIncreasedLines.length} material line(s) show recorded price increases`,
          );
        }
      }
      if (market && market.status === "ok" && market.result) {
        const r = market.result as {
          trends: Array<{
            materialName: string;
            direction: string;
            changePct: number;
            dataPoints: number;
          }>;
        };
        for (const t of r.trends
          .filter((x) => x.direction === "increasing")
          .slice(0, 3)) {
          reasons.push(
            `${t.materialName} market trend: increasing (${(t.changePct * 100).toFixed(1)}% over ${t.dataPoints} recorded points)`,
          );
        }
      }
      return {
        answer:
          reasons.length > 0
            ? `Based on your recorded data: ${reasons.join("; ")}. These are measured differences, not guesses.`
            : "No cost increases are measurable in your current records, either prices are tracking their estimates, or actual prices have not been recorded yet.",
        supportsAiSummary: true,
        basedOn:
          reasons.length > 0
            ? ["recorded price comparisons", "market trend analysis"]
            : ["no measurable increases found"],
      };
    }
  }
}

function find(
  analysis: ProjectPredictiveAnalysis,
  kind: string,
): PredictionResult | undefined {
  return analysis.predictions.find((p) => p.kind === kind);
}

/**
 * Build the context block the Copilot AI summarizes. The AI is
 * FORBIDDEN from adding numbers not present here, this function
 * is the retrieval layer for all predictive questions (§20).
 */
export function buildPredictiveContextForAi(
  analysis: ProjectPredictiveAnalysis,
): string {
  const lines: string[] = [
    `Project predictive analysis (generated ${analysis.generatedAt}, data quality ${analysis.dataQuality.rating}, ${analysis.dataQuality.reason}):`,
  ];
  for (const p of analysis.predictions) {
    lines.push(
      p.status === "ok"
        ? `- ${p.kind.replace(/_/g, " ")}: ${p.prediction} (confidence ${p.confidence?.band ?? "n/a"}, freshness ${p.freshness})`
        : `- ${p.kind.replace(/_/g, " ")}: INSUFFICIENT DATA, missing: ${p.missingData.join(", ")}`,
    );
  }
  if (analysis.risks.length > 0) {
    lines.push("Detected risks:");
    for (const r of analysis.risks) {
      lines.push(
        `- [${r.severity}] ${r.category}: ${r.title} → ${r.recommendedAction}`,
      );
    }
  } else {
    lines.push("No measurable risks detected in current records.");
  }
  lines.push(
    "RULE: summarize only the facts above. Do not add numbers, risks or predictions that are not present in this context. If something is insufficient data, say so.",
  );
  return lines.join("\n");
}
