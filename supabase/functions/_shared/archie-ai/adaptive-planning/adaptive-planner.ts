// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — CORE COORDINATOR
//
// Unifies means-ends analysis, Hierarchical Task Networks,
// DAG scheduling, Critical Path Method, dynamic contingencies,
// adaptive telemetry feedback, and Unified Memory integration.
// =========================================================

import type {
  Fact,
  FactPattern,
  Operator,
  PlanAlternative,
} from "../native-engine/types.ts";
import { FactStore } from "../native-engine/knowledge.ts";
import {
  DEFAULT_OPERATORS,
  PLANNING_OPERATORS,
} from "../native-engine/planning.ts";
import { CONSTRUCTION_OPERATORS } from "../native-engine/domains/construction.ts";
import type {
  AdaptivePlan,
  AdaptivePlanningDiagnostics,
  AdaptivePlanRequest,
  AdaptivePlanStepNode,
  HierarchicalMilestone,
  PlanExecutionStatus,
  PlanningObjectiveProfile,
  WaveExecutionResult,
} from "./types.ts";
import { DagScheduler } from "./dag-scheduler.ts";
import { HtnDecomposer } from "./htn-decomposer.ts";
import { ContingencyEngine } from "./contingency-engine.ts";
import { OperatorTelemetryStore } from "./telemetry-learning.ts";
import { MemoryPlannerBridge } from "./memory-planner-bridge.ts";

function patternLabel(pattern: FactPattern): string {
  return `${pattern.subject ?? "?"} ${pattern.predicate ?? "?"}`;
}

export class AdaptivePlanningEngine {
  private scheduler = new DagScheduler();
  private decomposer = new HtnDecomposer();
  private contingencyEngine = new ContingencyEngine();
  private telemetryStore = new OperatorTelemetryStore();
  private memoryBridge: MemoryPlannerBridge;
  private operators: Operator[];

  private diagnostics: AdaptivePlanningDiagnostics = {
    totalPlansGenerated: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    contingenciesTriggered: 0,
    repairsPerformed: 0,
    trackedOperatorsCount: 0,
    averagePlanReliability: 0.0,
  };

  constructor(
    private facts: FactStore = new FactStore(),
    customOperators?: Operator[],
    private derivable?: (pattern: FactPattern) => boolean,
  ) {
    this.memoryBridge = new MemoryPlannerBridge(facts);
    this.operators = customOperators ?? [
      ...DEFAULT_OPERATORS,
      ...PLANNING_OPERATORS,
      ...CONSTRUCTION_OPERATORS,
    ];
  }

  getTelemetryStore(): OperatorTelemetryStore {
    return this.telemetryStore;
  }

  getScheduler(): DagScheduler {
    return this.scheduler;
  }

  getOperators(): readonly Operator[] {
    return this.operators;
  }

  /**
   * Generates a fully scheduled, adaptive plan with DAG dependencies,
   * PERT critical path, dynamic contingencies, and HTN milestones.
   */
  async generatePlan(request: AdaptivePlanRequest): Promise<AdaptivePlan> {
    // Will increment and compute actual average reliability when plan nodes are generated

    const goalPattern: FactPattern =
      typeof request.goal === "string"
        ? { predicate: request.goal }
        : { ...request.goal };

    const goalSubject = goalPattern.subject ?? "general_task";
    const goalPredicate = goalPattern.predicate ?? "planned";
    const profile: PlanningObjectiveProfile = request.profile ?? "balanced";
    const maxDepth = request.depth ?? 10;

    // 1. Ingest context from Unified Memory
    const memoryContext = await this.memoryBridge.retrieveContext(
      goalSubject,
      request.workingMemoryConstraints,
    );

    // 2. Perform HTN milestone decomposition
    const milestones = this.decomposer.decomposeGoal(
      goalSubject,
      request.domainContext ?? "",
    );

    // 3. Goal-scoped operator instantiation
    const substPattern = (p: FactPattern): FactPattern =>
      p.subject === "$goal" && goalSubject !== undefined
        ? { ...p, subject: goalSubject }
        : p;

    const instantiatedOperators = this.operators.map((op) => ({
      ...op,
      achieves: substPattern(op.achieves),
      preconditions: op.preconditions.map(substPattern),
      effects: op.effects.map((f) =>
        f.subject === "$goal" && goalSubject !== undefined
          ? ({ ...f, subject: goalSubject } as Fact)
          : f,
      ),
    }));

    // 4. Means-ends planning with adaptive utility ranking
    const resolvedPatterns = new Set<string>();
    for (const p of memoryContext.preExistingSatisfiedPatterns) {
      resolvedPatterns.add(p);
    }

    const rawSteps: Array<{
      op: Operator;
      satisfies: string;
    }> = [];
    const gapReport: string[] = [];

    const resolvePrecondition = (pattern: FactPattern, depth: number): boolean => {
      const key = patternLabel(pattern);
      if (
        (this.facts.query(pattern).length > 0) ||
        resolvedPatterns.has(key)
      ) {
        return true;
      }

      if (this.derivable?.(pattern)) {
        resolvedPatterns.add(key);
        return true;
      }

      if (depth <= 0) {
        gapReport.push(`missing: ${key} (planning depth exhausted)`);
        return false;
      }

      // Find candidate operators achieving pattern
      const candidates = instantiatedOperators.filter(
        (op) =>
          this.matchesPattern(op.achieves, pattern) ||
          op.effects.some((e) => this.matchesPattern(e, pattern)),
      );

      if (candidates.length === 0) {
        gapReport.push(
          `missing: ${key} — no registered operator achieves this yet`,
        );
        return false;
      }

      // Rank candidates by adaptive utility according to the chosen profile
      candidates.sort(
        (a, b) =>
          this.telemetryStore.computeUtility(b, profile) -
          this.telemetryStore.computeUtility(a, profile),
      );

      for (const candidate of candidates) {
        const preconditionsMet = candidate.preconditions.every((pre) =>
          resolvePrecondition(pre, depth - 1),
        );

        if (preconditionsMet) {
          rawSteps.push({
            op: candidate,
            satisfies: key,
          });
          resolvedPatterns.add(key);
          for (const eff of candidate.effects) {
            resolvedPatterns.add(patternLabel(eff));
          }
          return true;
        }
      }

      return false;
    };

    const executable = resolvePrecondition(goalPattern, maxDepth);

    // 5. Build AdaptivePlanStepNode DAG
    const nodes: AdaptivePlanStepNode[] = [];
    const producedByKey = new Map<string, string>(); // patternLabel -> stepId

    // Pre-populate with store facts
    for (const p of memoryContext.preExistingSatisfiedPatterns) {
      producedByKey.set(p, "stored_fact");
    }

    let stepCounter = 1;
    for (const item of rawSteps) {
      const stepId = `step_${stepCounter.toString().padStart(2, "0")}_${item.op.id.replace(/^op_/, "")}`;
      stepCounter++;

      const dependsOn: string[] = [];
      for (const pre of item.op.preconditions) {
        const preKey = patternLabel(pre);
        const producerStepId = producedByKey.get(preKey);
        if (
          producerStepId &&
          producerStepId !== "stored_fact" &&
          !dependsOn.includes(producerStepId)
        ) {
          dependsOn.push(producerStepId);
        }
      }

      // Fallback: if no direct pattern match, depend on the immediate predecessor
      if (dependsOn.length === 0 && nodes.length > 0) {
        dependsOn.push(nodes[nodes.length - 1].id);
      }

      const baseCost = item.op.cost || 1;
      const adaptiveCost = this.telemetryStore.computeAdaptiveCost(item.op);
      const reliabilityScore = this.telemetryStore.computeReliability(item.op.id);

      const isConsequential =
        item.op.id.includes("propose") ||
        item.op.id.includes("trade") ||
        item.op.id.includes("deploy") ||
        item.op.id.includes("auth");

      // Approximate durations based on operator type
      let expDuration = 200;
      if (item.op.id.includes("research")) expDuration = 1200;
      if (item.op.id.includes("calculate") || item.op.id.includes("survey")) expDuration = 400;

      const node: AdaptivePlanStepNode = {
        id: stepId,
        operatorId: item.op.id,
        title: item.op.description,
        achieves: patternLabel(item.op.achieves),
        satisfies: item.satisfies,
        dependsOn,
        estimatedDurationMs: expDuration,
        optimisticDurationMs: Math.round(expDuration * 0.6),
        pessimisticDurationMs: Math.round(expDuration * 2.2),
        baseCost,
        adaptiveCost,
        reliabilityScore,
        requiresOwnerAuthorization: isConsequential,
        status: isConsequential ? "awaiting_owner" : "pending",
      };

      // Assign to matching milestone
      const matchingMilestone = this.findMatchingMilestone(milestones, item.op);
      if (matchingMilestone) {
        node.milestoneId = matchingMilestone.id;
        matchingMilestone.stepIds.push(stepId);
      }

      nodes.push(node);

      // Record achievements and effects
      producedByKey.set(patternLabel(item.op.achieves), stepId);
      for (const eff of item.op.effects) {
        producedByKey.set(patternLabel(eff), stepId);
      }
    }

    // 6. Assign Dynamic Contingencies
    const contingencyCount = this.contingencyEngine.assignContingencies(
      nodes,
      instantiatedOperators,
    );

    // 7. DAG Analysis: Validation, Waves, and Critical Path
    this.scheduler.validateDag(nodes);
    const criticalPath = this.scheduler.computeCriticalPath(nodes);

    // 8. Alternatives analysis
    const alternatives: PlanAlternative[] = [];
    for (const op of instantiatedOperators) {
      if (nodes.some((n) => n.operatorId === op.id)) continue;
      if (this.matchesPattern(op.achieves, goalPattern)) {
        alternatives.push({
          operatorIds: [op.id],
          description: op.description,
          totalCost: op.cost,
          tradeoff: `Alternative single-operator resolution achieving ${patternLabel(op.achieves)} directly.`,
        });
      }
    }

    const totalCost = nodes.reduce((sum, n) => sum + n.baseCost, 0);
    const adaptiveTotalCost = Number(
      nodes.reduce((sum, n) => sum + n.adaptiveCost, 0).toFixed(2),
    );

    const overallReliability = Number(
      (nodes.length === 0
        ? 1.0
        : nodes.reduce((acc, n) => acc * n.reliabilityScore, 1.0)
      ).toFixed(3),
    );

    this.diagnostics.totalPlansGenerated++;
    const prevTotal = this.diagnostics.totalPlansGenerated - 1;
    this.diagnostics.averagePlanReliability = Number(
      ((this.diagnostics.averagePlanReliability * prevTotal + overallReliability) /
        this.diagnostics.totalPlansGenerated).toFixed(3),
    );

    const hasOwnerAuthGate = nodes.some((n) => n.requiresOwnerAuthorization);

    const plan: AdaptivePlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      goal: `${goalSubject} ${goalPredicate}`.trim(),
      goalSubject,
      profile,
      nodes,
      milestones,
      criticalPath,
      executable,
      totalCost,
      adaptiveTotalCost,
      overallReliability,
      gapReport,
      alternatives,
      requiresOwnerAuthorization: hasOwnerAuthGate,
      activeConstraints: memoryContext.activeConstraints,
      relevantLessons: memoryContext.relevantLessons,
      contingencyCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return plan;
  }

  /**
   * Executes a specific wave of steps concurrently.
   */
  async executeWave(
    plan: AdaptivePlan,
    waveIndex: number,
    executor: (node: AdaptivePlanStepNode) => Promise<{
      status: PlanExecutionStatus;
      result?: string;
      error?: string;
    }>,
  ): Promise<WaveExecutionResult> {
    const waves = plan.criticalPath.parallelExecutionWaves;
    if (waveIndex >= waves.length) {
      return {
        waveIndex,
        stepResults: [],
        waveCompleted: true,
        blockedForOwner: false,
      };
    }

    const currentWaveStepIds = waves[waveIndex];
    const stepResults: WaveExecutionResult["stepResults"] = [];
    let blockedForOwner = false;

    for (const stepId of currentWaveStepIds) {
      const node = plan.nodes.find((n) => n.id === stepId);
      if (!node) continue;

      // Explicit prerequisite check: Ensure all declared dependencies have actually succeeded
      const failedDep = node.dependsOn.find((depId) => {
        const depNode = plan.nodes.find((n) => n.id === depId);
        return !depNode || depNode.status !== "executed";
      });

      if (failedDep) {
        node.status = "blocked";
        node.error = `Prerequisite step ${failedDep} has not executed successfully.`;
        stepResults.push({
          stepId: node.id,
          operatorId: node.operatorId,
          status: "blocked",
          error: node.error,
        });
        continue;
      }

      if (node.requiresOwnerAuthorization && node.status === "awaiting_owner") {
        blockedForOwner = true;
        stepResults.push({
          stepId: node.id,
          operatorId: node.operatorId,
          status: "awaiting_owner",
          result: "Halted at Owner Authorization boundary.",
        });
        continue;
      }

      const start = Date.now();
      try {
        node.status = "in_progress";
        const execRes = await executor(node);
        const duration = Date.now() - start;

        node.status = execRes.status;
        node.result = execRes.result;
        node.error = execRes.error;
        node.executedAt = new Date().toISOString();

        const success = execRes.status === "executed";
        this.telemetryStore.recordExecution(
          node.operatorId,
          success,
          duration,
          execRes.error,
        );

        if (success) {
          this.diagnostics.successfulExecutions++;
        } else {
          this.diagnostics.failedExecutions++;
        }

        stepResults.push({
          stepId: node.id,
          operatorId: node.operatorId,
          status: execRes.status,
          result: execRes.result,
          error: execRes.error,
        });
      } catch (err) {
        const duration = Date.now() - start;
        const errMsg = err instanceof Error ? err.message : String(err);
        node.status = "failed";
        node.error = errMsg;

        this.telemetryStore.recordExecution(node.operatorId, false, duration, errMsg);
        this.diagnostics.failedExecutions++;

        stepResults.push({
          stepId: node.id,
          operatorId: node.operatorId,
          status: "failed",
          error: errMsg,
        });
      }
    }

    const allExecuted = stepResults.every((r) => r.status === "executed");
    return {
      waveIndex,
      stepResults,
      waveCompleted: allExecuted,
      blockedForOwner,
      nextWaveIndex: allExecuted && waveIndex + 1 < waves.length ? waveIndex + 1 : undefined,
    };
  }

  /**
   * Triggers adaptive repair for a failed step without losing
   * progress from earlier executed steps.
   */
  async repairPlan(
    plan: AdaptivePlan,
    failedStepId: string,
    errorMessage: string,
  ): Promise<{ plan: AdaptivePlan; repaired: boolean; strategyApplied: string }> {
    this.diagnostics.repairsPerformed++;

    const repairResult = this.contingencyEngine.repairPlan(
      plan,
      failedStepId,
      errorMessage,
      this.operators,
    );

    if (repairResult.repaired) {
      this.diagnostics.contingenciesTriggered++;
      // Recompute Critical Path and Waves
      const criticalPath = this.scheduler.computeCriticalPath(
        repairResult.repairedPlan.nodes,
      );
      repairResult.repairedPlan.criticalPath = criticalPath;
    }

    return {
      plan: repairResult.repairedPlan,
      repaired: repairResult.repaired,
      strategyApplied: repairResult.strategyApplied,
    };
  }

  getDiagnostics(): AdaptivePlanningDiagnostics {
    this.diagnostics.trackedOperatorsCount = this.telemetryStore.getAllTelemetry().length;
    return { ...this.diagnostics };
  }

  private matchesPattern(achieved: FactPattern, required: FactPattern): boolean {
    if (
      required.predicate !== undefined &&
      achieved.predicate !== required.predicate
    ) {
      return false;
    }
    if (
      required.subject !== undefined &&
      achieved.subject !== required.subject
    ) {
      return false;
    }
    return true;
  }

  private findMatchingMilestone(
    milestones: HierarchicalMilestone[],
    op: Operator,
  ): HierarchicalMilestone | undefined {
    if (milestones.length === 0) return undefined;
    const opText = `${op.id} ${op.description}`.toLowerCase();

    for (const ms of milestones) {
      const msText = `${ms.id} ${ms.title}`.toLowerCase();
      if (
        (opText.includes("inventory") || opText.includes("gap")) &&
        (msText.includes("prerequisite") || msText.includes("gap") || msText.includes("anchor"))
      ) {
        return ms;
      }
      if (
        (opText.includes("research") || opText.includes("cost") || opText.includes("quantit")) &&
        (msText.includes("cost") || msText.includes("retrieval") || msText.includes("task"))
      ) {
        return ms;
      }
      if (
        (opText.includes("sequence") || opText.includes("draft") || opText.includes("weather")) &&
        (msText.includes("schedul") || msText.includes("corroborat") || msText.includes("implement"))
      ) {
        return ms;
      }
      if (
        (opText.includes("propose") || opText.includes("owner")) &&
        (msText.includes("proposal") || msText.includes("review") || msText.includes("synthesis"))
      ) {
        return ms;
      }
    }

    return milestones[milestones.length - 1];
  }
}

export function createAdaptivePlanningEngine(
  facts?: FactStore,
  operators?: Operator[],
): AdaptivePlanningEngine {
  return new AdaptivePlanningEngine(facts, operators);
}
