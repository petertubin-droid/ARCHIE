import { describe, expect, it } from "vitest";
import { lookupWords } from "./retrieval.ts";
import type { LexiconWordRow } from "./retrieval.ts";

// Minimal structural fake — same thenable pattern as
// curated-corpus.test.ts: the builder calls the resolve
// callback directly inside then().
const WORD_ID = "00000000-0000-0000-0000-000000000001";

function fakeClient(opts?: {
  withRpc?: boolean;
  failRpc?: boolean;
  bumpCalls?: { fn: string; ids: string[] }[];
}) {
  const word = {
    id: WORD_ID,
    canonical: "cement",
    normalized: "cement",
    spelling_variants: [],
    language: "en",
    regional_usage: null,
    pronunciation: null,
    part_of_speech: "noun",
    unit_type: null,
    inflection_metadata: {},
    frequency: null,
  } as unknown as LexiconWordRow;
  const from = (table: string) => {
    const data = table === "lexicon_words" ? [word] : [];
    const b: Record<string, unknown> = {
      select: () => b,
      in: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(
          cb ? cb({ data, error: null }) : { data, error: null },
        ),
    };
    return b;
  };
  const client: Record<string, unknown> = { from };
  if (opts?.withRpc !== false) {
    client.rpc = async (fn: string, args: { pWordIds: string[] }) => {
      if (opts?.failRpc) throw new Error("rpc down");
      opts?.bumpCalls?.push({ fn, ids: args.pWordIds });
      return { error: null };
    };
  }
  return client as never;
}

describe("lexicon frequency tracking (2026-10-19)", () => {
  it("bumps frequency via the archie_bump_lexicon_frequency RPC on a successful DB lookup", async () => {
    const calls: { fn: string; ids: string[] }[] = [];
    const results = await lookupWords(
      fakeClient({ bumpCalls: calls }),
      ["cement"],
    );
    expect(results.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe("archie_bump_lexicon_frequency");
    expect(calls[0].ids).toEqual([WORD_ID]);
  });

  it("NEVER fails a lookup when the rpc throws — statistics are fire-and-forget", async () => {
    const results = await lookupWords(fakeClient({ failRpc: true }), [
      "cement",
    ]);
    expect(results.length).toBeGreaterThan(0);
  });

  it("skips the bump for in-memory (curated) clients that expose no rpc", async () => {
    const results = await lookupWords(fakeClient({ withRpc: false }), [
      "cement",
    ]);
    expect(results.length).toBeGreaterThan(0);
  });
});
