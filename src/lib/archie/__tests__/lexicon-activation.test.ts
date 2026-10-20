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
