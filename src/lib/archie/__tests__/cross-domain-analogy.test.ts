import { describe, it, expect } from "vitest";
import {
  CrossDomainAnalogyEngine,
  REGISTERED_ANALOGIES,
  analogyEngine,
  type AnalogySchema,
} from "../cross-domain-analogy";

describe("CrossDomainAnalogyEngine", () => {
  it("initializes with all registered structural analogy schemas", () => {
    expect(REGISTERED_ANALOGIES.length).toBeGreaterThanOrEqual(5);
    const ids = REGISTERED_ANALOGIES.map((a) => a.id);
    expect(ids).toContain("ANALOGY_IMMUNE_DEFENSE_TO_CYBERSECURITY");
    expect(ids).toContain("ANALOGY_STRUCTURAL_SHEAR_TO_DISTRIBUTED_ISOLATION");
    expect(ids).toContain("ANALOGY_VASCULAR_FLOW_TO_QUEUE_BACKPRESSURE");
    expect(ids).toContain("ANALOGY_THERMODYNAMIC_ENTROPY_TO_CODE_DEGRADATION");
    expect(ids).toContain("ANALOGY_URBAN_ZONING_TO_SYSTEM_MODULARITY");
  });

  it("finds analogies by target domain and category", () => {
    const cyberAnalogies = analogyEngine.findAnalogies({
      target_domain: "cybersecurity",
    });
    expect(cyberAnalogies.length).toBe(1);
    expect(cyberAnalogies[0].id).toBe("ANALOGY_IMMUNE_DEFENSE_TO_CYBERSECURITY");
    expect(cyberAnalogies[0].category).toBe("RESILIENCE_AND_DEFENSE");

    const flowAnalogies = analogyEngine.findAnalogies({
      category: "SYSTEMIC_FLOW",
    });
    expect(flowAnalogies.length).toBe(1);
    expect(flowAnalogies[0].source_domain).toBe("science");
    expect(flowAnalogies[0].target_domain).toBe("networking");
  });

  it("finds analogies by keyword across elements and mechanisms", () => {
    const shearMatches = analogyEngine.findAnalogies({
      keyword: "shear",
    });
    expect(shearMatches.length).toBeGreaterThanOrEqual(1);
    expect(shearMatches[0].id).toBe("ANALOGY_STRUCTURAL_SHEAR_TO_DISTRIBUTED_ISOLATION");

    const entropyMatches = analogyEngine.findAnalogies({
      keyword: "entropy",
    });
    expect(entropyMatches.length).toBe(1);
    expect(entropyMatches[0].id).toBe("ANALOGY_THERMODYNAMIC_ENTROPY_TO_CODE_DEGRADATION");
  });

  it("enforces epistemic constraints: all analogies are INFERRED or ASSUMED hypotheses, never FACT", () => {
    for (const schema of REGISTERED_ANALOGIES) {
      expect(["INFERRED", "ASSUMED"]).toContain(schema.epistemic_status);
      expect(schema.relational_mappings.length).toBeGreaterThanOrEqual(3);
      expect(schema.boundary_conditions.breakdown_points.length).toBeGreaterThanOrEqual(1);
      expect(schema.boundary_conditions.false_equivalence_risks.length).toBeGreaterThanOrEqual(1);
      expect(schema.solution_transfer.heuristic.length).toBeGreaterThan(10);
    }
  });

  it("evaluates structural validity and flags breakdown risks honestly", () => {
    const evalReport = analogyEngine.evaluateAnalogy(
      "ANALOGY_IMMUNE_DEFENSE_TO_CYBERSECURITY",
    );
    expect(evalReport.viable).toBe(true);
    expect(evalReport.structural_score).toBeGreaterThan(0.8);
    expect(evalReport.relational_depth).toBe(4);
    expect(evalReport.epistemic_classification).toBe("INFERRED");
    expect(evalReport.recommendation).toContain("Observe breakdown conditions");
  });

  it("ANTI-FABRICATION: refuses evaluation on unregistered analogies", () => {
    const report = analogyEngine.evaluateAnalogy("FABRICATED_NONEXISTENT_ANALOGY");
    expect(report.viable).toBe(false);
    expect(report.structural_score).toBe(0);
    expect(report.epistemic_classification).toBe("UNKNOWN");
    expect(report.recommendation).toContain("Never fabricate unregistered analogies");
  });

  it("maps cross-domain hypothesis when registered relation path exists", () => {
    const result = analogyEngine.mapCrossDomainHypothesis({
      source_domain: "structural",
      target_domain: "science",
      source_problem: "High lateral load in structural framing",
      target_problem: "Vector force equilibrium in physics",
      rationale: "Mechanics principles underpin structural load calculations",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.analogy.epistemic_status).toBe("ASSUMED");
      expect(result.analogy.relational_mappings[0].relation).toBe("grounded_in");
    }
  });

  it("ANTI-FABRICATION: refuses cross-domain hypothesis when no relation exists", () => {
    const result = analogyEngine.mapCrossDomainHypothesis({
      source_domain: "painting_finishes",
      target_domain: "crypto_intelligence",
      source_problem: "Paint drying time",
      target_problem: "Crypto transaction settlement",
      rationale: "Both take time",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No registered relation path");
      expect(result.error).toContain("analogy transfer is never fabricated");
    }
  });
});
