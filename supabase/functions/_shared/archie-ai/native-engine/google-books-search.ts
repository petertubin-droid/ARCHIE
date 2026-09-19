// =========================================================
// GOOGLE BOOKS SEARCH ADAPTER (owner upgrade 2026-09-16).
// Google Books volumes API is Google's DOCUMENTED public,
// keyless machine interface for book search — open,
// robots-friendly, explicitly intended for programmatic use
// with no API key for basic volume search. This adds Google
// as a real research site WITHOUT any AI model: real titles,
// canonical Google Books URLs, real descriptions.
// It declines site: queries honestly (a web-index feature,
// not a catalog feature) — a decline is a REFUSAL, never a
// fake zero-hit "search completed".
// =========================================================

import type { ResearchAdapter, ResearchHit } from "./webresearch.ts";

const BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";

export interface GoogleBooksAdapterOptions {
  /** Injectable fetch — tests pass a stub. */
  fetchFn?: typeof fetch;
  /** Hard per-request timeout (default 8000ms). */
  timeoutMs?: number;
  /** Max results requested (default 8, API max 40). */
  maxResults?: number;
}

export class GoogleBooksAdapter implements ResearchAdapter {
  readonly id = "google-books-api";
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResults: number;

  constructor(opts: GoogleBooksAdapterOptions = {}) {
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
      `${BOOKS_ENDPOINT}?maxResults=${this.maxResults}` +
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
        note: `google books api unavailable: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      };
    }
    if (!res.ok) {
      return {
        hits: [],
        note: `google books api unavailable: status ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        hits: [],
        note: "google books api unavailable: malformed JSON response",
      };
    }
    const items = (
      body as {
        items?: Array<{
          volumeInfo?: {
            title?: string;
            subtitle?: string;
            description?: string;
            infoLink?: string;
            canonicalVolumeLink?: string;
          };
        }>;
      }
    )?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    const hits: ResearchHit[] = [];
    for (const item of items) {
      const info = item?.volumeInfo;
      const title = (info?.title ?? "").trim();
      if (!title) continue;
      const fullTitle = info?.subtitle
        ? `${title}: ${info.subtitle.trim()}`
        : title;
      const url = (info?.canonicalVolumeLink ?? info?.infoLink ?? "").trim();
      if (!url) continue;
      const snippet = (info?.description ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      hits.push({
        title: fullTitle.slice(0, 140),
        url,
        snippet,
        domain: "books.google.com",
      });
      if (hits.length >= 8) break;
    }
    if (hits.length === 0) {
      return { hits: [], note: "no results found for the query" };
    }
    return { hits, note: "search completed" };
  }
}
