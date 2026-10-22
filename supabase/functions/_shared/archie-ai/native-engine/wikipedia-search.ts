// =========================================================
// WIKIPEDIA SEARCH ADAPTER (audit Phase 2.2).
// DuckDuckGo Lite refuses Supabase edge/datacenter traffic
// (anomaly protection, live-verified 2026-09-11). The
// MediaWiki web-service API is the DOCUMENTED machine
// interface of Wikipedia: open, keyless, robots-friendly and
// explicitly intended for programmatic use. This adapter is
// the EDGE-RELIABLE research backbone: real titles, real
// canonical page URLs, real search snippets. It declines
// site-scoped queries honestly (site: search syntax is a
// web-index feature, not a wiki feature) — a decline is a
// REFUSAL, never a fake zero-hit "search completed".
// =========================================================

import type { ResearchAdapter, ResearchHit } from "./webresearch.ts";
import { contentWordsOf, topicallyMatches } from "./query-terms.ts";
import { decodeHtmlEntities } from "./html-text.ts";

const WIKI_ENDPOINT = "https://en.wikipedia.org/w/api.php";

export interface WikipediaSearchAdapterOptions {
  /** Injectable fetch — tests pass a stub. */
  fetchFn?: typeof fetch;
  /** Hard per-request timeout (default 8000ms). */
  timeoutMs?: number;
}

export class WikipediaSearchAdapter implements ResearchAdapter {
  readonly id = "wikipedia-api";
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: WikipediaSearchAdapterOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    // RESPONSE TIME (owner directive 2026-09-16): 8s let one
    // slow request hold a chat reply hostage. 3s is plenty for
    // the MediaWiki search API on a warm connection; a timeout
    // degrades honestly to "site unreachable".
    this.timeoutMs = opts.timeoutMs ?? 3000;
  }

  async search(query: string): Promise<{ hits: ResearchHit[]; note: string }> {
    if (/\bsite:\S+/i.test(query)) {
      return {
        hits: [],
        note: "site-scoped search not supported by this adapter — declined",
      };
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    // BATCH 44 (live-verified 2026-10-21): CirrusSearch
    // ranks keyword queries, not questions — the raw
    // question returned "Straight razor" for a whetstone
    // query. Search on the content words instead.
    const words = contentWordsOf(trimmed);
    const searchQuery = words.length > 0 ? words.join(" ") : trimmed;
    const url =
      `${WIKI_ENDPOINT}?action=query&list=search&format=json&origin=*` +
      `&srlimit=8&srsearch=${encodeURIComponent(searchQuery)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: {
          // MediaWiki asks API clients for a descriptive UA.
          "user-agent": "ARCHIE-Native-Engine/1.0 (research; contact owner)",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return {
        hits: [],
        note: `wikipedia api unavailable: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      };
    }
    if (!res.ok) {
      return {
        hits: [],
        note: `wikipedia api unavailable: status ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        hits: [],
        note: "wikipedia api unavailable: malformed JSON response",
      };
    }
    const results = (
      body as {
        query?: { search?: Array<{ title?: string; snippet?: string }> };
      }
    )?.query?.search;
    if (!Array.isArray(results) || results.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    const hits: ResearchHit[] = [];
    for (const r of results) {
      const title = decodeHtmlEntities((r.title ?? "").trim());
      if (!title) continue;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      const snippet = decodeHtmlEntities(r.snippet ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      hits.push({ title: title.slice(0, 140), url, snippet });
      if (hits.length >= 8) break;
    }
    if (hits.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    // BATCH 44: a search hit sharing zero content words with
    // the question is a ranking artifact, not an answer —
    // it must not enter candidate knowledge. This is an
    // honest filter (genuine zero when everything drifts),
    // never a fabricated hit.
    const onTopic = words.length > 0
      ? hits.filter((h) => topicallyMatches(`${h.title} ${h.snippet}`, words))
      : hits;
    if (onTopic.length === 0) {
      return {
        hits: [],
        note: "no topically matching results found for the query",
      };
    }
    return { hits: onTopic, note: "search completed" };
  }
}
