// =========================================================
// ARCHIE CLIENT-SIDE CURATED LEXICON TESTS
//
// Verifies browser/PWA offline lexical disambiguation,
// curated dictionary lookups, and domain classifications.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  CURATED_DICTIONARY,
  lookupCuratedWord,
  lookupCuratedWords,
  disambiguateWord,
  disambiguateMessage,
  getCuratedLexiconDomains,
} from "../curated-lexicon";

describe("Client-Side Curated Lexicon Engine", () => {
  it("loads code-declared dictionary with verified senses", () => {
    expect(CURATED_DICTIONARY.length).toBeGreaterThan(10);
    const buildWord = lookupCuratedWord("build");
    expect(buildWord).not.toBeNull();
    expect(buildWord?.canonical).toBe("build");
    expect(buildWord?.senses.length).toBeGreaterThanOrEqual(2);
  });

  it("retrieves words by lemma or inflection", () => {
    const ranWord = lookupCuratedWord("ran");
    expect(ranWord).not.toBeNull();
    expect(ranWord?.canonical).toBe("run");

    const builtWord = lookupCuratedWord("built");
    expect(builtWord).not.toBeNull();
    expect(builtWord?.canonical).toBe("build");
  });

  it("disambiguates words contextually without network requests", () => {
    // 1. "bank" financial vs river
    const finResult = disambiguateWord("bank", "commercial deposit account at the local bank");
    expect(finResult.status).toBe("DISAMBIGUATED");
    expect(finResult.primarySense?.domain).toBe("finance.banking");

    const waterResult = disambiguateWord("bank", "walking along the river bank water");
    expect(waterResult.status).toBe("DISAMBIGUATED");
    expect(waterResult.primarySense?.domain).toBe("geography.topography");

    // 2. "block" masonry vs storage
    const masonryResult = disambiguateWord("block", "cinder concrete block wall");
    expect(masonryResult.status).toBe("DISAMBIGUATED");
    expect(masonryResult.primarySense?.domain).toBe("construction.materials");

    const storageResult = disambiguateWord("block", "allocating memory block storage size");
    expect(storageResult.status).toBe("DISAMBIGUATED");
    expect(storageResult.primarySense?.domain).toBe("computing.storage");
  });

  it("analyzes entire user messages and disambiguates multi-sense terms", () => {
    const message = "Please run the program and check the database column on the server";
    const disambiguations = disambiguateMessage(message);
    expect(disambiguations.length).toBeGreaterThan(0);

    const runDisambig = disambiguations.find((d) => d.lemma === "run");
    expect(runDisambig).toBeDefined();
    expect(runDisambig?.status).toBe("DISAMBIGUATED");
    expect(runDisambig?.primarySense?.domain).toBe("computing.systems");
  });

  it("lists all unique operational domains present in the curated corpus", () => {
    const domains = getCuratedLexiconDomains();
    expect(domains.length).toBeGreaterThan(5);
    expect(domains).toContain("construction.structural");
    expect(domains).toContain("computing.systems");
    expect(domains).toContain("finance.banking");
  });
});
