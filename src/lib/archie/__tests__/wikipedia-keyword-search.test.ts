// BATCH 44 regression: the Wikipedia adapter must search on
// content words and drop topically drifted hits. Derived
// from the live 2026-10-21 probe where "what is a good
// whetstone for kitchen knives" produced "Straight razor"
// and "Filipino cuisine" as candidate knowledge.
import { describe, expect, it } from "vitest";
import { WikipediaSearchAdapter } from "@studio-shared/archie-ai/native-engine/wikipedia-search.ts";

function wikiResponse(titles: string[]) {
  return new Response(
    JSON.stringify({
      query: {
        search: titles.map((t) => ({
          title: t,
          snippet:
            t === "Sharpening stone"
              ? "how to use a whetstone to sharpen a kitchen knife"
              : `an article about ${t.toLowerCase()} for testing`,
        })),
      },
    }),
    { status: 200 },
  );
}

function adapterWith(
  onResponse: (searchTerm: string | null) => Response,
): { adapter: WikipediaSearchAdapter; seen: { term: string | null } } {
  const seen = { term: null as string | null };
  const fetchFn = ((url: string | Request) => {
    const u = String(url);
    const m = u.match(/srsearch=([^&]+)/);
    seen.term = m ? decodeURIComponent(m[1]) : null;
    return Promise.resolve(onResponse(seen.term));
  }) as unknown as typeof fetch;
  return { adapter: new WikipediaSearchAdapter({ fetchFn }), seen };
}

describe("WikipediaSearchAdapter — keyword query and topical gate", () => {
  it("searches on content words, not the raw question", async () => {
    const { adapter, seen } = adapterWith(() =>
      wikiResponse(["Sharpening stone"]),
    );
    const res = await adapter.search(
      "what is a good whetstone for kitchen knives",
    );
    expect(seen.term).toBe("whetstone kitchen knife");
    expect(res.note).toBe("search completed");
    expect(res.hits[0].title).toBe("Sharpening stone");
  });

  it("keeps only topically matching hits", async () => {
    const { adapter } = adapterWith(() =>
      wikiResponse(["Straight razor", "Butcher knife", "Filipino cuisine"]),
    );
    const res = await adapter.search(
      "what is a good whetstone for kitchen knives",
    );
    expect(res.hits.map((h) => h.title)).toEqual(["Butcher knife"]);
  });

  it("reports an honest genuine zero when every hit drifts", async () => {
    const { adapter } = adapterWith(() =>
      wikiResponse(["Straight razor", "Filipino cuisine"]),
    );
    const res = await adapter.search(
      "what is a good whetstone for kitchen knives",
    );
    expect(res.hits).toEqual([]);
    expect(res.note).toBe(
      "no topically matching results found for the query",
    );
  });

  it("falls back to the raw query when no content words survive", async () => {
    const { adapter, seen } = adapterWith(() => wikiResponse(["It"]));
    await adapter.search("what is it");
    expect(seen.term).toBe("what is it");
  });

  it("still declines site-scoped queries honestly", async () => {
    const { adapter } = adapterWith(() => {
      throw new Error("must not fetch");
    });
    const res = await adapter.search("site:example.com knives");
    expect(res.hits).toEqual([]);
    expect(res.note).toContain("site-scoped search not supported");
  });
});
