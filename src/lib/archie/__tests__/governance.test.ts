// =========================================================
// GOVERNANCE TESTS (batch 28, fix 125)
// The evidence state machine: ACTUAL_OUTCOME is terminal,
// nothing is born verified, ARCHIE can never approve its own
// learning, and the deterministic surface (formulas, unit
// conversions, safety thresholds) is never modifiable —
// only observable.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ARCHIE_NEVER_MODIFIES,
  canEvidenceConvert,
  canRecordCandidate,
  checkArchiePromotion,
  convertEvidenceState,
  DETERMINISM_SAFE_TYPES,
  VERIFIED_STATES,
} from "@/lib/archie/governance";
import type { ArchieCandidate } from "@/lib/archie/types";

function candidate(over: Partial<ArchieCandidate> = {}): ArchieCandidate {
  return {
    topic: "roof pitch practice",
    content: { note: "observed" },
    domain: "construction",
    knowledge_type: "REGIONAL_PRACTICE",
    evidence_state: "AI_EXTRACTED",
    confidence: 0.7,
    evidence: ["user conversation"],
    cited_sources: ["user"],
    assumptions: [],
    proposed_scope: "REGIONAL" as never,
    requires_engineering_review: false,
    ...over,
  } as ArchieCandidate;
}

describe("the evidence state machine", () => {
  it("verifies truth only as SYSTEM_VERIFIED/EXTERNAL_SOURCE_VERIFIED/ACTUAL_OUTCOME", () => {
    expect([...VERIFIED_STATES]).toEqual([
      "SYSTEM_VERIFIED",
      "EXTERNAL_SOURCE_VERIFIED",
      "ACTUAL_OUTCOME",
    ]);
  });

  it("allows step-by-step promotion and transitive reach, never shortcuts", () => {
    expect(canEvidenceConvert("AI_EXTRACTED", "USER_CONFIRMED")).toBe(true);
    expect(canEvidenceConvert("AI_EXTRACTED", "SYSTEM_VERIFIED")).toBe(true); // over time, via USER_CONFIRMED
    expect(canEvidenceConvert("ESTIMATED", "SYSTEM_VERIFIED")).toBe(true);
    expect(canEvidenceConvert("ACTUAL_OUTCOME", "USER_CONFIRMED")).toBe(false); // terminal
    expect(
      canEvidenceConvert("SYSTEM_VERIFIED", "EXTERNAL_SOURCE_VERIFIED"),
    ).toBe(false);
  });

  it("requires a human approver + verification evidence for verified states, step-by-step", () => {
    // Direct AI_EXTRACTED → SYSTEM_VERIFIED is refused even with human+evidence: pipeline steps first.
    expect(
      convertEvidenceState("AI_EXTRACTED", "SYSTEM_VERIFIED", {
        approverIsHuman: true,
        hasVerificationEvidence: true,
      }),
    ).toMatchObject({ ok: false });
    // The legal single step demands a human…
    expect(
      convertEvidenceState("AI_EXTRACTED", "USER_CONFIRMED", {
        approverIsHuman: false,
        hasVerificationEvidence: false,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/human approver/i),
    });
    // …and verified promotion also demands evidence.
    expect(
      convertEvidenceState("USER_CONFIRMED", "SYSTEM_VERIFIED", {
        approverIsHuman: true,
        hasVerificationEvidence: false,
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Verification evidence/i),
    });
    expect(
      convertEvidenceState("USER_CONFIRMED", "SYSTEM_VERIFIED", {
        approverIsHuman: true,
        hasVerificationEvidence: true,
      }),
    ).toEqual({ ok: true });
    // ACTUAL_OUTCOME never moves.
    expect(
      convertEvidenceState("ACTUAL_OUTCOME", "ACTUAL_OUTCOME", {
        approverIsHuman: false,
        hasVerificationEvidence: false,
      }),
    ).toEqual({ ok: true }); // no-op only
  });
});

describe("the deterministic surface", () => {
  it("lists what ARCHIE must never modify", () => {
    for (const item of [
      "formulas",
      "unit conversions",
      "safety thresholds",
      "deterministic quantity engines",
    ]) {
      expect(ARCHIE_NEVER_MODIFIES).toContain(item);
    }
  });

  it("allows only observation-safe knowledge types to touch it", () => {
    expect(DETERMINISM_SAFE_TYPES.has("FACT")).toBe(true);
    expect(DETERMINISM_SAFE_TYPES.has("REGIONAL_PRACTICE")).toBe(true);
    expect(DETERMINISM_SAFE_TYPES.has("FORMULA_OVERRIDE" as never)).toBe(false);
  });
});

describe("candidate gates", () => {
  it("refuses blank topics, bad confidence, and candidates born verified", () => {
    expect(canRecordCandidate(candidate({ topic: " " })).ok).toBe(false);
    expect(canRecordCandidate(candidate({ confidence: 1.5 })).ok).toBe(false);
    expect(
      canRecordCandidate(candidate({ evidence_state: "SYSTEM_VERIFIED" })).ok,
    ).toBe(false);
    expect(
      canRecordCandidate(candidate({ evidence_state: "ACTUAL_OUTCOME" })).ok,
    ).toBe(false);
    expect(canRecordCandidate(candidate()).ok).toBe(true);
  });

  it("promotion needs a HUMAN ARCHIE_ADMIN, engineering review for high-risk knowledge", () => {
    expect(
      checkArchiePromotion({
        candidate: candidate(),
        actorRole: "ARCHIE_ADMIN",
        actorIsHuman: false,
      }).ok,
    ).toBe(false);
    expect(
      checkArchiePromotion({
        candidate: candidate(),
        actorRole: "DOMAIN_CONTRIBUTOR",
        actorIsHuman: true,
      }).ok,
    ).toBe(false);
    const highRisk = candidate({ requires_engineering_review: true });
    expect(
      checkArchiePromotion({
        candidate: highRisk,
        actorRole: "ARCHIE_ADMIN",
        actorIsHuman: true,
      }).ok,
    ).toBe(false);
    expect(
      checkArchiePromotion({
        candidate: highRisk,
        actorRole: "ARCHIE_ADMIN",
        actorIsHuman: true,
        hasEngineeringReview: true,
      }),
    ).toEqual({ ok: true });
  });
});
