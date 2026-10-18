// =========================================================
// ARCHIE CURATED LEXICON CORPUS & PRUNING TESTS (§LEXICON)
//
// Tests for code-declared curated lexicon corpus, in-memory
// fallback, zero-database LexiconClient, and disambiguation.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  CURATED_ENTRIES,
  CURATED_LEXICON_SOURCE,
  lookupCuratedWord,
  lookupCuratedWords,
  selectCuratedContextualSenses,
  createCuratedLexiconClient,
} from "./curated-corpus.ts";
import {
  lookupWords,
  lookupWord,
  selectContextualSenses,
  lexicalGroundTruth,
} from "./retrieval.ts";

describe("ARCHIE Curated Lexicon Corpus — In-Memory Engine", () => {
  it("declares essential curated entries with verified senses and domains", () => {
    expect(CURATED_ENTRIES.length).toBeGreaterThan(15);
    const runEntry = CURATED_ENTRIES.find((e) => e.lemma === "run" && e.pos === "verb");
    expect(runEntry).toBeDefined();
    expect(runEntry!.senses.length).toBeGreaterThanOrEqual(3);

    // Verify domains are clean and categorized
    const domains = new Set(CURATED_ENTRIES.flatMap((e) => e.senses.map((s) => s.domain)));
    expect(domains.has("computing.systems")).toBe(true);
    expect(domains.has("construction.structural")).toBe(true);
    expect(domains.has("finance.banking")).toBe(true);
  });

  it("looks up individual words and inflections without database access", () => {
    const runWord = lookupCuratedWord("run");
    expect(runWord).not.toBeNull();
    expect(runWord!.word.canonical).toBe("run");
    expect(runWord!.senses.length).toBeGreaterThanOrEqual(2);

    // Inflection / variant lookup
    const ranWord = lookupCuratedWord("ran");
    expect(ranWord).not.toBeNull();
    expect(ranWord!.word.canonical).toBe("run");

    // Non-existent word returns null honestly
    const fakeWord = lookupCuratedWord("nonexistentlexicaltokenxyz");
    expect(fakeWord).toBeNull();
  });

  it("looks up batches of words deterministically", () => {
    const results = lookupCuratedWords(["bank", "rebar", "token"]);
    expect(results.length).toBe(3);
    const lemmas = results.map((r) => r.word.canonical);
    expect(lemmas).toContain("bank");
    expect(lemmas).toContain("rebar");
    expect(lemmas).toContain("token");
  });

  it("disambiguates polysemous words contextually in memory", () => {
    // 1. "run" in software context
    const compResult = selectCuratedContextualSenses("run", "please run the unit tests program");
    expect(compResult.word).not.toBeNull();
    expect(compResult.selection.ambiguous).toBe(false);
    expect(compResult.selection.selected?.sense.domain).toBe("computing.systems");

    // 2. "run" in athletic context
    const motionResult = selectCuratedContextualSenses("run", "he will run a marathon race on foot");
    expect(motionResult.selection.ambiguous).toBe(false);
    expect(motionResult.selection.selected?.sense.domain).toBe("general.motion");

    // 3. "bank" in financial context
    const finResult = selectCuratedContextualSenses("bank", "deposit money in the commercial bank account");
    expect(finResult.selection.ambiguous).toBe(false);
    expect(finResult.selection.selected?.sense.domain).toBe("finance.banking");

    // 4. "bank" in water/river context
    const waterResult = selectCuratedContextualSenses("bank", "sit on the river bank beside the canal water");
    expect(waterResult.selection.ambiguous).toBe(false);
    expect(waterResult.selection.selected?.sense.domain).toBe("geography.topography");

    // 5. "rebar" is monosemous structural
    const rebarResult = selectCuratedContextualSenses("rebar", "reinforce the foundation slab");
    expect(rebarResult.selection.ambiguous).toBe(false);
    expect(rebarResult.selection.selected?.sense.domain).toBe("construction.reinforcement");
  });

  it("preserves ambiguity honestly when context provides no discriminating evidence", () => {
    // Ambiguous sentence with no domain clues
    const ambResult = selectCuratedContextualSenses("bank", "I saw it over there yesterday");
    expect(ambResult.selection.ambiguous).toBe(true);
    expect(ambResult.selection.selected).toBeNull();
    expect(ambResult.selection.note).toContain("ambiguous");
  });
});

describe("ARCHIE Curated Lexicon Client — Zero-Database Operation", () => {
  it("implements LexiconClient and serves retrieval queries directly from memory", async () => {
    const client = createCuratedLexiconClient();

    // lookupWords via retrieval API over curated client
    const pairs = await lookupWords(client, ["run", "rebar"]);
    expect(pairs.length).toBeGreaterThanOrEqual(2);

    // selectContextualSenses over curated client
    const selection = await selectContextualSenses(
      client,
      "run",
      "execute the program software script",
    );
    expect(selection.word).not.toBeNull();
    expect(selection.selection.selected).not.toBeNull();
    expect(selection.selection.selected?.sense.domain).toBe("computing.systems");
  });

  it("runs full lexicalGroundTruth context builder using CuratedLexiconClient", async () => {
    const client = createCuratedLexiconClient();

    const gt = await lexicalGroundTruth(client, "I need to run the software program");
    expect(gt.wordsExamined).toBeGreaterThan(0);
    expect(gt.disambiguated).toContain("run");
    expect(gt.block).toContain("Lexical ground truth from ARCHIE's verified lexicon");
    expect(gt.block).toContain("execute or operate software");
  });

  it("supports fallbackToCorpus when database client returns empty records", async () => {
    // Fake empty DB client
    const emptyDbClient = {
      from: (_table: string) => {
        const b: Record<string, unknown> = {
          select: () => b,
          in: () => b,
          eq: () => b,
          order: () => b,
          limit: () => b,
          then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve(cb ? cb({ data: [], error: null }) : { data: [], error: null }),
        };
        return b;
      },
    };

    // Without fallback, empty DB client returns [] (honoring existing degradation contract)
    const normalLookup = await lookupWords(emptyDbClient, ["run"]);
    expect(normalLookup).toEqual([]);

    // With fallbackToCorpus, returns curated definitions
    const fallbackLookup = await lookupWords(emptyDbClient, ["run"], {
      fallbackToCorpus: true,
    });
    expect(fallbackLookup.length).toBeGreaterThan(0);
    expect(fallbackLookup[0].word.canonical).toBe("run");
  });
});
