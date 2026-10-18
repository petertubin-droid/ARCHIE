import { describe, it, expect } from "vitest";
import {
  detectDomainsFromText,
  executeMultiDomainReasoning,
  runMultiDomainReasoningLoop,
  DEFAULT_MAX_MULTI_DOMAIN_STEPS,
} from "../multi-domain-reasoning-loop";

describe("MultiDomainReasoningLoop", () => {
  it("detects candidate domains from inquiry text", () => {
    const domains = detectDomainsFromText(
      "Evaluate structural shear walls and costing for this commercial building project",
    );
    expect(domains).toContain("structural");
    expect(domains).toContain("costing");
    expect(domains).toContain("architecture");
  });

  it("executes multi-domain reasoning across connected domains with full synthesis and analogies", () => {
    const outcome = executeMultiDomainReasoning({
      query: "Design a high-resilience distributed cloud architecture with zero-trust cyber defense",
      explicit_domains: ["cloud_infrastructure", "cybersecurity"],
      include_analogies: true,
    });

    expect(outcome.active_domains.length).toBeGreaterThanOrEqual(2);
    expect(outcome.active_domains).toContain("cloud_infrastructure");
    expect(outcome.active_domains).toContain("cybersecurity");

    // Traversed relations
    expect(outcome.relation_paths.length).toBeGreaterThanOrEqual(1);

    // Discovered analogies
    expect(outcome.analogies_found.length).toBeGreaterThanOrEqual(1);
    expect(
      outcome.analogies_found.some(
        (a) => a.id === "ANALOGY_IMMUNE_DEFENSE_TO_CYBERSECURITY",
      ),
    ).toBe(true);

    // Synthesis report
    expect(outcome.synthesis_report.total_claims_analyzed).toBeGreaterThanOrEqual(2);
    expect(outcome.synthesis_report.synthesized_thesis.length).toBeGreaterThan(10);

    // Steps trace
    expect(outcome.steps.length).toBeGreaterThanOrEqual(4);
    expect(outcome.used_steps).toBeLessThanOrEqual(DEFAULT_MAX_MULTI_DOMAIN_STEPS);
    expect(outcome.budget_exhausted).toBe(false);
    expect(outcome.trace).toContain("DISCOVER_DOMAINS");
    expect(outcome.trace).toContain("TRAVERSE_GRAPH");
    expect(outcome.trace).toContain("VERIFY_AND_CONCLUDE");
  });

  it("ANTI-FABRICATION: records excluded domains with explicit rationale", () => {
    const outcome = executeMultiDomainReasoning({
      query: "Analyze painting finishes and paint cure schedules",
      explicit_domains: ["painting_finishes"],
      max_hops: 1,
    });

    expect(outcome.active_domains).toContain("painting_finishes");
    expect(outcome.excluded_domains.length).toBeGreaterThan(0);

    const excluded = outcome.excluded_domains[0];
    expect(excluded.reason).toContain("No registered relation path to the anchor domains");
    expect(excluded.reason).toContain("cross-domain context is never fabricated");
  });

  it("HONEST BUDGET BOUNDING: halts when max_steps is exceeded without faking completion", () => {
    const outcome = executeMultiDomainReasoning({
      query: "Comprehensive multi-domain evaluation of global infrastructure and economics",
      explicit_domains: ["cloud_infrastructure", "economics", "cybersecurity", "costing"],
      max_steps: 3,
    });

    expect(outcome.budget_exhausted).toBe(true);
    expect(outcome.used_steps).toBe(3);
    expect(outcome.epistemic_classification).toBe("ASSUMED");
    expect(outcome.trace).toContain("BUDGET_STOP");
    expect(outcome.trace).toContain("Halting reasoning honestly");
  });

  it("runs asynchronously via runMultiDomainReasoningLoop", async () => {
    const outcome = await runMultiDomainReasoningLoop({
      query: "Evaluate seismic load dissipation and fluid flow backpressure analogies",
      explicit_domains: ["structural", "science"],
    });

    expect(outcome.query).toBe(
      "Evaluate seismic load dissipation and fluid flow backpressure analogies",
    );
    expect(outcome.overall_confidence).toBeGreaterThan(0.7);
    expect(["VERIFIED", "INFERRED"]).toContain(outcome.epistemic_classification);
  });
});
