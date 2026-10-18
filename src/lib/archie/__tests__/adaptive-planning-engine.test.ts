import { describe, expect, it } from "vitest";
// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — TEST SUITE
//
// Verifies DAG scheduling, Critical Path Method (CPM), PERT
// duration estimation, Hierarchical Task Networks (HTN),
// parallel execution waves, dynamic contingency branching,
// checkpoint-preserving partial plan repair, adaptive
// telemetry learning, Unified Memory integration, and the
// strict Owner Authorization gate.
// =========================================================

import {
  AdaptivePlanningEngine,
  createAdaptivePlanningEngine,
  formatAdaptivePlanSummary,
  planObjectiveAdaptively,
} from "@/lib/archie/adaptive-planning";
import { DagScheduler } from "@studio-shared/archie-ai/adaptive-planning/dag-scheduler.ts";
import { HtnDecomposer } from "@studio-shared/archie-ai/adaptive-planning/htn-decomposer.ts";
import { OperatorTelemetryStore } from "@studio-shared/archie-ai/adaptive-planning/telemetry-learning.ts";
import { ContingencyEngine } from "@studio-shared/archie-ai/adaptive-planning/contingency-engine.ts";
import type { AdaptivePlanStepNode } from "@studio-shared/archie-ai/adaptive-planning/types.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

describe("DAG Scheduling & Critical Path Method", () => {
  const scheduler = new DagScheduler();

  const mockSteps: AdaptivePlanStepNode[] = [
    {
      id: "step_01",
      operatorId: "op_inventory",
      title: "Inventory prerequisites",
      achieves: "prerequisites mapped",
      satisfies: "prerequisites mapped",
      dependsOn: [],
      estimatedDurationMs: 200,
      optimisticDurationMs: 100,
      pessimisticDurationMs: 400,
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.95,
      requiresOwnerAuthorization: false,
      status: "pending",
    },
    {
      id: "step_02",
      operatorId: "op_gaps",
      title: "Identify gaps",
      achieves: "gaps identified",
      satisfies: "gaps identified",
      dependsOn: ["step_01"],
      estimatedDurationMs: 300,
      optimisticDurationMs: 150,
      pessimisticDurationMs: 600,
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.98,
      requiresOwnerAuthorization: false,
      status: "pending",
    },
    {
      id: "step_03_parallel",
      operatorId: "op_weather",
      title: "Check weather forecast",
      achieves: "weather checked",
      satisfies: "weather checked",
      dependsOn: ["step_01"],
      estimatedDurationMs: 100,
      optimisticDurationMs: 50,
      pessimisticDurationMs: 200,
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.99,
      requiresOwnerAuthorization: false,
      status: "pending",
    },
    {
      id: "step_04",
      operatorId: "op_sequence",
      title: "Sequence tasks",
      achieves: "tasks sequenced",
      satisfies: "tasks sequenced",
      dependsOn: ["step_02", "step_03_parallel"],
      estimatedDurationMs: 400,
      optimisticDurationMs: 200,
      pessimisticDurationMs: 800,
      baseCost: 2,
      adaptiveCost: 2,
      reliabilityScore: 0.92,
      requiresOwnerAuthorization: false,
      status: "pending",
    },
  ];

  it("validates valid DAG with no circular dependencies", () => {
    const res = scheduler.validateDag(mockSteps);
    expect(res.valid).toBe(true);
    expect(res.hasCycles).toBe(false);
    expect(res.issues).toHaveLength(0);
  });

  it("flags missing dependencies and circular loops honestly", () => {
    const brokenSteps: AdaptivePlanStepNode[] = [
      {
        ...mockSteps[0],
        id: "loop_A",
        dependsOn: ["loop_B"],
      },
      {
        ...mockSteps[1],
        id: "loop_B",
        dependsOn: ["loop_A"],
      },
    ];

    const res = scheduler.validateDag(brokenSteps);
    expect(res.valid).toBe(false);
    expect(res.hasCycles).toBe(true);
    expect(res.issues.join(" ")).toMatch(/Circular dependency/i);
  });

  it("groups independent tasks into parallel execution waves", () => {
    const waves = scheduler.computeExecutionWaves(mockSteps);
    expect(waves.length).toBe(3);
    // Wave 1: root steps with 0 dependencies
    expect(waves[0]).toEqual(["step_01"]);
    // Wave 2: step_02 and step_03_parallel can execute concurrently
    expect(waves[1]).toEqual(["step_02", "step_03_parallel"]);
    // Wave 3: step_04 depends on both previous steps
    expect(waves[2]).toEqual(["step_04"]);
  });

  it("calculates PERT expected duration and Critical Path correctly", () => {
    const cpm = scheduler.computeCriticalPath(mockSteps);
    expect(cpm.totalEstimatedDurationMs).toBeGreaterThan(0);
    // step_02 (317ms PERT) takes longer than step_03_parallel (108ms PERT)
    // Thus the critical path must flow step_01 -> step_02 -> step_04
    expect(cpm.criticalPathStepIds).toContain("step_01");
    expect(cpm.criticalPathStepIds).toContain("step_02");
    expect(cpm.criticalPathStepIds).toContain("step_04");
    // step_03_parallel has positive slack (float)
    expect(cpm.slackPerStep["step_03_parallel"]).toBeGreaterThan(0);
    expect(cpm.slackPerStep["step_02"]).toBeLessThanOrEqual(1);
  });
});

describe("Hierarchical Task Networks (HTN) Decomposition", () => {
  const decomposer = new HtnDecomposer();

  it("decomposes construction goals into phased engineering milestones", () => {
    const milestones = decomposer.decomposeGoal("3-bedroom bungalow in Ibadan");
    expect(milestones.length).toBeGreaterThanOrEqual(3);
    expect(milestones[0].title).toMatch(/prerequisites/i);
    expect(milestones[1].title).toMatch(/quantities|cost/i);
    expect(milestones[milestones.length - 1].title).toMatch(/proposal|authorization/i);
    // Milestones enforce dependency progression
    expect(milestones[1].dependsOnMilestones).toContain(milestones[0].id);
  });

  it("decomposes research goals into evidence & truth milestones", () => {
    const milestones = decomposer.decomposeGoal("research historic mortar recipes in Nigeria");
    expect(milestones[0].title).toMatch(/gap/i);
    expect(milestones[1].title).toMatch(/evidence/i);
    expect(milestones[2].title).toMatch(/cross-checking|contradiction|corroboration/i);
  });

  it("decomposes software engineering goals into static analysis & review milestones", () => {
    const milestones = decomposer.decomposeGoal("refactor payment api dependencies");
    expect(milestones[0].title).toMatch(/static code|analysis/i);
    expect(milestones[milestones.length - 1].title).toMatch(/review|gate/i);
  });
});

describe("Adaptive Telemetry & Learning Calibration", () => {
  it("computes Laplace-smoothed reliability without division by zero", () => {
    const store = new OperatorTelemetryStore();
    const rel = store.computeReliability("op_inventory_prerequisites");
    expect(rel).toBeGreaterThan(0.9);
    expect(rel).toBeLessThanOrEqual(1.0);
  });

  it("penalizes operator cost and reduces utility upon repeated failures", () => {
    const store = new OperatorTelemetryStore();
    const mockOp = {
      id: "op_flaky_service",
      description: "Flaky external service",
      achieves: { subject: "quote", predicate: "fetched" },
      preconditions: [],
      effects: [],
      cost: 2,
    };

    const initialUtility = store.computeUtility(mockOp, "balanced");

    // Simulate 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      store.recordExecution("op_flaky_service", false, 1500, "Timeout error", "external");
    }

    const penalisedCost = store.computeAdaptiveCost(mockOp);
    const penalisedUtility = store.computeUtility(mockOp, "balanced");

    expect(penalisedCost).toBeGreaterThan(mockOp.cost);
    expect(penalisedUtility).toBeLessThan(initialUtility);
  });

  it("optimizes operator utility differently across objective profiles", () => {
    const store = new OperatorTelemetryStore();
    const fastOp = {
      id: "op_fast_internal",
      description: "Fast in-memory solver",
      achieves: { subject: "x", predicate: "y" },
      preconditions: [],
      effects: [],
      cost: 5,
    };
    const cheapOp = {
      id: "op_cheap_slow",
      description: "Slow cheap solver",
      achieves: { subject: "x", predicate: "y" },
      preconditions: [],
      effects: [],
      cost: 1,
    };

    store.recordExecution("op_fast_internal", true, 50);
    store.recordExecution("op_cheap_slow", true, 2000);

    const utilityFast = store.computeUtility(fastOp, "fastest");
    const utilityCheapOnFast = store.computeUtility(cheapOp, "fastest");
    expect(utilityFast).toBeGreaterThan(utilityCheapOnFast);

    const utilityCheapOnCost = store.computeUtility(cheapOp, "lowest_cost");
    const utilityFastOnCost = store.computeUtility(fastOp, "lowest_cost");
    expect(utilityCheapOnCost).toBeGreaterThan(utilityFastOnCost);
  });
});

describe("Dynamic Contingency & Checkpoint-Preserving Repair", () => {
  const contingencyEngine = new ContingencyEngine();

  it("attaches contingency strategies to high-risk or external operators", () => {
    const testNodes: AdaptivePlanStepNode[] = [
      {
        id: "step_web",
        operatorId: "op_web_research",
        title: "Web research",
        achieves: "knowledge available",
        satisfies: "knowledge available",
        dependsOn: [],
        estimatedDurationMs: 1200,
        optimisticDurationMs: 600,
        pessimisticDurationMs: 3000,
        baseCost: 5,
        adaptiveCost: 5,
        reliabilityScore: 0.7,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
    ];

    const attached = contingencyEngine.assignContingencies(testNodes, []);
    expect(attached).toBe(1);
    expect(testNodes[0].contingency).toBeDefined();
    expect(testNodes[0].contingency?.action).toBe("fallback_operator");
    expect(testNodes[0].contingency?.fallbackOperatorId).toBe("op_owner_teach_goal_knowledge");
  });

  it("captures execution checkpoints of completed progress", () => {
    const mockPlan = {
      id: "test_plan",
      nodes: [
        {
          id: "step_01",
          operatorId: "op_a",
          title: "A",
          achieves: "a",
          satisfies: "a",
          dependsOn: [],
          estimatedDurationMs: 100,
          optimisticDurationMs: 50,
          pessimisticDurationMs: 200,
          baseCost: 1,
          adaptiveCost: 1,
          reliabilityScore: 0.9,
          requiresOwnerAuthorization: false,
          status: "executed" as const,
          result: "Done successfully",
        },
        {
          id: "step_02",
          operatorId: "op_b",
          title: "B",
          achieves: "b",
          satisfies: "b",
          dependsOn: ["step_01"],
          estimatedDurationMs: 100,
          optimisticDurationMs: 50,
          pessimisticDurationMs: 200,
          baseCost: 1,
          adaptiveCost: 1,
          reliabilityScore: 0.9,
          requiresOwnerAuthorization: false,
          status: "pending" as const,
        },
      ],
    } as any;

    const checkpoint = contingencyEngine.createCheckpoint(mockPlan, 0);
    expect(checkpoint.completedStepIds).toEqual(["step_01"]);
    expect(checkpoint.stepResults["step_01"]).toBe("Done successfully");
  });

  it("performs partial plan repair when a step fails with a contingency fallback", () => {
    const availableOperators = [
      {
        id: "op_owner_teach_goal_knowledge",
        description: "Owner teaches knowledge directly",
        achieves: { subject: "$goal", predicate: "knowledge-available" },
        preconditions: [],
        effects: [],
        cost: 1,
      },
    ];

    const failingPlan: any = {
      id: "plan_repair_test",
      goal: "research roofing materials",
      nodes: [
        {
          id: "step_01",
          operatorId: "op_web_research",
          title: "Web research",
          achieves: "knowledge-available",
          satisfies: "knowledge-available",
          dependsOn: [],
          estimatedDurationMs: 1200,
          optimisticDurationMs: 600,
          pessimisticDurationMs: 2400,
          baseCost: 5,
          adaptiveCost: 5,
          reliabilityScore: 0.7,
          requiresOwnerAuthorization: false,
          status: "in_progress",
          contingency: {
            triggerOn: "step_failure",
            action: "fallback_operator",
            fallbackOperatorId: "op_owner_teach_goal_knowledge",
            rationale: "Fallback to owner teaching",
          },
        },
        {
          id: "step_02",
          operatorId: "op_draft_plan",
          title: "Draft plan",
          achieves: "plan-drafted",
          satisfies: "plan-drafted",
          dependsOn: ["step_01"],
          estimatedDurationMs: 200,
          optimisticDurationMs: 100,
          pessimisticDurationMs: 400,
          baseCost: 1,
          adaptiveCost: 1,
          reliabilityScore: 0.95,
          requiresOwnerAuthorization: false,
          status: "pending",
        },
      ],
      gapReport: [],
      updatedAt: new Date().toISOString(),
    };

    const result = contingencyEngine.repairPlan(
      failingPlan,
      "step_01",
      "Network connection refused",
      availableOperators as any,
    );

    expect(result.repaired).toBe(true);
    expect(result.strategyApplied).toContain("op_owner_teach_goal_knowledge");
    // Original step marked failed for audit
    const original = result.repairedPlan.nodes.find((n) => n.id === "step_01");
    expect(original?.status).toBe("failed");
    // Replacement contingency node added
    const replacement = result.repairedPlan.nodes.find(
      (n) => n.id === "step_01_contingency",
    );
    expect(replacement).toBeDefined();
    expect(replacement?.operatorId).toBe("op_owner_teach_goal_knowledge");
    // Downstream step_02 rewired to depend on replacement node
    const step02 = result.repairedPlan.nodes.find((n) => n.id === "step_02");
    expect(step02?.dependsOn).toContain("step_01_contingency");
  });
});

describe("End-to-End Adaptive Planning Engine", () => {
  it("generates an executable adaptive plan with waves, critical path, and HTN milestones", async () => {
    const store = new FactStore();
    // Provide prerequisite facts
    await store.assert({
      subject: "owner",
      predicate: "available",
      object: "yes",
      confidence: 1.0,
      provenance: { source: "seed" },
      status: "validated",
    });
    await store.assert({
      subject: "roofing project",
      predicate: "scope-defined",
      object: "yes",
      confidence: 1.0,
      provenance: { source: "seed" },
      status: "validated",
    });
    await store.assert({
      subject: "roofing project",
      predicate: "inputs-quantified",
      object: "yes",
      confidence: 1.0,
      provenance: { source: "seed" },
      status: "validated",
    });

    const engine = new AdaptivePlanningEngine(store);
    const plan = await engine.generatePlan({
      goal: {
        subject: "roofing project",
        predicate: "planned",
      },
      profile: "balanced",
      workingMemoryConstraints: ["finish before rainy season", "use local steel"],
    });

    expect(plan.executable).toBe(true);
    expect(plan.nodes.length).toBeGreaterThan(0);
    expect(plan.criticalPath.parallelExecutionWaves.length).toBeGreaterThan(0);
    expect(plan.criticalPath.totalEstimatedDurationMs).toBeGreaterThan(0);
    expect(plan.milestones.length).toBeGreaterThan(0);
    expect(plan.activeConstraints).toContain("finish before rainy season");
    expect(plan.contingencyCount).toBeGreaterThanOrEqual(1);

    // Verify format summary output
    const summary = formatAdaptivePlanSummary(plan);
    expect(summary).toContain("Plan: roofing project planned");
    expect(summary).toContain("Execution Waves");
    expect(summary).toContain("Critical Path");
  });

  it("strictly enforces the Owner Authorization gate on consequential actions", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "action",
      predicate: "justified",
      object: "yes",
      confidence: 1.0,
      provenance: { source: "seed" },
      status: "validated",
    });

    const engine = new AdaptivePlanningEngine(store);
    const plan = await engine.generatePlan({
      goal: {
        predicate: "proposed",
      },
    });

    expect(plan.requiresOwnerAuthorization).toBe(true);
    const authNode = plan.nodes.find((n) => n.requiresOwnerAuthorization);
    expect(authNode).toBeDefined();
    expect(authNode?.status).toBe("awaiting_owner");

    // Attempting wave execution halts at the gate
    const waveRes = await engine.executeWave(plan, 0, async () => {
      return { status: "executed", result: "auto executed" };
    });
    expect(waveRes.blockedForOwner).toBe(true);
  });

  it("reports honest gaps when prerequisites are missing", async () => {
    const emptyStore = new FactStore();
    const engine = new AdaptivePlanningEngine(emptyStore);

    const plan = await engine.generatePlan({
      goal: {
        subject: "quantum computer",
        predicate: "teleported",
      },
    });

    expect(plan.executable).toBe(false);
    expect(plan.gapReport.length).toBeGreaterThan(0);
    expect(plan.gapReport.join(" ")).toContain("no registered operator");
  });

  it("client convenience function planObjectiveAdaptively runs seamlessly", async () => {
    const plan = await planObjectiveAdaptively("daily routine");
    expect(plan).toBeDefined();
    expect(plan.goal).toContain("daily routine");
    expect(plan.criticalPath.parallelExecutionWaves).toBeDefined();
  });
});
