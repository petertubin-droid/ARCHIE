// =========================================================
// CODE-REVIEW-INTELLIGENCE TESTS (batch 23, fix 86)
// Findings without evidence are guesses; fixes are proposals
// through the fixed gate; deterministic components force
// engineering review.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEVERITY,
  describeFinding,
  prepareFinding,
  prioritizeFindings,
  type CodeReviewFinding,
} from "@/lib/archie/code-review-intelligence";

const base = {
  kind: "bug" as const,
  affected_component: "src/pages/Paint.tsx",
  evidence: "TypeError in test output",
  likely_cause: "null access",
  impact: "calc page crashes",
  recommended_remediation: "null-guard the input",
};

describe("prepareFinding", () => {
  it("refuses findings without evidence — a guess is not a finding", () => {
    const r = prepareFinding({ ...base, evidence: "  " });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/evidence is required/i);
  });

  it("refuses findings without the affected component", () => {
    expect(prepareFinding({ ...base, affected_component: "" }).ok).toBe(false);
  });

  it("marks every remediation as a proposal through the fixed gate", () => {
    const r = prepareFinding(base);
    expect(r.ok).toBe(true);
    if (r.ok && r.finding) {
      expect(r.finding.remediation_is_proposal).toBe(true);
      expect(r.finding.gate).toMatch(
        /ARCHIE proposes → OWNER reviews → OWNER authorizes/,
      );
    }
  });

  it("defaults severity per kind and forces engineering review on deterministic components", () => {
    const r = prepareFinding({ ...base, kind: "security_vulnerability" });
    expect(r.ok).toBe(true);
    if (r.ok && r.finding)
      expect(r.finding.severity).toBe(DEFAULT_SEVERITY.security_vulnerability);

    const det = prepareFinding({
      ...base,
      affected_component: "src/lib/paint-formula.ts (deterministic math)",
    });
    expect(det.ok).toBe(true);
    if (det.ok && det.finding)
      expect(det.finding.requires_engineering_review).toBe(true);
  });
});

describe("prioritizeFindings", () => {
  function f(
    sev: CodeReviewFinding["severity"],
    eng: boolean,
  ): CodeReviewFinding {
    return {
      kind: "bug",
      severity: sev,
      affected_component: "c",
      evidence: "e",
      likely_cause: "c",
      impact: "i",
      recommended_remediation: "r",
      requires_engineering_review: eng,
    };
  }

  it("sorts by severity first, engineering-gated first within severity", () => {
    const ordered = prioritizeFindings([
      f("LOW", true),
      f("CRITICAL", false),
      f("HIGH", false),
      f("HIGH", true),
    ]);
    expect(ordered.map((x) => x.severity)).toEqual([
      "CRITICAL",
      "HIGH",
      "HIGH",
      "LOW",
    ]);
    expect(ordered[1].requires_engineering_review).toBe(true);
  });
});

describe("describeFinding", () => {
  it("renders the full honest reporting shape", () => {
    const text = describeFinding({
      kind: "bug",
      severity: "HIGH",
      affected_component: "Paint.tsx",
      evidence: "stack trace",
      likely_cause: "x",
      impact: "y",
      recommended_remediation: "z",
      requires_engineering_review: false,
    });
    expect(text).toMatch(/\[HIGH\] bug/);
    expect(text).toMatch(/Evidence: stack trace/);
    expect(text).toMatch(/Remediation \(proposal\): z/);
    expect(text).toMatch(/standard owner approval gate/);
  });
});
