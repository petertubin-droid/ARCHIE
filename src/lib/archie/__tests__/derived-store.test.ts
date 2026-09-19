import { describe, expect, it } from "vitest";
// =========================================================
// P8 — DERIVED-VS-TAUGHT KNOWLEDGE SEPARATION
// The forward chainer's output is DERIVED knowledge:
//   * it never auto-validates into the trusted KB, no matter
//     how high the propagated confidence (the old >= 0.6
//     shortcut is gone)
//   * it survives re-derivation idempotently (reinforced,
//     never duplicated, never promoted by repetition)
//   * a contradiction with owner-taught knowledge parks the
//     DERIVED fact — the owner's word outranks a rule chain,
//     in both assertion orders
//   * answers citing derived facts carry the explicit
//     "DERIVED — not owner-validated" epistemic label
//   * promotion out of "derived" only happens through the
//     real verification-event gates (P3)
// =========================================================

import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  DEFAULT_RULES,
  ReasoningEngine,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import { CONSTRUCTION_RULES } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import {
  composerSelfCheck,
  includesDerived,
} from "@studio-shared/archie-ai/native-engine/composer.ts";

/** bag-mass premise + the construction bag-volume rule (the
 *  engine composes DEFAULT_RULES + domain skill rules; these
 *  tests compose them the same way — audit fix 2026-09-11). */
async function seededStore() {
  const store = new FactStore();
  await store.assert({
    subject: "cement",
    predicate: "bag-mass",
    object: "50 kg",
    confidence: 0.95,
    provenance: { source: "seed" },
    status: "validated",
  });
  return store;
}

describe("P8 derived-vs-taught separation", () => {
  it("derived facts are stored as derived — never auto-validated, even at high confidence", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    await reasoning.forwardChain();
    const derived = store.query({ subject: "cement", predicate: "bag-volume" });
    expect(derived.length).toBe(1);
    // propagated confidence is 0.9025 — the OLD code auto-validated at >= 0.6
    expect(derived[0].confidence).toBeCloseTo(0.9025, 3);
    expect(derived[0].status).toBe("derived");
    expect(derived[0].provenance.source).toBe("inferred");
    // the validated KB did not grow: only the seed premise
    expect(store.validatedCount()).toBe(1);
  });

  it("re-derivation is idempotent: reinforced, never duplicated, never promoted by repetition", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    await reasoning.forwardChain();
    const first = store.query({
      subject: "cement",
      predicate: "bag-volume",
    })[0];
    const countAfterFirst = store.count();

    const second = await reasoning.forwardChain();
    const again = store.query({ subject: "cement", predicate: "bag-volume" });
    expect(again.length).toBe(1);
    expect(again[0].id).toBe(first.id);
    expect(again[0].status).toBe("derived");
    expect(second.reinforced).toContain(first.id);
    expect(store.count()).toBe(countAfterFirst);
    // repetition of the SAME source never establishes knowledge
    expect(store.validatedCount()).toBe(1);
  });

  it("owner contradiction parks the DERIVED fact — owner wins (derive first)", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    await reasoning.forwardChain();
    const derived = store.query({
      subject: "cement",
      predicate: "bag-volume",
    })[0];

    // owner teaches a conflicting bag volume AFTER the derivation
    await store.assert({
      subject: "cement",
      predicate: "bag-volume",
      object: "0.04 m³ (custom bag)",
      confidence: 0.99,
      provenance: { source: "owner-taught" },
      status: "validated",
    });

    const parked = store.get(derived.id)!;
    expect(parked.status).toBe("uncertain");
    const ownersFact = store
      .query({ subject: "cement", predicate: "bag-volume" })
      .find((f) => f.provenance.source === "owner-taught");
    expect(ownersFact?.object).toBe("0.04 m³ (custom bag)");
    // the owner's fact is stored live — knowledge did not flip
    expect(ownersFact?.status).not.toBe("uncertain");
  });

  it("derivation contradicting owner-taught knowledge is parked before it is ever live", async () => {
    const store = await seededStore();
    // owner fact FIRST
    await store.assert({
      subject: "cement",
      predicate: "bag-volume",
      object: "0.04 m³ (custom bag)",
      confidence: 0.99,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    await reasoning.forwardChain();
    // the rule derived the standard 0.035 m³ — contradicts the owner
    const ruleDerived = store
      .query({ subject: "cement", predicate: "bag-volume" })
      .find((f) => f.provenance.source === "inferred");
    expect(ruleDerived?.status).toBe("uncertain");
    const ownersFact = store
      .query({ subject: "cement", predicate: "bag-volume" })
      .find((f) => f.provenance.source === "owner-taught");
    expect(ownersFact?.status).toBe("validated");
  });

  it("answers citing derived facts carry the explicit derived epistemic label", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    await engine.store().assert({
      subject: "kraken",
      predicate: "hull-span",
      object: "400mm",
      confidence: 0.8,
      provenance: {
        source: "inferred",
        derivation: { ruleId: "rule_test_kraken", premiseIds: [] },
        note: "test derivation",
      },
      status: "derived",
    });
    const res = await engine.converse("what is the kraken hull span");
    // explicit per-fact label — never presented as owner-validated
    // OWNER DIRECTIVE (2026-09-16): no em dashes in ARCHIE's
    // voice — the label survives, comma-joined.
    expect(res.responseText).toMatch(
      /DERIVED, inferred by rule chain, not owner-validated/,
    );
    // the opening names derived knowledge, not "validated knowledge"
    expect(res.responseText).toMatch(/derived/i);
    expect(res.responseText).not.toMatch(/validated knowledge/i);
  });

  it("promotion out of derived requires REAL verification events (P3 gates)", async () => {
    const store = await seededStore();
    const reasoning = new ReasoningEngine(store, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    await reasoning.forwardChain();
    const derived = store.query({
      subject: "cement",
      predicate: "bag-volume",
    })[0];

    // owner teaches the SAME conclusion — corroborating evidence
    await store.assert({
      subject: "cement",
      predicate: "bag-volume",
      object: derived.object,
      confidence: 0.99,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    // one corroboration is not enough — gate needs validatedCount >= 2
    expect(store.get(derived.id)!.status).toBe("derived");
    expect(store.get(derived.id)!.verifiedBy).toContain("owner-taught");

    await store.assert({
      subject: "cement",
      predicate: "bag-volume",
      object: derived.object,
      confidence: 0.99,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
    // now the gate is satisfied: a real verification event exists
    expect(store.get(derived.id)!.status).toBe("validated");
  });

  it("composer helpers keep the derived epistemic markers (self-check)", () => {
    expect(composerSelfCheck().ok).toBe(true);
    expect(
      includesDerived([{ status: "derived" }, { status: "validated" }]),
    ).toBe(true);
    expect(includesDerived([{ status: "validated" }])).toBe(false);
  });
});
