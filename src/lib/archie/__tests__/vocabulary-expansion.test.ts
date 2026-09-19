import { describe, expect, it } from "vitest";
// =========================================================
// SELF-EVOLVING VOCABULARY — QUALITY GATE (owner directive,
// 2026-09-12)
//   1. seed integrity: 1000+ entries, no hyphens, no
//      duplicates, every term has a real meaning
//   2. English coverage: every word class, abbreviations,
//      idioms, Nigerian English, A-Z spread
//   3. corrector protection: registered words are NEVER typo
//      corrected — seed words and live-learned words alike
//   4. capture: unknown words are extracted, known words and
//      stopwords are never re-captured
//   5. no fake knowledge: means-facts exist only for seeded
//      or taught meanings; an observed word without a
//      meaning is never a fact
// =========================================================
import {
  SEED_VOCABULARY,
  extractCandidateTokens,
  extractUnknownTokens,
  isWhContraction,
  isKnownVocabularyTerm,
  registerLearnedTerms,
  seedMeansFacts,
  seedVocabularyCount,
} from "@studio-shared/archie-ai/knowledge/vocabulary.ts";
import {
  correctConversationalTypos,
  understand,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { SupabasePersistence } from "@studio-shared/archie-ai/native-engine/persistence.ts";

describe("seed integrity", () => {
  it("contains at least 1000 seeded entries with meanings", () => {
    expect(seedVocabularyCount()).toBeGreaterThanOrEqual(1000);
    for (const e of SEED_VOCABULARY) {
      expect(e.term.length).toBeGreaterThan(0);
      expect(e.meaning.length).toBeGreaterThan(2);
    }
  });

  it("contains no hyphens in terms or meanings (owner rule)", () => {
    const offenders = SEED_VOCABULARY.filter(
      (e) => e.term.includes("-") || e.meaning.includes("-"),
    );
    expect(offenders).toEqual([]);
  });

  it("contains no duplicate terms", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const e of SEED_VOCABULARY) {
      if (seen.has(e.term)) dups.push(e.term);
      seen.add(e.term);
    }
    expect(dups).toEqual([]);
  });

  it("covers every English word class the owner listed", () => {
    const classes = new Set(SEED_VOCABULARY.map((e) => e.wordClass));
    for (const required of [
      "pronoun",
      "noun",
      "verb",
      "adjective",
      "adverb",
      "preposition",
      "conjunction",
      "determiner",
      "number",
      "time",
      "color",
      "interjection",
      "expression",
      "abbreviation",
      "phrase",
    ]) {
      expect(classes, `missing class ${required}`).toContain(required);
    }
  });

  it("spreads the alphabet a to z", () => {
    const letters = new Set(
      SEED_VOCABULARY.map((e) => e.term[0]).filter((c) => /[a-z]/.test(c)),
    );
    for (const l of "abcdefghijklmnopqrstuvwxyz") {
      expect(letters, `letter ${l} uncovered`).toContain(l);
    }
  });

  it("includes abbreviations, idioms and nigerian english", () => {
    const types = new Set(SEED_VOCABULARY.map((e) => e.termType));
    for (const t of ["abbreviation", "phrase", "expression", "word"]) {
      expect(types).toContain(t);
    }
    for (const term of ["brb", "abeg", "wahala", "piece of cake"]) {
      expect(
        SEED_VOCABULARY.some((e) => e.term === term),
        term,
      ).toBe(true);
    }
  });
});

describe("corrector protection", () => {
  it("never corrects a registered seed word", () => {
    // heart and service were previously corrupted into hear
    // and services; registration must end that permanently.
    expect(correctConversationalTypos("my heart is full of joy")).toContain(
      "heart",
    );
    expect(correctConversationalTypos("is the engine at my service")).toContain(
      "service",
    );
    expect(
      correctConversationalTypos("the apple and banana are tasty"),
    ).toContain("apple");
  });

  it("never corrects a word learned live from conversation", () => {
    registerLearnedTerms(["kwisatz"]);
    expect(correctConversationalTypos("the kwisatz is here")).toContain(
      "kwisatz",
    );
    expect(isKnownVocabularyTerm("kwisatz")).toBe(true);
  });

  it("still corrects genuine typos of unknown tokens", () => {
    const out = correctConversationalTypos("helo there");
    expect(out).toContain("hello");
    expect(out).toContain("there");
  });
});

describe("capture", () => {
  it("extracts genuinely unknown words and skips known ones", () => {
    registerLearnedTerms([]);
    const unknown = extractUnknownTokens(
      "the kwisatz haderach is a fremen word about prophecy",
    );
    expect(unknown).toContain("kwisatz");
    expect(unknown).toContain("haderach");
    expect(unknown).toContain("fremen");
    expect(unknown).toContain("prophecy");
    // known seed words are never re-captured
    expect(unknown).not.toContain("word");
  });

  it("skips stopwords, numbers and short fragments", () => {
    registerLearnedTerms([]);
    const unknown = extractUnknownTokens("the and 123 ab xy for you");
    expect(unknown).toEqual([]);
  });

  it("wh-contractions are grammar, never vocabulary (hows incident 2026-09-13)", () => {
    // live incident: registering "hows" blocked the corrector's
    // normalization and "hows your engine doing" fell from
    // system_status (0.80) to knowledge_query (0.08). Capture
    // must skip wh-contractions and the corrector must never
    // treat one as known, even if it reaches the registry.
    expect(isWhContraction("hows")).toBe(true);
    expect(isWhContraction("whens")).toBe(true);
    expect(isWhContraction("how")).toBe(false);
    expect(isWhContraction("services")).toBe(false);
    expect(extractCandidateTokens("hows your engine doing")).not.toContain(
      "hows",
    );
    registerLearnedTerms(["hows"]);
    expect(isKnownVocabularyTerm("hows")).toBe(false);
    const fixed = correctConversationalTypos("hows your engine doing");
    expect(fixed).not.toContain("hows");
  });

  it("capture candidates keep learned words for frequency bumps", () => {
    // a word learned live is already registered, but repeated
    // usage must still count: capture candidates include it
    // while unknown-token extraction (fresh capture) skips it.
    registerLearnedTerms(["flimber"]);
    expect(extractUnknownTokens("the flimber again")).not.toContain("flimber");
    expect(extractCandidateTokens("the flimber again")).toContain("flimber");
    // seed terms are never re-captured
    expect(extractCandidateTokens("the garri and the apple")).toEqual([]);
  });
});

describe("no fake knowledge", () => {
  it("hydrates means-facts only for terms with meanings", () => {
    const facts = seedMeansFacts();
    expect(facts.length).toEqual(SEED_VOCABULARY.length);
    for (const f of facts) {
      expect(f.subject.length).toBeGreaterThan(0);
      expect(f.predicate).toEqual("means");
      expect(f.object.length).toBeGreaterThan(2);
      expect(f.provenance.source).toContain("vocabulary");
    }
    const garri = facts.find((f) => f.subject === "garri");
    expect(garri?.object).toContain("cassava");
  });
});

describe("owner teaching of meanings (self-evolving vocabulary)", () => {
  it("bare meaning-teach statements route to teaching, not gratitude", () => {
    // live incident 2026-09-13: "kwisatz means sacred weed"
    // fell to the Bayes fallback and misrouted to gratitude.
    expect(understand("kwisatz means sacred weed").intent).toBe("teaching");
    expect(understand("the word kwisatz means sacred weed").intent).toBe(
      "teaching",
    );
    expect(understand("brb is short for be right back").intent).toBe(
      "teaching",
    );
    expect(understand("shakara is another word for showing off").intent).toBe(
      "teaching",
    );
    // definition QUESTIONS are not teaching
    expect(understand("what does garri mean").intent).not.toBe("teaching");
    expect(understand("thanks a lot").intent).toBe("gratitude");
  });

  it("a meaning-teach statement writes the registry with owner-taught provenance", async () => {
    // stub db: every select returns [], upsert captures rows
    const upserts: Array<Record<string, unknown>> = [];
    const empty = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null })),
      range: () => ({
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null })),
      }),
    };
    const stub = {
      from: () => ({
        select: () => empty,
        insert: () => ({ error: null }),
        update: () => ({ eq: () => ({ error: null }) }),
        upsert: (rows: Array<Record<string, unknown>>) => {
          upserts.push(...rows);
          return { error: null };
        },
      }),
    };
    // the engine takes a raw SupabaseLike and wraps it in
    // its own SupabasePersistence — pass the stub directly.
    const engine = new ArchieNativeEngine({
      persistence: stub as unknown as ConstructorParameters<
        typeof SupabasePersistence
      >[0],
    });
    const res = await engine.generate({
      turns: [
        { role: "owner", parts: [{ text: "kwisatz means sacred weed" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    const reply =
      ((res as { parts?: Array<{ text?: string }> }).parts ?? [{}])[0].text ??
      "";
    // OWNER DIRECTIVE (2026-09-16): teaching answers are short —
    // no registry narration, no provenance footer.
    expect(reply).toContain("kwisatz means: sacred weed");
    expect(reply).toContain("Kept.");
    const vocabRow = upserts.find(
      (r) => (r as { term_key?: string }).term_key === "kwisatz",
    );
    expect(vocabRow).toBeDefined();
    expect((vocabRow as { meaning?: string }).meaning).toBe("sacred weed");
    expect((vocabRow as { source?: string }).source).toBe("owner_teach");
  });

  it("without persistence the teaching still lands in the fact store", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.generate({
      turns: [
        { role: "owner", parts: [{ text: "kwisatz means sacred weed" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    const reply =
      ((res as { parts?: Array<{ text?: string }> }).parts ?? [{}])[0].text ??
      "";
    expect(reply).toContain("Retained as your assertion");
  });
});
