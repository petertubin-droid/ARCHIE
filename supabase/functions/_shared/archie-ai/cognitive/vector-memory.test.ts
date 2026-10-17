// ============================================================
// ARCHIE SEMANTIC VECTOR MEMORY ENGINE — TESTS
// Determinism, subword bridging, recall floor, fusion
// stability (zero displacement), honest caps.
// ============================================================

import { describe, expect, it } from "vitest";
import {
  SEMANTIC_RECALL_FLOOR,
  SemanticIndex,
  charTrigrams,
  cosine,
  fuseRecall,
  hashEmbed,
} from "./vector-memory.ts";

describe("determinism", () => {
  it("identical input → byte-identical embedding, every time", () => {
    const a = hashEmbed("screed mixing ratio 1:4");
    const b = hashEmbed("screed mixing ratio 1:4");
    expect(a).toEqual(b);
  });

  it("different input → different embedding, non-zero norm", () => {
    const a = hashEmbed("screed mixing ratio");
    const b = hashEmbed("roof pitch geometry");
    expect(a).not.toEqual(b);
    expect(cosine(a, a)).toBeCloseTo(1, 6);
  });

  it("empty text → zero vector, never a crash", () => {
    const v = hashEmbed("");
    expect(cosine(v, v)).toBe(0);
  });
});

describe("charTrigrams", () => {
  it("marks boundaries: screed → ^sc … ed$", () => {
    expect(charTrigrams("screed")).toEqual([
      "^sc",
      "scr",
      "cre",
      "ree",
      "eed",
      "ed$",
    ]);
  });

  it("two-char tokens produce two boundary trigrams", () => {
    expect(charTrigrams("ab")).toEqual(["^ab", "ab$"]);
  });

  it("single-char tokens are one whole feature", () => {
    expect(charTrigrams("a")).toEqual(["^a$"]);
  });
});

describe("subword bridging — the recall the exact-token ranker misses", () => {
  it("morphological variants score well above the floor", () => {
    const a = hashEmbed("cement screed mixing ratio");
    const b = hashEmbed("screeding mix proportions");
    expect(cosine(a, b)).toBeGreaterThan(SEMANTIC_RECALL_FLOOR);
  });

  it("owner typos still bridge: scredding ≈ screeding", () => {
    const a = hashEmbed("screeding the floor");
    const b = hashEmbed("scredding the floor");
    expect(cosine(a, b)).toBeGreaterThan(0.6);
  });

  it("unrelated topics stay below the floor", () => {
    const a = hashEmbed("cement screed mixing ratio");
    const b = hashEmbed("birthday party decorations");
    expect(cosine(a, b)).toBeLessThan(SEMANTIC_RECALL_FLOOR);
  });

  it("a mid-word subword kiss is NOT recall: 'decorations' ≈ 'mixing_ratio'", () => {
    const idx = new SemanticIndex();
    // 'decorations' shares only mid-word trigrams (rat/ati/tio)
    // with 'mixing_ratio' — 0 strong (prefix) anchors → refused.
    idx.rebuild([
      { id: "f1", text: 'screed mixing_ratio "1 part cement to 4 parts sand"' },
    ]);
    const { items } = idx.recall("decorations ratio ideas", 2);
    expect(items).toEqual([]);
  });

  it("strong anchors gate: 'party decorations' refused even though 'party' prefix-matches 'parts'", () => {
    const idx = new SemanticIndex();
    idx.rebuild([
      { id: "f1", text: "cement screed parts sand 1 part" },
    ]);
    // 'party' shares ^pa,par with 'parts' — 1 strong anchor.
    // 'decorations' shares nothing prefix-wise — 0 strong.
    const { items } = idx.recall("birthday party decorations", 2);
    expect(items).toEqual([]);
  });
});

describe("SemanticIndex recall", () => {
  it("recalls a fact across morphology, ranked by score (dual gate: floor + 2 anchors)", () => {
    const idx = new SemanticIndex();
    idx.rebuild([
      { id: "f1", text: "cement screed mixing ratio 1 part cement 4 parts sand" },
      { id: "f2", text: "roof pitch minimum 15 degrees" },
      { id: "f3", text: "client estimate expires after 30 days" },
    ]);
    const { items, capReached } = idx.recall("screeding mix proportions", 2);
    expect(capReached).toBe(false);
    expect(items[0].id).toBe("f1");
    expect(items[0].score).toBeGreaterThan(SEMANTIC_RECALL_FLOOR);
    // floor keeps the unrelated facts out
    expect(items.find((i) => i.id === "f3")).toBeUndefined();
    // honest miss, documented: a single-token typo query
    // ("scredding the floor") keeps the honest refusal —
    // the anchor gate demands 2 anchored content tokens.
    const typo = idx.recall("scredding the floor", 2);
    expect(typo.items).toEqual([]);
  });

  it("remove() drops the entry from recall", () => {
    const idx = new SemanticIndex();
    idx.add("f1", "screed mixing ratio");
    idx.remove("f1");
    expect(idx.recall("screeding mix", 5).items).toEqual([]);
    expect(idx.size()).toBe(0);
  });

  it("deterministic ordering: score desc, then id asc", () => {
    const idx = new SemanticIndex();
    idx.add("b", "screed mixing ratio");
    idx.add("a", "screed mixing ratio"); // same text → same score
    const { items } = idx.recall("screeding mix", 2);
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("queries with no features recall nothing, no crash", () => {
    const idx = new SemanticIndex();
    idx.add("f1", "some fact");
    expect(idx.recall("", 3).items).toEqual([]);
  });
});

describe("fuseRecall — zero-displacement contract", () => {
  const items = [
    { id: "a", name: "tfidf-first" },
    { id: "b", name: "tfidf-second" },
  ];
  const byId = (id: string) => items.find((i) => i.id === id);

  it("TF-IDF results keep their order; semantic only appends", () => {
    const fused = fuseRecall(
      [items[1]], // b ranked first by TF-IDF
      [
        { id: "a", score: 0.9 },
        { id: "b", score: 0.8 },
      ],
      byId,
      3,
    );
    expect(fused.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("never duplicates an id the TF-IDF path already returned", () => {
    const fused = fuseRecall(items, [{ id: "a", score: 0.9 }], byId, 3);
    expect(fused).toHaveLength(2);
  });

  it("respects k", () => {
    const fused = fuseRecall([], [
      { id: "a", score: 0.9 },
      { id: "b", score: 0.8 },
    ], byId, 1);
    expect(fused).toHaveLength(1);
  });

  it("empty semantic → TF-IDF unchanged, verbatim", () => {
    expect(fuseRecall(items, [], byId, 5)).toEqual(items);
  });
});
