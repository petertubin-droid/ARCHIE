import { describe, expect, it } from "vitest";
// =========================================================
// NUMERIC + STRUCTURED UNIFICATION (audit Phase 2 item 4)
//
// "let object variables bind numbers and structured objects
// with typed patterns — this unlocks the rule engine's
// construction rules (and future quantitative rules)."
//
// Object variables bind string OR number fact objects; "shape"
// patterns ({ value: "?v", unit: "m" }) bind structured fact
// objects one level deep; rules with `compute` derive real
// quantitative conclusions and REFUSE (undefined) when a
// premise carries no usable number — never guess.
// =========================================================

import {
  enumerateBindings,
  matchUnder,
  patternVars,
  substitute,
  unboundVars,
  type Binding,
} from "@studio-shared/archie-ai/native-engine/unify.ts";
import { ReasoningEngine } from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import type {
  Fact,
  Rule,
} from "@studio-shared/archie-ai/native-engine/types.ts";
import { CONSTRUCTION_RULES } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

function fact(subject: string, predicate: string, object: unknown): Fact {
  return {
    id: `${subject}-${predicate}`,
    subject,
    predicate,
    object,
    confidence: 0.9,
    provenance: { source: "owner-taught" },
    status: "candidate",
    validatedCount: 0,
    createdAt: new Date().toISOString(),
  };
}

describe("numeric unification (Phase 2.4)", () => {
  it("binds an object variable to a NUMBER fact object", () => {
    const m = matchUnder(
      { subject: "screed", predicate: "thickness", object: "?t" },
      fact("screed", "thickness", 0.05),
      new Map(),
    );
    expect(m?.get("?t")).toBe(0.05);
  });

  it("still binds an object variable to a string fact object", () => {
    const m = matchUnder(
      { subject: "screed", predicate: "thickness", object: "?t" },
      fact("screed", "thickness", "0.05 m"),
      new Map(),
    );
    expect(m?.get("?t")).toBe("0.05 m");
  });

  it("requires agreement when a numeric object variable is already bound", () => {
    const binding: Binding = new Map([["?t", 0.05]]);
    const ok = matchUnder(
      { subject: "screed", predicate: "thickness", object: "?t" },
      fact("screed", "thickness", 0.05),
      binding,
    );
    const bad = matchUnder(
      { subject: "screed", predicate: "thickness", object: "?t" },
      fact("screed", "thickness", 0.1),
      binding,
    );
    expect(ok).not.toBeNull();
    expect(bad).toBeNull();
  });

  it("matches a shape pattern against a structured fact object one level deep", () => {
    const m = matchUnder(
      {
        subject: "screed",
        predicate: "thickness",
        object: { value: "?v", unit: "m" },
      },
      fact("screed", "thickness", {
        value: 0.05,
        unit: "m",
        notes: "extra key allowed",
      }),
      new Map(),
    );
    expect(m?.get("?v")).toBe(0.05);
  });

  it("refuses a shape pattern when a literal key mismatches", () => {
    const m = matchUnder(
      {
        subject: "screed",
        predicate: "thickness",
        object: { value: "?v", unit: "mm" },
      },
      fact("screed", "thickness", { value: 0.05, unit: "m" }),
      new Map(),
    );
    expect(m).toBeNull();
  });

  it("exposes nested shape variables in patternVars/unboundVars", () => {
    const vars = patternVars({
      subject: "?s",
      object: { value: "?v", unit: "m" },
    });
    expect(vars).toEqual(["?s", "?v"]);
    const still = unboundVars(
      { subject: "?s", object: { value: "?v", unit: "m" } },
      new Map([["?s", "screed"]]),
    );
    expect(still).toEqual(["?v"]);
  });

  it("substitutes a bound numeric object variable into a conclusion", () => {
    const out = substitute(
      { subject: "screed", predicate: "volume", object: "?v" },
      new Map([["?v", 0.15]]),
    );
    expect(out.object).toBe(0.15);
  });

  it("enumerateBindings carries numeric bindings through a two-condition join", () => {
    const facts = [
      fact("screed", "thickness", 0.05),
      fact("floor", "area", 24),
    ];
    const out = enumerateBindings(
      [
        { subject: "screed", predicate: "thickness", object: "?t" },
        { subject: "floor", predicate: "area", object: "?a" },
      ],
      facts,
    );
    expect(out.length).toBe(1);
    expect(out[0].binding.get("?t")).toBe(0.05);
    expect(out[0].binding.get("?a")).toBe(24);
  });
});

describe("computed rule conclusions (Phase 2.4)", () => {
  const volumeRule: Rule = {
    id: "rule_test_volume",
    conditions: [
      { subject: "screed", predicate: "thickness", object: "?t" },
      { subject: "floor", predicate: "area", object: "?a" },
    ],
    produces: { subject: "screed", predicate: "volume", object: "computed" },
    weight: 0.9,
    description: "volume = thickness x area",
    compute: (bound) => {
      const t =
        typeof bound["?t"] === "number" ? bound["?t"] : Number(bound["?t"]);
      const a =
        typeof bound["?a"] === "number" ? bound["?a"] : Number(bound["?a"]);
      if (!Number.isFinite(t) || !Number.isFinite(a)) return undefined;
      return t * a;
    },
  };

  it("derives a REAL numeric fact from numeric premises", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "screed",
      predicate: "thickness",
      object: 0.05,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    await store.assert({
      subject: "floor",
      predicate: "area",
      object: 24,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    const engine = new ReasoningEngine(store, [volumeRule]);
    const out = await engine.forwardChain();
    const derived = out.derived.find((f) => f.predicate === "volume");
    expect(derived?.object).toBeCloseTo(1.2, 10);
  });

  it("REFUSES the conclusion when a premise carries no usable number", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "screed",
      predicate: "thickness",
      object: "standard practice",
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    await store.assert({
      subject: "floor",
      predicate: "area",
      object: 24,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    const engine = new ReasoningEngine(store, [volumeRule]);
    const out = await engine.forwardChain();
    expect(out.derived.find((f) => f.predicate === "volume")).toBeUndefined();
  });

  it("the construction screed rule computes volume from taught facts (numeric strings parse honestly)", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "screed",
      predicate: "thickness",
      object: "0.05 m",
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    await store.assert({
      subject: "floor",
      predicate: "area",
      object: "20 m2",
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    const engine = new ReasoningEngine(store, CONSTRUCTION_RULES);
    const out = await engine.forwardChain();
    const derived = out.derived.find((f) => f.predicate === "volume");
    expect(derived?.object).toBeCloseTo(1.0, 10);
  });

  it("the construction screed rule derives exact volume from NUMBER objects too", async () => {
    const store = new FactStore();
    await store.assert({
      subject: "screed",
      predicate: "thickness",
      object: 0.04,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    await store.assert({
      subject: "floor",
      predicate: "area",
      object: 30,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "candidate",
    });
    const engine = new ReasoningEngine(store, CONSTRUCTION_RULES);
    const out = await engine.forwardChain();
    const derived = out.derived.find((f) => f.predicate === "volume");
    expect(derived?.object).toBeCloseTo(1.2, 10);
  });
});
