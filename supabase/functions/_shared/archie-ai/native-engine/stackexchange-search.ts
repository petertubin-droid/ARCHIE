// =========================================================
// STACK EXCHANGE SEARCH ADAPTER (owner upgrade 2026-09-16).
// The StackExchange API is the DOCUMENTED public, keyless
// machine interface of Stack Overflow and its sibling Q&A
// sites — explicitly intended for programmatic use. Technical
// Q&A evidence complements the taught coding curriculum: real
// question titles, canonical per-question URLs, real excerpts
// and answer counts. It declines site: queries honestly — the
// per-site choice is made by the adapter (stackoverflow), not
// by the query.
// =========================================================

import type { ResearchAdapter, ResearchHit } from "./webresearch.ts";

const SE_ENDPOINT = "https://api.stackexchange.com/2.3/search/advanced";

export interface StackExchangeAdapterOptions {
  /** Injectable fetch — tests pass a stub. */
  fetchFn?: typeof fetch;
  /** Hard per-request timeout (default 8000ms). */
  timeoutMs?: number;
  /** Which SE site to search (default stackoverflow). */
  site?: string;
  /** Page size (default 8). */
  pageSize?: number;
}

export class StackExchangeAdapter implements ResearchAdapter {
  readonly id = "stackexchange-api";
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly site: string;
  private readonly pageSize: number;

  constructor(opts: StackExchangeAdapterOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.site = opts.site ?? "stackoverflow";
    this.pageSize = opts.pageSize ?? 8;
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
      `${SE_ENDPOINT}?order=desc&sort=relevance` +
      `&pagesize=${this.pageSize}&site=${encodeURIComponent(this.site)}` +
      `&q=${encodeURIComponent(trimmed)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: {
          "user-agent": "ARCHIE-Native-Engine/1.0 (research; contact owner)",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return {
        hits: [],
        note: `stack exchange api unavailable: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      };
    }
    if (!res.ok) {
      return {
        hits: [],
        note: `stack exchange api unavailable: status ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        hits: [],
        note: "stack exchange api unavailable: malformed JSON response",
      };
    }
    const items = (
      body as {
        items?: Array<{
          title?: string;
          link?: string;
          score?: number;
          answer_count?: number;
          excerpt?: string;
        }>;
      }
    )?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    const hits: ResearchHit[] = [];
    for (const item of items) {
      const title = (item?.title ?? "").trim();
      const url = (item?.link ?? "").trim();
      if (!title || !url) continue;
      // The advanced-search default filter includes excerpt;
      // when it is absent the honest fallback is the real
      // score/answers metadata — never an invented snippet.
      const meta =
        typeof item.score === "number"
          ? `score ${item.score}` +
            (typeof item.answer_count === "number"
              ? `, ${item.answer_count} answer(s)`
              : "")
          : "";
      const excerpt = (item.excerpt ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      const snippet = excerpt || meta;
      hits.push({
        title: title.slice(0, 140),
        url,
        snippet,
        domain: "stackoverflow.com",
      });
      if (hits.length >= 8) break;
    }
    if (hits.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    return { hits, note: "search completed" };
  }
}
