// =========================================================
// FRELUX INTEL SEARCH — provider-abstracted search intelligence
//
// Uses an approved search provider/API rather than scraping
// search-engine result pages. Providers are adapters (TAVILY
// implemented; SERPER/BRAVE/CUSTOM slots ready) — no
// Google-specific logic anywhere. Results are EVIDENCE
// CANDIDATES, never automatic truth, and nothing is ingested
// automatically. API keys live only in server-side env.
// =========================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const CORS = {
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface SearchCandidate {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  retrieved_at: string;
}

interface SearchAdapter {
  search(
    query: string,
    opts: { maxResults: number },
  ): Promise<SearchCandidate[]>;
}

function tavilyAdapter(apiKey: string): SearchAdapter {
  return {
    async search(query, opts) {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: opts.maxResults,
          search_depth: "basic",
        }),
      });
      if (!res.ok) throw new Error(`Tavily API error ${res.status}`);
      const data = await res.json();
      return (data.results ?? []).map(
        (r: { title?: string; url: string; content?: string }) => ({
          title: r.title ?? r.url,
          url: r.url,
          snippet: (r.content ?? "").slice(0, 400),
          provider: "TAVILY",
          retrieved_at: new Date().toISOString(),
        }),
      );
    },
  };
}

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.AI,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "POST only." });
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer "))
    return json(401, { ok: false, error: "Authentication required." });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const caller = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${authHeader.replace("Bearer ", "")}` },
    },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user)
    return json(401, { ok: false, error: "Invalid session." });
  const service = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profile?.role !== "admin")
    return json(403, { ok: false, error: "Admin authorization required." });

  let body: { query?: string; maxResults?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body must be JSON." });
  }
  const query = (body.query ?? "").trim();
  if (!query) return json(400, { ok: false, error: "query is required." });

  const { data: provider } = await service
    .from("frelux_search_providers")
    .select("name, adapter")
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (!provider) {
    return json(409, {
      ok: false,
      error:
        "No search provider is configured. Register an approved provider in Admin → Intelligence Sources (API keys are set server-side only).",
    });
  }
  const adapterName = (provider as { adapter: string }).adapter;
  let adapter: SearchAdapter | null = null;
  if (adapterName === "TAVILY") {
    const key = Deno.env.get("TAVILY_API_KEY");
    if (key) adapter = tavilyAdapter(key);
  }
  // SERPER / BRAVE / CUSTOM adapters slot in here without any change to callers.
  if (!adapter) {
    return json(409, {
      ok: false,
      error: `Provider ${adapterName} is registered but its server-side API key is not configured.`,
    });
  }

  try {
    const results = await adapter.search(query, {
      maxResults: Math.min(body.maxResults ?? 8, 10),
    });
    return json(200, {
      ok: true,
      provider: adapterName,
      results,
      message:
        "Results are EVIDENCE CANDIDATES only — not verified truth. Register the site as a source and crawl it to feed the learning pipeline.",
    });
  } catch (e) {
    return json(502, {
      ok: false,
      error: `Search provider failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
  }
});
