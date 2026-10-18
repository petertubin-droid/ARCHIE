import { describe, expect, it } from "vitest";
import {
  GeminiResearchAdapter,
  type GeminiResearchAdapterOptions,
} from "@studio-shared/archie-ai/native-engine/gemini-research.ts";
import { isSearchFailureNote } from "@studio-shared/archie-ai/native-engine/webresearch.ts";

function res(text: string, status = 200): Response {
  return new Response(text, { status });
}

function geminiBody(answer: string): string {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: answer }] } }],
  });
}

function mk(opts: GeminiResearchAdapterOptions = {}): GeminiResearchAdapter {
  return new GeminiResearchAdapter(opts);
}

describe("Gemini learning source (owner directive 2026-10-18)", () => {
  it("has the gemini adapter id", () => {
    expect(mk().id).toBe("gemini-knowledge");
  });

  it("no key configured is an HONEST FAILURE, never a fake zero", async () => {
    const a = mk({ apiKey: undefined, fetchFn: (() => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch });
    const out = await a.search("what is a femto slab");
    expect(out.hits).toHaveLength(0);
    expect(out.note).toContain("no key configured");
    expect(isSearchFailureNote(out.note)).toBe(true);
  });

  it("an answer becomes ONE hit with named Gemini provenance", async () => {
    let calledUrl = "";
    const a = mk({
      apiKey: "test-key",
      fetchFn: ((url: string) => {
        calledUrl = url;
        return Promise.resolve(res(geminiBody(
          "A femto slab is a thin suspended concrete floor element.",
        )));
      }) as unknown as typeof fetch,
    });
    const out = await a.search("what is a femto slab");
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].title).toContain("Gemini knowledge:");
    expect(out.hits[0].snippet).toContain("femto slab");
    expect(out.hits[0].domain).toBe("generativelanguage.googleapis.com");
    // the key rides the query string, model in the URL
    expect(calledUrl).toContain("gemini-2.0-flash");
    expect(calledUrl).toContain("key=test-key");
    expect(out.note).toContain("candidate, not validated");
  });

  it("a network/timeout failure is a failure note (falls through)", async () => {
    const a = mk({
      apiKey: "test-key",
      fetchFn: (() =>
        Promise.reject(new DOMException("timed out", "TimeoutError"))) as unknown as typeof fetch,
    });
    const out = await a.search("test");
    expect(out.hits).toHaveLength(0);
    expect(isSearchFailureNote(out.note)).toBe(true);
    expect(out.note).toContain("gemini api unavailable");
  });

  it("an http error is a failure note", async () => {
    const a = mk({
      apiKey: "test-key",
      fetchFn: (() => Promise.resolve(res("quota exceeded", 429))) as unknown as typeof fetch,
    });
    const out = await a.search("test");
    expect(out.hits).toHaveLength(0);
    expect(isSearchFailureNote(out.note)).toBe(true);
    expect(out.note).toContain("http 429");
  });

  it("an honest model refusal is a GENUINE zero, not a failure", async () => {
    const a = mk({
      apiKey: "test-key",
      fetchFn: (() => Promise.resolve(res(geminiBody("NO RELIABLE ANSWER")))) as unknown as typeof fetch,
    });
    const out = await a.search("who will win the 2030 election");
    expect(out.hits).toHaveLength(0);
    expect(isSearchFailureNote(out.note)).toBe(false);
    expect(out.note).toContain("no answer from gemini");
  });

  it("an empty model response is a failure (never fabricated as zero)", async () => {
    const a = mk({
      apiKey: "test-key",
      fetchFn: (() => Promise.resolve(res(geminiBody("  ")))) as unknown as typeof fetch,
    });
    const out = await a.search("test");
    expect(out.hits).toHaveLength(0);
    expect(isSearchFailureNote(out.note)).toBe(true);
  });
});
