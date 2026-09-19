// ============================================================
// ARCHIE NATIVE ENGINE — OWNER-GATED LOCAL GENERATIVE MODEL
// (gap audit A-1, owner directive 2026-09-16)
// ============================================================
// The last honest gap in ARCHIE's language ability: open-ended
// GENERATION. Everything ARCHIE says today is composed from
// owner-validated knowledge, rule chains, or real tool output —
// when it knows nothing, it says so. This gateway adds the one
// missing capability WITHOUT breaking that contract:
//
//   OWNER-GATED. Only an owner-authorized request can invoke
//   generation (the chat front door's owner path; the agent
//   worker passes ownerAuthorized=false — agent work products
//   stay verifiable, never generated). Family and visitor
//   traffic structurally never reaches this code.
//
//   LOCAL-ONLY. The endpoint is the OWNER'S OWN model server
//   (Ollama / llama.cpp compatible), configured via the
//   ARCHIE_LOCAL_MODEL_URL + ARCHIE_LOCAL_MODEL_NAME secrets.
//   No external AI provider is involved — the OpenAI
//   separation rule is untouched; nothing leaves the owner's
//   infrastructure.
//
//   HONEST ABSENCE. No endpoint configured, endpoint down,
//   timeout, or malformed response → the answer is a real
//   unavailability, and the caller keeps the honest-unknown
//   response. Generation is never simulated, never faked.
//
//   LABELED OUTPUT. Generated text is returned with an
//   explicit GENERATED label and is NEVER stored as knowledge,
//   NEVER enters the FactStore, and NEVER inherits confidence
//   from validated facts. The epistemic class stays UNVERIFIED.
//
//   AUDITED. Every attempt (forbidden, unavailable, generated)
//   is reported back to the caller for the audit chain — the
//   engine records it with the response.
// ============================================================

/** Runtime-agnostic env read: Deno in production (edge
 *  runtime), Node in tests (vitest). Same pattern config.ts
 *  established. */
function envRaw(name: string): string | undefined {
  const g = globalThis as {
    Deno?: { env?: { get(n: string): string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  try {
    return g.Deno?.env?.get(name) ?? g.process?.env?.[name];
  } catch {
    return undefined;
  }
}

/** Where the owner's local model server lives (Ollama /
 *  llama.cpp compatible). Absent = the capability is honestly
 *  unconfigured — never guessed, never defaulted. */
export function localModelUrl(): string | null {
  const url = (envRaw("ARCHIE_LOCAL_MODEL_URL") ?? "").trim();
  return url.length > 0 ? url : null;
}

/** The model name on the owner's server. Absent = the server's
 *  own default (its configuration decides, honestly). */
export function localModelName(): string {
  return (envRaw("ARCHIE_LOCAL_MODEL_NAME") ?? "").trim();
}

/** Injected for tests: the runtime fetch in production. */
export type GenerativeFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

const defaultFetch: GenerativeFetch = (url, init) => fetch(url, init);

export type GenerativeOutcome =
  | {
      status: "generated";
      text: string;
      model: string;
      latencyMs: number;
    }
  | {
      status: "forbidden";
      reason: string;
    }
  | {
      status: "unavailable";
      reason: string;
    };

/** The maximum wall-clock a generation may take before ARCHIE
 *  answers honestly without it. The owner's local server, on
 *  the owner's hardware, at the owner's patience. */
const GENERATIVE_TIMEOUT_MS = 30_000;

/** Owner-gated local generation. Never throws — every failure
 *  is an honest, typed outcome the caller can report. */
export async function ownerLocalGenerate(opts: {
  prompt: string;
  ownerAuthorized: boolean;
  fetchFn?: GenerativeFetch;
  timeoutMs?: number;
}): Promise<GenerativeOutcome> {
  if (!opts.ownerAuthorized) {
    return {
      status: "forbidden",
      reason:
        "generation is owner-gated — this request has no owner authorization",
    };
  }
  const url = localModelUrl();
  if (!url) {
    return {
      status: "unavailable",
      reason:
        "no local model endpoint is configured (ARCHIE_LOCAL_MODEL_URL) — the capability is honestly absent",
    };
  }

  const fetchFn = opts.fetchFn ?? defaultFetch;
  const timeoutMs = opts.timeoutMs ?? GENERATIVE_TIMEOUT_MS;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Ollama-compatible /api/generate contract; llama.cpp
    // servers expose the same shape. stream:false — the whole
    // answer arrives in one honest response, never pieced
    // together from partial guesses.
    const res = await fetchFn(`${url.replace(/\/+$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(localModelName() ? { model: localModelName() } : {}),
        prompt: opts.prompt,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        status: "unavailable",
        reason: `the local model server answered HTTP ${res.status} — reported honestly, never retried into a guess`,
      };
    }
    const body = (await res.json()) as { response?: unknown };
    const text = typeof body.response === "string" ? body.response.trim() : "";
    if (text.length === 0) {
      return {
        status: "unavailable",
        reason:
          "the local model returned an empty answer — nothing fabricated to fill it",
      };
    }
    return {
      status: "generated",
      text,
      model: localModelName() || "local-default",
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `the local model did not answer within ${timeoutMs}ms — the answer proceeds without it`
        : `the local model endpoint is unreachable (${err instanceof Error ? err.message : "unknown error"}) — the answer proceeds without it`;
    return { status: "unavailable", reason };
  } finally {
    clearTimeout(timer);
  }
}

/** The honesty label attached to any generated text. The marker
 *  "GENERATED" survives in every variant (tests enforce it):
 *  generated output is NEVER dressed as validated knowledge. */
const GENERATED_LABELS = [
  "GENERATED by the local model",
  "GENERATED locally (unverified)",
  "GENERATED text from the local model",
];

export function generatedLabel(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GENERATED_LABELS[h % GENERATED_LABELS.length];
}
