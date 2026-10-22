// BATCH 48 REGRESSION TESTS (2026-10-22)
// Covers the eight fixes of remediation batch 48:
// 1. mile/ounce converter units
// 2. typo-tolerant correction rules
// 3. percent-of math phrasing
// 4. market-status routing to the crypto domain skill
// 5. treasury operations pointer (no fabricated balances,
//    no absurd research/teach invite)
// 6. natural unit-conversion phrasings ("what is 20 celsius
//    in fahrenheit", "5 miles to km", "how many km in 5
//    miles") reach the deterministic converter
// 7. bare "forget X" routes to memory_exclusion
// 8. HTML entities decoded in research adapter output
import { describe, expect, it } from "vitest";
import { understand } from "../../../../supabase/functions/_shared/archie-ai/native-engine/nlu.ts";
import { decodeHtmlEntities } from "../../../../supabase/functions/_shared/archie-ai/native-engine/html-text.ts";
import { convertUnits } from "../../../../supabase/functions/_shared/archie-ai/native-engine/tools.ts";

describe("batch 48 defect 1: converter unit coverage", () => {
  it("converts miles to km", () => {
    expect(convertUnits(5, "miles", "km")).toBeCloseTo(8.04672, 4);
  });
  it("converts ounces to grams", () => {
    expect(convertUnits(16, "oz", "g")).toBeCloseTo(453.592, 1);
  });
});

describe("batch 48 defect 6: natural conversion phrasing routing", () => {
  it("routes 'what is 20 celsius in fahrenheit' to math_question", () => {
    const r = understand("what is 20 celsius in fahrenheit", [], { rules: [] });
    expect(r.intent).toBe("math_question");
  });
  it("routes '5 miles to km' to math_question", () => {
    const r = understand("5 miles to km", [], { rules: [] });
    expect(r.intent).toBe("math_question");
  });
  it("routes 'how many km in 5 miles' to math_question", () => {
    const r = understand("how many km in 5 miles", [], { rules: [] });
    expect(r.intent).toBe("math_question");
  });
  it("routes 'what is 10 pounds in kg' to math_question", () => {
    const r = understand("what is 10 pounds in kg", [], { rules: [] });
    expect(r.intent).toBe("math_question");
  });
  it("does not steal percent math ('what is 15 percent of 2400')", () => {
    const r = understand("what is 15 percent of 2400", [], { rules: [] });
    expect(r.intent).toBe("math_question");
  });
});

describe("batch 48 defect 7: bare forget directives", () => {
  it("routes 'forget that' to memory_exclusion", () => {
    const r = understand("forget that", [], { rules: [] });
    expect(r.intent).toBe("memory_exclusion");
  });
  it("routes 'forget the price' to memory_exclusion", () => {
    const r = understand("forget the price", [], { rules: [] });
    expect(r.intent).toBe("memory_exclusion");
  });
  it("keeps 'do not forget X' as a teach directive (opposite meaning)", () => {
    const r = understand("do not forget the gate code", [], { rules: [] });
    expect(r.intent).toBe("teaching");
  });
});

describe("batch 48 defect 8: HTML entity decoding", () => {
  it("decodes decimal numeric entities", () => {
    expect(decodeHtmlEntities("r&#233;aumur")).toBe("réaumur");
  });
  it("decodes hex numeric entities", () => {
    expect(decodeHtmlEntities("caf&#xE9;")).toBe("café");
  });
  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("&lt;b&gt;bold&lt;/b&gt; &amp; more")).toBe(
      "<b>bold</b> & more",
    );
  });
  it("passes unknown entities through untouched", () => {
    expect(decodeHtmlEntities("&unknownentity; stays")).toBe(
      "&unknownentity; stays",
    );
  });
  it("drops invalid code points instead of crashing", () => {
    expect(decodeHtmlEntities("&#x110000; ok")).toBe(" ok");
  });
  it("leaves clean text untouched", () => {
    expect(decodeHtmlEntities("plain text")).toBe("plain text");
  });
});
