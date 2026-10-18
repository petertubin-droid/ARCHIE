import { describe, expect, it } from "vitest";
// =========================================================
// ARCHIE ADVANCED UNIFIED PLANNING AND DECISION ENGINE TEST SUITE
//
// Comprehensive verification of:
// 1. Goal Formalization (Constraints, Criteria, Exclusions, Provenance)
// 2. Hierarchical Decomposition (Milestones, Deliverables, Checkpoints)
// 3. DAG Scheduling, Cycle Detection, Failure Propagation & PERT
// 4. Resource Allocation & System Limits Enforcement
// 5. Multi-Criteria Decision Intelligence (MCDA, Sensitivity, Pareto)
// 6. Dynamic Risk Assessment & Mitigation Generation
// 7. Epistemic Uncertainty Management & Policy Adaptation
// 8. Owner Authority Gate (Protection of Releases, Migrations, Data)
// 9. Plan Persistence, State Hydration & Recovery
// 10. Execution Verification (Verified vs Attempted, Verdict Handling)
// =========================================================

import {
  AdaptivePlanningEngine,
  createAdaptivePlanningEngine,
  GoalFormalizer,
  ResourceAllocator,
  DecisionIntelligenceEngine,
  RiskAssessmentEngine,
  UncertaintyManager,
  OwnerAuthorityGateKeeper,
  PlanPersistenceStore,
  planStructuredObjective,
} from "@/lib/archie/adaptive-planning";
import type { AdaptivePlanStepNode } from "@studio-shared/archie-ai/adaptive-planning/types.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

describe("1. Goal Understanding & Formalization", () => {
  const formalizer = new GoalFormalizer();

  it("formalizes complex objectives into structured goals without hallucinating budgets or deadlines", () => {
    const goal = formalizer.formalizeGoal({
      objective: "Deploy microservice auth module to production environment",
      constraints: ["Zero downtime required", "Must retain backward compatibility with v1 API"],
      acceptanceCriteria: ["Latency p99 < 50ms", "All integration tests pass"],
      explicitExclusions: ["No schema alterations to user table during deployment"],
      priority: "CRITICAL",
      requestedBy: "Engineering Lead",
    });

    expect(goal.id).toMatch(/^goal_/);
    expect(goal.primaryObjective).toBe("Deploy microservice auth module to production environment");
    expect(goal.priority).toBe("CRITICAL");
    expect(goal.constraints.length).toBe(2);
    expect(goal.constraints[0].type).toBe("HARD");
    expect(goal.acceptanceCriteria.length).toBe(2);
    expect(goal.explicitExclusions).toContain("No schema alterations to user table during deployment");
    expect(goal.provenance.requestedBy).toBe("Engineering Lead");
    // Verify no hallucinated deadline was invented
    expect(goal.deadline).toBeUndefined();
    // Verify no hallucinated financial budget was invented
    expect(goal.resourceBudget?.financialCostLimit).toBeUndefined();
  });

  it("detects genuine ambiguities that materially change the plan and asks targeted clarification", () => {
    const ambiguousInput = {
      objective: "Update the database to the new version",
    };
    const goal = formalizer.formalizeGoal(ambiguousInput);

    expect(goal.ambiguityQuestions.length).toBeGreaterThan(0);
    const questionsText = goal.ambiguityQuestions.join(" ");
    expect(questionsText.toLowerCase()).toMatch(/target database|migration strategy|backup|rollback/);
  });
});

describe("2. Hierarchical Task Decomposition", () => {
  const formalizer = new GoalFormalizer();
  const engine = createAdaptivePlanningEngine();

  it("decomposes structured goals into milestones with explicit deliverables and checkpoints", async () => {
    const goal = formalizer.formalizeGoal({
      objective: "Migrate user authentication system to OAuth2 standard",
      acceptanceCriteria: ["100% test coverage on auth endpoints", "Zero regressions in existing session store"],
      constraints: ["Strict compliance with RFC 6749"],
      priority: "HIGH",
    });

    const structuredPlan = await engine.generateStructuredPlan(goal);

    expect(structuredPlan.milestones.length).toBeGreaterThan(0);
    for (const milestone of structuredPlan.milestones) {
      expect(milestone.id).toBeDefined();
      expect(milestone.deliverables.length).toBeGreaterThan(0);
      expect(milestone.checkpoints.length).toBeGreaterThan(0);
      expect(milestone.checkpoints[0].criteria.length).toBeGreaterThan(0);
    }
  });
});

describe("3. DAG Scheduling, Cycle Detection & Failure Propagation", () => {
  const engine = createAdaptivePlanningEngine();
  const scheduler = engine.getScheduler();

  it("detects circular dependencies and prevents invalid execution wave scheduling", () => {
    const cyclicSteps: AdaptivePlanStepNode[] = [
      {
        id: "step_A",
        operatorId: "op_a",
        title: "Step A",
        achieves: "a",
        satisfies: "a",
        dependsOn: ["step_C"], // Cycle: A -> C -> B -> A
        estimatedDurationMs: 100,
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
        achieves: "b",
        satisfies: "b",
        dependsOn: ["step_A"],
        estimatedDurationMs: 100,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
      {
        id: "step_C",
        operatorId: "op_c",
        title: "Step C",
        achieves: "c",
        satisfies: "c",
        dependsOn: ["step_B"],
        estimatedDurationMs: 100,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
    ];

    const validation = scheduler.validateDag(cyclicSteps);
    expect(validation.valid).toBe(false);
    expect(validation.hasCycles).toBe(true);
    expect(validation.issues.some((i) => i.includes("Circular dependency"))).toBe(true);

    const waves = scheduler.computeExecutionWaves(cyclicSteps);
    // Scheduler refuses to schedule circular waves
    expect(waves.length).toBe(0);
  });

  it("propagates failure downstream: halts and blocks all transitive dependents", () => {
    const steps: AdaptivePlanStepNode[] = [
      {
        id: "step_root",
        operatorId: "op_root",
        title: "Root Database Migration",
        achieves: "schema_updated",
        satisfies: "schema_updated",
        dependsOn: [],
        estimatedDurationMs: 100,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "failed",
        error: "Database connection timeout during table creation",
      },
      {
        id: "step_dep1",
        operatorId: "op_seed",
        title: "Seed Reference Data",
        achieves: "data_seeded",
        satisfies: "data_seeded",
        dependsOn: ["step_root"],
        estimatedDurationMs: 100,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
      {
        id: "step_dep2",
        operatorId: "op_index",
        title: "Build Elastic Indexes",
        achieves: "indexes_built",
        satisfies: "indexes_built",
        dependsOn: ["step_dep1"],
        estimatedDurationMs: 100,
        baseCost: 1,
        adaptiveCost: 1,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
    ];

    const blocked = scheduler.propagateFailure(
      steps,
      "step_root",
      "Database connection timeout during table creation",
    );

    expect(blocked).toContain("step_dep1");
    expect(blocked).toContain("step_dep2");

    const dep1 = steps.find((s) => s.id === "step_dep1")!;
    const dep2 = steps.find((s) => s.id === "step_dep2")!;
    expect(dep1.status).toBe("blocked");
    expect(dep1.error).toContain("Cascading dependency failure: Prerequisite step \"step_root\" failed");
    expect(dep2.status).toBe("blocked");
  });

  it("prefers measured execution duration over speculative estimates when computing PERT", () => {
    const step: AdaptivePlanStepNode = {
      id: "step_measured",
      operatorId: "op_measured",
      title: "Benchmark Measured Step",
      achieves: "benchmarked",
      satisfies: "benchmarked",
      dependsOn: [],
      estimatedDurationMs: 500,
      optimisticDurationMs: 200,
      pessimisticDurationMs: 1000,
      measuredDurationMs: 142, // Real telemetry measurement
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.95,
      requiresOwnerAuthorization: false,
      status: "executed",
    };

    const pertDuration = scheduler.computePertDuration(step);
    expect(pertDuration).toBe(142);
  });
});

describe("4. Resource Allocation & Limits Enforcement", () => {
  const allocator = new ResourceAllocator({
    maxConcurrentTasks: 2,
    maxPlanCost: 5,
    maxPlanDurationMs: 2000,
    maxToolInvocations: 10,
  });

  it("detects when a plan exceeds allocated cost and concurrency limits honestly", () => {
    const costlySteps: AdaptivePlanStepNode[] = [
      {
        id: "step_1",
        operatorId: "op_compute_heavy",
        title: "Heavy Processing 1",
        achieves: "part1",
        satisfies: "part1",
        dependsOn: [],
        estimatedDurationMs: 1500,
        baseCost: 3,
        adaptiveCost: 3,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
      {
        id: "step_2",
        operatorId: "op_compute_heavy",
        title: "Heavy Processing 2",
        achieves: "part2",
        satisfies: "part2",
        dependsOn: [],
        estimatedDurationMs: 1500,
        baseCost: 4,
        adaptiveCost: 4,
        reliabilityScore: 0.9,
        requiresOwnerAuthorization: false,
        status: "pending",
      },
    ];

    const allocation = allocator.allocate("goal_costly", costlySteps);
    expect(allocation.feasible).toBe(false);
    expect(allocation.conflicts.some((c) => c.resourceType === "cost")).toBe(true);
    const costConflict = allocation.conflicts.find((c) => c.resourceType === "cost")!;
    expect(costConflict).toBeDefined();
    expect(costConflict.requested).toBe(7);
    expect(costConflict.limit).toBe(5);
  });
});

describe("5. Multi-Criteria Decision Intelligence (MCDA)", () => {
  const decisionEngine = new DecisionIntelligenceEngine();

  it("evaluates multiple alternative strategies, detects Pareto-optimal solutions, and checks sensitivity", () => {
    const result = decisionEngine.evaluateAlternatives({
      decisionId: "dec_db_choice",
      title: "Select Storage Architecture for Vector Search",
      alternatives: [
        {
          id: "alt_pgvector",
          name: "PostgreSQL pgvector extension",
          description: "In-database vector storage using existing Supabase infrastructure",
          scores: {
            feasibility: 0.95,
            performance: 0.75,
            cost_efficiency: 0.90,
            simplicity: 0.90,
            safety: 0.85,
          },
          advantages: ["No new network boundary", "Existing backup and RLS infrastructure"],
          disadvantages: ["Higher CPU load during peak vector queries"],
        },
        {
          id: "alt_dedicated_pinecone",
          name: "Dedicated Cloud Vector DB",
          description: "Specialized external vector database",
          scores: {
            feasibility: 0.70,
            performance: 0.95,
            cost_efficiency: 0.40,
            simplicity: 0.60,
            safety: 0.70,
          },
          advantages: ["High index scaling", "Specialized hardware"],
          disadvantages: ["High monthly subscription", "Separate auth and network latency"],
        },
      ],
    });

    expect(result.rankedAlternatives.length).toBe(2);
    expect(result.paretoFrontierIds.length).toBeGreaterThan(0);
    expect(result.recommendedAlternativeId).toBe("alt_pgvector");
    expect(result.sensitivityAnalysis.robust).toBeDefined();
    expect(result.tradeoffMatrix.length).toBe(2);
  });
});

describe("6. Dynamic Risk Assessment & Mitigation", () => {
  const riskEngine = new RiskAssessmentEngine();

  it("identifies high-impact risks on critical external or consequential operators and generates mitigations", () => {
    const planSteps: AdaptivePlanStepNode[] = [
      {
        id: "step_deploy_prod",
        operatorId: "op_deploy_to_production",
        title: "Deploy release package to live users",
        achieves: "deployed",
        satisfies: "deployed",
        dependsOn: [],
        estimatedDurationMs: 1000,
        baseCost: 2,
        adaptiveCost: 2,
        reliabilityScore: 0.70,
        requiresOwnerAuthorization: true,
        status: "awaiting_owner",
      },
    ];

    const assessment = riskEngine.assessPlanRisks(planSteps);
    expect(assessment.risks.length).toBeGreaterThan(0);
    expect(assessment.overallRiskLevel).toBe("HIGH");

    const criticalRisks = assessment.risks.filter((r) => r.impact === "CRITICAL" || r.impact === "HIGH");
    expect(criticalRisks.length).toBeGreaterThan(0);
    expect(criticalRisks[0].mitigation).toBeDefined();
  });
});

describe("7. Epistemic Uncertainty Management", () => {
  const manager = new UncertaintyManager();

  it("recommends GATHER_MORE_INFO or PROCEED_WITH_DISCLAIMER when evidence is thin or unverified", () => {
    const report = manager.assessPlanUncertainty(
      [
        {
          id: "step_scrape",
          operatorId: "op_web_research",
          title: "Web Research on Unverified Vendor Pricing",
          achieves: "pricing_gathered",
          satisfies: "pricing_gathered",
          dependsOn: [],
          estimatedDurationMs: 1200,
          baseCost: 2,
          adaptiveCost: 2,
          reliabilityScore: 0.65,
          requiresOwnerAuthorization: false,
          status: "pending",
        },
      ],
      {
        id: "goal_vendor",
        primaryObjective: "Estimate international vendor procurement costs",
        priority: "NORMAL",
        status: "DRAFT",
        constraints: [],
        acceptanceCriteria: [],
        explicitExclusions: [],
        provenance: { source: "USER_DIRECT", timestamp: new Date().toISOString() },
      },
    );

    expect(report.averageConfidence).toBeLessThan(0.85);
    expect(["GATHER_MORE_INFO", "PROCEED_WITH_DISCLAIMER"]).toContain(report.recommendedPolicy);
    expect(report.criticalUncertainties.length).toBeGreaterThan(0);
  });
});

describe("8. Owner Authority Gate", () => {
  const gateKeeper = new OwnerAuthorityGateKeeper();

  it("strictly classifies and halts production releases and migrations at the Owner boundary", () => {
    const step: AdaptivePlanStepNode = {
      id: "step_prod_migration",
      operatorId: "op_production_migration",
      title: "Run alter table migration on production user accounts",
      achieves: "table_altered",
      satisfies: "table_altered",
      dependsOn: [],
      estimatedDurationMs: 500,
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.95,
      requiresOwnerAuthorization: true,
      status: "pending",
    };

    const evaluation = gateKeeper.evaluateGate(step);
    expect(evaluation.requiresApproval).toBe(true);
    expect(evaluation.isApproved).toBe(false);
    expect(evaluation.actionClassification).toBe("production_migration");

    const clear = gateKeeper.enforceGate(step);
    expect(clear).toBe(false);
    expect(step.status).toBe("awaiting_owner");
  });

  it("permits protected actions only when an explicit valid Owner Approval record is present", () => {
    const step: AdaptivePlanStepNode = {
      id: "step_prod_deploy",
      operatorId: "op_deploy_production",
      title: "Deploy release package to live production",
      achieves: "live_deployed",
      satisfies: "live_deployed",
      dependsOn: [],
      estimatedDurationMs: 500,
      baseCost: 1,
      adaptiveCost: 1,
      reliabilityScore: 0.95,
      requiresOwnerAuthorization: true,
      status: "pending",
    };

    const approvals = {
      step_prod_deploy: {
        approved: true,
        approver: "Owner",
        timestamp: new Date().toISOString(),
      },
    };

    const evaluation = gateKeeper.evaluateGate(step, approvals);
    expect(evaluation.requiresApproval).toBe(true);
    expect(evaluation.isApproved).toBe(true);
    expect(evaluation.approver).toBe("Owner");
  });
});

describe("9. Plan Persistence, State Hydration & Recovery", () => {
  const store = new PlanPersistenceStore();

  it("saves durable checkpoints after execution and hydrates completed steps without re-executing", async () => {
    const plan = await planStructuredObjective("Organize architectural design review");

    // Checkpoint wave 1 completion
    await store.saveCheckpoint({
      planId: plan.id,
      version: 1,
      timestamp: new Date().toISOString(),
      completedStepIds: [plan.nodes[0]?.id || "step_01"],
      stepResults: { [plan.nodes[0]?.id || "step_01"]: "Initial review completed verified." },
      stepVerdicts: { [plan.nodes[0]?.id || "step_01"]: "PASS" },
      currentWaveIndex: 1,
      resumedFromCheckpoint: false,
    });

    const checkpoint = await store.loadCheckpoint(plan.id);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.completedStepIds).toContain(plan.nodes[0]?.id || "step_01");
    expect(checkpoint?.stepVerdicts[plan.nodes[0]?.id || "step_01"]).toBe("PASS");
  });
});

describe("10. Execution Verification & Verdict Integrity", () => {
  it("distinguishes planned, attempted, and verified states — fails step when verification verdict is FAIL", async () => {
    const store = new FactStore();
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
    const engine = createAdaptivePlanningEngine(store);
    const plan = await engine.generatePlan({
      goal: { subject: "roofing project", predicate: "planned" },
    });

    const result = await engine.executeWave(plan, 0, async (node) => {
      // Step reports execution but verification validator verdict is FAIL
      return {
        status: "executed",
        result: "Backup command ran but checksum verification failed on archive",
        verdict: "FAIL",
        error: "Corrupted archive header detected during integrity check",
      };
    });

    const evaluatedNode = plan.nodes.find((n) => n.id === result.stepResults[0]?.stepId);
    expect(evaluatedNode?.status).toBe("failed");
    expect(evaluatedNode?.verificationVerdict).toBe("FAIL");
    expect(evaluatedNode?.error).toContain("Corrupted archive header");
  });
});
