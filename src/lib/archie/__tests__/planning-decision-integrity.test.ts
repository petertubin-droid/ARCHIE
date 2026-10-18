import { describe, it, expect } from "vitest";
import { FactStore } from "../../../../supabase/functions/_shared/archie-ai/native-engine/knowledge";
import { createAdaptivePlanningEngine, AdaptivePlanningEngine } from "../../../../supabase/functions/_shared/archie-ai/adaptive-planning/adaptive-planner";
import { DagScheduler } from "../../../../supabase/functions/_shared/archie-ai/adaptive-planning/dag-scheduler";
import { OperatorTelemetryStore } from "../../../../supabase/functions/_shared/archie-ai/adaptive-planning/telemetry-learning";
import type { AdaptivePlanStepNode } from "../../../../supabase/functions/_shared/archie-ai/adaptive-planning/types";
import type { Operator } from "../../../../supabase/functions/_shared/archie-ai/native-engine/types";

describe("ARCHIE Planning & Decision Engine Integrity", () => {
  it("rejects execution of downstream steps when prerequisite step fails or is unexecuted", async () => {
    const store = new FactStore();
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
      goal: { subject: "roofing project", predicate: "planned" },
    });

    expect(plan.nodes.length).toBeGreaterThan(1);
    expect(plan.criticalPath.parallelExecutionWaves.length).toBeGreaterThan(1);

    // Wave 0 executes and fails
    const wave0 = await engine.executeWave(plan, 0, async () => ({
      status: "failed",
      error: "Network failure during supplier inquiry",
    }));

    expect(wave0.waveCompleted).toBe(false);

    // Wave 1 should block downstream dependent steps
    const wave1 = await engine.executeWave(plan, 1, async () => ({
      status: "executed",
      result: "Should not execute",
    }));

    const blockedSteps = wave1.stepResults.filter((s) => s.status === "blocked");
    expect(blockedSteps.length).toBeGreaterThan(0);
    expect(blockedSteps[0].error).toContain("Prerequisite step");
  });

  it("calculates real diagnostic telemetry rather than hardcoded 0.92 reliability", async () => {
    const store = new FactStore();
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
    const initialDiag = engine.getDiagnostics();
    expect(initialDiag.averagePlanReliability).toBe(0.0);
    expect(initialDiag.totalPlansGenerated).toBe(0);

    const plan = await engine.generatePlan({
      goal: { subject: "roofing project", predicate: "planned" },
    });

    const afterDiag = engine.getDiagnostics();
    expect(afterDiag.totalPlansGenerated).toBe(1);
    expect(afterDiag.averagePlanReliability).toBeGreaterThan(0.0);
    expect(afterDiag.averagePlanReliability).toBe(plan.overallReliability);
  });

  it("detects and validates complex DAG cycles returning hasCycles flag and issue description", () => {
    const scheduler = new DagScheduler();
    const cyclicNodes: AdaptivePlanStepNode[] = [
      {
        id: "step_A",
        operatorId: "op_a",
        title: "Step A",
        achieves: "fact_a",
        satisfies: "fact_a",
        dependsOn: ["step_B"],
        estimatedDurationMs: 100,
        optimisticDurationMs: 50,
        pessimisticDurationMs: 150,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
      {
        id: "step_B",
        operatorId: "op_b",
        title: "Step B",
        achieves: "fact_b",
        satisfies: "fact_b",
        dependsOn: ["step_A"],
        estimatedDurationMs: 100,
        optimisticDurationMs: 50,
        pessimisticDurationMs: 150,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
    ];

    const result = scheduler.validateDag(cyclicNodes);
    expect(result.valid).toBe(false);
    expect(result.hasCycles).toBe(true);
    expect(result.issues.some((issue) => issue.includes("Circular dependency detected"))).toBe(true);
  });

  it("dynamically adapts cost based on recorded failures in telemetry", () => {
    const store = new OperatorTelemetryStore();
    const testOp: Operator = {
      id: "op_custom_test",
      description: "Custom test op",
      cost: 10,
      achieves: { predicate: "done" },
      preconditions: [],
      effects: [],
    };

    const initialCost = store.computeAdaptiveCost(testOp);
    expect(initialCost).toBe(10);

    // Record failures
    store.recordExecution(testOp.id, false, 2000, "Timeout");
    store.recordExecution(testOp.id, false, 2000, "Network error");

    const highCost = store.computeAdaptiveCost(testOp);
    expect(highCost).toBeGreaterThan(initialCost);
    expect(store.computeReliability(testOp.id)).toBeLessThan(0.5);
  });

  it("enforces Owner boundary for high-consequence operations during wave execution", async () => {
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
      goal: { predicate: "proposed" },
    });

    expect(plan.requiresOwnerAuthorization).toBe(true);
    const authNode = plan.nodes.find((n) => n.requiresOwnerAuthorization);
    expect(authNode).toBeDefined();
    expect(authNode?.status).toBe("awaiting_owner");

    const waveRes = await engine.executeWave(plan, 0, async () => {
      return { status: "executed", result: "auto executed" };
    });
    expect(waveRes.blockedForOwner).toBe(true);
  });
});
