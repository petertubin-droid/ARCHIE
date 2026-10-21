// =========================================================
// GEMINI RESEARCH ADAPTER — ARCHIE learns FROM Gemini
// (owner directive 2026-10-18)
//
// GEMINI IS NOT INSIDE ARCHIE. It is an EXTERNAL research
// source, exactly like Wikipedia, DuckDuckGo, Google Books,
// StackExchange and arXiv: ARCHIE consults it ON KNOWLEDGE
// MISSES, treats its answer as low-confidence CANDIDATE
// knowledge with named provenance, and never lets it anywhere
// near the reasoning path. The native engine reasons; Gemini
// only gets to suggest. The owner's teaching always
// overwrites; candidate knowledge is never presented as
// validated fact.
//
// Honesty rules (same as every other adapter):
// - no API key configured => FAILURE note ("never executed"),
//   never a fake zero-hit search
// - network/timeout/http errors => FAILURE note, falls
//   through to the next source in the composite
// - a genuine empty/refused answer => the ONLY real zero
// =========================================================

import type { ResearchAdapter, ResearchHit } from "./webresearch.ts";

// BATCH 43 (2026-10-21): the pinned gemini-2.0-flash was
// retired upstream and every call began returning 404
// (live-verified from production). The model is now
// env-overridable (GEMINI_RESEARCH_MODEL) so a retirement
// never needs a code change again; the default tracks the
// current stable flash model.
const GEMINI_MODEL = resolveModelName();
function resolveModelName(): string {
  // Deno edge runtime in production; never throws under vitest.
  try {
    const d = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } })
      .Deno;
    if (d?.env?.get) {
      return d.env.get("GEMINI_RESEARCH_MODEL") ?? "gemini-2.5-flash";
    }
  } catch {
    /* not the edge runtime */
  }
  return "gemini-2.5-flash";
}
const DEFAULT_TIMEOUT_MS = 4000;
const SNIPPET_MAX = 400;

export interface GeminiResearchAdapterOptions {
  /** Injected key (tests). Production resolves from env lazily,
   * per request, so a key added after boot is picked up. */
  apiKey?: string;
  /** Injectable fetch (tests pass a stub). */
  fetchFn?: typeof fetch;
  /** Per-request timeout. */
  timeoutMs?: number;
}

function resolveEnvKey(): string {
  // Deno edge runtime in production; never throws under vitest.
  try {
    const d = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } })
      .Deno;
    if (d?.env?.get) {
      return d.env.get("GEMINI_API_KEY") ?? d.env.get("GOOGLE_AI_API_KEY") ?? "";
    }
  } catch {
    /* not Deno */
  }
  return "";
}

/** Prompt honesty constraints, mirroring the human-readable
 * rules ARCHIE itself follows: no invention, admit gaps. */
function knowledgePrompt(query: string): string {
  return [
    "You are an external knowledge source consulted by a system that stores",
    "your answer as LOW-CONFIDENCE candidate knowledge pending validation.",
    "Answer the question with a concise factual paragraph.",
    "If you are not confident about the answer, reply with exactly:",
    "NO RELIABLE ANSWER",
    "Never invent numbers, names, or claims. No lists, no markdown.",
    "",
    `Question: ${query}`,
  ].join("\n");
}

// ---------------------------------------------------------
// SCHEDULED-PATH GUARD (batch 40, owner directive
// 2026-10-21: the resumed cron must NOT consume Gemini):
// a module-level switch the maintenance edge function turns
// OFF for its whole invocation. While off, search() returns
// a zero-hit disabled note WITHOUT touching the network —
// even if a future maintenance mode ever reaches the
// research chain, Gemini quota is provably untouched.
// Chat (owner/visitor) keeps the default ON; the toggle is
// synchronous module state, so it affects every adapter
// instance in the isolate for the duration of the pass.
// ---------------------------------------------------------
let geminiResearchEnabled = true;

export function setGeminiResearchEnabled(on: boolean): void {
  geminiResearchEnabled = on;
}

export function isGeminiResearchEnabled(): boolean {
  return geminiResearchEnabled;
}

export class GeminiResearchAdapter implements ResearchAdapter {
  readonly id = "gemini-knowledge";
  private readonly injectedKey?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GeminiResearchAdapterOptions = {}) {
    this.injectedKey = opts.apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async search(
    query: string,
  ): Promise<{ hits: ResearchHit[]; note: string }> {
    if (!geminiResearchEnabled) {
      // Guard engaged: no key resolution, no network, no
      // quota — an honest zero with the reason stated.
      return {
        hits: [],
        note: "gemini research disabled for this context (scheduled maintenance is quota-free by construction)",
      };
    }
    const key = this.injectedKey ?? resolveEnvKey();
    if (!key) {
      return {
        hits: [],
        note:
          "gemini api unavailable (no key configured — skipped, never fabricated)",
      };
    }
    let res: Response;
    try {
      res = await this.fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: knowledgePrompt(query) }] }],
            // BATCH 43 (live-verified 2026-10-21): 2.5-flash is a
            // thinking model; default thinking blew the 4s edge
            // budget (TimeoutError) where non-thinking 2.0-flash
            // fit. This is a latency-critical single-fact lookup,
            // so thinking is disabled for it.
            generationConfig: {
              temperature: 0,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch (e) {
      return {
        hits: [],
        note: `gemini api unavailable (network: ${e instanceof Error ? e.name : "error"})`,
      };
    }
    if (!res.ok) {
      return {
        hits: [],
        note: `gemini api unavailable (http ${res.status})`,
      };
    }
    let body: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { hits: [], note: "gemini api unavailable (malformed response)" };
    }
    const answer = (body.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!answer) {
      return { hits: [], note: "gemini api unavailable (empty response)" };
    }
    if (/^no reliable answer/i.test(answer)) {
      // The model honestly declined — a genuine zero, not a failure.
      return { hits: [], note: "no answer from gemini for this query" };
    }
    return {
      hits: [
        {
          title: `Gemini knowledge: ${query.slice(0, 80)}`,
          url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`,
          snippet: answer.slice(0, SNIPPET_MAX),
          domain: "generativelanguage.googleapis.com",
        },
      ],
      note: "answered by Gemini (AI model knowledge — candidate, not validated)",
    };
  }
}
