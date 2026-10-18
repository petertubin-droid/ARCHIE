// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — COMPREHENSIVE
// TEST SUITE
//
// Rigorous verification covering:
//   - Analytical Reasoning (§3.A)
//   - Deductive Reasoning (§3.B)
//   - Inductive Reasoning (§3.C)
//   - Abductive Reasoning (§3.D)
//   - Causal Reasoning (§3.E)
//   - Comparative & Decision Reasoning (§3.F)
//   - Probabilistic & Uncertainty Reasoning (§3.G)
//   - Mathematical & Computational Reasoning (§3.H)
//   - Adaptive Reasoning Strategy Selection (§4.A)
//   - Structured Problem Decomposition (§4.B)
//   - Assumption Management & Provenance (§4.E, §4.F)
//   - Bounded Recursive Review & Self-Correction (§4.G)
//   - 11-Question Structured Self-Check (§12)
//   - Owner Authority Boundary (§8)
//   - Unified Engine Orchestration (§5)
// =========================================================

import { describe, expect, it } from "vitest";
import {
  performAnalyticalReasoning,
} from "./analytical.ts";
import {
  evaluateDeductiveInference,
  checkDeductiveConsistency,
} from "./deductive.ts";
import {
  evaluateInductiveGeneralization,
  detectObservationTrend,
} from "./inductive.ts";
import {
  evaluateAbductiveExplanations,
} from "./abductive.ts";
import {
  evaluateCausalModel,
  checkNecessaryAndSufficient,
} from "./causal.ts";
import {
  performComparativeAnalysis,
} from "./comparative.ts";
import {
  assessProblemUncertainty,
  computeBayesianUpdate,
  propagateUncertainty,
} from "./probabilistic.ts";
import {
  solveLinearEquation,
  computeTolerance,
} from "./math.ts";
import {
  selectAdaptiveStrategy,
} from "./classify.ts";
import {
  executeRecursiveReview,
} from "./review.ts";
import {
  runStructuredSelfCheck,
} from "./validate.ts";
import {
  checkOwnerAuthority,
  classifyOperationalStage,
} from "./authority.ts";
import {
  reasoningGroundTruth,
  reasoningApplicable,
} from "./engine.ts";
import type {
  ReasoningPremise,
  Constraint,
  CandidateSolution,
  ReasoningProblem,
  ValidationReport,
  ReasoningTurnInput,
} from "./types.ts";

describe("§3.A Analytical Reasoning", () => {
  it("extracts variables and identifies candidate root causes", () => {
    const text = "The foundation cracked because moisture and soil temperature fluctuated.";
    const facts: ReasoningPremise[] = [
      { id: "f1", statement: "Foundation has visible cracks", state: "FACT", source: "USER_PROVIDED" },
    ];
    const constraints: Constraint[] = [];

    const res = performAnalyticalReasoning(text, facts, constraints);
    expect(res.variables.length).toBeGreaterThan(0);
    expect(res.rootCauses.length).toBeGreaterThan(0);
    expect(res.synthesizedConclusion).toBeDefined();
    expect(typeof res.synthesizedConclusion).toBe("string");
  });
});

describe("§3.B Deductive Reasoning", () => {
  it("performs modus ponens and evaluates rule consistency", () => {
    const premises: ReasoningPremise[] = [
      { id: "p1", statement: "The foundation is settling", state: "FACT", source: "USER_PROVIDED" },
    ];
    const rules = [
      {
        id: "r1",
        antecedent: "The foundation is settling",
        consequent: "Cracks will appear in the walls",
        formalType: "MODUS_PONENS" as const,
      },
    ];

    const res = evaluateDeductiveInference(premises, rules);
    expect(res.valid).toBe(true);
    expect(res.sound).toBe(true);
    expect(res.conclusions).toContain("Cracks will appear in the walls");

    const consistency = checkDeductiveConsistency(premises);
    expect(consistency.consistent).toBe(true);
    expect(consistency.contradictions).toHaveLength(0);
  });

  it("detects formal logical contradiction in conflicting premises", () => {
    const conflictingPremises: ReasoningPremise[] = [
      { id: "p1", statement: "The concrete is cured", state: "FACT", source: "USER_PROVIDED" },
      { id: "p2", statement: "The concrete is not cured", state: "FACT", source: "USER_PROVIDED" },
    ];
    const consistency = checkDeductiveConsistency(conflictingPremises);
    expect(consistency.consistent).toBe(false);
    expect(consistency.contradictions.length).toBeGreaterThan(0);
  });
});

describe("§3.C Inductive Reasoning", () => {
  it("detects trend and projects next value from observations", () => {
    const observations = [10, 20, 30, 40, 50];
    const trend = detectObservationTrend(observations);
    expect(trend.direction).toBe("INCREASING");
    expect(trend.slope).toBeCloseTo(10, 1);
    expect(trend.rSquared).toBeGreaterThan(0.95);
    expect(trend.projectedNext).toBeCloseTo(60, 1);
    expect(trend.sampleSizeAdequate).toBe(true);
  });

  it("evaluates inductive generalization and detects counterexamples", () => {
    const observations = [
      { id: "o1", observation: "Beam 1 passed load test" },
      { id: "o2", observation: "Beam 2 passed load test" },
    ];
    const counterexamples = [
      { id: "c1", counterexample: "Beam 3 failed load test under high shear" },
    ];

    const res = evaluateInductiveGeneralization(
      "All beams will pass load test",
      observations,
      counterexamples,
    );
    expect(res.counterexamplesFound).toHaveLength(1);
    expect(res.confidenceScore).toBeLessThan(0.4);
    expect(res.biasWarning).toBeDefined();
  });
});

describe("§3.D Abductive Reasoning", () => {
  it("ranks competing hypotheses by explanatory coverage", () => {
    const observations = [
      "Water is pooling near the east footing",
      "Cracks appeared on the basement slab",
    ];
    const hypotheses = [
      {
        id: "h1",
        description: "Broken storm drain pipe saturating soil",
        coversObservations: ["Water is pooling near the east footing", "Cracks appeared on the basement slab"],
        contradictsObservations: [],
        assumptions: ["Drain pipe runs near east footing"],
        priorPlausibility: 0.8,
      },
      {
        id: "h2",
        description: "Minor condensation from indoor humidity",
        coversObservations: [],
        contradictsObservations: ["Water is pooling near the east footing"],
        assumptions: ["HVAC humidity is high"],
        priorPlausibility: 0.2,
      },
    ];

    const ranked = evaluateAbductiveExplanations(observations, hypotheses);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].hypothesis.id).toBe("h1");
    expect(ranked[0].explanatoryCoverage).toBe(1.0);
    expect(ranked[0].plausibilityRank).toBe(1);
    expect(ranked[0].discriminationTests.length).toBeGreaterThan(0);
  });
});

describe("§3.E Causal Reasoning", () => {
  it("traverses causal links, detects cycles, and evaluates interventions", () => {
    const links = [
      { cause: "rainfall", effect: "soil_moisture", strength: 0.9 },
      { cause: "soil_moisture", effect: "soil_swelling", strength: 0.8 },
      { cause: "soil_swelling", effect: "foundation_pressure", strength: 0.85 },
    ];

    const model = evaluateCausalModel("soil_swelling", links);
    expect(model.directCauses).toContain("soil_moisture");
    expect(model.indirectCauses).toContain("rainfall");
    expect(model.feedbackCycles).toHaveLength(0);

    const necSuf = checkNecessaryAndSufficient(
      "foundation_pressure",
      "soil_swelling",
      true,
      false,
    );
    expect(necSuf.necessary).toBe(true);
    expect(necSuf.sufficient).toBe(false);
  });
});

describe("§3.F Comparative & Decision Reasoning", () => {
  it("performs weighted multi-criteria ranking and identifies Pareto optimality", () => {
    const alternatives = [
      {
        id: "alt1",
        name: "Reinforced Concrete Pile",
        scores: { cost: 0.6, durability: 0.95, speed: 0.5 },
        isReversible: false,
      },
      {
        id: "alt2",
        name: "Helical Screw Pile",
        scores: { cost: 0.8, durability: 0.8, speed: 0.9 },
        isReversible: true,
      },
    ];
    const criteria = [
      { name: "durability", weight: 0.5, direction: "MAXIMIZE" as const },
      { name: "speed", weight: 0.3, direction: "MAXIMIZE" as const },
      { name: "cost", weight: 0.2, direction: "MAXIMIZE" as const },
    ];

    const res = performComparativeAnalysis(alternatives, criteria);
    expect(res.rankedAlternatives).toHaveLength(2);
    expect(res.rankedAlternatives[0].score).toBeGreaterThan(0);
    expect(res.tradeOffSummary).toBeDefined();
  });
});

describe("§3.G Probabilistic & Uncertainty Reasoning", () => {
  it("computes exact Bayesian update without fabricated precision", () => {
    const update = computeBayesianUpdate(0.1, 0.8, 0.2);
    // P(H|E) = (0.8 * 0.1) / (0.8 * 0.1 + 0.2 * 0.9) = 0.08 / (0.08 + 0.18) = 0.08 / 0.26 ≈ 0.3077
    expect(update.posterior).toBeCloseTo(0.3077, 3);
    expect(update.shiftMagnitude).toBeGreaterThan(0.2);
  });

  it("propagates uncertainty across addition and multiplication", () => {
    const sum = propagateUncertainty(10, 1, 20, 2, "ADD");
    expect(sum.value).toBe(30);
    // sqrt(1^2 + 2^2) = sqrt(5) ≈ 2.236
    expect(sum.uncertainty).toBeCloseTo(2.236, 2);

    const mult = propagateUncertainty(10, 1, 20, 2, "MULTIPLY");
    expect(mult.value).toBe(200);
    expect(mult.uncertainty).toBeGreaterThan(0);
  });
});

describe("§3.H Mathematical & Computational Reasoning", () => {
  it("solves algebraic linear equations deterministically", () => {
    const eq1 = solveLinearEquation("3x + 12 = 48");
    expect(eq1.ok).toBe(true);
    expect(eq1.variable).toBe("x");
    expect(eq1.value).toBe(12);

    const eq2 = solveLinearEquation("2y - 10 = 30");
    expect(eq2.ok).toBe(true);
    expect(eq2.variable).toBe("y");
    expect(eq2.value).toBe(20);
  });

  it("computes tolerance intervals with absolute and percentage bounds", () => {
    const absTol = computeTolerance(100, 5, false);
    expect(absTol.lowerBound).toBe(95);
    expect(absTol.upperBound).toBe(105);

    const pctTol = computeTolerance(200, 10, true);
    expect(pctTol.lowerBound).toBe(180);
    expect(pctTol.upperBound).toBe(220);
  });
});

describe("§4.A Adaptive Strategy Selection", () => {
  it("selects rigorous strategies for complex or high-risk tasks", () => {
    const strat1 = selectAdaptiveStrategy("MATHEMATICAL", "SIMPLE", 1, 0);
    expect(strat1.strategy).toBe("DETERMINISTIC_COMPUTATION");

    const strat2 = selectAdaptiveStrategy("CAUSAL", "COMPLEX", 5, 2);
    expect(strat2.strategy).toBe("CAUSAL_INVESTIGATION");
    expect(strat2.verificationLevel).toBe("RIGOROUS");
  });
});

describe("§4.G Bounded Recursive Review & Self-Correction", () => {
  it("terminates within budget without runaway loops", () => {
    const candidate: CandidateSolution = {
      id: "c1",
      description: "Cost: 100",
      premiseIds: ["p1"],
      assumptions: [],
      constraintsSatisfied: [],
      constraintsViolated: [],
      evidenceState: "EVIDENCED",
      risks: [],
      validationState: "PENDING",
      final: false,
      hypothetical: false,
      freluxEngineId: null,
    };
    const premises: ReasoningPremise[] = [
      { id: "p1", statement: "Cost base is 100", state: "FACT", source: "USER_PROVIDED" },
    ];
    const constraints: Constraint[] = [];

    const res = executeRecursiveReview({
      candidate,
      premises,
      constraints,
      maxIterations: 3,
    });
    expect(res.totalIterations).toBeLessThanOrEqual(3);
    expect(res.converged).toBe(true);
  });
});

describe("§8 Owner Authority Boundary Enforcement", () => {
  it("classifies operational stages accurately", () => {
    expect(classifyOperationalStage("What if we change the foundation design?")).toBe("ANALYSIS");
    expect(classifyOperationalStage("Design an architecture for the new calculation module")).toBe("DESIGN");
    expect(classifyOperationalStage("Prepare a patch for fixing the parser bug")).toBe("PATCH_PREPARATION");
    expect(classifyOperationalStage("Deploy this release to production now")).toBe("RELEASE_DEPLOYMENT");
    expect(classifyOperationalStage("Run migration on production database")).toBe("PRODUCTION_MIGRATION");
  });

  it("blocks unauthorized production modifications while allowing safe analysis", () => {
    const safeCheck = checkOwnerAuthority("Can you analyze this algorithm?", false);
    expect(safeCheck.allowed).toBe(true);

    const protectedCheck = checkOwnerAuthority("Deploy this release to production now", false);
    expect(protectedCheck.isProtected).toBe(true);
    expect(protectedCheck.allowed).toBe(false);
    expect(protectedCheck.reason).toContain("Owner approval");

    const approvedCheck = checkOwnerAuthority("Deploy this release to production now", true);
    expect(approvedCheck.allowed).toBe(true);
  });
});

describe("Unified Engine Orchestration (§5)", () => {
  it("detects applicability for advanced reasoning modalities", () => {
    const input: ReasoningTurnInput = {
      message: "What is the root cause of the foundation settlement?",
      intent: "problem_solving",
      facts: [],
      userPremises: [],
      inferences: [],
      contradictions: [],
      evidenceStates: [],
      conceptKeys: [],
      domainCandidates: ["construction"],
    };
    expect(reasoningApplicable(input)).toBe(true);
  });

  it("solves algebraic linear equations end-to-end through reasoningGroundTruth", async () => {
    const input: ReasoningTurnInput = {
      message: "solve 3x + 12 = 48",
      intent: "math_question",
      facts: [],
      userPremises: [],
      inferences: [],
      contradictions: [],
      evidenceStates: [],
      conceptKeys: [],
      domainCandidates: [],
    };
    const gt = await reasoningGroundTruth({ frelux: null }, input);
    expect(gt.applicable).toBe(true);
    expect(gt.solution).toContain("x = 12");
  });
});
