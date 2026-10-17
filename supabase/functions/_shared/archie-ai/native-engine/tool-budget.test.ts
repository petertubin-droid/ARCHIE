import { describe, expect, it } from "vitest";
import { isToolHopWithinBudget, MAX_TOOL_HOPS } from "./tool-budget.ts";

describe("shared ARCHIE tool-hop budget", () => {
  it("allows exactly the configured number of executions and blocks the next call", () => {
    expect(MAX_TOOL_HOPS).toBe(8);
    for (let executed = 0; executed < MAX_TOOL_HOPS; executed += 1) {
      expect(isToolHopWithinBudget(executed)).toBe(true);
    }
    expect(isToolHopWithinBudget(MAX_TOOL_HOPS)).toBe(false);
    expect(isToolHopWithinBudget(MAX_TOOL_HOPS + 1)).toBe(false);
  });

  it("rejects invalid counters and honors a smaller explicit budget", () => {
    expect(isToolHopWithinBudget(-1)).toBe(false);
    expect(isToolHopWithinBudget(1.5)).toBe(false);
    expect(isToolHopWithinBudget(1, 1)).toBe(false);
    expect(isToolHopWithinBudget(0, 1)).toBe(true);
  });
});
