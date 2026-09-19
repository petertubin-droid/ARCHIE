import { describe, expect, it } from "vitest";
// =========================================================
// RESEARCH SITE EXPANSION (owner upgrade 2026-09-16):
// Google Books, StackExchange and arXiv adapters — real
// documented keyless research APIs, NO AI models. All network
// stubbed; CI never touches the live web. Honest failure
// classification, site: declines, and composite fallback are
// all contract-tested.
// =========================================================

import {
  isSearchFailureNote,
  DomainAwareSearchAdapter,
  MultiSearchAdapter,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import {
  GoogleBooksAdapter,
} from "@studio-shared/archie-ai/native-engine/google-books-search.ts";
import {
  StackExchangeAdapter,
} from "@studio-shared/archie-ai/native-engine/stackexchange-search.ts";
import { ArxivAdapter } from "@studio-shared/archie-ai/native-engine/arxiv-search.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------
// Google Books adapter
// ---------------------------------------------------------
describe("GoogleBooksAdapter", () => {
  it("parses real volume results into title/url/snippet hits", async () => {
    let calledUrl = "";
    const fetchFn = ((url: string) => {
      calledUrl = url;
      return Promise.resolve(
        jsonResponse(200, {
          items: [
            {
              volumeInfo: {
                title: "Structure and Interpretation",
                subtitle: "Computer Programs",
                description: "Classic <b>CS</b> text.",
                canonicalVolumeLink: "https://books.google.com/books?id=abc",
              },
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const a = new GoogleBooksAdapter({ fetchFn });
    const res = await a.search("sicp computer programs");
    expect(res.note).toBe("search completed");
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].title).toContain("Structure and Interpretation");
    expect(res.hits[0].title).toContain("Computer Programs");
    expect(res.hits[0].url).toContain("books.google.com");
    expect(res.hits[0].snippet).toContain("Classic CS text.");
    expect(calledUrl).toContain("googleapis.com/books/v1/volumes");
    expect(calledUrl).toContain("maxResults=8");
  });

  it("reports an honest zero when the catalog has no items", async () => {
    const fetchFn = (() =>
      Promise.resolve(jsonResponse(200, { totalItems: 0 }))) as unknown as typeof fetch;
    const a = new GoogleBooksAdapter({ fetchFn });
    const res = await a.search("zzzz nonexistent query zzzz");
    expect(res.hits).toHaveLength(0);
    expect(res.note).toBe("no results found for the query");
    expect(isSearchFailureNote(res.note)).toBe(false);
  });

  it("classifies API failures as failures (never fake zero)", async () => {
    const fetchFn = (() =>
      Promise.resolve(jsonResponse(403, { error: "forbidden" }))) as unknown as typeof fetch;
    const a = new GoogleBooksAdapter({ fetchFn });
    const res = await a.search("anything");
    expect(res.note).toBe("google books api unavailable: status 403");
    expect(isSearchFailureNote(res.note)).toBe(true);
  });

  it("declines site: queries honestly", async () => {
    const a = new GoogleBooksAdapter({ fetchFn: (() => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch });
    const res = await a.search("closure site:example.com");
    expect(res.note).toContain("site-scoped search not supported");
    expect(isSearchFailureNote(res.note)).toBe(true);
  });

  it("reports network errors as unavailable", async () => {
    const fetchFn = (() =>
      Promise.reject(new Error("timeout hit"))) as unknown as typeof fetch;
    const a = new GoogleBooksAdapter({ fetchFn });
    const res = await a.search("closure");
    expect(res.note).toContain("google books api unavailable");
    expect(isSearchFailureNote(res.note)).toBe(true);
  });
});

// ---------------------------------------------------------
// StackExchange adapter
// ---------------------------------------------------------
describe("StackExchangeAdapter", () => {
  it("parses question results with excerpt or honest metadata", async () => {
    const fetchFn = (() =>
      Promise.resolve(
        jsonResponse(200, {
          items: [
            {
              title: "What is a closure in JavaScript?",
              link: "https://stackoverflow.com/questions/111102",
              score: 2100,
              answer_count: 12,
              excerpt: "A closure is a function plus its captured scope.",
            },
            {
              title: "Second question (no excerpt)",
              link: "https://stackoverflow.com/questions/999",
              score: 3,
              answer_count: 0,
            },
          ],
        }),
      )) as unknown as typeof fetch;
    const a = new StackExchangeAdapter({ fetchFn });
    const res = await a.search("what is a closure javascript");
    expect(res.note).toBe("search completed");
    expect(res.hits).toHaveLength(2);
    expect(res.hits[0].snippet).toContain("captured scope");
    expect(res.hits[1].snippet).toContain("score 3");
    expect(res.hits[1].snippet).toContain("0 answer(s)");
  });

  it("reports honest zero on empty items", async () => {
    const fetchFn = (() =>
      Promise.resolve(jsonResponse(200, { items: [] }))) as unknown as typeof fetch;
    const a = new StackExchangeAdapter({ fetchFn });
    const res = await a.search("zzz");
    expect(res.note).toBe("no results found for the query");
    expect(isSearchFailureNote(res.note)).toBe(false);
  });

  it("classifies API failure notes as failures", async () => {
    const fetchFn = (() =>
      Promise.resolve(jsonResponse(503, {}))) as unknown as typeof fetch;
    const a = new StackExchangeAdapter({ fetchFn });
    const res = await a.search("closure");
    expect(res.note).toBe("stack exchange api unavailable: status 503");
    expect(isSearchFailureNote(res.note)).toBe(true);
  });

  it("declines site: queries honestly", async () => {
    const a = new StackExchangeAdapter({ fetchFn: (() => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch });
    const res = await a.search("closure site:stackoverflow.com");
    expect(res.note).toContain("site-scoped search not supported");
  });
});

// ---------------------------------------------------------
// arXiv adapter
// ---------------------------------------------------------
describe("ArxivAdapter", () => {
  it("parses Atom XML entries into paper hits", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Attention Is All You Need</title>
<id>http://arxiv.org/abs/1706.03762v5</id>
<summary>We propose the Transformer architecture &amp; show it
works.</summary></entry>
<entry><title>Second Paper &lt;with entities&gt;</title>
<id>http://arxiv.org/abs/1901.00001v1</id>
<summary>Summary two.</summary></entry>
</feed>`;
    const fetchFn = (() =>
      Promise.resolve(new Response(xml, { status: 200 }))) as unknown as typeof fetch;
    const a = new ArxivAdapter({ fetchFn });
    const res = await a.search("transformer architecture");
    expect(res.note).toBe("search completed");
    expect(res.hits).toHaveLength(2);
    expect(res.hits[0].title).toBe("Attention Is All You Need");
    expect(res.hits[0].url).toContain("arxiv.org/abs/1706.03762");
    expect(res.hits[0].snippet).toContain("Transformer architecture & show it");
    expect(res.hits[1].title).toBe("Second Paper <with entities>");
  });

  it("reports honest zero on an empty feed", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
    const fetchFn = (() =>
      Promise.resolve(new Response(xml, { status: 200 }))) as unknown as typeof fetch;
    const a = new ArxivAdapter({ fetchFn });
    const res = await a.search("zzz");
    expect(res.note).toBe("no results found for the query");
    expect(isSearchFailureNote(res.note)).toBe(false);
  });

  it("classifies API failure notes as failures", async () => {
    const fetchFn = (() =>
      Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
    const a = new ArxivAdapter({ fetchFn });
    const res = await a.search("closure");
    expect(res.note).toBe("arxiv api unavailable: status 500");
    expect(isSearchFailureNote(res.note)).toBe(true);
  });

  it("declines site: queries honestly", async () => {
    const a = new ArxivAdapter({ fetchFn: (() => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch });
    const res = await a.search("closure site:arxiv.org");
    expect(res.note).toContain("site-scoped search not supported");
  });
});

// ---------------------------------------------------------
// Composite behavior with the new sites in the chain
// ---------------------------------------------------------
describe("MultiSearchAdapter — new research sites chain", () => {
  const failing = {
    id: "blocked",
    search: async () => ({
      hits: [],
      note: "search endpoint refused this client: anomaly protection (status 202)",
    }),
  };

  it("falls through a blocked adapter to Google Books hits", async () => {
    const google = new GoogleBooksAdapter({
      fetchFn: (() =>
        Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                volumeInfo: {
                  title: "Result",
                  canonicalVolumeLink: "https://books.google.com/books?id=x",
                },
              },
            ],
          }),
        )) as unknown as typeof fetch,
    });
    const m = new MultiSearchAdapter([failing, google]);
    const res = await m.search("test query");
    expect(res.hits).toHaveLength(1);
    expect(res.note).toContain("google-books-api");
  });

  it("widens through a genuine zero to a later source (WIDENING COMPOSITE 2026-09-16)", async () => {
    // A Wikipedia-shaped genuine zero must not stop the chain —
    // StackExchange answers programming questions Wikipedia
    // never covers.
    const google = new GoogleBooksAdapter({
      fetchFn: (() =>
        Promise.resolve(jsonResponse(200, { totalItems: 0 }))) as unknown as typeof fetch,
    });
    const se = new StackExchangeAdapter({
      fetchFn: (() =>
        Promise.resolve(
          jsonResponse(200, {
            items: [{ title: "How to center a div", link: "https://stackoverflow.com/q/1", score: 100, answer_count: 5 }],
          }),
        )) as unknown as typeof fetch,
    });
    const m = new MultiSearchAdapter([google, se]);
    const res = await m.search("test query");
    expect(res.hits).toHaveLength(1);
    expect(res.note).toContain("stackexchange-api");
  });

  it("reports the FIRST genuine zero when every executing source comes up empty (no fake success)", async () => {
    const google = new GoogleBooksAdapter({
      fetchFn: (() =>
        Promise.resolve(jsonResponse(200, { totalItems: 0 }))) as unknown as typeof fetch,
    });
    const se = new StackExchangeAdapter({
      fetchFn: (() =>
        Promise.resolve(jsonResponse(200, { items: [] }))) as unknown as typeof fetch,
    });
    const m = new MultiSearchAdapter([google, se]);
    const res = await m.search("test query");
    expect(res.hits).toHaveLength(0);
    expect(res.note).toBe("no results found for the query");
    expect(isSearchFailureNote(res.note)).toBe(false);
  });

  it("asks StackExchange BEFORE the encyclopedia for a programming question (domain-aware chain)", async () => {
    // Recording stubs with the REAL adapter ids — the
    // domain-aware composite reorders by id, and a stub that
    // is never consulted must never execute.
    const order: string[] = [];
    const mk = (id: string, hits: number) =>
      ({
        id,
        search: async () => {
          order.push(id);
          return {
            hits: hits > 0
              ? [{ url: `https://${id}.example/1`, title: `${id} hit`, snippet: "s" }]
              : [],
            note: hits > 0 ? "found" : "no results found for the query",
          };
        },
      }) as never;
    const chain = new DomainAwareSearchAdapter([
      mk("duckduckgo-lite", 0), // blocked on the edge — failure note path
      mk("wikipedia-api", 1),
      mk("stackexchange-api", 1),
    ]);
    // DDG fails hard (blocked) — genuine failure note, chain
    // continues. Programming domain: SE is promoted ahead of
    // Wikipedia, so SE wins and Wikipedia is never consulted.
    order.length = 0;
    const res = await chain.search("how to center a div with css");
    expect(res.note).toContain("stackexchange-api");
    expect(order).toEqual(["duckduckgo-lite", "stackexchange-api"]);
  });

  it("keeps the general chain for non-programming questions", async () => {
    const order: string[] = [];
    const mk = (id: string, hits: number) =>
      ({
        id,
        search: async () => {
          order.push(id);
          return {
            hits: hits > 0
              ? [{ url: `https://${id}.example/1`, title: `${id} hit`, snippet: "s" }]
              : [],
            note: hits > 0 ? "found" : "no results found for the query",
          };
        },
      }) as never;
    const chain = new DomainAwareSearchAdapter([
      mk("duckduckgo-lite", 0),
      mk("wikipedia-api", 1),
      mk("stackexchange-api", 1),
    ]);
    const res = await chain.search("contrastive divergence in restricted boltzmann machines");
    expect(res.note).toContain("wikipedia-api");
    expect(order).toEqual(["duckduckgo-lite", "wikipedia-api"]);
  });

  it("routes site-scoped queries through the FULL general chain (honest declines)", async () => {
    const order: string[] = [];
    const mk = (id: string, note: string) =>
      ({
        id,
        search: async () => {
          order.push(id);
          return { hits: [], note };
        },
      }) as never;
    const chain = new DomainAwareSearchAdapter([
      mk("duckduckgo-lite", "search endpoint refused this client"),
      mk("wikipedia-api", "site-scoped search not supported by this adapter — declined"),
      mk("stackexchange-api", "site-scoped search not supported by this adapter — declined"),
    ]);
    const res = await chain.search("css grid layout site:developer.mozilla.org");
    expect(order).toEqual([
      "duckduckgo-lite",
      "wikipedia-api",
      "stackexchange-api",
    ]);
    expect(res.note).toContain("network unavailable after all adapters");
  });
});
