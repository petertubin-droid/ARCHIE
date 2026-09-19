// =========================================================
// KNOWLEDGE-VALIDATION TESTS (batch 28, fix 124)
// §11 contract: UNVERIFIED is never silently fact; ARCHIE
// cannot verify its own knowledge; INFERRED always states a
// basis; CONFIGURED/OWNER_PROVIDED are terminal; confidence
// decays and stale knowledge surfaces for revalidation.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  canTransition,
  decayedConfidence,
  isFact,
  labelStatement,
  needsRevalidation,
  rankForRetrieval,
  registerKnowledge,
  type ValidatedKnowledge,
} from "@/lib/archie/knowledge-validation";

function k(
  over: Partial<ValidatedKnowledge> & {
    humanVerified?: boolean;
    previousVersion?: number;
  } = {},
): ValidatedKnowledge {
  return {
    key: "k1",
    domain: "construction",
    statement: "Cement price observed at ₦9,500",
    validation_state: "UNVERIFIED",
    confidence: 0.8,
    learned_at: "2026-09-15T00:00:00Z",
    source: "market survey",
    version: 1,
    ...over,
  };
}

describe("the state machine", () => {
  it("passes UNVERIFIED→VERIFIED only through human verification; terminal states are immutable", () => {
    expect(canTransition("UNVERIFIED", "VERIFIED")).toBe(true);
    expect(canTransition("UNVERIFIED", "INFERRED")).toBe(true);
    expect(canTransition("INFERRED", "VERIFIED")).toBe(true);
    expect(canTransition("CONFIGURED", "UNVERIFIED")).toBe(false);
    expect(canTransition("OWNER_PROVIDED", "INFERRED")).toBe(false);
    expect(canTransition("VERIFIED", "UNVERIFIED")).toBe(true); // re-opened by contradicting evidence
  });

  it("counts only VERIFIED/OWNER_PROVIDED/CONFIGURED as fact", () => {
    expect(isFact("VERIFIED")).toBe(true);
    expect(isFact("OWNER_PROVIDED")).toBe(true);
    expect(isFact("CONFIGURED")).toBe(true);
    expect(isFact("INFERRED")).toBe(false);
    expect(isFact("UNVERIFIED")).toBe(false);
  });
});

describe("registerKnowledge — ARCHIE cannot verify its own knowledge", () => {
  it("refuses VERIFIED without the human-verification step and evidence", () => {
    expect(
      registerKnowledge(k({ validation_state: "VERIFIED" })),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/cannot verify its own knowledge/i),
    });
    expect(
      registerKnowledge(
        k({ validation_state: "VERIFIED", humanVerified: true }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/verification evidence/i),
    });
  });

  it("mints VERIFIED only with human verification AND evidence, versioning upward", () => {
    const r = registerKnowledge(
      k({
        validation_state: "VERIFIED",
        humanVerified: true,
        verification_evidence: "doc 4.2",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.knowledge.version).toBe(1);
    const r2 = registerKnowledge(
      k({
        validation_state: "VERIFIED",
        humanVerified: true,
        verification_evidence: "doc 4.2",
        previousVersion: 3,
      }),
    );
    expect(r2.ok && r2.knowledge.version).toBe(4);
  });

  it("requires a basis for INFERRED and the Owner as source for OWNER_PROVIDED", () => {
    expect(
      registerKnowledge(k({ validation_state: "INFERRED" })),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/inference basis/i),
    });
    expect(
      registerKnowledge(
        k({ validation_state: "INFERRED", inference_basis: "3 surveys agree" }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      registerKnowledge(
        k({ validation_state: "OWNER_PROVIDED", source: "ARCHIE" }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Owner as source/i),
    });
  });

  it("bounds confidence to 0..1", () => {
    expect(registerKnowledge(k({ confidence: 1.2 })).ok).toBe(false);
  });
});

describe("confidence decay", () => {
  it("decays with a 365-day half-life", () => {
    const now = new Date("2027-09-15T00:00:00Z"); // 365 days later
    const c = decayedConfidence(k({ confidence: 0.8 }), now);
    expect(c).toBeCloseTo(0.4, 2);
    expect(
      decayedConfidence(
        k({ confidence: 0.8 }),
        new Date("2026-09-15T00:00:00Z"),
      ),
    ).toBeCloseTo(0.8, 5);
  });

  it("flags stale knowledge for revalidation below the state bar", () => {
    const stale = needsRevalidation(
      k({ confidence: 0.7, learned_at: "2024-01-01T00:00:00Z" }),
      new Date("2026-09-15T00:00:00Z"),
    );
    expect(stale).toBe(true);
    const fresh = needsRevalidation(k(), new Date("2026-09-16T00:00:00Z"));
    expect(fresh).toBe(false);
  });
});

describe("retrieval and labeling", () => {
  it("ranks by decayed confidence", () => {
    const items = [
      k({ key: "old", learned_at: "2020-01-01T00:00:00Z", confidence: 0.9 }),
      k({ key: "new", confidence: 0.5 }),
    ];
    expect(
      rankForRetrieval(items, new Date("2026-09-15T00:00:00Z"))[0].key,
    ).toBe("new");
  });

  it("labels UNVERIFIED/INFERRED statements and flags aging facts — nothing unverified presented as fact", () => {
    expect(labelStatement(k())).toMatch(/^\[UNVERIFIED · confidence/);
    expect(
      labelStatement(k({ validation_state: "INFERRED", inference_basis: "b" })),
    ).toMatch(/^\[INFERRED/);
    const aging = labelStatement(
      k({
        validation_state: "CONFIGURED",
        confidence: 0.9,
        learned_at: "2018-01-01T00:00:00Z",
      }),
      new Date("2026-09-15T00:00:00Z"),
    );
    expect(aging).toMatch(/\[CONFIGURED · aging, revalidate\]/);
    expect(
      labelStatement(
        k({ validation_state: "OWNER_PROVIDED", source: "OWNER" }),
      ),
    ).not.toMatch(/^\[/);
  });
});
