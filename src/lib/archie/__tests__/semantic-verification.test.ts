import { describe, expect, it } from "vitest";
// =========================================================
// SEMANTIC VERIFICATION TEST (audit Phase 3.3, 2026-09-11)
//
// The pre-existing checks were STRUCTURAL: cited fact IDs
// exist, uncertain facts are not asserted as established. A
// response could cite a validated fact and then MISSTATE it
// in prose — no check would catch it. verifySemanticClaims is
// the real semantic check: restated claims must AGREE with
// the cited validated facts. High-precision by design: it
// only flags a restatement that contradicts a cited fact.
// =========================================================

import { SelfEvaluator } from "@studio-shared/archie-ai/native-engine/selfeval.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";

async function fact(
  subject: string,
  object: string,
  opts: { predicate?: string; status?: Fact["status"] } = {},
): Promise<Fact> {
  const store = new FactStore();
  const { fact: f } = await store.assert({
    subject,
    predicate: opts.predicate ?? "property",
    object,
    confidence: 0.9,
    provenance: { source: "seed" },
    status: opts.status ?? "validated",
  });
  return f;
}

const ev = new SelfEvaluator();

describe("verifySemanticClaims — real semantic verification", () => {
  it("passes when the response restates a validated numeric claim correctly", async () => {
    const f = await fact("screed thickness", "25 mm");
    const check = ev.verifySemanticClaims(
      [f],
      "The screed thickness for this floor is 25 mm per the validated standard.",
    );
    expect(check.passed).toBe(true);
    expect(check.detail).toContain("agree");
  });

  it("FAILS when the response misstates the cited fact's number", async () => {
    const f = await fact("screed thickness", "25 mm");
    const check = ev.verifySemanticClaims(
      [f],
      "The screed thickness for this floor is 50 mm.",
    );
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("50 mm");
    expect(check.detail).toContain("25 mm");
  });

  it("tolerances small restatement rounding within 5%", async () => {
    const f = await fact("cement bag volume", "0.035 m3");
    const check = ev.verifySemanticClaims(
      [f],
      "A standard cement bag holds roughly 0.036 m3.",
    );
    expect(check.passed).toBe(true);
  });

  it("does not flag a different unit or a different subject (no false positives)", async () => {
    const f = await fact("screed thickness", "25 mm");
    // different subject entirely, same number — fine
    let check = ev.verifySemanticClaims(
      [f],
      "The wall thickness is 50 mm elsewhere.",
    );
    expect(check.passed).toBe(true);
    // same subject, different unit — not the same claim kind
    check = ev.verifySemanticClaims(
      [f],
      "The screed area is 12 m2 in that room.",
    );
    expect(check.passed).toBe(true);
  });

  it("FAILS when the response negates a cited validated textual fact", async () => {
    const f = await fact("block face area", "0.1081 square metres");
    const check = ev.verifySemanticClaims(
      [f],
      "The block face area is not 0.1081 square metres as previously thought.",
    );
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("negates");
  });

  it("passes when the response cites facts without restating them", async () => {
    const f = await fact("paint coverage", "10 m2 per litre");
    const check = ev.verifySemanticClaims(
      [f],
      "Based on stored knowledge I can compute the paint you need.",
    );
    expect(check.passed).toBe(true);
  });

  it("ignores unvalidated (candidate/uncertain) facts — they are not established", async () => {
    const f = await fact("screed thickness", "25 mm", {
      status: "candidate",
    });
    const check = ev.verifySemanticClaims(
      [f],
      "The screed thickness might be 50 mm.",
    );
    expect(check.passed).toBe(true);
  });
});
