import { describe, it, expect } from "vitest";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ReasoningEngine,
  DEFAULT_RULES,
  GENERAL_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import { CONSTRUCTION_RULES } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import {
  matchUnder,
  substitute,
  enumerateBindings,
  unboundVars,
  isVar,
} from "@studio-shared/archie-ai/native-engine/unify.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";

// =========================================================
// ARCHIE NATIVE ENGINE — UNIFICATION & GENERAL REASONING
// src/lib/archie/__tests__/reasoning-unification.test.ts
//
// Proves the P1 capability upgrade (owner directive 2026-09-10
// §3): variable binding, generalized rules, transitivity,
// syllogisms, bounded enumeration, backward search with
// variables — plus regression protection for the original
// literal path.
// =========================================================

function fact0(
  subject: string,
  predicate: string,
  object: string,
  confidence = 0.9,
): {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  provenance: { source: "seed" };
  status: "validated";
} {
  return {
    subject,
    predicate,
    object,
    confidence,
    provenance: { source: "seed" },
    status: "validated",
  };
}

const F = (subject: string, object: string, predicate = "is-a"): Fact =>
  ({
    id: "f",
    subject,
    predicate,
    object,
    confidence: 0.9,
    provenance: { source: "seed" },
    status: "validated",
    validatedCount: 1,
    createdAt: new Date().toISOString(),
  }) as Fact;

describe("Unification primitives", () => {
  it("isVar recognizes variables", () => {
    expect(isVar("?x")).toBe(true);
    expect(isVar("roof")).toBe(false);
    expect(isVar(42)).toBe(false);
  });

  it("binds free variables and enforces consistent re-binding", () => {
    const b = new Map<string, string>();
    const m1 = matchUnder(
      { subject: "?x", predicate: "part-of", object: "?y" },
      F("roof", "house", "part-of"),
      b,
    );
    expect(m1).not.toBeNull();
    expect(m1!.get("?x")).toBe("roof");
    expect(m1!.get("?y")).toBe("house");
    // Same ?x must agree on the second premise.
    const m2 = matchUnder(
      { subject: "?x", predicate: "part-of", object: "?z" },
      F("attic", "roof"),
      m1!,
    );
    expect(m2).toBeNull(); // "attic" ≠ bound "roof"
  });

  it("literal patterns still match exactly (no behavior change)", () => {
    expect(
      matchUnder({ subject: "roof" }, F("roof", "house"), new Map()),
    ).not.toBeNull();
    expect(
      matchUnder({ subject: "wall" }, F("roof", "house"), new Map()),
    ).toBeNull();
  });

  it("substitute fills bound variables and leaves unbound verbatim", () => {
    const binding = new Map([["?x", "roof"]]);
    const out = substitute(
      { subject: "?x", predicate: "part-of", object: "?y" },
      binding,
    );
    expect(out.subject).toBe("roof");
    expect(out.object).toBe("?y");
    expect(unboundVars(out, binding)).toEqual(["?y"]);
  });

  it("enumerateBindings finds consistent cross-premise bindings (transitivity)", () => {
    const facts = [
      F("roof", "house"),
      F("attic", "roof"),
      F("chimney", "roof"),
      F("door", "wall"),
    ].map((f, i) => ({ ...f, id: `f${i}` })) as Fact[];
    const sets = enumerateBindings(
      [
        { subject: "?x", predicate: "is-a", object: "?y" },
        { subject: "?y", predicate: "is-a", object: "?z" },
      ],
      facts,
    );
    // attic→roof→house and chimney→roof→house are the only
    // two consistent chains; door→wall does not chain.
    expect(sets.length).toBe(2);
    const pairs = sets.map((s) => [s.binding.get("?x"), s.binding.get("?z")]);
    expect(pairs).toContainEqual(["attic", "house"]);
    expect(pairs).toContainEqual(["chimney", "house"]);
    expect(pairs).not.toContainEqual(["door", "house"]);
  });

  it("enumerateBindings respects the safety cap", () => {
    const facts = Array.from({ length: 50 }, (_, i) => F(`x${i}`, `y${i}`)).map(
      (f, i) => ({ ...f, id: `c${i}` }),
    ) as Fact[];
    const sets = enumerateBindings(
      [{ subject: "?x", predicate: "is-a", object: "?y" }],
      facts,
      10,
    );
    expect(sets.length).toBeLessThanOrEqual(10);
  });
});

describe("Forward chaining with general (variable) rules", () => {
  it("derives a syllogism: my-shop is-a building → kind-of building", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("my-shop", "is-a", "building"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const out = await re.forwardChain();
    const derived = fs.query({ subject: "my-shop", predicate: "kind-of" });
    expect(derived.length).toBe(1);
    expect(derived[0].object).toBe("building");
    expect(derived[0].provenance.source).toBe("inferred");
    expect(out.explanations[0].ruleId).toBe("rule_general_class_inheritance");
    // Binding recorded honestly in the derivation.
    const derivation = (
      derived[0].provenance as {
        derivation?: { binding?: Record<string, string> };
      }
    ).derivation;
    expect(derivation?.binding?.["?x"]).toBe("my-shop");
    expect(derivation?.binding?.["?y"]).toBe("building");
  });

  it("derives transitivity: attic→roof→house ⇒ attic part-of-chain → house", async () => {
    const fs = new FactStore();
    // The GENERAL_RULES transitivity works on "part-of".
    await fs.assert(fact0("attic", "part-of", "roof"));
    await fs.assert(fact0("roof", "part-of", "house"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const out = await re.forwardChain();
    const derived = fs.query({
      subject: "attic",
      predicate: "part-of",
      object: "house",
    });
    expect(derived.length).toBe(1);
    expect(derived[0].confidence).toBeCloseTo(0.9 * 0.9, 5);
    expect(out.bindings.length).toBeGreaterThan(0);
  });

  it("derives causal chains: rain causes wet causes slippery", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("rain", "causes", "wet-ground"));
    await fs.assert(fact0("wet-ground", "causes", "slippery-site"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    await re.forwardChain();
    expect(
      fs.query({
        subject: "rain",
        predicate: "causes",
        object: "slippery-site",
      }).length,
    ).toBe(1);
  });

  it("flags contradictions: a thing cannot be and not-be", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("beam-depth", "is", "450mm"));
    await fs.assert(fact0("beam-depth", "verified-not", "450mm"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    await re.forwardChain();
    const flagged = fs.query({
      subject: "beam-depth",
      predicate: "contradiction-detected",
    });
    expect(flagged.length).toBe(1);
  });

  it("refuses to derive conclusions with unbound variables", async () => {
    // Perf-pass update (2026-09-11, ledger entry 1): a rule
    // with exactly ONE free variable and ONE object-elided
    // condition is now a SOUND capture shorthand (see
    // variable-binding.test.ts) — the value binds from the
    // matched fact. The refusal this test pins applies to
    // shapes that CANNOT be bound: here TWO free variables —
    // no unique capture source exists, so derivation stays
    // refused.
    const fs = new FactStore();
    await fs.assert(fact0("orphan", "is-a", "widget"));
    const bad = new ReasoningEngine(fs, [
      {
        id: "bad",
        conditions: [{ subject: "?x", predicate: "is-a" }],
        produces: {
          subject: "?y",
          predicate: "relates-to",
          object: "?unbound",
        },
        weight: 0.9,
        description: "illegal: two free vars, no unique capture",
      },
    ]);
    const out = await bad.forwardChain();
    expect(out.derived.length).toBe(0);
  });

  it("does not re-derive existing conclusions (reinforces instead)", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("shop", "is-a", "building"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const first = await re.forwardChain();
    const second = await re.forwardChain();
    expect(first.derived.length).toBe(1);
    expect(second.derived.length).toBe(0);
    expect(second.reinforced.length).toBeGreaterThan(0);
  });
});

describe("Backward search with variables (canReach)", () => {
  it("proves a variable goal through a general rule", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("my-shop", "is-a", "building"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const r = re.canReach({ subject: "my-shop", predicate: "kind-of" });
    expect(r.holds).toBe(true);
    expect(r.proof).toContain("rule_general_class_inheritance");
  });

  it("returns honest failure for underivable goals", () => {
    const fs = new FactStore();
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const r = re.canReach({ subject: "atlantis", predicate: "location" });
    expect(r.holds).toBe(false);
    expect(r.proof).toEqual([]);
  });

  it("literal goals keep their original semantics (regression)", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("concrete", "grade", "M20"));
    await fs.assert(fact0("concrete", "mix-ratio", "1:2:4"));
    const re = new ReasoningEngine(fs, [
      ...DEFAULT_RULES,
      ...CONSTRUCTION_RULES,
    ]);
    const r = re.canReach({
      subject: "concrete",
      predicate: "characteristic-strength",
    });
    expect(r.holds).toBe(true);
    expect(r.proof).toContain("rule_concrete_mix_ratio");
  });
});

describe("Engine integration (P1 substrate active in ARCHIE)", () => {
  it("GENERAL_RULES ship domain-neutral primitives", () => {
    expect(GENERAL_RULES.length).toBe(4);
    expect(GENERAL_RULES.every((r) => JSON.stringify(r).includes("?x"))).toBe(
      true,
    );
    // Audit fix 2026-09-11 (domain-capture removal): the 3
    // construction literals moved VERBATIM to the construction
    // domain skill; DEFAULT_RULES keeps the 2 domain-general
    // variable primitives (xd-3) plus the owner-authorization
    // literal. The engine composes DEFAULT_RULES + skill rules
    // — the effective rule set is unchanged; the literal ids
    // are asserted against that composed set.
    expect(DEFAULT_RULES.length).toBe(3);
    const composed = [...DEFAULT_RULES, ...CONSTRUCTION_RULES];
    const literalIds = composed
      .filter((r) => !JSON.stringify(r).includes("?"))
      .map((r) => r.id);
    // Phase 2.4 (numeric unification): rule_screeding_thickness_area
    // gained object variables ?t/?a plus a `compute` function — it
    // is no longer a literal rule and derives REAL volumes.
    expect(literalIds).toEqual([
      "rule_project_owner_authorization",
      "rule_concrete_mix_ratio",
      "rule_cement_bag_standard",
    ]);
    const general = DEFAULT_RULES.filter((r) =>
      JSON.stringify(r).includes("?"),
    );
    expect(general.length).toBe(2);
    for (const r of general) {
      // Safety property: every conclusion variable is bound by
      // a condition — no unbound-variable derivations, ever.
      const condVars = new Set(
        r.conditions.flatMap((c) =>
          [c.subject, c.object].flatMap((v) =>
            typeof v === "string" && v.startsWith("?") ? [v] : [],
          ),
        ),
      );
      const prodVars = [r.produces.subject, r.produces.object].filter(
        (v): v is string => typeof v === "string" && v.startsWith("?"),
      );
      expect(prodVars.every((v) => condVars.has(v))).toBe(true);
    }
  });
});
