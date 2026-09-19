// =========================================================
// ARCHIE NATIVE ENGINE — VOCABULARY MEANING RESEARCH
//
// SELF-EVOLVING VOCABULARY (owner directive 2026-09-13):
// when a term is not in the registry and the owner asks
// ARCHIE to research it, ARCHIE queries MULTIPLE public
// dictionary/reference websites IN PARALLEL, cross-checks
// what they return and stores the meaning with RESEARCH
// provenance — lower confidence than owner-taught
// knowledge, honestly labeled, never presented as owner
// authority.
//
//   search (parallel, multi-site)
//     -> cross-check (independent recognition)
//     -> store with research provenance + source domains
//     -> the owner can confirm (strengthens) or correct
//        (owner-taught provenance overwrites) anytime.
//
// HONESTY RULES (same as the research pipeline):
//   - a site that could not be reached or returned an
//     error is a FAILURE, named in the reply — never
//     smoothed into "no results"
//   - a site that answered but does not know the term is
//     a genuine miss
//   - all sites failing means NO meaning is invented —
//     the report says so plainly
//   - only JSON APIs, no keys, public and robots-friendly
//     endpoints; no scraping of pages behind ToS gates
// =========================================================

import { table } from "../tables.ts";
import type { VocabularyDb } from "./vocabulary.ts";

/** One site's answer for a term. */
export interface MeaningSourceResult {
  /** Display name ("Free Dictionary API"). */
  site: string;
  domain: string;
  meaning: string | null;
  /** Honest outcome note ("not found in this dictionary"). */
  note: string;
  /** True = the query NEVER EXECUTED (network/refusal) —
   *  must never be reported as "no results". */
  failure: boolean;
}

export interface MeaningResearchReport {
  term: string;
  results: MeaningSourceResult[];
  /** Cross-checked meaning, or null when nothing was found. */
  meaning: string | null;
  /** 0.6 = recognized by >=2 independent sites; 0.4 = one. */
  confidence: number;
  /** Domains that actually supplied the meaning. */
  domains: string[];
  note: string;
}

/** Structural fetch — Deno/Node fetch satisfies this; tests
 *  inject an explicit labeled double. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// RESPONSE TIME (owner directive 2026-09-16): a chat reply must
// not wait 7 seconds on one straggler site. The sites run in
// parallel, so the cap is the SLOWEST site — 3s is enough for
// dictionary APIs on a warm connection.
const SITE_TIMEOUT_MS = 3000;
const MEANING_MAX = 240;

function firstSentence(text: string): string {
  const t = text.trim();
  const cut = t.search(/[.!?](\s|$)/);
  const out =
    cut >= 0 && cut < MEANING_MAX
      ? t.slice(0, cut + 1)
      : t.slice(0, MEANING_MAX);
  return out.trim();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(
  fetchFn: FetchLike,
  url: string,
): Promise<{ ok: boolean; data?: unknown; note: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITE_TIMEOUT_MS);
    try {
      const res = await fetchFn(url, { signal: controller.signal });
      if (!res.ok) {
        return { ok: false, note: `http ${res.status}` };
      }
      const data = (await res.json()) as unknown;
      return { ok: true, data, note: "answered" };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return {
      ok: false,
      note: `network unavailable (${e instanceof Error ? e.name : "error"})`,
    };
  }
}

/** Free Dictionary API — dictionaryapi.dev (free, keyless). */
async function lookupFreeDictionary(
  fetchFn: FetchLike,
  term: string,
): Promise<MeaningSourceResult> {
  const site = "Free Dictionary API";
  const domain = "dictionaryapi.dev";
  const { ok, data, note } = await fetchJson(
    fetchFn,
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
  );
  if (!ok) return { site, domain, meaning: null, note, failure: true };
  const entries = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : [];
  for (const entry of entries) {
    const meanings = (entry.meanings ?? []) as Array<Record<string, unknown>>;
    for (const m of meanings) {
      const defs = (m.definitions ?? []) as Array<Record<string, unknown>>;
      for (const d of defs) {
        const def = typeof d.definition === "string" ? d.definition : null;
        if (def && def.trim()) {
          return {
            site,
            domain,
            meaning: firstSentence(def),
            note: "found",
            failure: false,
          };
        }
      }
    }
  }
  return {
    site,
    domain,
    meaning: null,
    note: "not found in this dictionary",
    failure: false,
  };
}

/** Wiktionary REST definition API — en.wiktionary.org. */
async function lookupWiktionary(
  fetchFn: FetchLike,
  term: string,
): Promise<MeaningSourceResult> {
  const site = "Wiktionary";
  const domain = "wiktionary.org";
  const { ok, data, note } = await fetchJson(
    fetchFn,
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`,
  );
  if (!ok) return { site, domain, meaning: null, note, failure: true };
  const byLang = (data ?? {}) as Record<string, Array<Record<string, unknown>>>;
  for (const block of byLang.en ?? []) {
    const defs = (block.definitions ?? []) as Array<Record<string, unknown>>;
    for (const d of defs) {
      const raw = typeof d.definition === "string" ? d.definition : "";
      const clean = stripTags(raw);
      if (clean) {
        return {
          site,
          domain,
          meaning: firstSentence(clean),
          note: "found",
          failure: false,
        };
      }
    }
  }
  return {
    site,
    domain,
    meaning: null,
    note: "not found in this dictionary",
    failure: false,
  };
}

/** DuckDuckGo Instant Answer API — api.duckduckgo.com. */
async function lookupDuckDuckGo(
  fetchFn: FetchLike,
  term: string,
): Promise<MeaningSourceResult> {
  const site = "DuckDuckGo Instant Answers";
  const domain = "duckduckgo.com";
  const { ok, data, note } = await fetchJson(
    fetchFn,
    `https://api.duckduckgo.com/?q=${encodeURIComponent(`${term} meaning`)}&format=json&no_html=1&no_redirect=1&skip_disambiguation=1`,
  );
  if (!ok) return { site, domain, meaning: null, note, failure: true };
  const d = (data ?? {}) as Record<string, unknown>;
  const dd =
    typeof d.Definition === "string" && d.Definition.trim()
      ? d.Definition
      : null;
  const abs =
    typeof d.AbstractText === "string" && d.AbstractText.trim()
      ? d.AbstractText
      : null;
  const meaning = dd ?? abs;
  if (meaning) {
    return {
      site,
      domain,
      meaning: firstSentence(meaning),
      note: "found",
      failure: false,
    };
  }
  return {
    site,
    domain,
    meaning: null,
    note: "no instant answer for this term",
    failure: false,
  };
}

/** Wikipedia REST summary — en.wikipedia.org. */
async function lookupWikipedia(
  fetchFn: FetchLike,
  term: string,
): Promise<MeaningSourceResult> {
  const site = "Wikipedia";
  const domain = "wikipedia.org";
  const { ok, data, note } = await fetchJson(
    fetchFn,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
  );
  if (!ok) return { site, domain, meaning: null, note, failure: true };
  const d = (data ?? {}) as Record<string, unknown>;
  const extract = typeof d.extract === "string" ? d.extract.trim() : "";
  if (extract) {
    return {
      site,
      domain,
      meaning: firstSentence(extract),
      note: "found",
      failure: false,
    };
  }
  return {
    site,
    domain,
    meaning: null,
    note: "no encyclopedia article for this term",
    failure: false,
  };
}

/** Research a term's meaning across ALL sites in parallel.
 *  Dictionary-quality sites (Free Dictionary API, Wiktionary)
 *  are preferred for the stored meaning; support sites
 *  (DuckDuckGo, Wikipedia) confirm recognition. Cross-check
 *  = >=2 INDEPENDENT sites returned a meaning. */
/** RESPONSE TIME (owner directive 2026-09-16): a definition miss
 *  fires the 4-site research on EVERY repeat — the registry only
 *  stores successes, so an unknown term is re-researched (3s) for
 *  every single message that mentions it. An in-process TTL memo
 *  for the PRODUCTION fetch path only (tests inject their own
 *  fetchFn and stay uncached) makes repeats instant within a warm
 *  isolate. The memo stores the honest report verbatim — same
 *  answer, same provenance, no re-fetch theater. */
const RESEARCH_MEMO_TTL_MS = 10 * 60 * 1000;
const RESEARCH_MEMO_MAX = 200;
const researchMemo = new Map<
  string,
  { at: number; report: MeaningResearchReport }
>();

export async function researchTermMeaning(
  term: string,
  fetchFn: FetchLike,
): Promise<MeaningResearchReport> {
  const clean = term.toLowerCase().trim().slice(0, 60);
  const memoEligible = fetchFn === (globalThis.fetch as FetchLike);
  if (memoEligible) {
    const hit = researchMemo.get(clean);
    if (hit && Date.now() - hit.at < RESEARCH_MEMO_TTL_MS) {
      return hit.report;
    }
  }
  const report = await collectTermMeaning(clean, fetchFn);
  if (memoEligible) {
    if (researchMemo.size >= RESEARCH_MEMO_MAX) researchMemo.clear();
    researchMemo.set(clean, { at: Date.now(), report });
  }
  return report;
}

async function collectTermMeaning(
  clean: string,
  fetchFn: FetchLike,
): Promise<MeaningResearchReport> {
  const results = await Promise.all([
    lookupFreeDictionary(fetchFn, clean),
    lookupWiktionary(fetchFn, clean),
    lookupDuckDuckGo(fetchFn, clean),
    lookupWikipedia(fetchFn, clean),
  ]);
  const found = results.filter((r) => r.meaning);
  // dictionary-quality first — support sites only store
  // when no dictionary site knows the term
  const dictionary = found.filter(
    (r) => r.domain === "dictionaryapi.dev" || r.domain === "wiktionary.org",
  );
  const chosen = dictionary[0] ?? found[0] ?? null;
  if (!chosen || !chosen.meaning) {
    return {
      term: clean,
      results,
      meaning: null,
      confidence: 0,
      domains: [],
      note: "no site returned a meaning — nothing stored",
    };
  }
  const domains = found.map((r) => r.domain);
  const crossChecked = found.length >= 2;
  return {
    term: clean,
    results,
    meaning: chosen.meaning,
    confidence: crossChecked ? 0.6 : 0.4,
    domains,
    note: crossChecked
      ? `recognized by ${found.length} independent site(s) (cross-checked)`
      : "single source — lower confidence, easily overwritten by teaching",
  };
}

/** Store a researched meaning in the registry — RESEARCH
 *  provenance: lower confidence than owner-taught (0.9),
 *  honestly labeled, the owner can correct or confirm. */
export async function researchTerm(
  db: VocabularyDb,
  ownerId: string | null,
  term: string,
  meaning: string,
  domains: string[],
  confidence: number,
): Promise<boolean> {
  const clean = term.toLowerCase().trim().slice(0, 60);
  const row = {
    term_key: clean,
    term: clean,
    term_type: "word",
    word_class: "unknown",
    meaning: meaning.trim().slice(0, 500),
    source: "research",
    provenance: `researched from ${domains.join(", ")}, ${new Date().toISOString().slice(0, 10)}`,
    confidence,
    status: "ACTIVE",
    times_seen: 1,
    context: null,
    created_by: ownerId,
  };
  const { error } = await db
    .from(table("vocabulary"))
    .upsert([row], { onConflict: "term_key" });
  return !error;
}

/** Does a meaning-research request reference a term, and
 *  is there a recent definition question to resolve "it"?
 *  Used by the engine's research route: "research what
 *  kwisatz means", "research the word kwisatz", or a bare
 *  "research it" following "what does kwisatz mean".
 *  Accepts BOTH history shapes: kernel turns (role + parts)
 *  and session memory (role + text). */
export function extractMeaningResearchRequest(
  input: string,
  history?: Array<{
    role: string;
    parts?: Array<{ text?: string }>;
    text?: string;
  }>,
): string | null {
  const direct =
    /^(?:research|look\s+up|find\s+out)\s+(?:what\s+)?["']?([a-z][\w' -]{0,60}?)["']?\s+(?:means|stands\s+for)\b/i.exec(
      input,
    ) ??
    /^(?:research|look\s+up|find\s+out)\s+(?:the\s+)?(?:word|phrase|term|meaning\s+of)\s+["']?([a-z][\w' -]{0,60})["']?\s*$/i.exec(
      input,
    );
  if (direct) {
    return direct[1]
      .trim()
      .replace(/^(?:the|a|an)\s+/i, "")
      .toLowerCase();
  }
  // bare "research it" — resolve the antecedent from the
  // most recent definition question in the conversation
  const it = /^(?:research|look\s+up)\s+it\b/i.test(input);
  if (!it || !history) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    // "owner" is the engine/client contract; "user" is the
    // common web convention — accept both as the human turn.
    if (turn.role !== "owner" && turn.role !== "user") continue;
    const text = (
      turn.text ?? (turn.parts ?? []).map((p) => p.text ?? "").join(" ")
    ).trim();
    const defQ =
      /(?:what\s+(?:does|do|is)|define|meaning\s+of)\s+["']?([a-z][\w' -]{0,60}?)["']?\s*(?:mean|means)?\s*\??$/i.exec(
        text,
      );
    if (defQ) {
      return defQ[1]
        .trim()
        .replace(/^(?:the|a|an|word|phrase|term)\s+/i, "")
        .replace(/\s+(?:word|phrase|term)$/i, "")
        .toLowerCase();
    }
  }
  return null;
}
