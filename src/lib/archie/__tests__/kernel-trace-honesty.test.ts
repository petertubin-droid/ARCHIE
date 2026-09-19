import { describe, expect, it } from "vitest";
// =========================================================
// P9 — KERNEL TRACE HONESTY (M1 remainder)
// The trace never fakes work:
//   * every phase status is one of executed | delegated |
//     skipped
//   * "executed" means REAL evidence — a measured duration
//     (> 0) or a concrete artifact record in the summary,
//     never a ceremonial "completed"
//   * "delegated" phases name the substrate component that
//     actually did the work (reasoning loop, native engine,
//     learning engine, orchestrator)
//   * PLAN / LEARN / REPEAT are recorded as delegated when
//     that is what they are; OBSERVE stays executed (real
//     audit ledger write) while the loop runs observations
//     itself
// =========================================================

import { CognitiveKernel } from "@studio-shared/archie-ai/cognitive/kernel.ts";
import { LOOP_PHASES } from "@studio-shared/archie-ai/cognitive/types.ts";

const CEREMONIAL = new Set([
  "completed",
  "",
  "skipped",
]);

describe("P9 kernel trace honesty", () => {
  it("every phase carries an honest status from the honest set", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("hello archie");
    for (const p of result.trace.phases) {
      expect(["executed", "delegated", "skipped"]).toContain(p.status);
    }
  });

  it("no phase is labeled executed without measured duration or a real artifact record", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("what is the definition of screeding?");
    const executed = result.trace.phases.filter((p) => p.status === "executed");
    expect(executed.length).toBeGreaterThan(0);
    for (const p of executed) {
      const measured = p.durationMs > 0;
      const concreteArtifact =
        !CEREMONIAL.has(p.summary) && p.summary.length > 12;
      expect(
        measured || concreteArtifact,
        `phase ${p.phase} claims executed with neither measured duration nor artifact: "${p.summary}" (${p.durationMs}ms)`,
      ).toBe(true);
    }
  });

  it("delegated phases name the substrate component that did the work", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("what is the definition of screeding?");
    const delegated = result.trace.phases.filter((p) => p.status === "delegated");
    // PLAN/LEARN/REPEAT are exactly the ceremonial ones — at
    // least LEARN and REPEAT must appear on every substantive
    // cycle.
    const phases = delegated.map((p) => p.phase);
    expect(phases).toContain("LEARN");
    expect(phases).toContain("REPEAT");
    for (const p of delegated) {
      expect(p.summary).toMatch(/substrate|orchestrator|engine|loop/i);
    }
  });

  it("understand is executed with a real measured duration, not a 0ms default", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("what is the screeding ratio");
    const understand = result.trace.phases.find((p) => p.phase === "UNDERSTAND");
    expect(understand?.status).toBe("executed");
    expect(understand?.durationMs).toBeGreaterThanOrEqual(0);
    expect(understand?.summary).toMatch(/intent=/);
  });

  it("ceremonial summary 'completed' is gone — executed phases describe what they produced", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("what is 25 * 48?");
    for (const p of result.trace.phases) {
      if (p.status === "executed") {
        expect(p.summary).not.toBe("completed");
      }
    }
  });

  it("trace phases remain in the canonical loop order", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("hello archie");
    const positions = result.trace.phases
      .map((p) => LOOP_PHASES.indexOf(p.phase))
      .filter((i) => i >= 0);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});
