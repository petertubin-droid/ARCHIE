// =========================================================
// PLANNING-INTELLIGENCE TESTS (batch 23, fix 82)
// Plans are proposals carrying assumptions; health-adjacent
// plans must carry the professional-care disclaimer; goals
// are never invented.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assertHealthBoundary,
  buildPlanningProposal,
} from "@/lib/archie/planning-intelligence";

describe("buildPlanningProposal", () => {
  it("refuses a plan without a title or goals — ARCHIE does not invent goals", () => {
    expect(() =>
      buildPlanningProposal({
        plan_type: "DAILY_ROUTINE",
        title: "",
        goals: ["g"],
      }),
    ).toThrow(/requires a title/i);
    expect(() =>
      buildPlanningProposal({
        plan_type: "DAILY_ROUTINE",
        title: "T",
        goals: [],
      }),
    ).toThrow(/at least one goal is required/i);
  });

  it("builds deterministic, ordered steps embedding the stated goals", () => {
    const p = buildPlanningProposal({
      plan_type: "DAILY_ROUTINE",
      title: "My day",
      goals: ["morning workout", "deep work block"],
    });
    expect(p.steps[0].order).toBe(1);
    expect(p.steps.map((s) => s.description)).toContain(
      "Slot: morning workout",
    );
    expect(p.steps.map((s) => s.description)).toContain(
      "Slot: deep work block",
    );
    const orders = p.steps.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("records the assumptions the plan rests on", () => {
    const p = buildPlanningProposal({
      plan_type: "PROJECT_PLAN",
      title: "T",
      goals: ["g"],
      assumptions: ["budget = 200k"],
    });
    expect(p.assumptions).toContain("Plan type: PROJECT_PLAN");
    expect(p.assumptions).toContain("Goals as stated by the user.");
    expect(p.assumptions).toContain("budget = 200k");
  });

  it("falls back to the default disclaimer for unlisted plan types", () => {
    const p = buildPlanningProposal({
      plan_type: "SHOPPING_PLAN",
      title: "T",
      goals: ["g"],
    });
    expect(p.disclaimers.join(" ")).toMatch(/review before acting/i);
  });
});

describe("assertHealthBoundary (spec §12 high-consequence areas)", () => {
  it("passes fitness plans carrying the professional-care disclaimer", () => {
    const p = buildPlanningProposal({
      plan_type: "FITNESS_PLAN",
      title: "Strength program",
      goals: ["g"],
    });
    expect(() => assertHealthBoundary(p)).not.toThrow();
  });

  it("refuses health-adjacent plans without the medical disclaimer", () => {
    const p = buildPlanningProposal({
      plan_type: "TASK_PLAN",
      title: "Research medical treatment options",
      goals: ["g"],
    });
    // TASK_PLAN default disclaimer is not the medical one
    expect(() => assertHealthBoundary(p)).toThrow(
      /professional-care disclaimer/i,
    );
  });

  it("ignores non-health plans", () => {
    const p = buildPlanningProposal({
      plan_type: "TRAVEL_PLAN",
      title: "Lisbon in October",
      goals: ["beaches"],
    });
    expect(() => assertHealthBoundary(p)).not.toThrow();
  });
});
