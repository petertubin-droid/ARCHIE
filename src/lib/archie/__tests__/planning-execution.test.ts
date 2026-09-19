import { describe, expect, it } from "vitest";
// =========================================================
// PLANNING & EXECUTION TEST (audit Phase 3.2, 2026-09-11)
//
// Before this phase, every task_planning request resolved the
// FIXED goal predicate "planned" and produced the same single
// canned step ("Decompose a construction project into phased
// tasks") regardless of what was asked — a template, not a
// plan. Phase 3.2 makes planning real:
//  - the goal subject is DERIVED from the request and the
//    operator library is $goal-scoped, so chains are about
//    what was asked;
//  - the chain is a real dependency chain (inventory → gaps →
//    knowledge → quantities → sequence → draft → propose);
//  - the engine EXECUTES the steps bound to real subsystems
//    (knowledge inventory, deterministic construction
//    calculator) and stamps honest per-step results;
//  - owner-dependent steps wait for the owner; consequential
//    steps stop at PROPOSE. Never fabricated.
// =========================================================

import {
  ArchieNativeEngine,
  deriveGoalSubject,
} from "@studio-shared/archie-ai/native-engine/engine.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  DEFAULT_OPERATORS,
  PLANNING_OPERATORS,
  Planner,
} from "@studio-shared/archie-ai/native-engine/planning.ts";
import { CONSTRUCTION_OPERATORS } from "@studio-shared/archie-ai/native-engine/domains/construction.ts";

const engine = new ArchieNativeEngine();
const turns = (text: string) => [{ role: "owner" as const, parts: [{ text }] }];

async function planReply(text: string): Promise<string> {
  const result = await engine.generate({
    turns: turns(text),
    tools: [],
    systemInstruction: "",
  });
  return result.parts[0].text ?? "";
}

// ---------------------------------------------------------
// Goal-subject derivation (deterministic, input-specific)
// ---------------------------------------------------------
describe("goal derivation", () => {
  it("strips planning shells, keeping the actual goal", () => {
    expect(deriveGoalSubject("plan a roofing project for my bungalow")).toBe(
      "roofing project for my bungalow",
    );
    expect(deriveGoalSubject("help me organize a wedding reception")).toBe(
      "wedding reception",
    );
    expect(deriveGoalSubject("break my thesis work into steps")).toBe(
      "thesis work",
    );
    expect(deriveGoalSubject("create a plan for learning spanish")).toBe(
      "learning spanish",
    );
  });
});

// ---------------------------------------------------------
// Planner: goal-scoped means-ends over $goal operators
// ---------------------------------------------------------
describe("planner: real goal-scoped step chains", () => {
  async function goalStore(goal: string, quantities = false) {
    const store = new FactStore();
    await store.assert({
      subject: goal,
      predicate: "scope-defined",
      object: "test",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "validated",
    });
    // mirror the engine's honest quantity assertion: detected
    // when quantities exist, trivially-quantified otherwise
    await store.assert({
      subject: goal,
      predicate: quantities ? "quantities-detected" : "inputs-quantified",
      object: "test",
      confidence: 0.9,
      provenance: { source: "seed" },
      status: "validated",
    });
    for (const [subject] of [["owner"], ["network"]] as const) {
      await store.assert({
        subject,
        predicate: subject === "owner" ? "available" : "authorized",
        object: "test",
        confidence: 0.9,
        provenance: { source: "seed" },
        status: "validated",
      });
    }
    return store;
  }

  it("derives a multi-step dependency chain for the asked goal", async () => {
    const goal = "wedding reception";
    const planner = new Planner(await goalStore(goal), [
      ...DEFAULT_OPERATORS,
      ...PLANNING_OPERATORS,
    ]);
    const plan = planner.plan({ subject: goal, predicate: "planned" });
    expect(plan.executable).toBe(true);
    expect(plan.steps.length).toBeGreaterThanOrEqual(6);
    // dependency order: inventory before gaps before knowledge
    const ids = plan.steps.map((s) => s.operatorId);
    expect(ids.indexOf("op_inventory_prerequisites")).toBeLessThan(
      ids.indexOf("op_identify_gaps"),
    );
    expect(ids.indexOf("op_identify_gaps")).toBeLessThan(
      ids.indexOf("op_owner_teach_goal_knowledge"),
    );
    expect(ids[ids.length - 1]).toBe("op_propose_execution");
    // the chain is ABOUT the goal, not a fixed template
    expect(plan.goal).toContain(goal);
    expect(plan.steps.every((s) => s.satisfies.includes(goal))).toBe(true);
  });

  it("is input-dependent: quantity-bearing goals include the estimate operator", async () => {
    const goal = "6 by 3 meter block wall";
    const store = await goalStore(goal, true);
    const planner = new Planner(store, [
      ...DEFAULT_OPERATORS,
      ...PLANNING_OPERATORS,
      ...CONSTRUCTION_OPERATORS,
    ]);
    const plan = planner.plan({ subject: goal, predicate: "planned" });
    expect(
      plan.steps.some((s) => s.operatorId === "op_estimate_materials"),
    ).toBe(true);
    // and a quantity-free goal does NOT include it
    const plain = new Planner(await goalStore("wedding reception"), [
      ...DEFAULT_OPERATORS,
      ...PLANNING_OPERATORS,
      ...CONSTRUCTION_OPERATORS,
    ]).plan({ subject: "wedding reception", predicate: "planned" });
    expect(
      plain.steps.some((s) => s.operatorId === "op_estimate_materials"),
    ).toBe(false);
  });

  it("reports gaps honestly when a goal lacks its prerequisites", () => {
    const planner = new Planner(new FactStore(), [
      ...DEFAULT_OPERATORS,
      ...PLANNING_OPERATORS,
    ]);
    const plan = planner.plan({
      subject: "moon landing",
      predicate: "planned",
    });
    expect(plan.executable).toBe(false);
    expect(plan.gapReport.length).toBeGreaterThan(0);
  });

  it("keeps legacy predicate-only goals working (no subject, no $goal operators)", () => {
    const planner = new Planner(new FactStore(), DEFAULT_OPERATORS);
    const plan = planner.plan("answered");
    // knowledge:available is missing in an empty store — honest gap
    expect(plan.executable).toBe(false);
  });
});

// ---------------------------------------------------------
// Engine end-to-end: executed steps with honest results
// ---------------------------------------------------------
describe("engine: planning request → executed step chain", () => {
  it("produces a goal-specific, executed chain and stays owner-gated", async () => {
    const text = await planReply("help me organize a wedding reception");
    expect(text).toContain("Plan for your request");
    expect(text).toContain("goal: wedding reception");
    // real chain, not the old single canned construction step
    expect(text).not.toContain(
      "Decompose a construction project into phased tasks",
    );
    // the knowledge step waits for the owner — never fabricates
    expect(text).toContain("awaiting you");
    // execution stays owner-gated
    expect(text).toContain("PROPOSE");
  });

  it("executes the real calculator when quantities are present", async () => {
    const text = await planReply(
      "plan a 6 by 3 meter block wall project for my compound",
    );
    expect(text).toContain(
      "goal: 6 by 3 meter block wall project for my compound",
    );
    expect(text).toMatch(/approximately \d+ blocks/);
    // real computed estimate, not a promise
    expect(text).toContain("deterministic estimate");
  });

  it("reports a blocked estimate honestly when dimensions are incomplete", async () => {
    const text = await planReply(
      "plan the block wall for my site with 12 bags of cement",
    );
    // digits + block lexicon → estimate step runs, but the
    // calculator needs wall dimensions — blocked, never guessed
    expect(text).toMatch(/blocked|need the wall length and height/);
    expect(text).not.toMatch(/approximately \d+ blocks/);
  });
});

// ---------------------------------------------------------
// Planner step semantics (re-assessment 2026-09-13, gap 1):
// the three former label steps now run real subsystem work.
// ---------------------------------------------------------
describe("engine: planner step semantics — no label steps", () => {
  it("identify_gaps performs a real structural analysis, not a count label", async () => {
    const text = await planReply("help me organize a wedding reception");
    expect(text).toContain("0 structural gaps");
    expect(text).toContain("content:");
  });

  it("sequence_tasks verifies the dependency order before claiming it", async () => {
    const text = await planReply("help me organize a wedding reception");
    expect(text).toContain("dependency order verified over");
  });

  it("draft_plan composes a real draft from prior step outputs", async () => {
    const text = await planReply("help me organize a wedding reception");
    expect(text).toContain("DRAFT for");
    expect(text).toContain("known:");
    expect(text).toContain("gaps:");
    expect(text).toContain("order:");
    expect(text).toContain("authorization: ends at PROPOSE");
  });

  it("the draft carries the computed estimate when quantities exist", async () => {
    const text = await planReply(
      "plan a 6 by 3 meter block wall project for my compound",
    );
    expect(text).toContain("quantities:");
    expect(text).toContain("deterministic estimate");
  });

  it("a draft never carries an estimate that was blocked", async () => {
    const text = await planReply(
      "plan the block wall for my site with 12 bags of cement",
    );
    // estimate blocked on missing dimensions → no quantities line
    expect(text).not.toContain("quantities:");
  });
});
