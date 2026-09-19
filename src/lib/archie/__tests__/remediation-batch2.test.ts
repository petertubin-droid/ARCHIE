// =========================================================
// REMEDIATION BATCH 2 TESTS (2026-09-12)
//
// NLU clarification route: a message whose words match NO
// corpus vocabulary gets an honest rephrase request instead
// of a research/teach offer that would be theater for
// gibberish. Real engine path — converse() end to end.
// =========================================================

import { describe, it, expect } from "vitest";
import { probeVocabulary } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("NLU clarification route (remediation batch 2)", () => {
  it("probeVocabulary counts known words, honestly reports zero for gibberish", () => {
    // Real corpus words are known.
    expect(probeVocabulary("what is screeding")).toBeGreaterThan(0);
    expect(probeVocabulary("hello archie")).toBeGreaterThan(0);
    // Vocabulary-empty input: nothing known, no guessing.
    expect(probeVocabulary("xqzv jkwqq blorpt")).toBe(0);
    expect(probeVocabulary("...")).toBe(0);
  });

  it("converse() asks for a rephrase on vocabulary-empty input — never research theater", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.converse("xqzv jkwqq blorpt");
    const text = result.responseText;
    expect(text).toContain("rephrase");
    expect(text.toLowerCase()).not.toContain("research it on the open web");
  });

  it("still offers research/teach for REAL unknown topics with known words", async () => {
    const engine = new ArchieNativeEngine();
    // "who invented the quantum flurg" — real words, no fact match.
    const result = await engine.converse("who invented the quantum flurg");
    const text = result.responseText;
    expect(text).not.toContain("rephrase");
  });
});
