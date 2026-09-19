import { describe, expect, it } from "vitest";
// =========================================================
// FORENSIC PASS §11 — PLANNING & DECISION-MAKING DEPTH
// The Planner class (native-engine/planning.ts) had ZERO
// direct tests before this file. The engine uses it in the
// research route (plan("researched")) and the project route
// (plan("planned")) — so honest planning is user-visible.
// Attacked here:
//   * goal already satisfied → zero-step executable plan
//   * recursive precondition resolution (means-ends)
//   * honest gap reporting when prerequisites are missing
//     and when NO operator can achieve a goal
//   * cost-ranked operator selection (cheapest first)
//   * depth exhaustion reported honestly
//   * alternatives are REAL operator chains, never fabricated
//   * risk assessment reflects the operators actually chosen
//   * effects are NOT simulated during planning — a step's
//     effects never make a later precondition "magically" hold
// =========================================================

import { Planner, DEFAULT_OPERATORS } from "@studio-shared/archie-ai/native-engine/planning.ts";
import {
  CONSTRUCTION_OPERATORS,
} from "@studio-shared/archie-ai/native-engine/domains/construction.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";

async function storeWith(...facts: Array<[string, string, string]>) {
  const store = new FactStore();
  for (const [subject, predicate, object] of facts) {
    await store.assert({
      subject,
      predicate,
      object,
      confidence: 0.9,
      provenance: { source: "owner-taught" },
      status: "validated",
    });
  }
  return store;
}

describe("means-ends planning", () => {
  it("an already-satisfied goal yields an executable zero-step plan", async () => {
    const store = await storeWith(["knowledge", "available", "yes"]);
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("available");
    expect(plan.executable).toBe(true);
    expect(plan.steps).toEqual([]);
    expect(plan.totalCost).toBe(0);
    expect(plan.gapReport).toEqual([]);
  });

  it("recursive precondition resolution: web research needs network authorization first", async () => {
    const store = await storeWith(["network", "authorized", "yes"]);
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("researched");
    expect(plan.executable).toBe(true);
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]?.operatorId).toBe("op_web_research");
    expect(plan.totalCost).toBe(5);
  });

  it("missing network authorization is REPORTED, not papered over", async () => {
    const store = new FactStore();
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("researched");
    // op_web_research is the only operator achieving "researched"
    // — its precondition cannot be satisfied → not executable
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.join(" ")).toMatch(/network authorized|owner available/);
  });

  it("a goal NO operator achieves is reported honestly as unachievable", async () => {
    const store = new FactStore();
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("teleported");
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.join(" ")).toContain("no registered operator");
  });

  it("depth exhaustion is reported, never silently treated as success", async () => {
    const store = new FactStore();
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("researched", 0);
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.join(" ")).toMatch(/depth exhausted/);
  });

  it("cheaper operators are tried first (cost-ranked selection)", async () => {
    const store = new FactStore();
    const expensive = [
      {
        id: "op_expensive",
        description: "expensive path",
        achieves: { subject: "goal", predicate: "solved" },
        preconditions: [],
        effects: [],
        cost: 10,
      },
      {
        id: "op_cheap",
        description: "cheap path",
        achieves: { subject: "goal", predicate: "solved" },
        preconditions: [],
        effects: [],
        cost: 1,
      },
    ];
    const planner = new Planner(store, expensive);
    const plan = planner.plan("solved");
    expect(plan.executable).toBe(true);
    expect(plan.steps[0]?.operatorId).toBe("op_cheap");
    expect(plan.totalCost).toBe(1);
  });
});

describe("plan alternatives and risk", () => {
  it("alternatives are real operator chains — same goal or feeding a primary precondition", async () => {
    const store = await storeWith(["network", "authorized", "yes"]);
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("researched");
    // op_teach_from_owner also achieves "knowledge available"
    // (a precondition-adjacent alternative)... web research has
    // no preconditions satisfied by teaching, so alternatives
    // must at minimum be empty-or-real, never fabricated ids
    for (const alt of plan.alternatives) {
      const ids = alt.operatorIds;
      expect(ids.every((id) => DEFAULT_OPERATORS.some((op) => op.id === id))).toBe(true);
    }
  });

  it("a research plan is flagged medium-risk with a validation note", async () => {
    const store = await storeWith(["network", "authorized", "yes"]);
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("researched");
    expect(plan.risk.level).toBe("medium");
    expect(plan.risk.notes.join(" ")).toMatch(/validated before being trusted/i);
  });

  it("a stored-capability-only plan is low-risk", async () => {
    const store = await storeWith(["project", "scope-defined", "yes"]);
    // "planned" is achieved by the construction domain operator
    // — the engine composes it through the skill registry; this
    // test composes the same way (audit fix 2026-09-11).
    const planner = new Planner(store, [
      ...DEFAULT_OPERATORS,
      ...CONSTRUCTION_OPERATORS,
    ]);
    const plan = planner.plan("planned");
    expect(plan.executable).toBe(true);
    expect(plan.risk.level).toBe("low");
  });
});

describe("planning honesty invariants", () => {
  it("effects are PLANNED achievements, never store writes — an underivable precondition still fails the plan", () => {
    // Audit fix 2026-09-11: operator effects now chain WITHIN a
    // plan (see the effect-chaining test below), but the chain
    // still ends at facts. Asking for the "answered" goal with
    // NOTHING in the store: op_answer needs "knowledge
    // available" (producible by op_teach's effect), but
    // op_teach itself needs "owner available" — no fact, no
    // producing operator — so the plan must still fail and the
    // gap must still be reported. Simulated progress never
    // papers over a genuinely missing prerequisite.
    const store = new FactStore();
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("answered");
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.join(" ")).toMatch(/owner available|missing/);
  });

  it("effect chaining: a plan may derive a precondition from an earlier step's effect", async () => {
    // With "owner available" as a real stored fact, the chain
    // goal "answered" → op_answer needs "knowledge available"
    // → op_teach's effect produces it → op_teach needs "owner
    // available" (stored) becomes EXECUTABLE with the steps in
    // dependency order.
    const store = await storeWith(["owner", "available", "yes"]);
    const planner = new Planner(store, DEFAULT_OPERATORS);
    const plan = planner.plan("answered");
    expect(plan.executable).toBe(true);
    expect(plan.steps.map((s) => s.operatorId)).toEqual([
      "op_teach_from_owner",
      "op_answer_from_knowledge",
    ]);
    expect(plan.gapReport).toEqual([]);
  });

  it("operatorCount reflects the registered library", () => {
    const planner = new Planner(new FactStore(), DEFAULT_OPERATORS);
    expect(planner.operatorCount()).toBe(DEFAULT_OPERATORS.length);
    expect(planner.operatorCount()).toBeGreaterThan(5);
  });
});
