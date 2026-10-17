// ============================================================
// CALCULATION PROVENANCE TRACE — TESTS
// Evidence for the 2026-09-16 owner directive: deterministic
// engine calculations (statistics, arithmetic, unit
// conversion) report to the injected trace sink, and a
// throwing/failing sink NEVER corrupts the computed answer.
// ============================================================
import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "../engine.ts";
import type { CalculationTraceRecord } from "../engine.ts";

function engineWithSink(records: CalculationTraceRecord[]) {
  return new ArchieNativeEngine({
    calculationTrace: (r) => {
      records.push(r);
    },
  });
}

describe("§calculation provenance trace — statistics", () => {
  it("reports the real computation with its inputs and verdict", async () => {
    const records: CalculationTraceRecord[] = [];
    const engine = engineWithSink(records);
    const answer = await engine.converse("what is the mean of 1, 2, 3");
    expect(answer.responseText).toMatch(/2/);
    expect(records.length).toBeGreaterThanOrEqual(1);
    const stats = records.find((r) => r.calculator === "statistics");
    expect(stats).toBeDefined();
    expect(stats!.valid).toBe(true);
    expect(stats!.steps[0].op).toBe("mean");
    expect(stats!.steps[0].values).toEqual([1, 2, 3]);
    expect(stats!.verdict).toHaveProperty("result", 2);
  });
});

describe("§calculation provenance trace — arithmetic", () => {
  it("reports deterministic arithmetic with the expression", async () => {
    const records: CalculationTraceRecord[] = [];
    const engine = engineWithSink(records);
    const answer = await engine.converse("what is 25 * 48");
    expect(answer.responseText).toMatch(/1200/);
    const calc = records.find((r) => r.calculator === "arithmetic");
    expect(calc).toBeDefined();
    expect(calc!.valid).toBe(true);
    expect(calc!.steps[0].expression).toBe("25*48"); // normalized by extractExpression
    expect(calc!.verdict).toHaveProperty("result", 1200);
  });

  it("reports an honest failure verdict when the expression is invalid", async () => {
    const records: CalculationTraceRecord[] = [];
    const engine = engineWithSink(records);
    await engine.converse("what is 2 +");
    const calc = records.find((r) => r.calculator === "arithmetic");
    // Invalid input may not even extract an expression — the
    // honest rule is: no fake success trace is EVER recorded.
    if (calc) {
      expect(calc.valid).toBe(false);
      expect(calc.verdict).toHaveProperty("error");
    } else {
      expect(records.filter((r) => r.calculator === "arithmetic")).toHaveLength(0);
    }
  });
});

describe("§calculation provenance trace — unit conversion", () => {
  it("reports the conversion factors and result", async () => {
    const records: CalculationTraceRecord[] = [];
    const engine = engineWithSink(records);
    const answer = await engine.converse("convert 5 meters to centimeters");
    expect(answer.responseText).toMatch(/500/);
    const conv = records.find((r) => r.calculator === "convert_units");
    expect(conv).toBeDefined();
    expect(conv!.valid).toBe(true);
    expect(conv!.steps[0]).toEqual({ value: 5, from: "meters", to: "centimeters" });
  });
});

describe("§calculation provenance trace — safety", () => {
  it("never lets a throwing sink corrupt the computed answer", async () => {
    const engine = new ArchieNativeEngine({
      calculationTrace: () => {
        throw new Error("trace sink exploded");
      },
    });
    const answer = await engine.converse("what is 6 * 7");
    expect(answer.responseText).toMatch(/42/);
  });

  it("records nothing when no sink is wired (honest absence)", async () => {
    const engine = new ArchieNativeEngine();
    const answer = await engine.converse("what is 6 * 7");
    expect(answer.responseText).toMatch(/42/);
  });
});
