// =========================================================
// RESEARCH ADAPTER HARDENING (audit phase 8, 2026-09-11)
//
// The live DuckDuckGo Lite page emits SINGLE-QUOTED
// attributes with href before class — the original
// double-quote-only parser parsed ZERO hits from real pages
// silently. These tests pin the quote/order-flexible parser
// against the REAL live page markup (captured 2026-09-11,
// fixture: ddg-lite-results.html) plus drift fixtures, so CI
// never depends on the live network and drift can never be
// silent again.
// =========================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DuckDuckGoLiteAdapter,
  ResearchPipeline,
  type ResearchAdapter,
} from "@studio-shared/archie-ai/native-engine/webresearch.ts";
import { FactStore } from "@studio-shared/archie-ai/native-engine/knowledge.ts";
import {
  WebSourceRegistry,
  getWebSourceRegistry,
} from "@studio-shared/archie-ai/native-engine/web-sources.ts";

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname ?? ".", "fixtures", name), "utf-8");

function okResponse(html: string, status = 200): Response {
  return new Response(html, { status });
}

function jsonResponse(status: number): Response {
  // error JSON — a shape drift case seen in practice
  return new Response(JSON.stringify({ error: "bad request" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DuckDuckGoLiteAdapter — quote/order-flexible parsing (drift regression)", () => {
  it("parses hits from the REAL live page markup (old parser: 0 hits)", () => {
    const adapter = new DuckDuckGoLiteAdapter();
    const hits = adapter.parse(fixture("ddg-lite-results.html"));
    expect(hits.length).toBeGreaterThan(0);
    // Live capture: 10 result-link anchors, 2 of them
    // ddg-redirect-wrapped (skipped) → 8 direct hits.
    expect(hits.length).toBe(8);
    expect(hits[0].url).toMatch(/^https:\/\//);
    expect(hits[0].title.length).toBeGreaterThan(0);
    expect(hits[0].snippet.length).toBeGreaterThan(0);
  });

  it("still parses the legacy double-quoted shape (backward compatible)", () => {
    const adapter = new DuckDuckGoLiteAdapter();
    const html = `<html><body>
      <a class="result-link" href="https://example.com/a">Legacy shape</a>
      <td class="result-snippet">Legacy snippet text here</td>
    </body></html>`;
    const hits = adapter.parse(html);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Legacy shape");
    expect(hits[0].snippet).toBe("Legacy snippet text here");
  });

  it("skips duckduckgo redirect-wrapped links but keeps direct results", () => {
    const adapter = new DuckDuckGoLiteAdapter();
    const html = `<html><body>
      <a href="https://duckduckgo.com/l/?uddg=wrapped" class='result-link'>Wrapped</a>
      <a href="https://example.com/direct" class='result-link'>Direct</a>
      <td class='result-snippet'>s1</td><td class='result-snippet'>s2</td>
    </body></html>`;
    const hits = adapter.parse(html);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://example.com/direct");
  });
});

describe("DuckDuckGoLiteAdapter — honest drift detection (no silent zero hits)", () => {
  it("reports layout drift for an unrecognizable page (0 result markers)", async () => {
    const adapter = new DuckDuckGoLiteAdapter({
      fetchFn: async () => okResponse(fixture("ddg-lite-drift.html")),
      sleepFn: async () => {},
    });
    const { hits, note } = await adapter.search("concrete mix ratio");
    expect(hits).toHaveLength(0);
    expect(note).toMatch(/^adapter layout changed/);
    expect(note).toContain("do not trust the zero-hit result");
  });

  it("reports layout drift when result markers exist but none parse", async () => {
    const adapter = new DuckDuckGoLiteAdapter({
      fetchFn: async () => okResponse(fixture("ddg-lite-malformed.html")),
      sleepFn: async () => {},
    });
    const { hits, note } = await adapter.search("concrete mix ratio");
    expect(hits).toHaveLength(0);
    expect(note).toMatch(/^adapter layout changed/);
    expect(note).toContain("markup drifted");
  });

  it("reports an honest no-results page (not drift)", async () => {
    const adapter = new DuckDuckGoLiteAdapter({
      fetchFn: async () =>
        okResponse(
          `<html><body><p>Your search for qzxwv did not match any documents. No results.</p></body></html>`,
        ),
      sleepFn: async () => {},
    });
    const { hits, note } = await adapter.search("qzxwv");
    expect(hits).toHaveLength(0);
    expect(note).toBe("no results found for the query");
  });

  it("does not retry a drifted page — drift is structural", async () => {
    let calls = 0;
    const adapter = new DuckDuckGoLiteAdapter({
      maxRetries: 2,
      fetchFn: async () => {
        calls += 1;
        return okResponse(fixture("ddg-lite-drift.html"));
      },
      sleepFn: async () => {},
    });
    await adapter.search("concrete mix ratio");
    expect(calls).toBe(1);
  });
});

describe("DuckDuckGoLiteAdapter — retry and backoff", () => {
  it("retries a 500 then succeeds (3 attempts, 2 backoffs)", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const adapter = new DuckDuckGoLiteAdapter({
      maxRetries: 2,
      baseBackoffMs: 100,
      fetchFn: async () => {
        calls += 1;
        if (calls < 3) return jsonResponse(500);
        return okResponse(fixture("ddg-lite-results.html"));
      },
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
    });
    const { hits, note } = await adapter.search("concrete mix ratio");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]); // doubling backoff
    expect(note).toBe("search completed");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("retries a 429 with backoff, then succeeds", async () => {
    let calls = 0;
    const adapter = new DuckDuckGoLiteAdapter({
      maxRetries: 1,
      fetchFn: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(429)
          : okResponse(fixture("ddg-lite-results.html"));
      },
      sleepFn: async () => {},
    });
    const { note } = await adapter.search("concrete mix ratio");
    expect(calls).toBe(2);
    expect(note).toBe("search completed");
  });

  it("reports honest exhaustion when all attempts fail", async () => {
    let calls = 0;
    const adapter = new DuckDuckGoLiteAdapter({
      maxRetries: 2,
      baseBackoffMs: 10,
      fetchFn: async () => {
        calls += 1;
        return jsonResponse(503);
      },
      sleepFn: async () => {},
    });
    const { hits, note } = await adapter.search("concrete mix ratio");
    expect(calls).toBe(3);
    expect(hits).toHaveLength(0);
    expect(note).toMatch(/^network unavailable after 3 attempt\(s\)/);
    expect(note).toContain("503");
  });

  it("retries network errors (thrown fetch) and reports exhaustion honestly", async () => {
    let calls = 0;
    const adapter = new DuckDuckGoLiteAdapter({
      maxRetries: 1,
      fetchFn: async () => {
        calls += 1;
        throw new Error("ECONNRESET");
      },
      sleepFn: async () => {},
    });
    const { hits, note } = await adapter.search("concrete mix ratio");
    expect(calls).toBe(2);
    expect(hits).toHaveLength(0);
    expect(note).toContain("ECONNRESET");
  });

  it("does NOT retry a plain 404 — the request is wrong, not the network", async () => {
    let calls = 0;
    const adapter = new DuckDuckGoLiteAdapter({
      fetchFn: async () => {
        calls += 1;
        return jsonResponse(404);
      },
      sleepFn: async () => {},
    });
    const { note } = await adapter.search("concrete mix ratio");
    expect(calls).toBe(1);
    expect(note).toBe("search endpoint returned 404");
  });
});

describe("ResearchPipeline — adapter drift is a source failure, never a fake success", () => {
  it("classifies a drift note as a sourceFailure, not a searched source", async () => {
    const facts = new FactStore();
    const registry: WebSourceRegistry = getWebSourceRegistry();
    const driftAdapter: ResearchAdapter = {
      id: "drift-stub",
      search: async () => ({
        hits: [],
        note: "adapter layout changed: result page shape unrecognized (0 result markers) — upstream markup drifted, report this, do not trust the zero-hit result",
      }),
    };
    const pipeline = new ResearchPipeline(facts, driftAdapter, registry);
    const report = await pipeline.research(
      "concrete curing time best practices",
    );
    expect(report.searched).toBe(false);
    expect(report.sourcesSearched).toHaveLength(0);
    expect(report.sourceFailures.length).toBeGreaterThan(0);
    expect(report.sourceFailures[0].note).toMatch(/^adapter layout changed/);
  });
});

describe("Construction domain constants — data records sync", () => {
  it("every in-code record is seeded verbatim in the migration (data integrity)", async () => {
    const { constructionConstants } =
      await import("@studio-shared/archie-ai/native-engine/domains/construction.data.ts");
    const migrationSql = readFileSync(
      join(
        import.meta.dirname ?? ".",
        "../../../../supabase/migrations/20260916000000_archie_construction_domain_data.sql",
      ),
      "utf-8",
    );
    expect(constructionConstants().length).toBeGreaterThanOrEqual(10);
    for (const rec of constructionConstants()) {
      // each record id appears as a seeded row
      expect(migrationSql).toContain(`'${rec.id}', 'construction'`);
      // and its value appears in the seed VALUES list
      expect(migrationSql).toContain(`${rec.value}, '${rec.unit}'`);
    }
  });
});

// ---------------------------------------------------------
// Batch 12 (Level 8) regressions — fixes 37, 38
// ---------------------------------------------------------
describe("batch 12 — research honesty + bounded cache", () => {
  it("fix 37: legacy mode reports searched:false when the adapter failed outright", async () => {
    const dead: ResearchAdapter = {
      id: "dead",
      async search() {
        return {
          hits: [],
          note: "network unavailable after 3 attempt(s): connection refused",
        };
      },
    };
    const pipeline = new ResearchPipeline(new FactStore(), dead);
    const report = await pipeline.research("screeding mix ratios");
    expect(report.searched).toBe(false);
    expect(report.sourcesSearched).toEqual([]);
    expect(report.storedKnowledge).toBe(0);
  });

  it("fix 37: legacy mode still reports searched:true for a genuine no-results search", async () => {
    const empty: ResearchAdapter = {
      id: "empty",
      async search() {
        return { hits: [], note: "no results found for the query" };
      },
    };
    const pipeline = new ResearchPipeline(new FactStore(), empty);
    const report = await pipeline.research("zzzz nothing real");
    expect(report.searched).toBe(true);
    expect(report.sourcesSearched).toEqual(["open web (unrestricted query)"]);
  });

  it("fix 38: the findings cache is FIFO-bounded and evicts expired entries on read", async () => {
    let calls = 0;
    const adapter: ResearchAdapter = {
      id: "counting",
      async search(q: string) {
        calls += 1;
        return {
          hits: [
            {
              title: `about ${q}`,
              url: `https://example.com/${q.replace(/\\s+/g, "-")}`,
              snippet: `real snippet for ${q}`,
            },
          ],
          note: "search completed",
        };
      },
    };
    // Legacy mode exercises cachePut/read without a registry.
    const pipeline = new ResearchPipeline(new FactStore(), adapter);
    // Overfill: MAX_CACHE_ENTRIES is 64; issue 70 distinct queries.
    for (let i = 0; i < 70; i += 1) {
      await pipeline.research(`topic number ${i} screeding`);
    }
    expect(calls).toBe(70); // every query hit the adapter (no cache hits)
    // A repeat of the FIRST query must MISS (it was FIFO-evicted)
    // while a repeat of the LAST must HIT.
    await pipeline.research("topic number 0 screeding");
    await pipeline.research("topic number 69 screeding");
    expect(calls).toBe(71); // only the evicted one re-searched
  });
});
