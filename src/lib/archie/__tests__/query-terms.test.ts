// BATCH 44: content-word query construction and the
// topical overlap gate. Live-verified defect: a raw
// question handed to MediaWiki CirrusSearch returned
// "Straight razor" and "Filipino cuisine" for "what is a
// good whetstone for kitchen knives"; the same endpoint
// with content words returns on-topic cutlery articles.
import { describe, expect, it } from "vitest";
import {
  contentWordsOf,
  isTimeSensitiveQuery,
  topicallyMatches,
} from "@studio-shared/archie-ai/native-engine/query-terms.ts";

describe("contentWordsOf — question to keyword extraction", () => {
  it("strips interrogative lead-ins and stopwords", () => {
    expect(contentWordsOf("what is a good whetstone for kitchen knives"))
      .toEqual(["whetstone", "kitchen", "knife"]);
  });

  it("keeps already-keyword queries intact", () => {
    expect(contentWordsOf("gold price today")).toEqual([
      "gold", "price", "today",
    ]);
  });

  it("handles stacked lead-ins", () => {
    expect(contentWordsOf("can you tell me what the capital of France is"))
      .toEqual(["capital", "france"]);
  });

  it("singularizes simple plurals and ves plurals", () => {
    expect(contentWordsOf("how do i sharpen kitchen knives with stones"))
      .toEqual(["sharpen", "kitchen", "knife", "stone"]);
  });

  it("returns [] for pure-stopword queries (caller falls back)", () => {
    expect(contentWordsOf("what is it")).toEqual([]);
  });

  it("preserves alphanumeric tokens like chemical names", () => {
    expect(contentWordsOf("what is h2o2 used for"))
      .toEqual(["h2o2", "used"]);
  });
});

describe("topicallyMatches — overlap gate", () => {
  const words = contentWordsOf("what is a good whetstone for kitchen knives");

  it("accepts a hit sharing one content word", () => {
    expect(topicallyMatches("Butcher knife a kitchen tool", words)).toBe(true);
  });

  it("rejects a hit sharing zero content words", () => {
    expect(topicallyMatches("Filipino cuisine dishes of the Philippines", words))
      .toBe(false);
    expect(topicallyMatches("Straight razor a manual razor", words)).toBe(false);
  });

  it("empty word list passes everything (raw-query fallback)", () => {
    expect(topicallyMatches("anything", [])).toBe(true);
  });
});

describe("isTimeSensitiveQuery — current-value detection", () => {
  it("flags price and forecast questions", () => {
    expect(isTimeSensitiveQuery("current palm oil price in Nigeria")).toBe(true);
    expect(isTimeSensitiveQuery("what is the exchange rate today")).toBe(true);
    expect(isTimeSensitiveQuery("latest news on cement")).toBe(true);
    expect(isTimeSensitiveQuery("how much does a bag of rice cost")).toBe(true);
  });

  it("does not flag physics or definition questions", () => {
    expect(isTimeSensitiveQuery("what is electric current")).toBe(false);
    expect(isTimeSensitiveQuery("define momentum")).toBe(false);
    expect(isTimeSensitiveQuery("rate of reaction in chemistry")).toBe(false);
  });
});
