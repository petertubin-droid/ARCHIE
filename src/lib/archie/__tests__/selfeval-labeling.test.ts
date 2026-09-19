// Batch 14 (Level 10) — fix 47: the response-integrity gate
// enforces the epistemic-labeling contract observably.
import { describe, expect, it } from "vitest";
import { SelfEvaluator } from "@studio-shared/archie-ai/native-engine/selfeval.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";

async function storeWith(
  status: Fact["status"],
): Promise<{ store: FactStore; id: string }> {
  const store = new FactStore();
  const { fact } = await store.assert({
    subject: "screed thickness",
    predicate: "is",
    object: "25 mm minimum for heavy traffic",
    confidence: 0.9,
    provenance: { source: "seed", note: "fixture" },
    status,
  });
  return { store, id: fact.id };
}

describe("batch 14 — fix 47: epistemic labeling gate", () => {
  it("an unlabeled reply citing an uncertain fact fails the response-integrity check", async () => {
    const { store, id } = await storeWith("uncertain");
    const ev = new SelfEvaluator();
    const check = ev.verifyResponse(
      [id],
      store,
      false,
      "The screed thickness is 25 mm minimum for heavy traffic.",
    );
    expect(check.passed).toBe(false);
    expect(check.detail).toContain("established fact");
  });

  it("a labeled reply citing a candidate fact passes", async () => {
    const { store, id } = await storeWith("candidate");
    const ev = new SelfEvaluator();
    const check = ev.verifyResponse(
      [id],
      store,
      false,
      "Screed thickness — 25 mm minimum for heavy traffic [candidate knowledge, cross-checked but unverified].",
    );
    expect(check.passed).toBe(true);
  });

  it("an unlabeled reply citing a candidate fact fails", async () => {
    const { store, id } = await storeWith("candidate");
    const ev = new SelfEvaluator();
    const check = ev.verifyResponse(
      [id],
      store,
      false,
      "Screed thickness: 25 mm minimum for heavy traffic.",
    );
    expect(check.passed).toBe(false);
  });

  it("validated facts need no label — legacy passing behavior intact", async () => {
    const { store, id } = await storeWith("validated");
    const ev = new SelfEvaluator();
    const check = ev.verifyResponse(
      [id],
      store,
      false,
      "Screed thickness: 25 mm minimum for heavy traffic.",
    );
    expect(check.passed).toBe(true);
  });

  it("the explicit assertedAsEstablished flag still flags below-validated facts without text", async () => {
    const { store, id } = await storeWith("candidate");
    const ev = new SelfEvaluator();
    // The flag previously caught ONLY "uncertain" — candidates
    // slipped it even under explicit assertion.
    const check = ev.verifyResponse([id], store, true);
    expect(check.passed).toBe(false);
  });
});
