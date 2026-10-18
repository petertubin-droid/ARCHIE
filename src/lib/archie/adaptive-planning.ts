// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — CLIENT INTERFACE
//
// Client-side entry point and presentation adapter for the
// ARCHIE Adaptive Planning Engine. Connects the frontend to
// DAG scheduling, Critical Path Method, HTN milestones,
// dynamic contingency branches, and execution telemetry.
// =========================================================

import {
  AdaptivePlanningEngine,
  createAdaptivePlanningEngine,
} from "@studio-shared/archie-ai/adaptive-planning/index.ts";
import type {
  AdaptivePlan,
  AdaptivePlanRequest,
  PlanningObjectiveProfile,
  WaveExecutionResult,
} from "@studio-shared/archie-ai/adaptive-planning/types.ts";

export {
  AdaptivePlanningEngine,
  createAdaptivePlanningEngine,
};
export type {
  AdaptivePlan,
  AdaptivePlanRequest,
  PlanningObjectiveProfile,
  WaveExecutionResult,
};

/**
 * Generates an adaptive plan for an objective with default engine bindings.
 */
export async function planObjectiveAdaptively(
  goal: string,
  options: {
    profile?: PlanningObjectiveProfile;
    workingMemoryConstraints?: string[];
    domainContext?: string;
  } = {},
): Promise<AdaptivePlan> {
  const engine = createAdaptivePlanningEngine();
  return engine.generatePlan({
    goal: {
      subject: goal,
      predicate: "planned",
    },
    profile: options.profile ?? "balanced",
    workingMemoryConstraints: options.workingMemoryConstraints,
    domainContext: options.domainContext,
  });
}

/**
 * Formats an adaptive plan for human-readable display in chat or UI.
 */
export function formatAdaptivePlanSummary(plan: AdaptivePlan): string {
  const lines: string[] = [];
  lines.push(`🎯 Plan: ${plan.goal}`);
  lines.push(
    `⚡ Profile: ${plan.profile} | Total Cost: ${plan.totalCost} (Adaptive: ${plan.adaptiveTotalCost}) | Reliability: ${(plan.overallReliability * 100).toFixed(1)}%`,
  );
  lines.push(
    `⏱️ Estimated Duration: ${plan.criticalPath.totalEstimatedDurationMs}ms across ${plan.criticalPath.parallelExecutionWaves.length} execution wave(s)`,
  );

  if (plan.criticalPath.criticalPathStepIds.length > 0) {
    lines.push(
      `🔗 Critical Path Steps: ${plan.criticalPath.criticalPathStepIds.join(" -> ")}`,
    );
  }

  if (plan.milestones.length > 0) {
    lines.push("\n🏛️ Milestones:");
    for (const ms of plan.milestones) {
      lines.push(`  ${ms.order}. ${ms.title} (${ms.stepIds.length} steps)`);
    }
  }

  lines.push("\n📋 Execution Waves (DAG Scheduled):");
  plan.criticalPath.parallelExecutionWaves.forEach((wave, idx) => {
    lines.push(`  Wave ${idx + 1} (${wave.length} parallel step(s)):`);
    for (const stepId of wave) {
      const node = plan.nodes.find((n) => n.id === stepId);
      if (node) {
        const auth = node.requiresOwnerAuthorization ? " [Owner Gate]" : "";
        const cont = node.contingency ? " [Has Contingency]" : "";
        lines.push(`    - ${node.title} (${node.operatorId})${auth}${cont}`);
      }
    }
  });

  if (plan.criticalPath.bottlenecks.length > 0) {
    lines.push("\n⚠️ Bottlenecks & Gates:");
    for (const b of plan.criticalPath.bottlenecks) {
      lines.push(`  - Step ${b.stepId}: ${b.reason}`);
    }
  }

  if (plan.gapReport.length > 0) {
    lines.push("\n❌ Honest Gap Report:");
    for (const g of plan.gapReport) {
      lines.push(`  - ${g}`);
    }
  }

  return lines.join("\n");
}
