// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — CONTINGENCY & REPAIR
//
// Dynamic fallback strategies, failure containment,
// checkpoint-preserving partial plan repair, and recovery.
// =========================================================

import type { Operator } from "../native-engine/types.ts";
import type {
  AdaptivePlan,
  AdaptivePlanStepNode,
  ContingencyStrategy,
  ExecutionCheckpoint,
} from "./types.ts";

export class ContingencyEngine {
  /**
   * Evaluates step risk and assigns contingency strategies
   * to potentially fragile or external operator steps.
   */
  assignContingencies(
    steps: AdaptivePlanStepNode[],
    allOperators: Operator[],
  ): number {
    let attachedCount = 0;

    for (const step of steps) {
      if (step.contingency) continue;

      if (step.operatorId === "op_web_research") {
        step.contingency = {
          triggerOn: "step_failure",
          action: "fallback_operator",
          fallbackOperatorId: "op_owner_teach_goal_knowledge",
          fallbackDescription:
            "Request direct owner guidance for missing goal knowledge if web research is unavailable or rate-limited.",
          rationale:
            "Owner knowledge teaching preserves goal continuity without unvalidated assumptions.",
        };
        attachedCount++;
      } else if (step.operatorId.includes("price") || step.operatorId.includes("market")) {
        step.contingency = {
          triggerOn: "step_failure",
          action: "relax_constraint",
          fallbackOperatorId: "op_reason_over_facts",
          fallbackDescription:
            "Calibrate via historical macro inflation multipliers if live supplier quotes fail.",
          rationale:
            "Prevents silent quote guessing while preserving estimation realness.",
        };
        attachedCount++;
      } else if (step.requiresOwnerAuthorization) {
        step.contingency = {
          triggerOn: "owner_denied",
          action: "request_owner_guidance",
          fallbackDescription:
            "Halt execution at approval boundary and present modification options.",
          rationale:
            "Consequential actions strictly respect owner authority boundaries.",
        };
        attachedCount++;
      } else if (step.reliabilityScore < 0.75) {
        // Find alternative operator achieving the same goal predicate
        const altOp = allOperators.find(
          (o) =>
            o.id !== step.operatorId &&
            o.achieves.predicate === step.achieves,
        );
        if (altOp) {
          step.contingency = {
            triggerOn: "step_failure",
            action: "fallback_operator",
            fallbackOperatorId: altOp.id,
            fallbackDescription: `Fallback to alternative operator: ${altOp.description}`,
            rationale:
              "Low historical reliability triggers automatic alternative routing.",
          };
          attachedCount++;
        }
      }
    }

    return attachedCount;
  }

  /**
   * Captures an execution checkpoint of completed steps
   * so progress is not lost upon partial failure.
   */
  createCheckpoint(plan: AdaptivePlan, currentWave = 0): ExecutionCheckpoint {
    const completedStepIds: string[] = [];
    const stepResults: Record<string, string> = {};

    for (const node of plan.nodes) {
      if (node.status === "executed" && node.result) {
        completedStepIds.push(node.id);
        stepResults[node.id] = node.result;
      }
    }

    return {
      planId: plan.id,
      timestamp: new Date().toISOString(),
      completedStepIds,
      stepResults,
      currentWaveIndex: currentWave,
      resumedFromCheckpoint: false,
    };
  }

  /**
   * Finds all downstream nodes that depend directly or transitively
   * on a failed step.
   */
  findDownstreamDependents(
    failedStepId: string,
    nodes: AdaptivePlanStepNode[],
  ): Set<string> {
    const dependents = new Set<string>();
    const queue = [failedStepId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const node of nodes) {
        if (node.dependsOn.includes(current) && !dependents.has(node.id)) {
          dependents.add(node.id);
          queue.push(node.id);
        }
      }
    }

    return dependents;
  }

  /**
   * Performs partial plan repair:
   * Keeps all already executed steps untouched,
   * handles the failed step (via contingency or replacement),
   * and repairs downstream dependency links.
   */
  repairPlan(
    plan: AdaptivePlan,
    failedStepId: string,
    errorMessage: string,
    availableOperators: Operator[],
  ): {
    repairedPlan: AdaptivePlan;
    repaired: boolean;
    strategyApplied: string;
  } {
    const failedNode = plan.nodes.find((n) => n.id === failedStepId);
    if (!failedNode) {
      return {
        repairedPlan: plan,
        repaired: false,
        strategyApplied: `Failed step "${failedStepId}" not found in plan.`,
      };
    }

    failedNode.status = "failed";
    failedNode.error = errorMessage;

    // Check if step has an explicit contingency
    if (failedNode.contingency && failedNode.contingency.action === "fallback_operator") {
      const fallbackOpId = failedNode.contingency.fallbackOperatorId;
      const fallbackOp = availableOperators.find((o) => o.id === fallbackOpId);

      if (fallbackOp) {
        const replacementId = `${failedNode.id}_contingency`;
        const replacementNode: AdaptivePlanStepNode = {
          id: replacementId,
          operatorId: fallbackOp.id,
          title: `[Contingency] ${fallbackOp.description}`,
          achieves: failedNode.achieves,
          satisfies: failedNode.satisfies,
          dependsOn: [...failedNode.dependsOn],
          estimatedDurationMs: 300,
          optimisticDurationMs: 150,
          pessimisticDurationMs: 600,
          baseCost: fallbackOp.cost || 2,
          adaptiveCost: fallbackOp.cost || 2,
          reliabilityScore: 0.9,
          requiresOwnerAuthorization: false,
          milestoneId: failedNode.milestoneId,
          status: "pending",
        };

        // Rewire downstream dependents to point to replacementNode instead of failedNode
        const downstream = this.findDownstreamDependents(failedStepId, plan.nodes);
        for (const node of plan.nodes) {
          if (downstream.has(node.id)) {
            node.dependsOn = node.dependsOn.map((dep) =>
              dep === failedStepId ? replacementId : dep,
            );
            if (node.status === "failed") {
              node.status = "pending";
              node.error = undefined;
            }
          }
        }

        // Add replacement node to plan
        const newNodes = [
          ...plan.nodes.filter((n) => n.id !== failedStepId),
          failedNode, // Keep failed node marked as failed for audit
          replacementNode,
        ];

        return {
          repairedPlan: {
            ...plan,
            nodes: newNodes,
            updatedAt: new Date().toISOString(),
          },
          repaired: true,
          strategyApplied: `Activated contingency fallback "${fallbackOp.id}" replacing "${failedStepId}".`,
        };
      }
    }

    // If no direct contingency operator, check if downstream can be isolated or owner requested
    if (failedNode.contingency && failedNode.contingency.action === "request_owner_guidance") {
      failedNode.status = "awaiting_owner";
      return {
        repairedPlan: plan,
        repaired: true,
        strategyApplied: `Execution paused for owner guidance on step "${failedStepId}".`,
      };
    }

    // Default repair: mark downstream as blocked honestly
    const downstream = this.findDownstreamDependents(failedStepId, plan.nodes);
    for (const node of plan.nodes) {
      if (downstream.has(node.id)) {
        node.status = "failed";
        node.error = `Blocked by failure of upstream dependency "${failedStepId}".`;
      }
    }

    return {
      repairedPlan: {
        ...plan,
        executable: false,
        gapReport: [
          ...plan.gapReport,
          `Step "${failedStepId}" (${failedNode.operatorId}) failed: ${errorMessage}. ${downstream.size} dependent step(s) blocked.`,
        ],
        updatedAt: new Date().toISOString(),
      },
      repaired: false,
      strategyApplied: `No viable contingency; marked ${downstream.size} downstream step(s) as blocked.`,
    };
  }
}
