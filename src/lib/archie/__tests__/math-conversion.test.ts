import { describe, it, expect } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import {
  evaluateExpression,
  convertUnits,
} from "@studio-shared/archie-ai/native-engine/tools.ts";

// =========================================================
// ARCHIE NATIVE ENGINE — P2: parenthesized arithmetic, unit
// conversion, domain-general triple extraction.
// src/lib/archie/__tests__/math-conversion.test.ts
// =========================================================

function mathEngine() {
  return new ArchieNativeEngine({ persistence: null });
}

describe("Parenthesized arithmetic (ma-1)", () => {
  it("computes '(25 * 48) + 12' through the full route", async () => {
    const e = mathEngine();
    const r = await e.converse("(25 * 48) + 12");
    expect(r.responseText).toContain("1212");
  });

  it("respects precedence with nested parentheses", async () => {
    const e = mathEngine();
    const r = await e.converse("what is 2 * (3 + (4 * 5))");
    expect(r.responseText).toContain("46");
  });

  it("evaluateExpression handles unbalanced parens honestly (throws)", () => {
    expect(() => evaluateExpression("(25 * 48")).toThrow();
  });

  it("evaluateExpression keeps operator precedence without parens", () => {
    expect(evaluateExpression("2+3*4")).toBe(14);
    expect(evaluateExpression("(2+3)*4")).toBe(20);
    expect(evaluateExpression("2^3^2")).toBe(512);
  });
});

describe("Unit conversion (ma-3)", () => {
  it("converts 5 meters to centimeters through the full route", async () => {
    const e = mathEngine();
    const r = await e.converse("convert 5 meters to centimeters");
    expect(r.responseText).toContain("500");
    expect(r.responseText).toContain("deterministic");
  });

  it("converts temperature with real affine formulas", async () => {
    const e = mathEngine();
    const r = await e.converse("convert 30 celsius to fahrenheit");
    expect(r.responseText).toContain("86");
  });

  it("refuses cross-dimension conversion honestly", async () => {
    const e = mathEngine();
    const r = await e.converse("convert 5 meters to kilograms");
    expect(r.responseText).toMatch(/cannot convert|different dimensions|honest/i);
  });

  it("convertUnits: length, mass, volume factors are real", () => {
    expect(convertUnits(5, "meters", "cm")).toBe(500);
    expect(convertUnits(1, "km", "m")).toBe(1000);
    expect(convertUnits(2.5, "kg", "g")).toBe(2500);
    expect(convertUnits(1, "feet", "inches")).toBe(12);
    expect(convertUnits(1.5, "liters", "ml")).toBe(1500);
    expect(convertUnits(0, "c", "f")).toBe(32);
    expect(convertUnits(100, "f", "c")).toBeCloseTo(37.777778, 4);
  });

  it("convertUnits throws honest errors for unknown units", () => {
    expect(() => convertUnits(5, "bananas", "cm")).toThrow(/unknown unit/i);
  });
});

describe("Domain-general teaching (xd-2)", () => {
  it("teaches and answers non-construction knowledge", async () => {
    const e = mathEngine();
    await e.converse("remember that photosynthesis converts light into chemical energy");
    const r = await e.converse("what is photosynthesis?");
    expect(r.responseText).toContain("light");
    expect(r.responseText).toContain("chemical");
  });

  it("does not regress on the standard teaching verb", async () => {
    const e = mathEngine();
    await e.converse("remember that screeding ratio is 1:4 cement to sand");
    const r = await e.converse("what is screeding ratio?");
    expect(r.responseText).toContain("1:4");
  });
});
