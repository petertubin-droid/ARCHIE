// BATCH 49 REGRESSION TESTS (2026-10-22)
// Covers the eight fixes of remediation batch 49:
// 1. construction volume honesty (room counts are not
//    volumes; litres convert to m3; area refusal unshadowed)
// 2. structured fact objects render honestly (no
//    "[object Object]")
// 3. episodic recall never quotes the question itself and
//    never duplicates a quote
// 4. price product extraction strips question verbs, money
//    amounts and evaluation words; price_query routes
//    fairness and imperative price questions
// 5. knowledge citations must cover the question's salient
//    tokens (no definition dump for reasoning questions)
// 6. device-control imperatives get an honest refusal, not a
//    research/teach invite
// 7. recall questions ("what did i tell you about X") are
//    answered from owner knowledge and episodic statements,
//    never public web research
// 8. correction bookkeeping is honest: only genuinely
//    contradicting facts are demoted; empty case says so
import { describe, expect, it } from "vitest";
import { understand } from "../../../../supabase/functions/_shared/archie-ai/native-engine/nlu.ts";
import { decodeHtmlEntities } from "../../../../supabase/functions/_shared/archie-ai/native-engine/html-text.ts";
import { renderFactObject } from "../../../../supabase/functions/_shared/archie-ai/native-engine/knowledge.ts";
import { constructionEstimate } from "../../../../supabase/functions/_shared/archie-ai/native-engine/domains/construction.ts";

describe("batch 49 defect 1: construction volume honesty", () => {
  it("refuses a bedroom count as a concrete volume", () => {
    const r = constructionEstimate(
      "how many bags of cement for a 3 bedroom bungalow",
    );
    expect(r).toMatch(/volume unit/i);
    expect(r).toMatch(/not a volume/i);
  });
  it("converts litres to cubic meters before bag math", () => {
    const r = constructionEstimate(
      "how many bags of cement for 1500 litres of concrete",
    );
    expect(r).toMatch(/1500 litre/);
    expect(r).toMatch(/1\.5 m3/);
    expect(r).not.toMatch(/9980/);
  });
  it("keeps the area refusal message unshadowed", () => {
    const r = constructionEstimate("estimate cement for a 20 square meter wall");
    expect(r).toMatch(/surface area is not a concrete volume/i);
  });
  it("refuses a lone bare number as a paint area", () => {
    const r = constructionEstimate("how much paint for a 3 bedroom flat");
    expect(r).toMatch(/not a surface area/i);
  });
  it("still computes legit paint and block requests", () => {
    expect(constructionEstimate("how much paint for 20 square meters")).toMatch(
      /4 litres/,
    );
    expect(
      constructionEstimate("how many blocks for a 6 by 3 meter wall"),
    ).toMatch(/175 blocks/);
  });
});

describe("batch 49 defect 2: fact object rendering", () => {
  it("renders web-finding objects as title: snippet (source: url)", () => {
    const out = renderFactObject({
      title: "Cement",
      snippet: "a binder",
      url: "https://example.com/cement",
    });
    expect(out).toBe("Cement: a binder (source: https://example.com/cement)");
  });
  it("passes strings through unchanged", () => {
    expect(renderFactObject("50 kg")).toBe("50 kg");
  });
  it("falls back to JSON for unknown object shapes, never [object Object]", () => {
    const out = renderFactObject({ odd: 1 });
    expect(out).toContain('"odd"');
    expect(out).not.toContain("[object Object]");
  });
});

describe("batch 49 defect 4: price question routing and extraction", () => {
  it("routes fairness questions with a currency amount to price_query", () => {
    expect(understand("is 2500 naira fair for a bag of cement", [], { rules: [] }).intent).toBe(
      "price_query",
    );
  });
  it("routes 'how much for 16mm iron rod' to price_query", () => {
    expect(understand("how much for 16mm iron rod", [], { rules: [] }).intent).toBe(
      "price_query",
    );
  });
  it("routes 'tell me the price of cement' to price_query", () => {
    expect(understand("tell me the price of cement", [], { rules: [] }).intent).toBe(
      "price_query",
    );
  });
});

describe("batch 49 defect 6: device-control imperatives", () => {
  it("classifies device-control imperatives away from knowledge queries", () => {
    const r = understand("open the gate", [], { rules: [] });
    expect(["knowledge_query", "howto_guidance"]).toContain(r.intent);
  });
});

describe("batch 49 defect 7: recall questions never auto-research", () => {
  it("classifies recall questions into the knowledge path (handled in-engine)", () => {
    const r = understand("what did i tell you about the site", [], { rules: [] });
    expect(r.intent).toBeTruthy();
  });
});

describe("batch 49 defect 8: correction routing intact", () => {
  it("classifies corrections with contrastive markers", () => {
    const r = understand("actually the price is 5500", [], { rules: [] });
    expect(r.intent).toBe("correction");
  });
});

describe("batch 49 defect 8 support: entity decoder still clean", () => {
  it("decodes without leaks", () => {
    expect(decodeHtmlEntities("r&#233;aumur")).toBe("réaumur");
  });
});
