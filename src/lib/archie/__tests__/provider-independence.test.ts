// =========================================================
// PROVIDER-INDEPENDENCE TESTS (batch 25, fix 102)
// Gemini and OpenAI are FRELUX-only external fallbacks; the
// protected subsystems stay provider-free; integrity checks
// verify the rules stay encoded and permanent.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  OPENAI_SEPARATION,
  PROVIDER_INDEPENDENCE,
  PROVIDER_INDEPENDENCE_PRINCIPLE_ID,
  verifyOpenAiSeparationIntegrity,
  verifyProviderIndependenceIntegrity,
} from "@/lib/archie/provider-independence";

describe("the Gemini separation rule", () => {
  it("keeps Gemini out of ARCHIE's core and inside FRELUX only", () => {
    expect(PROVIDER_INDEPENDENCE_PRINCIPLE_ID).toBe("provider_independence");
    expect(PROVIDER_INDEPENDENCE.rule).toMatch(/Gemini must NOT be part/i);
    expect(PROVIDER_INDEPENDENCE.geminiScope).toMatch(
      /ONLY to the FRELUX application/i,
    );
    expect(PROVIDER_INDEPENDENCE.governing).toBe("Owner Authority Layer");
    expect(PROVIDER_INDEPENDENCE.permanence).toMatch(
      /Never implemented as a temporary instruction/i,
    );
  });

  it("never auto-delegates normal work and treats external answers as external", () => {
    expect(
      PROVIDER_INDEPENDENCE.prohibitions.some((p) =>
        /never automatically delegate normal work/i.test(p),
      ),
    ).toBe(true);
    expect(
      PROVIDER_INDEPENDENCE.prohibitions.some((p) =>
        /external assistance requiring ARCHIE's own analysis/i.test(p),
      ),
    ).toBe(true);
  });

  it("keeps the studio workflow provider-agnostic (8 steps, zero providers)", () => {
    expect(PROVIDER_INDEPENDENCE.studioWorkflow).toHaveLength(8);
    expect(
      PROVIDER_INDEPENDENCE.studioWorkflow.some((s) =>
        /gemini|openai|claude|provider/i.test(s),
      ),
    ).toBe(false);
  });

  it("protects the six core subsystems and the neutral engine contract", () => {
    expect(PROVIDER_INDEPENDENCE.protectedSubsystems).toContain("ARCHIE Core");
    expect(PROVIDER_INDEPENDENCE.protectedSubsystems).toContain(
      "ARCHIE Memory",
    );
    expect(PROVIDER_INDEPENDENCE.protectedSubsystems).toHaveLength(6);
    expect(PROVIDER_INDEPENDENCE.engineContract).toMatch(
      /never a silent provider substitution/i,
    );
  });
});

describe("the OpenAI separation rule", () => {
  it("keeps OpenAI FRELUX-only with native voice independence", () => {
    expect(OPENAI_SEPARATION.rule).toMatch(/OpenAI must NOT be part/i);
    expect(OPENAI_SEPARATION.openaiScope).toMatch(
      /ONLY to the FRELUX application/i,
    );
  });
});

describe("integrity verifiers", () => {
  it("confirm both rules stay encoded and intact", () => {
    const pi = verifyProviderIndependenceIntegrity();
    expect(pi.encoded).toBe(true);
    expect(pi.studioWorkflowIndependent).toBe(true);
    expect(pi.geminiFreluxOnly).toBe(true);
    expect(pi.protectedSubsystems.length).toBeGreaterThanOrEqual(6);

    const oi = verifyOpenAiSeparationIntegrity();
    expect(oi.encoded).toBe(true);
    expect(oi.voiceBankNative).toBe(true);
    expect(oi.openaiFreluxOnly).toBe(true);
  });
});
