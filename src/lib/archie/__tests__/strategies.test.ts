import { describe, it, expect } from "vitest";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ReasoningEngine,
  GENERAL_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import {
  selectStrategies,
  extractComparisonSubjects,
  executeStrategy,
  reasonWithStrategies,
  type ReasoningTask,
} from "@studio-shared/archie-ai/native-engine/strategies.ts";

// =========================================================
// ARCHIE NATIVE ENGINE — REASONING STRATEGIES
// src/lib/archie/__tests__/strategies.test.ts
//
// Every strategy reasons over REAL store data, states its
// assumptions, reports an uncertainty band, cites evidence,
// and never promotes a hypothesis to a fact.
// =========================================================

function seed0(s: string, p: string, o: string, confidence = 0.9) {
  return {
    subject: s,
    predicate: p,
    object: o,
    confidence,
    provenance: { source: "seed" as const },
    status: "validated" as const,
  };
}

async function task(
  text: string,
  opts?: {
    subject?: string;
    subject2?: string;
    seed?: Parameters<FactStore["assert"]>[0][];
  },
): Promise<ReasoningTask> {
  const fs = new FactStore();
  for (const s of opts?.seed ?? []) await fs.assert(s);
  return {
    text,
    subject: opts?.subject,
    subject2: opts?.subject2,
    facts: fs,
    reasoning: new ReasoningEngine(fs, GENERAL_RULES),
    rules: GENERAL_RULES,
  };
}

describe("Strategy selection (meta-reasoning)", () => {
  it("selects causal for 'why' questions", async () => {
    const t = await task("why does the roof leak?", { subject: "roof-leak" });
    const sel = selectStrategies(t);
    expect(sel.chosen).toContain("causal");
    expect(sel.rationale).toMatch(/causal question/);
  });

  it("selects probabilistic for likelihood language", async () => {
    const t = await task("what is the probability of rain?");
    expect(selectStrategies(t).chosen).toContain("probabilistic");
  });

  it("selects hypothesis for speculative language", async () => {
    const t = await task("maybe the crack is structural — any theory?");
    expect(selectStrategies(t).chosen).toContain("hypothesis");
  });

  it("falls back honestly to logical when nothing matches", async () => {
    const t = await task("tell me something");
    const sel = selectStrategies(t);
    expect(sel.chosen).toEqual(["logical"]);
    expect(sel.rationale).toMatch(/honest fallback/i);
  });

  it("limits selection to two strategies", async () => {
    const t = await task(
      "why is it cheaper? compare probability and risk, what caused it, maybe a pattern, at least 3 and at most 5",
    );
    expect(selectStrategies(t).chosen.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------
// Structure-driven selection (audit re-assessment gap 2):
// the selector joins lexical cues with STORE STRUCTURE, so a
// paraphrase with no cue words still reaches the strategy its
// evidence supports — and an empty store still falls back.
// ---------------------------------------------------------
describe("Structure-driven selection (gap 2)", () => {
  it("extracts subjects from choice questions with no comparison cue words", () => {
    expect(
      extractComparisonSubjects(
        "should I use granite or sand for my driveway?",
      ),
    ).toEqual({ a: "granite", b: "sand" });
    expect(extractComparisonSubjects("tea or coffee?")).toEqual({
      a: "tea",
      b: "coffee",
    });
  });

  it("does not read declarative 'or' sentences as comparisons", () => {
    expect(
      extractComparisonSubjects("I will call you or send a message."),
    ).toBeNull();
  });

  it("selects comparative from store structure alone — no cue words", async () => {
    const t = await task("should I use granite or sand for my driveway?", {
      seed: [
        seed0("granite", "price-per-tonne", "9200"),
        seed0("sand", "price-per-tonne", "4500"),
      ],
    });
    const sel = selectStrategies(t);
    expect(sel.chosen).toContain("comparative");
    expect(sel.rationale).toMatch(/structure:/);
  });

  it("structure cannot select on an empty store — honest fallback stays", async () => {
    const t = await task("should I use granite or sand for my driveway?");
    const sel = selectStrategies(t);
    expect(sel.chosen).toEqual(["logical"]);
    expect(sel.rationale).toMatch(/honest fallback/i);
  });

  it("structure adds rank to a cued strategy, never removes it", async () => {
    // "compare" cued + subjects grounded in the store → higher score
    const grounded = await task("compare granite with sand", {
      seed: [
        seed0("granite", "price-per-tonne", "9200"),
        seed0("sand", "price-per-tonne", "4500"),
      ],
    });
    const g = selectStrategies(grounded);
    const comparative = g.scores.find((x) => x.kind === "comparative");
    expect(comparative?.score).toBeGreaterThan(3); // cue 3 + structure
  });

  it("conflict-shaped stores surface consistency from structure", async () => {
    const t = await task("what do you know about cement?", {
      seed: [
        seed0("cement", "price-per-bag", "9200"),
        seed0("cement", "price-per-bag", "7500"),
      ],
    });
    expect(selectStrategies(t).chosen).toContain("consistency");
  });
});

describe("Causal strategy", () => {
  it("follows transitive causal chains with confidence products", async () => {
    const t = await task("why does the site flood?", {
      subject: "heavy-rain",
      seed: [
        seed0("heavy-rain", "causes", "soil-saturation"),
        seed0("soil-saturation", "causes", "runoff"),
        seed0("runoff", "causes", "site-flooding"),
      ],
    });
    const r = await executeStrategy("causal", t);
    expect(r.kind).toBe("causal");
    const full = r.conclusions.find((c) =>
      c.statement.includes("site-flooding"),
    );
    expect(full).toBeDefined();
    expect(full!.confidence).toBeCloseTo(0.9 * 0.9 * 0.9, 5);
  });

  it("honestly reports no chains when none exist", async () => {
    const t = await task("why?", { subject: "nothing" });
    const r = await executeStrategy("causal", t);
    expect(r.conclusions).toEqual([]);
    expect(r.uncertainty).toBe("unknown");
  });
});

describe("Probabilistic strategy", () => {
  it("same-source repetition reinforces weakly and stays moderate (plan P3)", async () => {
    // 2e8c19e: repeating the SAME assertion no longer stacks
    // into high confidence — repetition is not verification.
    // The twin merges (+0.02) and the band honestly stays
    // "moderate".
    const t = await task("how likely is beam failure?", {
      subject: "beam",
      seed: [
        seed0("beam", "load-capacity", "450 kN", 0.8),
        seed0("beam", "load-capacity", "450 kN", 0.7),
      ],
    });
    const r = await executeStrategy("probabilistic", t);
    expect(r.conclusions.length).toBe(1);
    expect(r.uncertainty).toBe("moderate");
  });

  it("cross-source corroboration lifts the band to high-confidence (plan P3)", async () => {
    // A DIFFERENT source asserting the same claim is real
    // corroboration: +0.05 and the corroborating source is
    // stamped into verifiedBy — this is the promotion path
    // the evidence gates were built for.
    const t = await task("how likely is beam failure?", {
      subject: "beam",
      seed: [
        seed0("beam", "load-capacity", "450 kN", 0.8),
        {
          ...seed0("beam", "load-capacity", "450 kN", 0.8),
          provenance: { source: "owner-taught" as const },
        },
      ],
    });
    const r = await executeStrategy("probabilistic", t);
    expect(r.conclusions.length).toBe(1);
    expect(r.uncertainty).toBe("high-confidence");
  });

  it("surfaces conflicts — never averages away competing claims", async () => {
    const t = await task("what is the slab thickness?", {
      subject: "slab",
      seed: [
        seed0("slab", "thickness", "150mm", 0.9),
        seed0("slab", "thickness", "200mm", 0.4),
      ],
    });
    const r = await executeStrategy("probabilistic", t);
    expect(r.uncertainty).toBe("conflicting");
    expect(r.conclusions.length).toBe(2);
    expect(r.conclusions.every((c) => c.statement.includes("contested"))).toBe(
      true,
    );
  });
});

describe("Consistency strategy", () => {
  it("detects SPO contradictions across the store", async () => {
    const t = await task("are my records consistent?", {
      seed: [
        seed0("roof-pitch", "angle", "30 degrees"),
        seed0("roof-pitch", "angle", "45 degrees"),
        seed0("wall", "material", "brick"),
      ],
    });
    const r = await executeStrategy("consistency", t);
    expect(r.uncertainty).toBe("conflicting");
    expect(r.conclusions.length).toBe(1);
    expect(r.conclusions[0].statement).toContain("VS");
  });

  it("certifies a clean store", async () => {
    const t = await task("consistency check", {
      seed: [seed0("roof", "material", "tiles")],
    });
    const r = await executeStrategy("consistency", t);
    expect(r.summary).toMatch(/internally consistent/);
  });
});

describe("Temporal strategy", () => {
  it("orders dated facts chronologically", async () => {
    const t = await task("history of the project", {
      subject: "project",
      seed: [
        seed0("project", "phase", "2026-09-01 foundation"),
        seed0("project", "phase", "2025-11-01 design"),
      ],
    });
    const r = await executeStrategy("temporal", t);
    expect(r.conclusions.length).toBe(2);
    expect(r.conclusions[0].statement).toContain("2025-11-01");
    expect(r.conclusions[1].statement).toContain("2026-09-01");
  });
});

describe("Constraint strategy", () => {
  it("checks numeric facts against parsed bounds", async () => {
    const t = await task("is the budget between 100 and 500?", {
      subject: "budget",
      seed: [
        seed0("budget", "total", "420 naira"),
        seed0("budget", "overrun", "640 naira"),
      ],
    });
    const r = await executeStrategy("constraint", t);
    const violations = r.conclusions.filter((c) =>
      c.statement.includes("VIOLATES"),
    );
    expect(violations.length).toBe(1);
    expect(violations[0].statement).toContain("640");
  });

  it("honestly reports when no bound is parseable", async () => {
    const t = await task("is it enough?", { subject: "budget" });
    const r = await executeStrategy("constraint", t);
    expect(r.summary).toMatch(/No numeric constraint/);
  });
});

describe("Comparative strategy", () => {
  it("compares two subjects on a shared predicate", async () => {
    const t = await task("compare beam A vs beam B", {
      subject: "beam-a",
      subject2: "beam-b",
      seed: [
        seed0("beam-a", "load-capacity", "300 kN"),
        seed0("beam-b", "load-capacity", "500 kN"),
      ],
    });
    const r = await executeStrategy("comparative", t);
    expect(r.conclusions[0].statement).toContain(
      "beam-b has higher load-capacity",
    );
  });
});

describe("Abductive & hypothesis strategies", () => {
  it("proposes causal explanations ranked by support", async () => {
    const t = await task("why is the wall damp?", {
      subject: "damp-wall",
      seed: [
        seed0("plumbing-leak", "causes", "damp-wall"),
        seed0("plumbing-leak", "detected", "yes", 0.4),
      ],
    });
    const r = await executeStrategy("abductive", t);
    expect(r.conclusions.length).toBeGreaterThan(0);
    expect(r.conclusions[0].status).toBe("candidate");
  });

  it("presents hypotheses with status 'hypothesis' — never fact", async () => {
    const t = await task("maybe the damp wall has a theory?", {
      subject: "damp-wall",
      seed: [seed0("plumbing-leak", "causes", "damp-wall")],
    });
    const r = await executeStrategy("hypothesis", t);
    expect(r.conclusions.every((c) => c.status === "hypothesis")).toBe(true);
    expect(r.conclusions[0].statement).not.toMatch(/^(the )?fact/i);
  });

  it("refuses to fabricate hypotheses with zero evidence", async () => {
    const t = await task("any hypothesis?", { subject: "nothing-known" });
    const r = await executeStrategy("hypothesis", t);
    expect(r.conclusions).toEqual([]);
    expect(r.explanation).toMatch(/Refusing to fabricate/);
  });
});

describe("Inductive strategy", () => {
  it("proposes generalizations from ≥3 validated subjects (never auto-asserts)", async () => {
    const t = await task("do you see a pattern?", {
      seed: [
        seed0("m20", "is-a", "concrete"),
        seed0("m25", "is-a", "concrete"),
        seed0("m30", "is-a", "concrete"),
      ],
    });
    const r = await executeStrategy("inductive", t);
    expect(r.conclusions.length).toBe(1);
    expect(r.conclusions[0].status).toBe("candidate");
    // Nothing was added to the store by induction.
    expect(t.facts.list().length).toBe(3);
  });

  it("requires three validated subjects — honest threshold", async () => {
    const t = await task("pattern?", {
      seed: [
        seed0("m20", "is-a", "concrete"),
        seed0("m25", "is-a", "concrete"),
      ],
    });
    const r = await executeStrategy("inductive", t);
    expect(r.conclusions).toEqual([]);
  });
});

describe("Counterfactual strategy", () => {
  it("identifies effects orphaned by removing a cause", async () => {
    const t = await task("what happens if we remove heavy rain?", {
      subject: "heavy-rain",
      seed: [
        seed0("heavy-rain", "causes", "runoff"),
        seed0("runoff", "causes", "erosion"),
        seed0("erosion", "causes", "foundation-risk"),
        seed0("bad-drainage", "causes", "erosion"),
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    // erosion keeps an independent cause (bad-drainage), so only
    // runoff is truly orphaned.
    const orphaned = r.conclusions.map((c) => c.statement);
    expect(orphaned.some((s) => s.includes("runoff"))).toBe(true);
    expect(orphaned.some((s) => s.includes("erosion"))).toBe(false);
  });

  // Audit #5 (2026-09-13): counterfactual was tested on a
  // single happy path. These regression tests pin the deep
  // semantics — multi-hop orphaning, cycle safety, honest
  // refusal, and extraction from prose.

  it("orphans the FULL downstream chain when no other cause exists", async () => {
    const t = await task("what if we remove heavy rain?", {
      subject: "heavy-rain",
      seed: [
        seed0("heavy-rain", "causes", "runoff"),
        seed0("runoff", "causes", "erosion"),
        seed0("erosion", "causes", "foundation-risk"),
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    const orphaned = r.conclusions.map((c) => c.statement);
    // No independent causes anywhere: every downstream node
    // is orphaned, multi-hop.
    expect(orphaned.some((s) => s.includes("runoff"))).toBe(true);
    expect(orphaned.some((s) => s.includes("erosion"))).toBe(true);
    expect(orphaned.some((s) => s.includes("foundation-risk"))).toBe(true);
    expect(r.conclusions.every((c) => c.status === "candidate")).toBe(true);
    expect(r.conclusions.every((c) => c.evidence.length > 0)).toBe(true);
  });

  it("treats a cause upstream of the removed node as independent support", async () => {
    // storm → heavy-rain → runoff. Removing heavy-rain still
    // leaves storm upstream, but storm is BEFORE the removed
    // node — its path to runoff runs THROUGH heavy-rain, so
    // runoff stays orphaned. The traversal must not credit
    // upstream-only causes as independent.
    const t = await task("what happens if we stop heavy rain?", {
      subject: "heavy-rain",
      seed: [
        seed0("storm", "causes", "heavy-rain"),
        seed0("heavy-rain", "causes", "runoff"),
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    expect(r.conclusions.some((c) => c.statement.includes("runoff"))).toBe(
      true,
    );
  });

  it("survives cycles in the causal graph without hanging or duplicating", async () => {
    // No independent cause: the cycle runoff ↔ erosion is fed
    // ONLY by heavy-rain, so both members are orphaned. The
    // traversal must terminate and never emit duplicates.
    const t = await task("what if we remove heavy rain?", {
      subject: "heavy-rain",
      seed: [
        seed0("heavy-rain", "causes", "runoff"),
        seed0("runoff", "causes", "erosion"),
        seed0("erosion", "causes", "runoff"), // cycle: runoff ↔ erosion
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    const nodes = r.conclusions.map((c) => c.statement);
    expect(new Set(nodes).size).toBe(nodes.length); // no duplicates
    expect(nodes.some((s) => s.includes("runoff"))).toBe(true);
    expect(nodes.some((s) => s.includes("erosion"))).toBe(true);
  });

  it("keeps a cycle alive when an independent cause feeds it", async () => {
    // bad-drainage → erosion → runoff keeps the whole cycle
    // alive after heavy-rain is removed: honest two-pass
    // semantics must not orphan anything here.
    const t = await task("what if we remove heavy rain?", {
      subject: "heavy-rain",
      seed: [
        seed0("heavy-rain", "causes", "runoff"),
        seed0("runoff", "causes", "erosion"),
        seed0("erosion", "causes", "runoff"), // cycle: runoff ↔ erosion
        seed0("bad-drainage", "causes", "erosion"),
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    expect(r.conclusions).toEqual([]);
    expect(r.explanation).toMatch(/independent causes/i);
  });

  it("refuses honestly when no intervention target exists", async () => {
    const t = await task("what if things were different?", {});
    const r = await executeStrategy("counterfactual", t);
    expect(r.conclusions).toEqual([]);
    expect(r.summary).toMatch(/no intervention target|honest/i);
  });

  it("extracts the intervention target from prose, not just the subject hint", async () => {
    const t = await task("what happens if we remove bad drainage?", {
      seed: [
        seed0("bad-drainage", "causes", "erosion"),
        seed0("erosion", "causes", "foundation-risk"),
        seed0("heavy-rain", "causes", "erosion"),
      ],
    });
    const r = await executeStrategy("counterfactual", t);
    // The prose names "bad drainage"; the strategy resolves it
    // to the stored hyphenated subject and reports the target.
    // erosion survives via heavy-rain, so nothing is orphaned.
    expect(r.summary).toMatch(/bad[- ]drainage/);
    expect(r.conclusions).toEqual([]);
  });

  it("states its assumptions explicitly — never silent intervention", async () => {
    const t = await task("what happens if we remove heavy rain?", {
      subject: "heavy-rain",
      seed: [seed0("heavy-rain", "causes", "runoff")],
    });
    const r = await executeStrategy("counterfactual", t);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(r.assumptions.some((a) => a.toLowerCase().includes("causes"))).toBe(
      true,
    );
  });
});

describe("Abductive strategy — deeper regression (audit #5)", () => {
  it("ranks competing explanations by stored support", async () => {
    // Two candidate causes for cracks; one has more stored
    // support than the other. Ranking must follow evidence.
    const t = await task("why do i see cracks in the wall?", {
      subject: "cracks",
      seed: [
        seed0("poor-curing", "causes", "cracks"),
        seed0("poor-curing", "is-a", "construction-defect"),
        seed0("poor-curing", "observed-on", "site-a"),
        seed0("soil-settlement", "causes", "cracks"),
      ],
    });
    const r = await executeStrategy("abductive", t);
    expect(r.conclusions.length).toBeGreaterThan(1);
    // Every hypothesis stays a HYPOTHESIS, never a fact.
    expect(
      r.conclusions.every(
        (c) => c.status === "hypothesis" || c.status === "candidate",
      ),
    ).toBe(true);
    // The better-supported cause leads the ranking.
    expect(r.conclusions[0].statement).toMatch(/poor-curing/);
    expect(r.conclusions.every((c) => c.evidence.length > 0)).toBe(true);
  });

  it("never invents causes absent from the store", async () => {
    const t = await task("why did the price spike?", {
      subject: "price-spike",
      seed: [seed0("fuel-scarcity", "causes", "transport-cost-rise")],
    });
    const r = await executeStrategy("abductive", t);
    // fuel-scarcity causes transport-cost-rise, NOT the
    // subject price-spike — no edge into the subject means
    // honest zero, not a fabricated cause.
    const into = r.conclusions.filter((c) =>
      c.statement.includes("fuel-scarcity"),
    );
    expect(into.length).toBe(0);
  });
});

describe("Deductive strategy", () => {
  it("runs the unified forward chain and reports derivations", async () => {
    const t = await task("therefore, what follows?", {
      seed: [seed0("my-shop", "is-a", "building")],
    });
    const r = await executeStrategy("logical", t);
    expect(r.kind).toBe("logical");
    const kindOf = t.facts.query({ subject: "my-shop", predicate: "kind-of" });
    expect(kindOf.length).toBe(1);
    expect(r.conclusions.some((c) => c.status === "derived")).toBe(true);
  });
});

describe("Full meta-reasoning pass", () => {
  it("selects, executes, and merges with rationale", async () => {
    const t = await task("why does the site flood? is that consistent?", {
      subject: "heavy-rain",
      seed: [seed0("heavy-rain", "causes", "site-flooding")],
    });
    const out = await reasonWithStrategies(t);
    expect(out.selected.chosen.length).toBeGreaterThan(0);
    expect(out.results.length).toBe(out.selected.chosen.length);
    for (const r of out.results) {
      expect(r.assumptions.length).toBeGreaterThan(0);
      expect(r.explanation.length).toBeGreaterThan(0);
    }
  });

  it("unimplemented kinds refuse honestly instead of faking", async () => {
    const t = await task("spatial reasoning please");
    const r = await executeStrategy("spatial", t);
    expect(r.summary).toMatch(/not yet implemented.*honest refusal/i);
    expect(r.conclusions).toEqual([]);
  });
});
