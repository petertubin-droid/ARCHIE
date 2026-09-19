import { describe, expect, it } from "vitest";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ReasoningEngine,
  DEFAULT_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";

// =========================================================
// ARCHIE — SINGLE-SLOT CAPTURE COMPLETION + TRANSITIVITY
// src/lib/archie/__tests__/variable-binding.test.ts
//
// Optimization entry for the 2026-09-11 performance pass
// (capability gap ms-2, baseline score 0). The forward
// chainer now completes a SOUND capture shorthand: a rule
// whose conclusion names exactly ONE variable its
// conditions never declare, while exactly ONE condition
// elides its object, materializes that variable into the
// elided slot. The captured value always comes from a real
// matched fact — never fabricated. All other shapes stay
// refused by the unbound-variable guard (safety preserved).
// =========================================================

async function seededStore(
  facts: Array<[string, string, unknown]>,
): Promise<FactStore> {
  const fs = new FactStore();
  for (const [s, p, o] of facts) {
    await fs.assert({
      subject: s,
      predicate: p,
      object: o,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
  }
  return fs;
}

describe("single-slot capture completion (ms-2 capability)", () => {
  it("derives from the capture shorthand: the free variable binds to the matched fact's object", async () => {
    const fs = await seededStore([["roof", "part-of", "house"]]);
    const re = new ReasoningEngine(fs, [
      {
        id: "trans",
        conditions: [{ subject: "?x", predicate: "part-of" }],
        produces: {
          subject: "?x",
          predicate: "indirect-part-of",
          object: "?y",
        },
        weight: 0.9,
        description: "transitive part-of",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(1);
    expect(out.derived[0].subject).toBe("roof");
    expect(out.derived[0].predicate).toBe("indirect-part-of");
    expect(out.derived[0].object).toBe("house"); // captured from the real fact
    expect(out.derived[0].status).toBe("derived"); // never auto-validated
    expect(out.bindings[0]).toEqual({ "?x": "roof", "?y": "house" });
    expect(out.derived[0].provenance.source).toBe("inferred");
  });

  it("still refuses TWO free variables (ambiguous — no capture)", async () => {
    const fs = await seededStore([["roof", "part-of", "house"]]);
    const re = new ReasoningEngine(fs, [
      {
        id: "two-free",
        conditions: [{ subject: "?x", predicate: "part-of" }],
        produces: { subject: "?y", predicate: "rel", object: "?z" },
        weight: 0.9,
        description: "two free vars",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(0); // refused: ?y and ?z unbound
  });

  it("still refuses a free variable when NO condition elides its object", async () => {
    const fs = await seededStore([["roof", "part-of", "house"]]);
    const re = new ReasoningEngine(fs, [
      {
        id: "no-slot",
        conditions: [{ subject: "?x", predicate: "part-of", object: "house" }],
        produces: { subject: "?x", predicate: "rel", object: "?y" },
        weight: 0.9,
        description: "no elided slot",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(0); // ?y has no legal source — refused
  });

  it("still refuses when TWO conditions elide their object (ambiguous which slot captures)", async () => {
    const fs = await seededStore([
      ["roof", "part-of", "house"],
      ["house", "contains", "rooms"],
    ]);
    const re = new ReasoningEngine(fs, [
      {
        id: "two-slots",
        conditions: [
          { subject: "?x", predicate: "part-of" },
          { subject: "?x", predicate: "contains" },
        ],
        produces: { subject: "?x", predicate: "rel", object: "?y" },
        weight: 0.9,
        description: "two elided slots",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(0);
  });

  it("numeric object capture is REAL and exact (Phase 2.4 numeric unification)", async () => {
    // Numbers are real capturable values now — the captured
    // value always comes from the matched fact, never
    // fabricated. This is what unlocks computed conclusions.
    const fs = await seededStore([["beam", "depth", 450]]);
    const re = new ReasoningEngine(fs, [
      {
        id: "num-capture",
        conditions: [{ subject: "?x", predicate: "depth", object: "?y" }],
        produces: { subject: "?x", predicate: "depth-reported", object: "?y" },
        weight: 0.9,
        description: "numeric object capture",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(1);
    expect(out.derived[0].object).toBe(450);
    // Binding recorded honestly in the derivation.
    const derivation = (
      out.derived[0].provenance as {
        derivation?: { binding?: Record<string, string | number> };
      }
    ).derivation;
    expect(derivation?.binding?.["?y"]).toBe(450);
  });

  it("capture still refuses structured objects — only strings and numbers bind", async () => {
    // A structured fact object is NOT a scalar value; a scalar
    // object variable cannot capture it (no silent deep
    // unification — use an explicit shape pattern instead).
    const fs = await seededStore([
      ["beam", "spec", { depth: 450, unit: "mm" }],
    ]);
    const re = new ReasoningEngine(fs, [
      {
        id: "obj-capture",
        conditions: [{ subject: "?x", predicate: "spec", object: "?y" }],
        produces: { subject: "?x", predicate: "spec-reported", object: "?y" },
        weight: 0.9,
        description: "structured object capture must be refused",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(0);
  });

  it("sound rules (all variables declared) are unaffected — literal + unification paths intact", async () => {
    const fs = await seededStore([
      ["roof", "part-of", "house"],
      ["house", "part-of", "building"],
    ]);
    const re = new ReasoningEngine(fs, [
      {
        id: "true-transitivity",
        conditions: [
          { subject: "?x", predicate: "part-of", object: "?y" },
          { subject: "?y", predicate: "part-of", object: "?z" },
        ],
        produces: {
          subject: "?x",
          predicate: "indirect-part-of",
          object: "?z",
        },
        weight: 0.9,
        description: "true two-hop transitivity",
      } as never,
    ]);
    const out = await re.forwardChain();
    expect(out.derived.length).toBe(1);
    expect(out.derived[0].subject).toBe("roof");
    expect(out.derived[0].object).toBe("building");
  });

  it("DEFAULT_RULES still chain (regression guard for the engine's own rules)", async () => {
    const fs = await seededStore([
      ["screed", "is-a", "material"],
      ["material", "needs-a", "primer"],
    ]);
    const re = new ReasoningEngine(fs, DEFAULT_RULES);
    const out = await re.forwardChain();
    // whatever the default set derives, the chain must be honest:
    // every derived fact is status "derived", never "validated"
    for (const f of out.derived) {
      expect(f.status).toBe("derived");
    }
    expect(out.iterations).toBeLessThanOrEqual(6);
  });
});
