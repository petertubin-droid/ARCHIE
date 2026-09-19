import { describe, expect, it } from "vitest";
// =========================================================
// REAL PAGE FETCHING (audit Phase 2.2): robots.txt
// compliance, hard timeouts, size caps, content extraction,
// and the research pipeline's deepening — fetched page
// content agreeing across independent domains raises the
// candidate confidence cap; every failure is honest, never
// silent. All network is stubbed — CI never touches the
// live web.
// =========================================================

import {
  PageFetcher,
  extractReadableText,
  parseRobots,
  robotsPermits,
} from "@studio-shared/archie-ai/native-engine/page-fetch.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  ResearchAdapter,
  ResearchHit,
  ResearchPipeline,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import { WebSourceRegistry } from "@studio-shared/archie-ai/native-engine/web-sources.ts";

// ---------------------------------------------------------
// robots.txt parsing
// ---------------------------------------------------------
describe("parseRobots", () => {
  it("reads the User-agent: * group and ignores other agents' rules", () => {
    const rules = parseRobots(
      [
        "User-agent: Googlebot",
        "Disallow: /private",
        "",
        "User-agent: *",
        "Disallow: /admin",
        "Disallow: /tmp/",
        "Allow: /tmp/public",
        "",
        "User-agent: bingbot",
        "Disallow: /hidden",
      ].join("\n"),
    );
    expect(rules.disallow).toEqual(["/admin", "/tmp/"]);
    expect(rules.allow).toEqual(["/tmp/public"]);
  });

  it("an empty star group (empty Disallow) means unrestricted", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n");
    expect(rules.disallow).toEqual([]);
  });

  it("robotsPermits: longest-prefix match, Allow can override Disallow", () => {
    const rules = { disallow: ["/tmp/"], allow: ["/tmp/public"] };
    expect(robotsPermits("/tmp/public/x", rules)).toBe(true);
    expect(robotsPermits("/tmp/private/x", rules)).toBe(false);
    expect(robotsPermits("/other", rules)).toBe(true);
  });
});

// ---------------------------------------------------------
// content extraction
// ---------------------------------------------------------
describe("extractReadableText", () => {
  it("removes script/style/chrome and decodes entities", () => {
    const html = [
      "<html><head><title>T</title><style>.a{color:red}</style></head>",
      "<body><nav>menu junk</nav><script>var x = 1;</script>",
      "<p>Compressive strength of concrete &amp; curing&nbsp;time</p>",
      "<!-- a comment -->",
      "</body></html>",
    ].join("");
    const text = extractReadableText(html);
    expect(text).toContain("Compressive strength of concrete & curing time");
    expect(text).not.toMatch(/var x|color:red|menu junk|a comment/);
  });
});

// ---------------------------------------------------------
// PageFetcher — honest outcomes, robots, timeout, size
// ---------------------------------------------------------
/** Route a stubbed fetchFn: robots.txt requests resolve from
 *  the map; everything else falls through to the page
 *  handler. */
function stubFetch(
  robotsBodies: Record<string, string | (() => Response)>,
  pageHandler: (url: string) => Response | Promise<Response>,
): typeof fetch {
  return (async (input: unknown, _init?: unknown) => {
    const url = String(input instanceof URL ? input : input);
    const robotsMatch = /^https?:\/\/[^/]+\/robots\.txt$/.exec(url);
    if (robotsMatch) {
      const body = robotsBodies[url];
      if (typeof body === "function") return body();
      if (body === undefined) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response(body, { status: 200 });
    }
    return pageHandler(url);
  }) as unknown as typeof fetch;
}

describe("PageFetcher", () => {
  it("does NOT fetch a robots-disallowed path — the refusal is in the note", async () => {
    const fetcher = new PageFetcher({
      fetchFn: stubFetch(
        {
          "https://example.com/robots.txt":
            "User-agent: *\nDisallow: /private/\n",
        },
        () => {
          throw new Error("page fetch must not happen");
        },
      ),
    });
    const result = await fetcher.fetch("https://example.com/private/doc");
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/robots\.txt disallows/);
  });

  it("reports a timeout honestly, never a fake extraction", async () => {
    const fetcher = new PageFetcher({
      timeoutMs: 30,
      fetchFn: (async (_input: unknown, init: { signal: AbortSignal }) => {
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }) as unknown as typeof fetch,
    });
    const result = await fetcher.fetch("https://slow.example.com/page");
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/timeout after 30ms/);
    expect(result.content).toBe("");
  });

  it("declines an oversized response before reading it", async () => {
    const fetcher = new PageFetcher({
      maxBytes: 1000,
      fetchFn: stubFetch({}, () => {
        throw new Error(
          "must not be reached — robots allow-all, then size guard",
        );
      }),
    });
    // robots fetch is stubbed; the page handler must serve the
    // oversized header — override after robots: use a raw fn.
    const fn = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response("", {
        status: 200,
        headers: { "content-length": "999999", "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;
    const result = await new PageFetcher({ maxBytes: 1000, fetchFn: fn }).fetch(
      "https://big.example.com/page",
    );
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/over the 1000 cap/);
    expect(fetcher).toBeTruthy();
  });

  it("extracts readable content from a real HTML page", async () => {
    const fn = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response(
        "<html><head><title>Curing Guide</title></head><body>" +
          "<script>bad()</script><p>Concrete cures properly over 28 days with moisture control, keeping the surface damp so the cement hydration reaction continues and the slab reaches its specified design strength.</p></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    }) as unknown as typeof fetch;
    const result = await new PageFetcher({ fetchFn: fn }).fetch(
      "https://guide.example.com/curing",
    );
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Concrete cures properly over 28 days");
    expect(result.content).not.toContain("bad()");
    expect(result.title).toBe("Curing Guide");
    expect(result.note).toMatch(/robots\.txt consulted/);
  });

  it("refuses non-text content types honestly", async () => {
    const fn = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response("%PDF-1.4", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    }) as unknown as typeof fetch;
    const result = await new PageFetcher({ fetchFn: fn }).fetch(
      "https://example.com/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.note).toMatch(/not readable text/);
  });
});

// ---------------------------------------------------------
// Pipeline deepening — content agreement raises the cap
// ---------------------------------------------------------
class ScriptedAdapter implements ResearchAdapter {
  readonly id = "scripted";
  queries: string[] = [];
  constructor(
    private run: (q: string) => { hits: ResearchHit[]; note: string },
  ) {}
  async search(query: string): Promise<{ hits: ResearchHit[]; note: string }> {
    this.queries.push(query);
    return this.run(query);
  }
}

describe("research pipeline page deepening", () => {
  const AGREEING_BODY = (domain: string) =>
    `<html><body><p>Site ${domain}: Concrete curing requires moisture retention for 28 days to reach design strength and prevent cracking in the slab surface.</p></body></html>`;

  function deepeningFetcher(): typeof fetch {
    return (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      const m = /^https?:\/\/([a-z0-9.-]+)\//.exec(url);
      const domain = m?.[1] ?? "unknown";
      return new Response(AGREEING_BODY(domain), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;
  }

  it("fetches top hits, cross-checks CONTENT, and stores higher-confidence candidates", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      return {
        hits: [
          {
            title: "Concrete curing guide",
            url: `https://${domain}/curing`,
            snippet: "Concrete curing moisture.",
          },
        ],
        note: "search completed",
      };
    });
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
      new PageFetcher({ fetchFn: deepeningFetcher() }),
    );
    const report = await pipeline.research("concrete curing best practices");

    expect(report.pageFetches.length).toBeGreaterThan(0);
    expect(report.pageFetches.every((f) => f.ok)).toBe(true);
    expect(report.contentCrossChecked).toBe(true);
    expect(report.crossChecked).toBe(true);
    // The deepened hits carry real extracted content.
    expect(report.hits[0].content ?? "").toContain("moisture retention");
    // The stored candidate's confidence reflects the raised
    // cap — still candidate, never validated.
    const stored = store.list().filter((f) => f.status === "candidate");
    expect(stored.length).toBeGreaterThan(0);
    expect(stored[0].confidence).toBeGreaterThan(0.45);
    expect(stored[0].confidence).toBeLessThanOrEqual(0.6);
    expect(stored[0].provenance.note).toMatch(/page content FETCHED/);
  });

  it("reports failed page fetches honestly and does not claim content agreement", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      return {
        hits: [
          {
            title: "Concrete curing guide",
            url: `https://${domain}/curing`,
            snippet: "Concrete curing moisture.",
          },
        ],
        note: "search completed",
      };
    });
    const failingFetcher = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      }
      return new Response("gone", { status: 404 });
    }) as unknown as typeof fetch;
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
      new PageFetcher({ fetchFn: failingFetcher }),
    );
    const report = await pipeline.research("concrete curing best practices");

    expect(report.pageFetches.length).toBeGreaterThan(0);
    expect(report.pageFetches.every((f) => !f.ok)).toBe(true);
    expect(report.pageFetches[0].note).toMatch(/404/);
    expect(report.contentCrossChecked).toBe(false);
    // No hit carries fake content.
    expect(report.hits.every((h) => h.content === undefined)).toBe(true);
  });

  it("respects robots.txt on the DEEPENING fetch — the page is never read", async () => {
    const store = new FactStore();
    const adapter = new ScriptedAdapter((query) => {
      const domain = query.match(/site:([a-z.]+)/)?.[1] ?? "unknown.org";
      return {
        hits: [
          {
            title: "Concrete curing guide",
            url: `https://${domain}/curing`,
            snippet: "Concrete curing moisture.",
          },
        ],
        note: "search completed",
      };
    });
    const robotsGuardedFetcher = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      }
      throw new Error("page fetch must not happen when robots disallows");
    }) as unknown as typeof fetch;
    const pipeline = new ResearchPipeline(
      store,
      adapter,
      new WebSourceRegistry(),
      new PageFetcher({ fetchFn: robotsGuardedFetcher }),
    );
    const report = await pipeline.research("concrete curing best practices");
    expect(report.pageFetches.length).toBeGreaterThan(0);
    expect(report.pageFetches[0].ok).toBe(false);
    expect(report.pageFetches[0].note).toMatch(/robots\.txt disallows/);
    expect(report.contentCrossChecked).toBe(false);
  });
});

// ---------------------------------------------------------
// Edge search fallback (audit Phase 2.2) — DDG anomaly-
// blocks Supabase datacenter traffic; the composite falls
// through to the Wikipedia API honestly.
// ---------------------------------------------------------
import {
  DuckDuckGoLiteAdapter,
  MultiSearchAdapter,
  isSearchFailureNote,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import { WikipediaSearchAdapter } from "@studio-shared/archie-ai/native-engine/wikipedia-search.ts";

describe("isSearchFailureNote — honest classification", () => {
  it("classifies execution failures vs genuine empty results", () => {
    expect(isSearchFailureNote("network unavailable after 3 attempt(s)")).toBe(
      true,
    );
    expect(isSearchFailureNote("adapter layout changed: markers present")).toBe(
      true,
    );
    expect(isSearchFailureNote("search endpoint returned 403")).toBe(true);
    expect(
      isSearchFailureNote(
        "search endpoint refused this client: anomaly protection (status 202)",
      ),
    ).toBe(true);
    expect(isSearchFailureNote("wikipedia api unavailable: status 500")).toBe(
      true,
    );
    expect(
      isSearchFailureNote(
        "site-scoped search not supported by this adapter — declined",
      ),
    ).toBe(true);
    expect(isSearchFailureNote("no results found for the query")).toBe(false);
    expect(isSearchFailureNote("search completed")).toBe(false);
  });
});

describe("DuckDuckGoLiteAdapter anomaly classification", () => {
  it("a 202 challenge page is a REFUSAL, not drift, not a real search", async () => {
    const adapter = new DuckDuckGoLiteAdapter({
      fetchFn: (async () =>
        new Response(
          "<html><head><title>DuckDuckGo</title></head><body>anomaly page</body></html>",
          { status: 202, headers: { "content-type": "text/html" } },
        )) as unknown as typeof fetch,
      sleepFn: (() => {}) as never,
    });
    const res = await adapter.search("concrete curing");
    expect(res.hits).toEqual([]);
    expect(res.note).toMatch(
      /search endpoint refused this client: anomaly protection \(status 202\)/,
    );
  });
});

describe("WikipediaSearchAdapter", () => {
  const wikiJson = JSON.stringify({
    query: {
      search: [
        {
          title: "Concrete curing",
          snippet: "Curing <b>keeps</b> concrete moist to reach strength.",
        },
        {
          title: "Concrete",
          snippet: "Composite construction material.",
        },
      ],
    },
  });

  it("returns real hits with canonical wiki URLs and tag-free snippets", async () => {
    const adapter = new WikipediaSearchAdapter({
      fetchFn: (async () =>
        new Response(wikiJson, {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    const res = await adapter.search("concrete curing time");
    expect(res.hits.length).toBe(2);
    expect(res.hits[0].url).toBe(
      "https://en.wikipedia.org/wiki/Concrete_curing",
    );
    expect(res.hits[0].snippet).toContain("keeps");
    expect(res.hits[0].snippet).not.toContain("<b>");
    expect(res.note).toBe("search completed");
  });

  it("declines site-scoped queries HONESTLY (a decline is never a fake empty search)", async () => {
    const adapter = new WikipediaSearchAdapter({
      fetchFn: (async () => {
        throw new Error("must not be called for site-scoped queries");
      }) as unknown as typeof fetch,
    });
    const res = await adapter.search("concrete site:owasp.org");
    expect(res.hits).toEqual([]);
    expect(res.note).toMatch(/site-scoped search not supported/);
  });

  it("a genuinely empty index result is reported as executed-but-empty", async () => {
    const adapter = new WikipediaSearchAdapter({
      fetchFn: (async () =>
        new Response(JSON.stringify({ query: { search: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    const res = await adapter.search("qzxv nonexisting topic");
    expect(res.hits).toEqual([]);
    expect(res.note).toBe("no results found for the query");
  });

  it("API errors are honest failures", async () => {
    const adapter = new WikipediaSearchAdapter({
      fetchFn: (async () =>
        new Response("", { status: 500 })) as unknown as typeof fetch,
    });
    const res = await adapter.search("concrete curing");
    expect(res.note).toMatch(/wikipedia api unavailable: status 500/);
  });
});

describe("MultiSearchAdapter — honest fallback", () => {
  it("falls through a blocked DDG to the Wikipedia API and reports the winner", async () => {
    const blockedDdg = new DuckDuckGoLiteAdapter({
      fetchFn: (async () =>
        new Response("<html>anomaly</html>", {
          status: 202,
        })) as unknown as typeof fetch,
      sleepFn: (() => {}) as never,
    });
    const wiki = new WikipediaSearchAdapter({
      fetchFn: (async () =>
        new Response(wikiJson(), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    function wikiJson() {
      return JSON.stringify({
        query: { search: [{ title: "Concrete", snippet: "Curing." }] },
      });
    }
    const multi = new MultiSearchAdapter([blockedDdg, wiki]);
    const res = await multi.search("concrete curing time");
    expect(res.hits.length).toBe(1);
    expect(res.note).toMatch(/^wikipedia-api: search completed/);
  });

  it("when EVERY adapter is blocked the composite reports a network-class failure", async () => {
    const blockedDdg = new DuckDuckGoLiteAdapter({
      fetchFn: (async () =>
        new Response("<html>anomaly</html>", {
          status: 202,
        })) as unknown as typeof fetch,
      sleepFn: (() => {}) as never,
    });
    const deadWiki = new WikipediaSearchAdapter({
      fetchFn: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
    });
    const multi = new MultiSearchAdapter([blockedDdg, deadWiki]);
    const res = await multi.search("concrete curing time");
    expect(res.hits).toEqual([]);
    expect(res.note).toMatch(/^network unavailable after all adapters/);
    expect(isSearchFailureNote(res.note)).toBe(true);
  });

  it("a genuine zero from the first ADAPTER is preserved (not overwritten by a later decline)", async () => {
    const emptyDdg = new DuckDuckGoLiteAdapter({
      fetchFn: (async () =>
        new Response("<html><body>No results</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch,
      sleepFn: (() => {}) as never,
    });
    // parse() yields 0 hits; classifyEmptyParse sees "no results".
    const decliningWiki = new WikipediaSearchAdapter({
      fetchFn: (async () => {
        throw new Error("unreachable");
      }) as unknown as typeof fetch,
    });
    const multi = new MultiSearchAdapter([emptyDdg, decliningWiki]);
    const res = await multi.search("concrete curing time");
    expect(res.note).toMatch(/no results found for the query/);
    expect(isSearchFailureNote(res.note)).toBe(false);
  });
});

// ---------------------------------------------------------
// Batch 12 (Level 8) regression — fix 39
// ---------------------------------------------------------
describe("batch 12 — SSRF guard", () => {
  it("fix 39: private-network targets are refused before any network call, honestly noted", async () => {
    // A stub fetch that must NEVER run for these targets.
    const guard = new PageFetcher({
      fetchFn: () => {
        throw new Error("network was reached — SSRF guard failed");
      },
    });
    const targets = [
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8000/secret",
      "http://127.0.0.1:5432/",
      "http://10.1.2.3/internal",
      "http://192.168.0.1/admin",
      "http://172.20.0.5/kong",
      "https://metadata.internal/creds",
      "http://[::1]:8080/",
    ];
    for (const url of targets) {
      const r = await guard.fetch(url);
      expect(r.ok).toBe(false);
      expect(r.content).toBe("");
      expect(r.note).toContain("refused");
      expect(r.note).not.toContain("network was reached");
    }
    // And a public URL still passes the guard (and reaches the stub).
    let reached = false;
    const pub = new PageFetcher({
      fetchFn: (async () => {
        reached = true;
        throw new Error("stop here");
      }) as unknown as typeof fetch,
    });
    const r = await pub.fetch("https://example.com/public-page");
    expect(reached).toBe(true); // guard let it through to the network layer
    expect(r.ok).toBe(false);
  });
});
