// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — RESOURCE ALLOCATOR
//
// Manages and enforces tool call limits, compute token limits,
// execution time budgets, financial budgets, and concurrency.
// =========================================================

import type {
  AdaptivePlanStepNode,
  ResourceAllocation,
  ResourceBudget,
  ResourceConflict,
} from "./types.ts";

export interface SystemResourceLimits {
  maxToolCallsPerPlan: number;
  maxComputeTokensPerPlan: number;
  maxExecutionTimeMs: number;
  maxStorageBytes: number;
  maxConcurrentSteps: number;
  maxPlanCost?: number;
  maxConcurrentTasks?: number;
  maxToolInvocations?: number;
  maxPlanDurationMs?: number;
}

export const DEFAULT_SYSTEM_LIMITS: SystemResourceLimits = {
  maxToolCallsPerPlan: 25,
  maxComputeTokensPerPlan: 100_000,
  maxExecutionTimeMs: 600_000, // 10 minutes
  maxStorageBytes: 50 * 1024 * 1024, // 50MB
  maxConcurrentSteps: 5,
  maxPlanCost: 1000,
};

export interface ResourceAllocationResult {
  feasible: boolean;
  allocations: ResourceAllocation[];
  conflicts: ResourceConflict[];
}

export class ResourceAllocator {
  private limits: SystemResourceLimits;

  constructor(customLimits?: Partial<SystemResourceLimits>) {
    this.limits = {
      ...DEFAULT_SYSTEM_LIMITS,
      ...customLimits,
    };
    if (customLimits?.maxConcurrentTasks !== undefined) {
      this.limits.maxConcurrentSteps = customLimits.maxConcurrentTasks;
    }
    if (customLimits?.maxToolInvocations !== undefined) {
      this.limits.maxToolCallsPerPlan = customLimits.maxToolInvocations;
    }
    if (customLimits?.maxPlanDurationMs !== undefined) {
      this.limits.maxExecutionTimeMs = customLimits.maxPlanDurationMs;
    }
  }

  /**
   * Evaluates the resource requirements of a set of plan nodes against
   * the provided budget and system resource limits.
   */
  evaluateResourceFeasibility(
    nodes: AdaptivePlanStepNode[],
    budget?: ResourceBudget,
  ): ResourceAllocationResult {
    const allocations: ResourceAllocation[] = [];
    const conflicts: ResourceConflict[] = [];

    // 1. Tool Call Allocation
    const toolCallLimit = Math.min(
      budget?.toolCallQuota ?? Infinity,
      this.limits.maxToolCallsPerPlan,
    );
    const totalToolCalls = nodes.filter(
      (n) => n.operatorId.includes("research") || n.operatorId.includes("web") || n.operatorId.includes("call"),
    ).length;

    allocations.push({
      resourceType: "tool_call",
      allocated: totalToolCalls,
      available: Math.max(0, toolCallLimit - totalToolCalls),
      limit: toolCallLimit,
      unit: "invocations",
    });

    if (totalToolCalls > toolCallLimit) {
      conflicts.push({
        resourceType: "tool_call",
        requested: totalToolCalls,
        limit: toolCallLimit,
        shortfall: totalToolCalls - toolCallLimit,
        blockingStepId: nodes.find((n) => n.operatorId.includes("research"))?.id,
        severity: "hard",
        message: `Plan requires ${totalToolCalls} tool calls, exceeding budget limit of ${toolCallLimit}.`,
      });
    }

    // 2. Duration Allocation
    const durationLimit = Math.min(
      budget?.timeBudgetMs ?? Infinity,
      this.limits.maxExecutionTimeMs,
    );
    const totalDuration = nodes.reduce((sum, n) => sum + (n.estimatedDurationMs || 200), 0);

    allocations.push({
      resourceType: "time",
      allocated: totalDuration,
      available: Math.max(0, durationLimit - totalDuration),
      limit: durationLimit,
      unit: "ms",
    });

    if (totalDuration > durationLimit) {
      conflicts.push({
        resourceType: "time",
        requested: totalDuration,
        limit: durationLimit,
        shortfall: totalDuration - durationLimit,
        severity: "soft",
        message: `Plan estimated duration (${totalDuration}ms) exceeds time budget of ${durationLimit}ms.`,
      });
    }

    // 3. Financial / Plan Cost Allocation
    const costLimit = Math.min(
      budget?.financialCostLimit ?? Infinity,
      this.limits.maxPlanCost ?? 1000,
    );
    const totalCost = nodes.reduce((sum, n) => sum + (n.baseCost || 1), 0);

    allocations.push({
      resourceType: "cost",
      allocated: totalCost,
      available: Math.max(0, costLimit - totalCost),
      limit: costLimit,
      unit: "credits",
    });

    if (totalCost > costLimit) {
      conflicts.push({
        resourceType: "cost",
        requested: totalCost,
        limit: costLimit,
        shortfall: totalCost - costLimit,
        blockingStepId: nodes[nodes.length - 1]?.id,
        severity: "hard",
        message: `Plan aggregate cost (${totalCost}) exceeds limit (${costLimit}).`,
      });
    }

    const feasible = conflicts.filter((c) => c.severity === "hard").length === 0;

    return {
      feasible,
      allocations,
      conflicts,
    };
  }

  allocate(
    goalId: string,
    nodes: AdaptivePlanStepNode[],
    budget?: ResourceBudget,
  ): ResourceAllocationResult {
    return this.evaluateResourceFeasibility(nodes, budget);
  }
}
