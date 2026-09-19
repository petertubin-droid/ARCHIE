// =========================================================
// serveWithCors — the CORS boundary for every ARCHIE edge
// function (audit fix M-5, 2026-09-11).
//
// Wrap the handler instead of threading `req` through every
// response builder: the boundary strips any stale ACAO a
// handler set (legacy local corsHeaders wildcards) and
// applies the per-request origin-echo allowlist exactly once,
// for every response, stream included. One-line change per
// function, zero helper cascades.
// =========================================================
import { resolveCorsHeaders } from "./cors.ts";

type Handler = (req: Request) => Response | Promise<Response>;

/** Default Deno entrypoint (edge runtime). Guarded so unit
 *  tests and non-Deno tooling (tsc on the web app) resolve the
 *  module without a Deno global. */
const denoServe: (handler: Handler) => unknown = (handler) =>
  (globalThis as { Deno?: { serve?: (h: Handler) => unknown } }).Deno?.serve!(
    handler,
  );

/**
 * Serve with the CORS boundary applied. The handler's own
 * Access-Control-Allow-Origin (if any) is always OVERRIDDEN —
 * the allowlist in _shared/cors.ts is the single authority.
 */
export function serveWithCors(
  handler: Handler,
  serveImpl: (handler: Handler) => unknown = denoServe,
): unknown {
  return serveImpl(async (req: Request): Promise<Response> => {
    // Preflight fast-path: every function answers OPTIONS uniformly
    // with the per-request CORS decision — handlers never see it,
    // and preflights never consume rate-limit quota.
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: resolveCorsHeaders(req),
      });
    }
    const res = await handler(req);
    const headers = new Headers(res.headers);
    // Strip any stale ACAO set inside the handler.
    headers.delete("Access-Control-Allow-Origin");
    // Apply the per-request decision exactly once.
    for (const [k, v] of Object.entries(resolveCorsHeaders(req))) {
      headers.set(k, v);
    }
    // Cache correctness: the response varies by Origin.
    const vary = headers.get("vary");
    if (!vary?.includes("Origin")) {
      headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
    return new Response(res.body, { status: res.status, headers });
  });
}
