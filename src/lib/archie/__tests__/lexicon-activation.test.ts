import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import {
  seedVocabularyEntry,
  storeLexiconSense,
} from "@studio-shared/archie-ai/knowledge/vocabulary.ts";
import type { MeaningResearchReport } from "@studio-shared/archie-ai/knowledge/vocabulary-research.ts";

/** UNIVERSAL LEXICON ENGINE ACTIVATION (owner directive
 *  2026-10-20): the 87k-word verified lexicon and the 1600+
 *  seed foundation answer definitions BEFORE external
 *  research — instant, sourced, honest. Authority: stored
 *  means-facts (owner-taught) > seed > lexicon > research. */

function replyOf(res: unknown): string {
  const parts = (res as { parts?: Array<{ text?: string }> }).parts ?? [];
  return parts.map((p) => p.text ?? "").join(" ");
}

const lexiconSense = {
  term: "momentum",
  partOfSpeech: "noun",
  meaning:
    "the quantity of motion of a moving body, measured as a product of its mass and velocity",
  domain: "physics",
};

describe("seed vocabulary activation", () => {
  it("finds exact seed entries and rejects unknowns", () => {
    const japa = seedVocabularyEntry("japa");
    expect(japa?.term).toBe("japa");
    expect(japa?.meaning?.length ?? 0).toBeGreaterThan(3);
    expect(seedVocabularyEntry("")).toBeNull();
    expect(seedVocabularyEntry("zzzzqqqqzz")).toBeNull();
  });

  it("answers a definition question from the seed foundation in memory", async () => {
    const engine = new ArchieNativeEngine({ persistence: null });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what does japa mean" }] }],
      tools: [],
      systemInstruction: "",
    });
    const reply = replyOf(res);
    expect(reply).toContain("japa means:");
    // plain answer — no provenance narration (owner directive 2026-09-16)
    expect(reply).not.toContain("research");
    expect(reply).not.toContain("%");
  });

  it("answers a bare-noun question from the seed foundation", async () => {
    const engine = new ArchieNativeEngine({ persistence: null });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what is japa" }] }],
      tools: [],
      systemInstruction: "",
    });
    const reply = replyOf(res);
    expect(reply).toContain("japa means:");
  });
});

describe("lexicon-first definition answers", () => {
  it("answers from the lexicon before any external research", async () => {
    let researchCalled = false;
    let lookupTerms: string[] = [];
    const engine = new ArchieNativeEngine({
      persistence: null,
      lexiconLookup: async (term) => {
        lookupTerms.push(term);
        return term === "momentum" ? { ...lexiconSense, term } : null;
      },
      meaningResearch: async () => {
        researchCalled = true;
        return {
          term: "momentum",
          meaning: "researched meaning",
          domains: ["dictionaryapi.dev"],
          confidence: 0.6,
          results: [],
        } as unknown as MeaningResearchReport;
      },
    });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what does momentum mean" }] }],
      tools: [],
      systemInstruction: "",
    });
    const reply = replyOf(res);
    expect(reply).toContain("momentum means:");
    expect(reply).toContain("quantity of motion");
    expect(researchCalled).toBe(false);
    expect(lookupTerms).toContain("momentum");
  });

  it("answers bare-noun questions from the lexicon on the knowledge path", async () => {
    let researchCalled = false;
    const engine = new ArchieNativeEngine({
      persistence: null,
      lexiconLookup: async (term) =>
        term === "momentum" ? { ...lexiconSense, term } : null,
      meaningResearch: async () => {
        researchCalled = true;
        return {
          term: "momentum",
          meaning: "researched meaning",
          domains: [],
          confidence: 0.6,
          results: [],
        } as unknown as MeaningResearchReport;
      },
    });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what is momentum?" }] }],
      tools: [],
      systemInstruction: "",
    });
    const reply = replyOf(res);
    expect(reply).toContain("momentum means:");
    expect(reply).toContain("quantity of motion");
    expect(researchCalled).toBe(false);
  });

  it("falls through to auto-research on a lexicon miss", async () => {
    const engine = new ArchieNativeEngine({
      persistence: null,
      lexiconLookup: async () => null,
      meaningResearch: async () =>
        ({
          term: "flimber",
          meaning: "a fabricated research hit",
          domains: ["dictionaryapi.dev"],
          confidence: 0.6,
          results: [],
        }) as unknown as MeaningResearchReport,
    });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what does flimber mean" }] }],
      tools: [],
      systemInstruction: "",
    });
    // no persistence: the honest "could not save" research reply
    expect(replyOf(res)).toContain("flimber");
  });

  it("never crashes when the lexicon lookup throws — research still answers", async () => {
    const engine = new ArchieNativeEngine({
      persistence: null,
      lexiconLookup: async () => {
        throw new Error("lexicon down");
      },
      meaningResearch: async () =>
        ({
          term: "flimber",
          meaning: "a fabricated research hit",
          domains: ["dictionaryapi.dev"],
          confidence: 0.6,
          results: [],
        }) as unknown as MeaningResearchReport,
    });
    const res = await engine.generate({
      turns: [{ role: "owner", parts: [{ text: "what does flimber mean" }] }],
      tools: [],
      systemInstruction: "",
    });
    expect(replyOf(res)).toContain("flimber");
  });
});

describe("first-writer-wins lexicon storage", () => {
  it("stores a verified lexicon sense with ignoreDuplicates so nothing is overwritten", async () => {
    const upsertCalls: Array<{
      rows: Array<Record<string, unknown>>;
      opts: Record<string, unknown>;
    }> = [];
    const db = {
      from: () => ({
        upsert: (
          rows: Array<Record<string, unknown>>,
          opts: Record<string, unknown>,
        ) => {
          upsertCalls.push({ rows, opts });
          return { error: null };
        },
      }),
    };
    const ok = await storeLexiconSense(
      db as never,
      "momentum",
      "quantity of motion",
      "physics",
    );
    expect(ok).toBe(true);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].opts.onConflict).toBe("term_key");
    expect(upsertCalls[0].opts.ignoreDuplicates).toBe(true);
    expect(upsertCalls[0].rows[0].source).toBe("lexicon");
    expect(upsertCalls[0].rows[0].meaning).toContain("quantity of motion");
    expect(String(upsertCalls[0].rows[0].provenance)).toContain(
      "verified lexicon sense",
    );
  });

  it("reports failure honestly when the write errors", async () => {
    const db = {
      from: () => ({
        upsert: () => ({ error: { message: "boom" } }),
      }),
    };
    const ok = await storeLexiconSense(
      db as never,
      "momentum",
      "quantity of motion",
      null,
    );
    expect(ok).toBe(false);
  });
});

/** FORENSIC AUDIT 2026-10-20 — lexicon decoupled from
 *  personalization consent (the live "momentum" defect):
 *  a consent-withheld request kernel (persistence null)
 *  with the lexicon db wired still answers from the
 *  verified lexicon, never web research. */
describe("lexicon decoupled from persistence consent", () => {
  it("request kernel with null persistence + lexicon db serves the lexicon sense", async () => {
    const { createRequestCognitiveEngine } = await import(
      "@studio-shared/archie-ai/cognitive/kernel.ts"
    );
    const wordRow = {
      id: "w-1",
      canonical: "momentum",
      normalized: "momentum",
      spelling_variants: [],
      language: "en",
      regional_usage: null,
      pronunciation: null,
      part_of_speech: "noun",
      unit_type: "",
      inflection_metadata: {},
      frequency: 5,
    };
    const senseRow = {
      id: "s-1",
      word_id: "w-1",
      source_id: "src-1",
      external_id: "x-1",
      synset_key: "k-1",
      definition: "the product of a body's mass and its velocity",
      usage_examples: [],
      domain: "physics",
      register: null,
      region: null,
      grammatical: {},
      confidence: 0.9,
      knowledge_status: "VERIFIED",
      version: 1,
    };
    const chain = (rows: unknown[]) => ({
      select: () => chain(rows),
      in: () => chain(rows),
      eq: () => chain(rows),
      order: () => chain(rows),
      limit: () => Promise.resolve({ data: rows, error: null }),
    });
    let call = 0;
    const lexiconStub = {
      from: () => {
        call += 1;
        return chain(call === 1 ? [wordRow] : [senseRow]);
      },
    } as never;
    const kernel = createRequestCognitiveEngine(
      null,
      "conv-lexicon-consent-false",
      lexiconStub,
    );
    const res = await kernel.generate({
      turns: [{ role: "owner", parts: [{ text: "what is momentum" }] }],
      tools: [],
      systemInstruction: "",
      conversationId: "conv-lexicon-consent-false",
    });
    const reply = replyOf(res);
    expect(reply).toContain("momentum");
    expect(reply).toContain("product of");
    expect(reply).not.toContain("research");
  }, 20000);

  it("null persistence and NO lexicon db stays honest (no lexicon)", async () => {
    const { createRequestCognitiveEngine } = await import(
      "@studio-shared/archie-ai/cognitive/kernel.ts"
    );
    const kernel = createRequestCognitiveEngine(null, "conv-lexicon-off");
    const res = await kernel.generate({
      turns: [{ role: "owner", parts: [{ text: "what is zzzzqqqqzz" }] }],
      tools: [],
      systemInstruction: "",
      conversationId: "conv-lexicon-off",
    });
    expect(replyOf(res)).not.toContain("zzzzqqqqzz means:");
  }, 20000);
});

/** FORENSIC AUDIT 2026-10-20 — honest tool-surface disclosure:
 *  the local system_status fallback states whether any tool
 *  surface was declared, so a dead declaration is visible
 *  from the surface instead of masquerading as health. */
describe("system_status fallback observability", () => {
  it("fallback without declared tools says so honestly", async () => {
    const engine = new ArchieNativeEngine({ persistence: null });
    const res = (await engine.converse("system status", [], "", {
      conversationId: "obs-none",
    })) as unknown as { responseText?: string };
    const reply = res.responseText ?? "";
    expect(reply).toContain("No tool surface was declared for this conversation.");
  });

  it("fallback with a declared (non-frelux) surface names it", async () => {
    const engine = new ArchieNativeEngine({ persistence: null });
    engine.noteDeclaredTools(["vocabulary_lookup"], "obs-some");
    const res = (await engine.converse("system status", [], "", {
      conversationId: "obs-some",
    })) as unknown as { responseText?: string };
    const reply = res.responseText ?? "";
    expect(reply).toContain("Declared tool surface: vocabulary_lookup.");
  });
});
