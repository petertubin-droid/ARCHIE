import { describe, expect, it } from "vitest";
// =========================================================
// FORENSIC PASS §4 — NATIVE REASONING MECHANISM BREADTH
// Verifies the implemented reasoning mechanisms actually
// work as claimed — especially that GENERAL (variable) rules
// generalize across multiple entities rather than only a
// hardcoded example, that confidence propagates honestly,
// and that the chainer terminates on cycles.
// =========================================================

import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  GENERAL_RULES,
  ReasoningEngine,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import type { Rule } from "@studio-shared/archie-ai/native-engine/types.ts";

async function seedPair(
  store: FactStore,
  subject: string,
  predicate: string,
  object: string,
  confidence = 0.9,
) {
  await store.assert({
    subject,
    predicate,
    object,
    confidence,
    provenance: { source: "seed" },
    status: "validated",
  });
}

describe("variable rules generalize (not literal one-offs)", () => {
  it("is-a → kind-of fires for MULTIPLE entities, not just one", async () => {
    const store = new FactStore();
    for (const [thing, cls] of [
      ["granite", "stone"],
      ["pine", "wood"],
      ["steel", "metal"],
    ]) {
      await seedPair(store, thing, "is-a", cls);
    }
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    expect(store.query({ subject: "granite", predicate: "kind-of" })[0]?.object).toBe("stone");
    expect(store.query({ subject: "pine", predicate: "kind-of" })[0]?.object).toBe("wood");
    expect(store.query({ subject: "steel", predicate: "kind-of" })[0]?.object).toBe("metal");
  });

  it("part-of transitivity composes across a two-hop chain", async () => {
    const store = new FactStore();
    await seedPair(store, "roof-tile", "part-of", "roof");
    await seedPair(store, "roof", "part-of", "building");
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    const derived = store.query({ subject: "roof-tile", predicate: "part-of" });
    expect(derived.map((f) => f.object)).toContain("building");
  });

  it("causal transitivity composes: a causes b, b causes c ⇒ a causes c", async () => {
    const store = new FactStore();
    await seedPair(store, "rain", "causes", "flooding");
    await seedPair(store, "flooding", "causes", "foundation-damage");
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    expect(
      store.query({ subject: "rain", predicate: "causes" }).map((f) => f.object),
    ).toContain("foundation-damage");
  });

  it("contradiction scan flags 'x is and is-not y'", async () => {
    const store = new FactStore();
    await seedPair(store, "curing", "is", "optional");
    await seedPair(store, "curing", "verified-not", "optional");
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    const flagged = store.query({ subject: "curing", predicate: "contradiction-detected" });
    expect(flagged.length).toBeGreaterThan(0);
    // the contradiction flag is derived knowledge, never validated
    expect(flagged[0].status).toBe("derived");
  });
});

describe("confidence propagation and bounds", () => {
  it("derived confidence = min(premise) × rule weight on variable rules", async () => {
    const store = new FactStore();
    await seedPair(store, "marble", "is-a", "stone", 0.8);
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    const kindOf = store.query({ subject: "marble", predicate: "kind-of" })[0];
    // rule_general_class_inheritance weight = 0.95
    expect(kindOf.confidence).toBeCloseTo(0.8 * 0.95, 3);
  });

  it("weakest premise governs a multi-premise rule", async () => {
    const store = new FactStore();
    await seedPair(store, "bolt", "part-of", "joint", 0.95);
    await seedPair(store, "joint", "part-of", "frame", 0.5);
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    await reasoning.forwardChain();
    const derived = store
      .query({ subject: "bolt", predicate: "part-of" })
      .find((f) => f.object === "frame");
    // transitivity weight 0.9 × weakest premise 0.5
    expect(derived?.confidence).toBeCloseTo(0.45, 3);
  });

  it("forwardChain respects maxIterations = 0 (no derivation)", async () => {
    const store = new FactStore();
    await seedPair(store, "granite", "is-a", "stone");
    const reasoning = new ReasoningEngine(store, GENERAL_RULES);
    const result = await reasoning.forwardChain(0);
    expect(store.query({ subject: "granite", predicate: "kind-of" }).length).toBe(0);
    expect(result.iterations).toBe(0);
  });

  it("cyclic rules terminate at the iteration bound without duplicates", async () => {
    const cyclic: Rule[] = [
      {
        id: "rule_cycle_a",
        conditions: [{ subject: "?x", predicate: "leads-to", object: "?y" }],
        produces: { subject: "?y", predicate: "leads-to", object: "?x" },
        weight: 0.5,
        description: "cycle: x leads-to y ⇒ y leads-to x",
      },
    ];
    const store = new FactStore();
    await seedPair(store, "signal", "leads-to", "echo");
    const reasoning = new ReasoningEngine(store, cyclic);
    const result = await reasoning.forwardChain();
    // both directions exist exactly once — re-derivation
    // reinforced instead of duplicating
    const fwd = store.query({ subject: "signal", predicate: "leads-to" });
    const back = store.query({ subject: "echo", predicate: "leads-to" });
    expect(fwd.length).toBe(1);
    expect(back.length).toBe(1);
    expect(result.iterations).toBeLessThanOrEqual(6);
  });

  it("multi-iteration chaining derives across passes (depth-2 rule chain)", async () => {
    const chained: Rule[] = [
      {
        id: "rule_step1",
        conditions: [{ subject: "?x", predicate: "is-a", object: "?y" }],
        produces: { subject: "?x", predicate: "kind-of", object: "?y" },
        weight: 0.9,
        description: "step 1",
      },
      {
        id: "rule_step2",
        conditions: [{ subject: "?x", predicate: "kind-of", object: "?y" }],
        produces: { subject: "?x", predicate: "member-of-class", object: "?y" },
        weight: 0.9,
        description: "step 2 consumes step 1 output",
      },
    ];
    const store = new FactStore();
    await seedPair(store, "oak", "is-a", "wood");
    const reasoning = new ReasoningEngine(store, chained);
    const result = await reasoning.forwardChain();
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(
      store.query({ subject: "oak", predicate: "member-of-class" })[0]?.object,
    ).toBe("wood");
  });
});
