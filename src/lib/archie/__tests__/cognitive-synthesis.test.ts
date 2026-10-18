import { describe, it, expect } from "vitest";
import {
  CognitiveSynthesisEngine,
  cognitiveSynthesisEngine,
  type DomainClaim,
} from "../cognitive-synthesis";

describe("CognitiveSynthesisEngine", () => {
  it("detects objective conflict tensions (e.g. security vs latency)", () => {
    const claims: DomainClaim[] = [
      {
        id: "C_SEC",
        domain: "cybersecurity",
        statement: "Enforce zero-trust auth and strict airgap sanitize checks on every API request",
        evidence: ["OWASP ASVS Level 3"],
        evidence_state: "VERIFIED",
        weight: 0.95,
        risk_critical: true,
      },
      {
        id: "C_PERF",
        domain: "networking",
        statement: "Achieve sub-5ms latency and maximum throughput with unbuffered packet processing",
        evidence: ["SLA benchmark"],
        evidence_state: "VERIFIED",
        weight: 0.9,
      },
    ];

    const tensions = cognitiveSynthesisEngine.identifyTensions(claims);
    expect(tensions.length).toBe(1);
    expect(tensions[0].nature).toBe("OBJECTIVE_CONFLICT");
    expect(tensions[0].severity).toBe("CRITICAL"); // escalated because risk_critical is true
    expect(tensions[0].domain_a).toBe("cybersecurity");
    expect(tensions[0].domain_b).toBe("networking");
  });

  it("detects resource competition tensions (cost vs redundancy)", () => {
    const claims: DomainClaim[] = [
      {
        id: "C_COST",
        domain: "costing",
        statement: "Enforce minimal-spend budget constraints and avoid unnecessary operational expenditures",
        evidence: ["Financial plan"],
        evidence_state: "INFERRED",
        weight: 0.8,
      },
      {
        id: "C_RESIL",
        domain: "structural",
        statement: "Implement multi-region redundancy, fault-tolerant shear walls, and high-availability backups",
        evidence: ["Building code 2026"],
        evidence_state: "VERIFIED",
        weight: 0.95,
      },
    ];

    const tensions = cognitiveSynthesisEngine.identifyTensions(claims);
    expect(tensions.length).toBe(1);
    expect(tensions[0].nature).toBe("RESOURCE_COMPETITION");
  });

  it("applies HIERARCHICAL_PRECEDENCE strategy when risk-critical constraints exist", () => {
    const claims: DomainClaim[] = [
      {
        id: "C1",
        domain: "structural",
        statement: "Seismic shear safety factors cannot be compromised",
        evidence: ["ASCE 7-22"],
        evidence_state: "VERIFIED",
        weight: 1.0,
        risk_critical: true,
      },
      {
        id: "C2",
        domain: "costing",
        statement: "Achieve cheap minimal-spend contractor estimates",
        evidence: ["Target budget"],
        evidence_state: "INFERRED",
        weight: 0.7,
      },
    ];

    const tensions = cognitiveSynthesisEngine.identifyTensions(claims);
    expect(tensions.length).toBe(1);

    const resolution = cognitiveSynthesisEngine.resolveTension(tensions[0], {
      strictSafetyPrecedence: true,
    });

    expect(resolution.strategy).toBe("HIERARCHICAL_PRECEDENCE");
    expect(resolution.tradeoffs.length).toBe(2);
    expect(resolution.tradeoffs.find((t) => t.domain === "structural")?.concessions).toContain("non-negotiable");
  });

  it("preserves epistemic uncertainty: assumptions propagate ASSUMED evidence state and residual uncertainty", () => {
    const claims: DomainClaim[] = [
      {
        id: "C1",
        domain: "business",
        statement: "Rapid sprint expansion into unverified market segments",
        evidence: ["Pitch deck"],
        evidence_state: "ASSUMED",
        weight: 0.6,
      },
      {
        id: "C2",
        domain: "regulations_standards",
        statement: "Mandatory compliance review and audit-trail certification",
        evidence: ["ISO 27001"],
        evidence_state: "VERIFIED",
        weight: 0.9,
      },
    ];

    const tensions = cognitiveSynthesisEngine.identifyTensions(claims);
    const resolution = cognitiveSynthesisEngine.resolveTension(tensions[0]);

    expect(resolution.resulting_evidence_state).toBe("ASSUMED");
    expect(resolution.residual_uncertainty).not.toBeNull();
    expect(resolution.residual_uncertainty).toContain("assumed parameters");
  });

  it("generates comprehensive synthesis report with epistemic audit", () => {
    const claims: DomainClaim[] = [
      {
        id: "C_SEC",
        domain: "cybersecurity",
        statement: "Strict token encryption and auth audit on all endpoints",
        evidence: ["Security standard"],
        evidence_state: "VERIFIED",
        weight: 0.9,
      },
      {
        id: "C_DEV",
        domain: "web_development",
        statement: "Instant fastest render pipeline with minimal serialization overhead",
        evidence: ["Vite benchmark"],
        evidence_state: "INFERRED",
        weight: 0.85,
      },
      {
        id: "C_COST",
        domain: "costing",
        statement: "Budget limits on external telemetry services",
        evidence: ["Billing limit"],
        evidence_state: "ASSUMED",
        weight: 0.7,
      },
    ];

    const report = cognitiveSynthesisEngine.synthesize(claims);
    expect(report.total_claims_analyzed).toBe(3);
    expect(report.domains_involved).toContain("cybersecurity");
    expect(report.domains_involved).toContain("web_development");
    expect(report.domains_involved).toContain("costing");
    expect(report.epistemic_audit.verified_count).toBe(1);
    expect(report.epistemic_audit.inferred_count).toBe(1);
    expect(report.epistemic_audit.assumed_count).toBe(1);
    expect(report.overall_confidence).toBeGreaterThan(0.7);
    expect(report.synthesized_thesis.length).toBeGreaterThan(20);
  });
});
