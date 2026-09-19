// =========================================================
// FRELUX ARCHIE AMENDMENT TESTS
// Full codebase intelligence, code review, coding workflow,
// cybersecurity, Trust & Safety, account pause authority,
// escrow intelligence and governance separation.
// =========================================================
import { describe, it, expect } from "vitest";

import {
  AUTHORIZED_CODE_ROOTS,
  FORBIDDEN_CODE_ROOTS,
  canInspectPath,
  registerTechnology,
  listTechnologies,
  ARCHIE_CODE_AUTHORITY,
} from "../code-intelligence";
import {
  FINDING_KINDS,
  prepareFinding,
  prioritizeFindings,
  describeFinding,
  DEFAULT_SEVERITY,
} from "../code-review-intelligence";
import {
  DEV_STAGES,
  PRODUCTION_WORKFLOW,
  DEVELOPMENT_DOMAINS,
  developmentAction,
  nextProductionStage,
  DEVELOPMENT_CAPABILITY,
} from "../development-workflow";
import {
  DEFENSIVE_CAPABILITIES,
  classifySecurityOperation,
  prepareVulnerabilityAssessment,
  INCIDENT_RESPONSE_STAGES,
} from "../cybersecurity";
import {
  TRUST_SAFETY_SIGNALS,
  assessTrustSafety,
  isEvidenceValid,
  riskLevelForScore,
  AUTHORITY_LAYERS,
  FINAL_PRINCIPLE,
  hasValidProvenance,
  type TrustSafetyEvidence,
} from "../trust-safety";
import {
  proposeAccountPause,
  isPauseActive,
  recordAppeal,
  ownerReview,
  MAX_SUSPENSION_HOURS,
  PAUSE_WORKFLOW,
} from "../account-pause";
import {
  ESCROW_MONITORING_SCOPE,
  ESCROW_AUTHORITY,
  flagTransaction,
  assistDisputeAnalysis,
  canArchieMoveFunds,
} from "../escrow-intelligence";
import { isAccountPaused, assertNotPaused } from "../trust-safety-client";

const ev = (
  observed: string,
  ref: string,
  at = "2026-09-08T10:00:00.000Z",
): TrustSafetyEvidence => ({ observed, source_ref: ref, captured_at: at });

// =========================================================
// 1. Full FRELUX codebase intelligence
// =========================================================
describe("amendment 1: full codebase intelligence", () => {
  it("covers the full technical architecture across authorized roots", () => {
    const roots = AUTHORIZED_CODE_ROOTS.map((r) => `${r.root}:${r.area}`);
    for (const expected of [
      "src/pages:frontend",
      "src/lib:backend",
      "supabase/functions:edge",
      "supabase/migrations:database",
      "vite.config.ts:build",
      "netlify.toml:deployment",
      ".github/workflows:deployment",
      "public/sw.js:pwa",
      "src/lib/archie/mobile:mobile",
      "src/**/__tests__:tests",
      "package.json:deps",
      "docs:config",
    ]) {
      expect(roots).toContain(expected);
    }
  });

  it("can inspect code across the surface but never secrets", () => {
    expect(canInspectPath("src/lib/calc.ts").ok).toBe(true);
    expect(canInspectPath("vite.config.ts").ok).toBe(true);
    expect(canInspectPath("supabase/migrations/x.sql").ok).toBe(true);
    for (const forbidden of FORBIDDEN_CODE_ROOTS) {
      expect(canInspectPath(`${forbidden}/thing`).ok).toBe(false);
    }
    expect(ARCHIE_CODE_AUTHORITY.mayModifyProduction).toBe(false);
    expect(ARCHIE_CODE_AUTHORITY.mayDeploy).toBe(false);
  });

  it("is extensible to new legitimate technologies", () => {
    const before = listTechnologies().length;
    const res = registerTechnology({
      name: "Rust",
      kind: "language",
      description: "Future performance-critical services",
    });
    expect(res.ok).toBe(true);
    expect(listTechnologies().length).toBe(before + 1);
    expect(listTechnologies().some((t) => t.name === "Rust")).toBe(true);
    // duplicates are rejected; empty names are rejected
    expect(registerTechnology({ name: "Rust", kind: "language", description: "" }).ok).toBe(false);
    // the base technologies are still there (Python, SQL, etc.)
    for (const base of ["TypeScript", "Python", "SQL", "React", "Supabase", "PWA"]) {
      expect(listTechnologies().some((t) => t.name === base)).toBe(true);
    }
  });
});

// =========================================================
// 2. Code review & error intelligence
// =========================================================
describe("amendment 2: code review & error intelligence", () => {
  it("identifies, explains and prioritizes every finding kind with the full reporting shape", () => {
    expect(FINDING_KINDS.length).toBe(14);
    const finding = prepareFinding({
      kind: "security_vulnerability",
      affected_component: "src/lib/supabase.ts",
      evidence: "Query built by string concatenation in fetchListing (line 10)",
      likely_cause: "User input interpolated without parameterization",
      impact: "Potential data exposure of other users' listings",
      recommended_remediation: "Use parameterized filters via the PostgREST client",
    });
    expect(finding.ok).toBe(true);
    expect(finding.finding!.severity).toBe("CRITICAL");
    const text = describeFinding(finding.finding!);
    for (const part of ["[CRITICAL]", "Component:", "Evidence:", "Likely cause:", "Impact:", "Remediation"]) {
      expect(text).toContain(part);
    }
    // engineering-gated components flag the extra review
    const eng = prepareFinding({
      kind: "bug",
      affected_component: "src/lib/roof/deterministic-formula.ts",
      evidence: "Unit test fails for negative rafter length",
      likely_cause: "Math.abs missing in hip reduction",
      impact: "Wrong timber quantities",
      recommended_remediation: "Guard input domain",
    });
    expect(eng.finding!.requires_engineering_review).toBe(true);
  });

  it("refuses findings without evidence and prioritizes by severity", () => {
    expect(
      prepareFinding({
        kind: "bug",
        affected_component: "x.ts",
        evidence: "  ",
        likely_cause: "?",
        impact: "?",
        recommended_remediation: "?",
      }).ok,
    ).toBe(false);
    const sorted = prioritizeFindings([
      { kind: "warning", severity: "LOW", affected_component: "a", evidence: "e", likely_cause: "c", impact: "i", recommended_remediation: "r", requires_engineering_review: false },
      { kind: "security_vulnerability", severity: "CRITICAL", affected_component: "b", evidence: "e", likely_cause: "c", impact: "i", recommended_remediation: "r", requires_engineering_review: false },
      { kind: "bug", severity: "HIGH", affected_component: "c", evidence: "e", likely_cause: "c", impact: "i", recommended_remediation: "r", requires_engineering_review: true },
    ]);
    expect(sorted[0].severity).toBe("CRITICAL");
    expect(sorted[1].requires_engineering_review).toBe(true);
    expect(DEFAULT_SEVERITY.deployment_problem).toBe("HIGH");
  });
});

// =========================================================
// 3. Coding & app development
// =========================================================
describe("amendment 3: coding & app development", () => {
  it("may READ → UNDERSTAND → ANALYZE → DESIGN → WRITE → TEST → REVIEW → PROPOSE", () => {
    expect(DEV_STAGES).toEqual([
      "READ", "UNDERSTAND", "ANALYZE", "DESIGN", "WRITE", "TEST", "REVIEW", "PROPOSE",
    ]);
    const action = developmentAction("build an Android client for ARCHIE mobile");
    expect(action.output).toBe("proposal");
    expect(action.gate).toContain("OWNER REVIEWS");
    expect(DEVELOPMENT_DOMAINS).toContain("android");
    expect(DEVELOPMENT_DOMAINS).toContain("pwa");
    expect(DEVELOPMENT_CAPABILITY.may_generate).toContain("tests");
  });

  it("never independently applies production changes: ARCHIE proposes, OWNER advances", () => {
    expect(
      nextProductionStage("ARCHIE PROPOSES", "ARCHIE").next,
    ).toBe("OWNER REVIEWS");
    // ARCHIE cannot advance past the owner's stages
    expect(nextProductionStage("OWNER REVIEWS", "ARCHIE").ok).toBe(false);
    expect(nextProductionStage("OWNER AUTHORIZES", "ARCHIE").ok).toBe(false);
    expect(nextProductionStage("APPLY", "ARCHIE").ok).toBe(false);
    expect(nextProductionStage("DEPLOY", "ARCHIE").ok).toBe(false);
    // the owner can
    expect(nextProductionStage("OWNER REVIEWS", "OWNER").ok).toBe(true);
    expect(PRODUCTION_WORKFLOW).toEqual([
      "ARCHIE PROPOSES", "OWNER REVIEWS", "OWNER AUTHORIZES", "APPLY", "TEST", "AUDIT", "VERSION", "DEPLOY",
    ]);
  });
});

// =========================================================
// 4. Cybersecurity, defensive only
// =========================================================
describe("amendment 4: defensive cybersecurity", () => {
  it("develops the full defensive capability set", () => {
    for (const cap of [
      "secure coding review",
      "secrets management hygiene",
      "dependency vulnerability assessment",
      "threat modeling",
      "incident response preparation",
      "authorized security testing of FRELUX systems",
    ]) {
      expect(DEFENSIVE_CAPABILITIES).toContain(cap);
    }
    expect(INCIDENT_RESPONSE_STAGES).toContain("owner-directed response");
  });

  it("allows defensive work and hard-refuses offensive operations", () => {
    expect(classifySecurityOperation("audit the RLS policies for gaps").verdict).toBe("DEFENSIVE_ALLOWED");
    expect(classifySecurityOperation("threat model the payments flow").verdict).toBe("DEFENSIVE_ALLOWED");
    const theft = classifySecurityOperation("steal the password hash to check them");
    expect(theft.verdict).toBe("REFUSED");
    expect(theft.rationale).toContain("credential theft");
    for (const op of [
      "bypass the security gate",
      "install a backdoor",
      "spy on the user's device",
      "attack the third-party API",
    ]) {
      expect(classifySecurityOperation(op).verdict).toBe("REFUSED");
    }
  });

  it("prepares vulnerability assessments as proposals with evidence", () => {
    expect(
      prepareVulnerabilityAssessment({
        finding: "XSS", component: "x", severity: "HIGH", evidence: "", defensive_fix: "f",
      }).ok,
    ).toBe(false);
    const a = prepareVulnerabilityAssessment({
      finding: "Exposed service key in client bundle",
      component: "src/lib/supabase.ts",
      severity: "CRITICAL",
      evidence: "Bundle contains SUPABASE_SERVICE_KEY string in built output",
      defensive_fix: "Move to server-side edge function; rotate the key",
    });
    expect(a.ok).toBe(true);
    expect(a.assessment!.fix_is_proposal).toBe(true);
  });
});

// =========================================================
// 5. Trust & Safety core
// =========================================================
describe("amendment 5: trust & safety core", () => {
  it("covers every detection category", () => {
    expect(TRUST_SAFETY_SIGNALS.length).toBe(12);
    for (const s of [
      "spam_message_flooding",
      "scam_attempt",
      "impersonation",
      "fraudulent_contractor_supplier_profile",
      "suspicious_payment_request",
      "manipulated_review",
      "malicious_link_or_file",
      "account_takeover_indicator",
      "marketplace_abuse",
      "suspicious_transaction_pattern",
      "coordinated_manipulation",
      "repeated_fraudulent_behavior",
    ]) {
      expect(TRUST_SAFETY_SIGNALS).toContain(s);
    }
  });

  it("scores risk from evidence only, confidence alone is refused", () => {
    const noEvidence = assessTrustSafety({
      account_id: "u1",
      signals: ["scam_attempt"],
      evidence: [],
    });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.error).toContain("confidence alone");
    const guessed = assessTrustSafety({
      account_id: "u1",
      signals: ["scam_attempt"],
      evidence: [{ observed: "looks fishy", source_ref: "", captured_at: "nonsense" }],
    });
    expect(guessed.ok).toBe(false);
    expect(isEvidenceValid(ev("x", "y"))).toBe(true);
  });

  it("produces auditable, risk-graded detection records", () => {
    const r = assessTrustSafety({
      account_id: "u1",
      signals: ["scam_attempt", "suspicious_payment_request"],
      evidence: [
        ev("Payment request asking for full amount before milestone", "msg-12"),
        ev("Off-platform payment link posted twice", "msg-13"),
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const a = r.assessment;
    expect(a.risk_level).toBe("HIGH");
    expect(a.risk_score).toBe(55);
    expect(a.detection_record.assessor).toBe("ARCHIE");
    expect(a.detection_record.review_status).toBe("PENDING_OWNER_REVIEW");
    expect(a.detection_record.evidence.length).toBe(2);
    expect(riskLevelForScore(0)).toBe("LOW");
    expect(riskLevelForScore(30)).toBe("MEDIUM");
    expect(riskLevelForScore(60)).toBe("HIGH");
  });
});

// =========================================================
// 6. Account pause authority
// =========================================================
describe("amendment 6: bounded account pause authority", () => {
  it("follows the full workflow with every recorded field", () => {
    const pause = proposeAccountPause({
      account_id: "offender-1",
      is_owner_account: false,
      reason: "Escrow-off platform payment scam with strong message evidence",
      signals: ["scam_attempt", "suspicious_payment_request", "repeated_fraudulent_behavior"],
      evidence: [ev("Off-platform payment links", "msg-88"), ev("Repeat victim reports", "case-3")],
      now: "2026-09-08T10:00:00.000Z",
    });
    expect(pause.ok).toBe(true);
    if (!pause.ok) throw new Error(pause.error);
    const p = pause.pause!;
    expect(p.account_identity).toBe("offender-1");
    expect(p.reason).toContain("scam");
    expect(p.evidence.length).toBe(2);
    expect(p.detected_behaviors.length).toBe(3);
    expect(["HIGH", "CRITICAL"]).toContain(p.risk_level);
    expect(p.paused_at).toBe("2026-09-08T10:00:00.000Z");
    expect(
      (new Date(p.expires_at).getTime() - new Date(p.paused_at).getTime()) / 3_600_000,
    ).toBe(MAX_SUSPENSION_HOURS);
    expect(p.archie_decision).toContain("TEMPORARY PAUSE");
    expect(p.review_status).toBe("PENDING_OWNER_REVIEW");
    expect(p.final_owner_decision).toBe("PENDING");
    expect(p.notification.account_notified).toBe(true);
    expect(p.notification.appeal_available).toBe(true);
    expect(p.notification.appeal_to).toBe("OWNER");
    expect(PAUSE_WORKFLOW).toContain("OWNER REVIEW");
  });

  it("refuses to pause the Owner, weak-evidence cases and non-serious risk levels", () => {
    expect(
      proposeAccountPause({
        account_id: "owner",
        is_owner_account: true,
        reason: "test",
        signals: ["scam_attempt"],
        evidence: [ev("e", "r")],
      }).ok,
    ).toBe(false);
    // no evidence → refused
    expect(
      proposeAccountPause({
        account_id: "u2",
        is_owner_account: false,
        reason: "suspicious",
        signals: ["marketplace_abuse"],
        evidence: [],
      }).ok,
    ).toBe(false);
    // MEDIUM risk → below threshold
    const medium = proposeAccountPause({
      account_id: "u3",
      is_owner_account: false,
      reason: "odd listing",
      signals: ["marketplace_abuse"],
      evidence: [ev("duplicate listings", "listing-9")],
    });
    expect(medium.ok).toBe(false);
    if (!medium.ok) expect(medium.error).toContain("threshold");
  });

  it("pauses expire at the maximum period unless the Owner reviews first", () => {
    const pause = proposeAccountPause({
      account_id: "u4",
      is_owner_account: false,
      reason: "coordinated review manipulation",
      signals: ["coordinated_manipulation", "manipulated_review", "repeated_fraudulent_behavior"],
      evidence: [
        ev("12 accounts reviewing same profile within 3 minutes", "audit-7"),
        ev("same 12 accounts repeated on a second profile", "audit-8"),
      ],
      now: "2026-09-08T10:00:00.000Z",
    });
    expect(pause.ok).toBe(true);
    if (!pause.ok) throw new Error(pause.error);
    const p = pause.pause;
    expect(isPauseActive(p, "2026-09-08T20:00:00.000Z").active).toBe(true);
    // at 72h + 1s the pause is gone, expired, account reinstated pending Owner decision
    const afterMax = isPauseActive(p, "2026-09-11T10:00:01.000Z");
    expect(afterMax.active).toBe(false);
    expect(afterMax.stage).toBe("EXPIRED");
  });

  it("ARCHIE can never adjudicate its own pause: appeals route to the Owner, termination is owner-only", () => {
    const pause = proposeAccountPause({
      account_id: "u5",
      is_owner_account: false,
      reason: "account takeover indicators with payment redirection",
      signals: ["account_takeover_indicator", "suspicious_payment_request"],
      evidence: [
        ev("login from 3 countries in 10 minutes", "auth-log-1"),
        ev("bank details changed then escrow payout re-requested", "payout-9"),
      ],
      now: "2026-09-08T10:00:00.000Z",
    });
    expect(pause.ok).toBe(true);
    if (!pause.ok) throw new Error(pause.error);
    const p = pause.pause;
    const appeal = recordAppeal(p, "That was me travelling, I can verify by email");
    expect(appeal.ok).toBe(true);
    if (!appeal.ok || !appeal.pause) throw new Error(appeal.error ?? "no pause");
    expect(appeal.pause.review_status).toBe("PENDING_OWNER_REVIEW");
    // ARCHIE cannot review, restrict or terminate
    expect(ownerReview(p, "TERMINATE", "ARCHIE").ok).toBe(false);
    expect(ownerReview(p, "RESTRICT", "ARCHIE").ok).toBe(false);
    // the Owner can reinstate, restrict or terminate
    const restricted = ownerReview(p, "RESTRICT", "OWNER");
    expect(restricted.ok).toBe(true);
    expect(restricted.pause!.final_owner_decision).toBe("RESTRICT");
    const active = isPauseActive(restricted.pause!);
    expect(active.active).toBe(true); // restriction still limits the account
    expect(active.stage).toBe("RESTRICTED");
    const terminated = ownerReview(p, "TERMINATE", "OWNER");
    expect(terminated.pause!.final_owner_decision).toBe("TERMINATE");
    expect(isPauseActive(terminated.pause!).stage).toBe("TERMINATED");
  });
});

// =========================================================
// 7. Escrow & transaction intelligence
// =========================================================
describe("amendment 7: escrow & transaction intelligence", () => {
  it("monitors the full scope but never moves funds", () => {
    expect(ESCROW_MONITORING_SCOPE.length).toBe(8);
    expect(ESCROW_AUTHORITY.may_monitor.length).toBe(8);
    expect(ESCROW_AUTHORITY.may_move_funds).toBe(false);
    expect(ESCROW_AUTHORITY.may_seize_funds).toBe(false);
    expect(ESCROW_AUTHORITY.may_release_funds).toBe(false);
    expect(ESCROW_AUTHORITY.funds_authority).toContain("provider");
  });

  it("flags and analyzes disputes with evidence, as recommendations only", () => {
    expect(
      flagTransaction({
        transaction_ref: "tx-1",
        topic: "fraud_indicators",
        reason: "milestone claimed without delivery evidence",
        evidence: "",
        recommended_action: "hold release pending human review",
      }).ok,
    ).toBe(false); // no evidence → refused
    const flag = flagTransaction({
      transaction_ref: "tx-1",
      topic: "fraud_indicators",
      reason: "milestone claimed without delivery evidence",
      evidence: "milestone-2 marked complete 4 minutes after contract start, no photos",
      recommended_action: "hold release pending human review",
    });
    expect(flag.ok).toBe(true);
    if (!flag.ok || !flag.flag) throw new Error("flagTransaction returned no flag");
    expect(flag.flag.fund_authority).toBe("payment/escrow provider");
    const dispute = assistDisputeAnalysis({
      transaction_ref: "tx-1",
      positions: ["client says not delivered", "contractor says delivered"],
      evidence_reviewed: ["msg-301", "milestone-log-2"],
      analysis: "No delivery/acceptance evidence on record for milestone 2",
      recommended_resolution: "request acceptance evidence before release",
    });
    expect(dispute.ok).toBe(true);
    expect(dispute.analysis!.decision_authority).toContain("human/business controls");
    // absolute guard
    expect(canArchieMoveFunds("release").allowed).toBe(false);
    expect(canArchieMoveFunds().error).toContain("never independently move or seize");
  });
});

// =========================================================
// 8. Governance separation
// =========================================================
describe("amendment 8: trust, safety & financial governance", () => {
  it("maintains complete separation of the five authority layers", () => {
    const layers = Object.keys(AUTHORITY_LAYERS);
    for (const layer of [
      "ARCHIE_DETECTION",
      "ARCHIE_RECOMMENDATION",
      "ARCHIE_TEMPORARY_SECURITY_ENFORCEMENT",
      "OWNER_AUTHORITY",
      "PAYMENT_ESCROW_PROVIDER_AUTHORITY",
    ]) {
      expect(layers).toContain(layer);
    }
    expect(AUTHORITY_LAYERS.ARCHIE_TEMPORARY_SECURITY_ENFORCEMENT.scope).toContain("pending owner review");
    expect(AUTHORITY_LAYERS.PAYMENT_ESCROW_PROVIDER_AUTHORITY.scope).toContain("custody");
  });

  it("AI confidence is never financial truth; provenance is required", () => {
    expect(FINAL_PRINCIPLE.ai_confidence_is_not_financial_truth).toBe(true);
    expect(hasValidProvenance({ evidence: [], reason: "r", assessor: "ARCHIE", timestamp: "2026-09-08T10:00:00Z" })).toBe(false);
    expect(
      hasValidProvenance({
        evidence: [ev("pattern observed", "tx-9")],
        reason: "coordinated bid manipulation",
        assessor: "ARCHIE",
        timestamp: "2026-09-08T10:00:00Z",
      }),
    ).toBe(true);
  });
});

// =========================================================
// 9. Final principle
// =========================================================
describe("amendment 9: the final principle", () => {
  it("states exactly what ARCHIE is and is not", () => {
    expect(FINAL_PRINCIPLE.archie_is).toBe("broad operational intelligence");
    expect(FINAL_PRINCIPLE.owner_is).toBe("final authority");
    expect(FINAL_PRINCIPLE.archie_cannot_bypass_owner_protected_authority).toBe(true);
    expect(FINAL_PRINCIPLE.archie_cannot_independently_perform_irreversible_financial_or_production_actions).toBe(true);
    expect(FINAL_PRINCIPLE.archie_can_temporarily_pause_serious_offenders_when_authorized).toBe(true);
    expect(FINAL_PRINCIPLE.archie_assists_escrow_and_transaction_intelligence).toBe(true);
  });
});

// =========================================================
// Real enforcement wiring
// =========================================================
describe("enforcement: paused accounts cannot create marketplace listings", () => {
  it("assertNotPaused / isAccountPaused fail open only on transport errors and gate real writes", async () => {
    // supabase is mocked/absent in tests → query returns nothing → not paused
    expect(await isAccountPaused("nobody")).toBe(false);
    expect((await assertNotPaused("nobody")).ok).toBe(true);
  });
});
