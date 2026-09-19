// Tests for ARCHIE's Offensive Security Engine: authorized
// ethical hacking with evidence-gated findings and a strict
// 8-phase lifecycle. No fake results; authorization enforced.

import { describe, expect, it } from "vitest";
import {
  addNote,
  advancePhase,
  AUTOMATION_ELIGIBILITY,
  BLUE_TEAM_METHODOLOGY,
  buildEngagementReport,
  inScope,
  OFFENSIVE_PHASES,
  recordFinding,
  RED_TEAM_METHODOLOGY,
  recommendRemediation,
  registerTarget,
  startEngagement,
  verifyFix,
} from "../offensive-security";
import { AuthorizationRegistry } from "../capability-authority";

const NOW = 1_800_000_000_000; // fixed ms epoch
const iso = (ms: number) => new Date(ms).toISOString();

function labTarget() {
  const r = registerTarget({
    kind: "DEDICATED_LAB",
    identifier: "lab.frelux.internal",
    scope: ["https://lab.frelux.internal/*"],
    exclusions: ["https://lab.frelux.internal/admin"],
    registeredBy: "owner",
  });
  if (!r.ok) throw new Error(r.error);
  return r.target;
}

function externalTarget() {
  const r = registerTarget({
    kind: "OWNER_AUTHORIZED_EXTERNAL",
    identifier: "https://partner.example.com",
    scope: ["https://partner.example.com"],
    registeredBy: "owner",
  });
  if (!r.ok) throw new Error(r.error);
  return r.target;
}

function registryWithExternalGrant() {
  const reg = new AuthorizationRegistry();
  reg.grant({
    id: "auth-ext-1",
    authority: "run_authorized_security_test",
    scope: "https://partner.example.com",
    granted_at: NOW,
    expires_at: NOW + 86_400_000,
    evidence: "test-owner-approval",
  });
  reg.grant({
    id: "auth-ext-access",
    authority: "access_authorized_target",
    scope: "https://partner.example.com",
    granted_at: NOW,
    expires_at: NOW + 86_400_000,
    evidence: "test-owner-approval",
  });
  return reg;
}

/** Registry with the standing lab authorization the EXPLOIT
 *  phase requires on controlled environments. */
function labRegistry() {
  const reg = new AuthorizationRegistry();
  reg.grant({
    id: "auth-lab",
    authority: "run_authorized_security_test",
    scope: "CONTROLLED_LAB",
    granted_at: NOW,
    expires_at: NOW + 86_400_000,
    evidence: "test-owner-approval",
  });
  return reg;
}

describe("§offensive targets", () => {
  it("registers targets with explicit scope", () => {
    const r = registerTarget({
      kind: "CTF_ENVIRONMENT",
      identifier: "ctf-range-1",
      scope: ["10.0.0.0/24"],
      registeredBy: "owner",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.target.id).toBeTruthy();
  });

  it("refuses targets without explicit scope", () => {
    const r = registerTarget({
      kind: "DEDICATED_LAB",
      identifier: "lab",
      scope: [],
      registeredBy: "owner",
    });
    expect(r.ok).toBe(false);
  });

  it("refuses ambiguous scope/exclusion overlap", () => {
    const r = registerTarget({
      kind: "DEDICATED_LAB",
      identifier: "lab",
      scope: ["https://lab.internal/app"],
      exclusions: ["https://lab.internal/app"],
      registeredBy: "owner",
    });
    expect(r.ok).toBe(false);
  });

  it("honours exclusions over scope", () => {
    const t = labTarget();
    expect(inScope(t, "https://lab.frelux.internal/app")).toBe(true);
    expect(inScope(t, "https://lab.frelux.internal/admin")).toBe(false);
    expect(inScope(t, "https://other.example.com")).toBe(false);
  });
});

describe("§offensive lifecycle", () => {
  it("follows the full 8-phase order", () => {
    expect(OFFENSIVE_PHASES).toEqual([
      "DISCOVER",
      "ENUMERATE",
      "ANALYZE",
      "TEST",
      "EXPLOIT",
      "DOCUMENT",
      "REMEDIATE",
      "RETEST",
    ]);
  });

  it("starts at DISCOVER without needing a grant (passive)", () => {
    const r = startEngagement(labTarget(), iso(NOW));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.engagement.currentPhase).toBe("DISCOVER");
      expect(r.engagement.phases.DISCOVER.status).toBe("IN_PROGRESS");
    }
  });

  it("advances through all phases on a registered lab", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    // walk every remaining phase
    for (const phase of OFFENSIVE_PHASES.slice(1)) {
      const a = advancePhase(e, reg, {
        operation: `perform ${phase} on the registered lab target`,
        now: iso(NOW + 1000),
      });
      expect(a.ok).toBe(true);
      expect(e.currentPhase).toBe(phase);
    }
    expect(e.phases.DISCOVER.status).toBe("DONE");
    expect(e.phases.RETEST.status).toBe("IN_PROGRESS");
  });

  it("refuses EXPLOIT on a controlled environment without the standing lab grant", () => {
    const reg = new AuthorizationRegistry(); // registration only, no grant
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    // ENUMERATE (ACTIVE, study-kind) may pass…
    void advancePhase(e, reg, { operation: "enumerate", now: iso(NOW + 1000) });
    void advancePhase(e, reg, { operation: "analyze", now: iso(NOW + 2000) });
    void advancePhase(e, reg, {
      operation: "test within scope",
      now: iso(NOW + 3000),
    });
    // …but EXPLOIT (INTRUSIVE) requires the CONTROLLED_LAB authorization.
    const a = advancePhase(e, reg, {
      operation: "attempt exploitation in the lab",
      now: iso(NOW + 4000),
    });
    expect(a.ok).toBe(false);
    expect(e.currentPhase).toBe("TEST"); // gate held
  });

  it("refuses advancement past the final phase", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    for (const _ of OFFENSIVE_PHASES.slice(1)) {
      void advancePhase(e, reg, {
        operation: "continue the engagement",
        now: iso(NOW + 2000),
      });
    }
    const past = advancePhase(e, reg, {
      operation: "continue past the end",
      now: iso(NOW + 3000),
    });
    expect(past.ok).toBe(false);
  });
});

describe("§authorization gate (external targets)", () => {
  it("refuses ENUMERATE on external targets without a live grant", () => {
    const reg = new AuthorizationRegistry(); // no grant
    const r = startEngagement(externalTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const a = advancePhase(r.engagement, reg, {
      operation: "enumerate the partner site",
      now: iso(NOW + 1000),
    });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toContain("authorization");
  });

  it("allows intrusive phases with a live, in-scope grant", () => {
    const reg = registryWithExternalGrant();
    const r = startEngagement(externalTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    const a = advancePhase(e, reg, {
      operation: "enumerate the partner site",
      now: iso(NOW + 2000),
    });
    expect(a.ok).toBe(true);
  });

  it("refuses phases when the grant has expired", () => {
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "auth-expired",
      authority: "run_authorized_security_test",
      scope: "https://partner.example.com",
      granted_at: NOW - 100_000,
      expires_at: NOW - 1000, // already expired
      evidence: "test-owner-approval",
    });
    const r = startEngagement(externalTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const a = advancePhase(r.engagement, reg, {
      operation: "enumerate the partner site",
      now: iso(NOW + 1000),
    });
    expect(a.ok).toBe(false);
  });

  it("refuses grants that do not cover the target", () => {
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "auth-other",
      authority: "run_authorized_security_test",
      scope: "https://different.example.com",
      granted_at: NOW,
      expires_at: NOW + 86_400_000,
      evidence: "test-owner-approval",
    });
    const r = startEngagement(externalTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const a = advancePhase(r.engagement, reg, {
      operation: "enumerate the partner site",
      now: iso(NOW + 1000),
    });
    expect(a.ok).toBe(false);
  });
});

describe("§evidence discipline (no fake results)", () => {
  it("refuses findings with no evidence", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    void advancePhase(e, reg, {
      operation: "enumerate the lab",
      now: iso(NOW + 1000),
    });
    const f = recordFinding(e, {
      title: "Admin panel without authentication",
      severity: "HIGH",
      category: "AUTHZ_WEAKNESS",
      evidence: [],
    });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain("evidence");
  });

  it("refuses whitespace-only evidence", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    void advancePhase(e, reg, {
      operation: "enumerate the lab",
      now: iso(NOW + 1000),
    });
    const f = recordFinding(e, {
      title: "Admin panel without authentication",
      severity: "HIGH",
      category: "AUTHZ_WEAKNESS",
      evidence: ["   ", "\t"],
    });
    expect(f.ok).toBe(false);
  });

  it("records real findings with evidence from TEST", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    void advancePhase(e, reg, { operation: "enumerate", now: iso(NOW + 1000) });
    void advancePhase(e, reg, { operation: "analyze", now: iso(NOW + 2000) });
    void advancePhase(e, reg, {
      operation: "test the lab within scope",
      now: iso(NOW + 3000),
    });
    expect(e.currentPhase).toBe("TEST");
    const f = recordFinding(e, {
      title: "IDOR on /api/orders/:id",
      severity: "HIGH",
      category: "AUTHZ_WEAKNESS",
      evidence: [
        "GET /api/orders/42 with session A returned 200 + order data",
        "GET /api/orders/42 with session B (different tenant) returned 200 + same data",
      ],
      remediation: "Add tenant checks to order lookups.",
    });
    expect(f.ok).toBe(true);
    expect(e.findings).toHaveLength(1);
  });

  it("refuses findings recorded from non-observational phases", () => {
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement; // still DISCOVER
    const f = recordFinding(e, {
      title: "Something",
      severity: "LOW",
      category: "MISCONFIGURATION",
      evidence: ["hypothetical"],
    });
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.error).toContain("DISCOVER");
  });

  it("cannot mark a fix RESOLVED outside the RETEST phase", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    void advancePhase(e, reg, { operation: "enumerate", now: iso(NOW + 1000) });
    const f = recordFinding(e, {
      title: "XSS in search box",
      severity: "MEDIUM",
      category: "XSS",
      evidence: ["payload <script>alert(1)</script> executed in DOM"],
    });
    if (!f.ok) throw new Error(f.error);
    const v = verifyFix(e, f.finding.id, ["fix deployed"]);
    expect(v.ok).toBe(false);
  });

  it("requires retest evidence to mark a fix RESOLVED", () => {
    const reg = labRegistry();
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    for (const p of OFFENSIVE_PHASES.slice(1, 7)) {
      void advancePhase(e, reg, {
        operation: `advance to ${p}`,
        now: iso(NOW + 1000),
      });
    }
    // Walk to RETEST
    void advancePhase(e, reg, {
      operation: "retest the fixed findings",
      now: iso(NOW + 2000),
    });
    expect(e.currentPhase).toBe("RETEST");
    const f = recordFinding(e, {
      title: "XSS in search box",
      severity: "MEDIUM",
      category: "XSS",
      evidence: ["payload executed at TEST time"],
      phase: "TEST",
    });
    if (!f.ok) throw new Error(f.error);
    // No retest evidence → refusal
    const noEv = verifyFix(e, f.finding.id, []);
    expect(noEv.ok).toBe(false);
    // Real retest evidence → RESOLVED
    const ok = verifyFix(e, f.finding.id, [
      "same payload now rendered as text, no script execution",
    ]);
    expect(ok.ok).toBe(true);
    expect(e.findings[0].fixStatus).toBe("RESOLVED");
    expect(e.findings[0].evidence.some((x) => x.startsWith("RETEST"))).toBe(
      true,
    );
  });
});

describe("§reporting", () => {
  it("builds an honest report over recorded evidence", () => {
    const r = startEngagement(labTarget(), iso(NOW));
    if (!r.ok) throw new Error(r.error);
    const e = r.engagement;
    addNote(e, "found admin surface at /admin (out of scope — skipped)");
    const report = buildEngagementReport(e);
    expect(report.engagementId).toBe(e.id);
    expect(report.openFindings).toBe(0);
    expect(report.resolvedFindings).toBe(0);
    expect(report.scopeStatement).toContain("Scope was:");
  });
});

describe("§methodology knowledge", () => {
  it("carries red-team methodology areas", () => {
    expect(RED_TEAM_METHODOLOGY.length).toBeGreaterThan(0);
    const keys = RED_TEAM_METHODOLOGY.map((m) => m.key);
    expect(keys).toContain("post_exploitation");
  });

  it("carries blue-team defensive methodology", () => {
    expect(BLUE_TEAM_METHODOLOGY.length).toBeGreaterThan(0);
    expect(BLUE_TEAM_METHODOLOGY.map((m) => m.key)).toContain("detection");
  });

  it("marks human-required vs automatable checks", () => {
    expect(AUTOMATION_ELIGIBILITY.dependency_version_audit).toBe("AUTOMATABLE");
    expect(AUTOMATION_ELIGIBILITY.exploit_development).toBe("HUMAN_REQUIRED");
    expect(AUTOMATION_ELIGIBILITY.social_engineering).toBe("HUMAN_REQUIRED");
  });

  it("recommends remediation without granting implementation authority", () => {
    const r = recommendRemediation("AUTHZ_WEAKNESS");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recommendation).toContain("authorization");
      expect(r.implementationRequiresOwnerApproval).toBe(true);
    }
  });

  it("admits when no playbook exists rather than inventing one", () => {
    const r = recommendRemediation("QUANTUM_TUNNELING");
    expect(r.ok).toBe(false);
  });
});
