// =========================================================
// REMEDIATION BATCH 5 TESTS (2026-09-13, Level 2 audit)
//
// Fix 10 — backward-chain soundness: compute rules are never
//          "proved" backward (numbers can't be fabricated).
// Fix 11 — registration-time rule validation: invalid shapes
//          partitioned out of BOTH chains, reasons surfaced.
// Fix 12 — the backward chain is real production capability:
//          planner preconditions provable by rule chains
//          resolve as simulated progress, not false gaps.
// Fix 13 — contradiction-detected facts are finally consumed:
//          new contradictions count as verification failures
//          and surface in diagnostics.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  ReasoningEngine,
  ruleRejectionReason,
  GENERAL_RULES,
  DEFAULT_RULES,
} from "@studio-shared/archie-ai/native-engine/reasoning.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import { Planner } from "@studio-shared/archie-ai/native-engine/planning.ts";
import { CONSTRUCTION_RULES } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import type { Rule } from "@studio-shared/archie-ai/native-engine/types.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";

function fact0(s: string, p: string, o: unknown) {
  return {
    subject: s,
    predicate: p,
    object: o,
    confidence: 0.9,
    provenance: { source: "seed" as const },
    status: "validated" as const,
  };
}

const badShapes: Array<[Rule, string]> = [
  [
    {
      id: "",
      conditions: [{ subject: "a", predicate: "b" }],
      produces: { subject: "a", predicate: "c", object: "d" },
      weight: 0.9,
      description: "x",
    },
    "id",
  ],
  [
    {
      id: "no-conds",
      conditions: [],
      produces: { subject: "a", predicate: "c", object: "d" },
      weight: 0.9,
      description: "x",
    },
    "no conditions",
  ],
  [
    {
      id: "bad-weight",
      conditions: [{ subject: "a", predicate: "b" }],
      produces: { subject: "a", predicate: "c", object: "d" },
      weight: 1.5,
      description: "x",
    },
    "weight",
  ],
  [
    {
      id: "two-free-vars",
      conditions: [{ subject: "?x", predicate: "is-a" }],
      produces: { subject: "?y", predicate: "r", object: "?unbound" },
      weight: 0.9,
      description: "x",
    },
    "free variables",
  ],
];

describe("Rule validation (fix 11)", () => {
  it("accepts the ENTIRE shipped rule library", () => {
    const all = [...DEFAULT_RULES, ...GENERAL_RULES, ...CONSTRUCTION_RULES];
    for (const r of all) {
      expect(ruleRejectionReason(r)).toBeNull();
    }
    expect(all.length).toBeGreaterThanOrEqual(7);
  });

  it("rejects malformed shapes with honest reasons", () => {
    for (const [rule, needle] of badShapes) {
      const reason = ruleRejectionReason(rule);
      expect(reason).not.toBeNull();
      expect(reason).toContain(needle);
    }
  });

  it("constructor partitions invalid rules out of both chains", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("orphan", "is-a", "widget"));
    const bad = badShapes[3][0];
    const re = new ReasoningEngine(fs, [...GENERAL_RULES, bad]);
    expect(re.ruleCount()).toBe(GENERAL_RULES.length);
    expect(re.invalidRules).toHaveLength(1);
    expect(re.invalidRules[0].id).toBe("two-free-vars");
    // Forward chain: the bad rule's predicate never appears —
    // it is not even present to try. (Valid GENERAL_RULES may
    // still fire on the seeded fact; that is correct.)
    const out = await re.forwardChain();
    expect(out.derived.filter((f) => f.predicate === "r")).toHaveLength(0);
    expect(
      out.derived.filter((f) => f.predicate === "relates-to"),
    ).toHaveLength(0);
  });
});

describe("Backward-chain soundness (fix 10)", () => {
  it("never proves compute-rule conclusions backward", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("concrete", "mix-ratio", "1:2:4"));
    const re = new ReasoningEngine(fs, CONSTRUCTION_RULES);
    const r = re.canReach({
      subject: "concrete",
      predicate: "characteristic-strength",
    });
    // The compute rule is skipped: honest failure, no fabricated number.
    expect(r.holds).toBe(false);
  });
});

describe("Planner derivability (fix 12)", () => {
  const ops = [
    {
      id: "noop",
      description: "does nothing",
      cost: 1,
      achieves: { predicate: "never-matches" },
      preconditions: [{ predicate: "never-matches" }],
      effects: [],
    },
  ];

  it("resolves preconditions provable by rule chains as simulated progress", async () => {
    const fs = new FactStore();
    await fs.assert(fact0("my-shop", "is-a", "building"));
    const planner = new Planner(
      fs,
      ops as never,
      (pattern) =>
        new ReasoningEngine(fs, GENERAL_RULES).canReach(pattern).holds,
    );
    const plan = planner.plan({ subject: "my-shop", predicate: "kind-of" });
    expect(plan.executable).toBe(true);
    expect(plan.gapReport).toHaveLength(0);
    expect(plan.steps.some((s) => s.operatorId === "inference")).toBe(true);
  });

  it("without the probe, the same goal honestly gapped (regression)", () => {
    const fs = new FactStore();
    const planner = new Planner(fs, ops as never);
    const plan = planner.plan({ subject: "my-shop", predicate: "kind-of" });
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.length).toBeGreaterThan(0);
  });
});

describe("Contradiction consumption (fix 13)", () => {
  it("counts new contradiction facts as verification failures (deduped)", async () => {
    // Engine-level behavior is exercised in the runtime suite;
    // here we pin the store-level contradiction derivation the
    // engine consumes: both claims present → one derived flag.
    const fs = new FactStore();
    await fs.assert(fact0("beam-depth", "verified-not", "600mm"));
    await fs.assert(fact0("beam-depth", "is", "600mm"));
    const re = new ReasoningEngine(fs, GENERAL_RULES);
    const out = await re.forwardChain();
    const flags = out.derived.filter(
      (f: Fact) => f.predicate === "contradiction-detected",
    );
    expect(flags.length).toBe(1);
    // Re-running never re-counts: reinforcement, not new facts.
    const again = await re.forwardChain();
    expect(
      again.derived.filter(
        (f: Fact) => f.predicate === "contradiction-detected",
      ).length,
    ).toBe(0);
  });
});
