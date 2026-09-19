// =========================================================
// Shared CORS helpers for Supabase Edge Functions
//
// AUDIT FIX M-5 (2026-09-11) — CORS was `Access-Control-Allow-
// Origin: *` on effectively every function: any website could
// make a visitor's browser read these endpoints' responses
// using the public anon key embedded in the frontend bundle.
// The wildcard is replaced by a per-request ORIGIN ECHO
// allowlist (see _shared/serve.ts — serveWithCors applies it
// at the response boundary of every function, overriding any
// stale header a handler set itself):
//
//   - ARCHIE_ALLOWED_ORIGINS env var (comma-separated) sets
//     the allowlist per deployment. The special value `*`
//     restores the legacy wildcard explicitly (documented,
//     deliberate, never silent).
//   - Default (env unset): the production webapp origin
//     (https://freluxtools.netlify.app) plus local dev
//     origins (localhost / 127.0.0.1 on common ports).
//   - A request whose Origin header is in the allowlist gets
//     that exact origin echoed with Vary: Origin.
//   - A request with NO Origin header (server-to-server,
//     curl, webhooks, same-origin) gets no ACAO header —
//     correct: CORS only governs cross-origin browser reads;
//     non-browser callers are unaffected.
//   - An UNLISTED origin gets no ACAO header: the browser
//     blocks the cross-origin read. Defense-in-depth on top
//     of the apikey/auth checks — never a replacement.
// =========================================================

/** The production webapp origin (Supabase config: Netlify deployment). */
export const PRODUCTION_ORIGINS = ["https://freluxtools.netlify.app"] as const;

/** Local development origins (vite dev server common ports). */
export const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
] as const;

/** Configured allowlist — deploy-driven via ARCHIE_ALLOWED_ORIGINS
 *  (comma-separated exact origins; `*` restores the wildcard). */
export function allowedOrigins(): string[] {
  // Deno-edge: Deno.env.get; environments without Deno (unit
  // tests) fall back to the default allowlist.
  const deno = (
    globalThis as {
      Deno?: { env?: { get?: (k: string) => string | undefined } };
    }
  ).Deno;
  const configured = deno?.env?.get?.("ARCHIE_ALLOWED_ORIGINS");
  if (!configured) return [...PRODUCTION_ORIGINS, ...DEV_ORIGINS];
  return configured
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Per-request CORS headers. `req` is REQUIRED by design: the
 *  origin decision is per-request, never cached across
 *  requests on an isolate. */
export function resolveCorsHeaders(req: Request): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
  const origins = allowedOrigins();
  if (origins.includes("*")) {
    return { "Access-Control-Allow-Origin": "*", ...base };
  }
  const origin = req.headers.get("origin");
  if (!origin) return base;
  if (origins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      ...base,
    };
  }
  return { Vary: "Origin", ...base };
}

/** Back-compat header set for the legacy helpers below —
 *  deliberately WITHOUT Access-Control-Allow-Origin: the
 *  serveWithCors boundary is the single authority for ACAO. */
export const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
} as const;

/** OPTIONS preflight — echoes the allowed origin (or omits
 *  ACAO for unlisted origins, which is the block). */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: resolveCorsHeaders(req) });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse({ error: message }, status, extraHeaders);
}

export function rateLimitedResponse(resetAt: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
