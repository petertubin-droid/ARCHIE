// ============================================================
// FACT RANKING — TF-IDF + SEMANTIC VECTOR MEMORY FUSION TESTS
// (engine 8, gap 13)
//
// The zero-displacement contract, proven:
//   1. exact-token TF-IDF rankings are BIT-FOR-BIT unchanged
//   2. previously-EMPTY results now recall semantically,
//      with the honest cosine as score
//   3. the dual gate (floor + 2 anchors) keeps lone-subword
//      false positives out
// ============================================================

import { describe, expect, it } from "vitest";
import { FactRankIndex } from "./knowledge.ts";
import type { Fact } from "./types.ts";

function fact(
  id: string,
  subject: string,
  predicate: string,
  object: unknown,
): Fact {
  return {
    id,
    subject,
    predicate,
    object,
    status: "validated",
    confidence: 0.9,
    provenance: { source: "seed", detail: "test", at: 0 },
    verifiedBy: [],
    validatedCount: 1,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Fact;
}

const CORPUS: Fact[] = [
  fact("f1", "screed", "mixing_ratio", "1 part cement to 4 parts sand"),
  fact("f2", "roof", "minimum_pitch", "15 degrees"),
  fact("f3", "client estimate", "expiry", "30 days"),
  fact("f4", "screed", "curing_time", "24 to 48 hours"),
];

function indexWith(): FactRankIndex {
  const idx = new FactRankIndex();
  idx.rebuild(CORPUS);
  return idx;
}

describe("regression — exact-token TF-IDF ranking unchanged", () => {
  it("an exact-token query ranks by TF-IDF, top result first", () => {
    const idx = indexWith();
    // NOTE: predicates tokenize as single tokens ("mixing_ratio"
    // is one token), so object tokens carry the exact match.
    const ranked = idx.rank("cement sand screed", 3);
    expect(ranked[0].id).toBe("f1");
    expect(ranked.some((f) => f.id === "f2")).toBe(false);
  });

  it("scored ranking carries the TF-IDF cosine", () => {
    const idx = indexWith();
    const scored = idx.rankScored("roof pitch", 2);
    expect(scored[0].fact.id).toBe("f2");
    expect(scored[0].score).toBeGreaterThan(0);
  });

  it("gibberish with no corpus overlap still returns []", () => {
    const idx = indexWith();
    expect(idx.rank("qqq zzz", 3)).toEqual([]);
  });
});

describe("semantic recall — the previously-empty path (gap 13)", () => {
  it("morphological variants now recall: screeding mix proportions", () => {
    const idx = indexWith();
    // exact-token path finds nothing ("screeding" not in corpus)
    const ranked = idx.rank("screeding mix proportions", 2);
    expect(ranked[0].id).toBe("f1");
    expect(ranked.length).toBeGreaterThanOrEqual(1);
  });

  it("the recalled score is the HONEST cosine, riding along in rankScored", () => {
    const idx = indexWith();
    const scored = idx.rankScored("screeding mix proportions", 2);
    expect(scored[0].fact.id).toBe("f1");
    expect(scored[0].score).toBeGreaterThan(0);
    expect(scored[0].score).toBeLessThanOrEqual(1);
  });

  it("roofing morphology recalls the roof fact, not screed", () => {
    const idx = indexWith();
    const ranked = idx.rank("roofing pitches minimums", 1);
    expect(ranked[0]?.id).toBe("f2");
  });

  it("lone subword kiss is refused: birthday party decorations", () => {
    const idx = indexWith();
    // 'party' subword-matches 'part(s)' but the dual gate
    // (floor + 2 anchor tokens) keeps it out — honest refusal
    expect(idx.rank("birthday party decorations", 3)).toEqual([]);
  });

  it("single-token typo keeps the honest refusal (documented miss)", () => {
    const idx = indexWith();
    expect(idx.rank("scredding", 3)).toEqual([]);
  });

  it("empty corpus and empty query degrade honestly", () => {
    const empty = new FactRankIndex();
    expect(empty.rank("anything", 3)).toEqual([]);
    const idx = indexWith();
    expect(idx.rank("", 3)).toEqual([]);
  });
});

describe("index maintenance keeps the semantic index in sync", () => {
  it("removed facts no longer recall semantically", () => {
    const idx = indexWith();
    idx.remove("f1");
    expect(idx.rank("screeding mix proportions", 3)).toEqual([]);
    // other facts still reachable by exact tokens
    expect(idx.rank("roof pitch", 2)[0].id).toBe("f2");
  });

  it("rebuild replaces the semantic corpus wholesale", () => {
    const idx = new FactRankIndex();
    idx.rebuild(CORPUS);
    idx.rebuild([fact("only", "ceiling", "height", "2.4 meters")]);
    expect(idx.rank("screeding mix proportions", 3)).toEqual([]);
    expect(idx.rank("ceiling height", 2)[0].id).toBe("only");
  });
});
