import { describe, expect, it } from "vitest";
// =========================================================
// FORENSIC PASS §9 — MEMORY RETRIEVAL DEPTH
// rankFacts() is the retrieval ranker for EVERY knowledge
// answer (TF-IDF + cosine over fact surface text). Existing
// coverage is incidental. Attacked here:
//   * irrelevant facts are filtered (score 0), never cited
//   * the k cap is respected
//   * ranking is deterministic across repeated calls
//   * empty store / empty query never crash
//   * numeric facts are retrievable by numeric queries
//   * keyword stuffing (surface-text gaming) — recorded as a
//     design note (lexical ranker, provenance still shown)
// =========================================================

import { rankFacts } from "@studio-shared/archie-ai/native-engine/memory.ts";
import type { Fact } from "@studio-shared/archie-ai/native-engine/types.ts";

function fact(
  subject: string,
  predicate: string,
  object: unknown,
  confidence = 0.8,
): Fact {
  return {
    id: `f-${subject}-${predicate}`,
    subject,
    predicate,
    object,
    confidence,
    provenance: { source: "owner-taught" },
    status: "taught",
    validatedCount: 0,
    verifiedBy: ["owner-taught"],
    createdAt: new Date().toISOString(),
  } as unknown as Fact;
}

const STORE = [
  fact("cement", "cures-in", "28 days"),
  fact("mortar", "ratio", "1:4"),
  fact("screeding", "sets-in", "48 hours"),
  fact("concrete", "compressive-strength", "30 MPa"),
  fact("sand", "sold-in", "tonnes"),
  fact("gravel", "costs", "moderately"),
  fact("blocks", "come-in", "450mm"),
  fact("paint", "applies-in", "2 coats"),
];

describe("retrieval ranking (rankFacts)", () => {
  it("retrieves the matching fact and filters zero-relevance facts", () => {
    const got = rankFacts("what is screeding", STORE);
    const ids = got.map((f) => f.id);
    expect(ids).toContain("f-screeding-sets-in");
    expect(ids).not.toContain("f-paint-applies-in");
  });

  it("respects the k cap even with many matching facts", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      fact(`cement-${i}`, "contains", "cement blend"),
    );
    const got = rankFacts("cement blend", many, 6);
    expect(got.length).toBe(6);
  });

  it("ranking is deterministic across repeated calls", () => {
    const a = rankFacts("what is mortar", STORE).map((f) => f.id);
    const b = rankFacts("what is mortar", STORE).map((f) => f.id);
    expect(a).toEqual(b);
  });

  it("empty query or empty store never crash", () => {
    expect(rankFacts("", STORE)).toEqual([]);
    expect(rankFacts("anything", [])).toEqual([]);
  });

  it("a numeric-valued fact is retrievable by a numeric query", () => {
    const got = rankFacts("how many days does cement cure", [
      fact("cement", "cures-in", 28),
    ]);
    expect(got.length).toBe(1);
  });

  it("keyword-stuffed surface text outranks genuine matches — recorded design note D-M1 (LOW)", () => {
    // The ranker scores SURFACE TEXT (subject predicate JSON
    // object). A fact whose object literally repeats the query
    // term outscores a semantically genuine fact. Acceptable
    // while facts are owner-written (provenance is always
    // displayed), but web-research-sourced facts could game
    // retrieval. Forensic report D-M1, LOW.
    const stuffed = fact("ad", "sponsored", "cement cement cement cement cement");
    const genuine = fact("cement", "cures-in", "28 days");
    const got = rankFacts("tell me about cement", [genuine, stuffed]);
    expect(got[0]?.id).toBe("f-ad-sponsored");
  });
});
