// =========================================================
// ARXIV SEARCH ADAPTER (owner upgrade 2026-09-16).
// The arXiv API is the DOCUMENTED public, keyless Atom
// interface of the arXiv preprint repository — explicitly
// intended for programmatic research use (the API terms ask
// for ~1 request every 3 seconds, which ARCHIE's research
// cadence satisfies). Academic primary-source evidence:
// real paper titles, canonical arXiv abstract URLs, real
// summaries. Atom XML parsed structurally; site: queries
// are declined honestly.
// =========================================================

import type { ResearchAdapter, ResearchHit } from "./webresearch.ts";

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

export interface ArxivAdapterOptions {
  /** Injectable fetch — tests pass a stub. */
  fetchFn?: typeof fetch;
  /** Hard per-request timeout (default 8000ms). */
  timeoutMs?: number;
  /** Max results requested (default 8). */
  maxResults?: number;
}

export class ArxivAdapter implements ResearchAdapter {
  readonly id = "arxiv-api";
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResults: number;

  constructor(opts: ArxivAdapterOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.maxResults = opts.maxResults ?? 8;
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
    const url =
      `${ARXIV_ENDPOINT}?search_query=${encodeURIComponent(`all:${trimmed}`)}` +
      `&start=0&max_results=${this.maxResults}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: {
          "user-agent": "ARCHIE-Native-Engine/1.0 (research; contact owner)",
          accept: "application/atom+xml",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return {
        hits: [],
        note: `arxiv api unavailable: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      };
    }
    if (!res.ok) {
      return {
        hits: [],
        note: `arxiv api unavailable: status ${res.status}`,
      };
    }
    let xml: string;
    try {
      xml = await res.text();
    } catch {
      return {
        hits: [],
        note: "arxiv api unavailable: unreadable response body",
      };
    }
    // Structural Atom parsing: entry blocks, then title/id/
    // summary. XML entities are decoded; a malformed feed is
    // an honest failure, never a silent zero.
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    if (entries.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    const decode = (s: string) =>
      s
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    const hits: ResearchHit[] = [];
    for (const entry of entries) {
      const block = entry[1];
      const title = decode(
        /<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? "",
      );
      const id = decode(/<id>([\s\S]*?)<\/id>/.exec(block)?.[1] ?? "");
      if (!title || !id) continue;
      const summary = decode(
        /<summary>([\s\S]*?)<\/summary>/.exec(block)?.[1] ?? "",
      ).slice(0, 300);
      hits.push({
        title: title.slice(0, 140),
        url: id,
        snippet: summary,
        domain: "arxiv.org",
      });
      if (hits.length >= 8) break;
    }
    if (hits.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    return { hits, note: "search completed" };
  }
}
