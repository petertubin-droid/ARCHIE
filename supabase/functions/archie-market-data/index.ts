// =========================================================
// archie-market-data — REAL live market prices for ARCHIE
// trading, powered by the Massive.com market data API.
//
// OWNER DIRECTIVE (2026-10-19): the trade section must show
// live market prices for all markets — stocks, crypto, forex,
// IPOs — through the Massive.com API, and ARCHIE's crypto
// knowledge must evolve from real market data.
//
// DESIGN CONTRACT:
//   * Owner/Admin-gated exactly like archie-trading: market
//     data feeds the Owner's trading console and is never
//     exposed to visitors.
//   * The Massive API key NEVER leaves the edge function —
//     the PWA only ever sees normalized prices.
//   * HONEST DATA, NEVER FABRICATED: this plan carries daily
//     aggregates (EOD/delayed), reference tickers, IPOs and
//     market status. Intraday/snapshot entitlements surface
//     honestly as "not_entitled" per symbol — nothing is
//     simulated, interpolated or faked.
//   * Every daily bar returned for a crypto pair is also
//     persisted as a VALIDATED native fact in
//     frelux_archie_native_facts (throttled: one fact per
//     symbol per UTC day) — ARCHIE's knowledge of crypto
//     markets grows from real observed prices, exactly like
//     the tree methodology's roots.
//   * In-isolate TTL cache (10 min) keeps the Owner's plan
//     quota safe — repeated console refreshes are served from
//     memory, not from Massive.
// =========================================================

import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Read per-request: the edge runtime env is constant in
// production, but the test harness varies it between cases.
const MASSIVE_KEY = () => Deno.env.get("MARKET_DATA_API_KEY") ?? "";

const MASSIVE_BASE = "https://api.massive.com";

// Daily-granularity data (EOD/delayed): a 10-minute cache is
// honest — the upstream bar cannot change faster than the
// daily roll — and protects the plan's request quota.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

// REST helper with BOTH apikey + bearer (Kong requirement,
// same convention as archie-trading).
async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      data: null,
      error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  return { data: body as T, error: null };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------
// Massive.com REST client (server-side only)
// ---------------------------------------------------------
async function massive<T>(
  path: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; kind: string; message: string }> {
  if (!MASSIVE_KEY()) {
    return {
      ok: false,
      status: 503,
      kind: "not_configured",
      message: "Market data is not configured on this deployment.",
    };
  }
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ok: true, data: cached.value as T };
  }
  let res: Response;
  try {
    res = await fetch(MASSIVE_BASE + path, {
      headers: { Authorization: `Bearer ${MASSIVE_KEY()}` },
    });
  } catch {
    return {
      ok: false,
      status: 502,
      kind: "upstream_unreachable",
      message: "The market data provider could not be reached.",
    };
  }
  const body = await res.json().catch(() => null) as
    | (Record<string, unknown> & { status?: string; message?: string })
    | null;
  if (!res.ok) {
    const message = typeof body?.message === "string" ? body.message : "";
    const kind = res.status === 401 || res.status === 403
      ? "not_entitled"
      : res.status === 404
        ? "not_found"
        : "upstream_error";
    return { ok: false, status: res.status, kind, message };
  }
  if (body === null) {
    return { ok: false, status: 502, kind: "upstream_error", message: "Invalid provider response." };
  }
  cache.set(path, { at: Date.now(), value: body });
  return { ok: true, data: body as T };
}

interface AggBar {
  T?: string;
  v: number;
  vw?: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
  n?: number;
}

interface AggsResponse {
  results?: AggBar[];
  resultsCount?: number;
}

/** Last daily bar for one ticker (works for stocks, crypto and forex). */
async function prevBar(ticker: string): Promise<AggBar | null> {
  const r = await massive<AggsResponse>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`,
  );
  return r.ok && r.data.results && r.data.results.length ? r.data.results[0] : null;
}

/** The two most recent daily bars — the second gives day-over-day change. */
async function lastTwoBars(ticker: string): Promise<AggBar[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const r = await massive<AggsResponse>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${iso(from)}/${iso(to)}`,
  );
  if (!r.ok || !r.data.results) return [];
  const bars = [...r.data.results].sort((a, b) => a.t - b.t);
  return bars.slice(-2);
}

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Map ARCHIE console symbols to Massive tickers where covered. */
function toMassiveTicker(symbol: string): string {
  const s = normalizeTicker(symbol);
  // Already a Massive native ticker (AAPL, X:BTCUSD, C:EURUSD…)
  if (/^[A-Z]+:[A-Z0-9]+$/.test(s) || /^[A-Z.=-]{1,10}$/.test(s)) return s;
  // Console pair style: BTC/USD → X:BTCUSD, EUR/USD → C:EURUSD
  const m = s.match(/^([A-Z0-9]+)\/?USD$/);
  if (m) {
    const base = m[1];
    const cryptoBase = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "LTC", "LINK", "AVAX", "TRX", "TON"];
    const forexBase = ["EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "USDT"];
    if (cryptoBase.includes(base)) return `X:${base}USD`;
    if (forexBase.includes(base)) return `C:${base}USD`;
  }
  // Reversed USD quote pairs: USD/JPY → C:USDJPY
  const rev = s.match(/^USD\/([A-Z]{3})$/);
  if (rev) return `C:USD${rev[1]}`;
  return s;
}

// ---------------------------------------------------------
// Crypto knowledge evolution (tree roots): persist each
// observed daily close as a VALIDATED native fact, one per
// symbol per UTC day (id is deterministic — replays upsert to
// the same row instead of spamming duplicates).
// ---------------------------------------------------------
async function recordCryptoFacts(bars: { ticker: string; bar: AggBar }[]): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  for (const { ticker, bar } of bars) {
    if (!ticker.startsWith("X:") || !bar?.c) continue;
    const day = new Date(bar.t).toISOString().slice(0, 10);
    const symbol = ticker.slice(2); // BTCUSD
    rows.push({
      id: `massive-daily-${ticker}-${day}`,
      subject: `crypto:${symbol}`,
      predicate: "closed_at_usd",
      object: {
        close: bar.c,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        volume: bar.v,
        day,
      },
      qualifiers: { granularity: "daily", source_ticker: ticker },
      confidence: 1.0,
      provenance: {
        source: "massive.com",
        endpoints: ["/v2/aggs/ticker/{t}/prev"],
        retrieved_at: new Date().toISOString(),
      },
      status: "validated",
      validated_count: 1,
    });
  }
  if (!rows.length) return;
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  // resolution=ignore-duplicates: a day's fact is recorded once.
  await fetch(`${base}rest/v1/frelux_archie_native_facts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify(rows),
  }).catch(() => {
    // Knowledge recording is opportunistic — a failed write
    // must never break the price response.
  });
}

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------
interface QuoteResult {
  symbol: string;
  ticker: string;
  price: number | null;
  change: number | null;
  changePerc: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  asOf: string | null;
  granularity: "daily";
  source: "massive";
  error?: { kind: string; message?: string };
}

async function actionQuotes(symbols: string[]): Promise<{ quotes: QuoteResult[] }> {
  const seen = new Set<string>();
  const tickers = symbols
    .map(normalizeTicker)
    .filter((s) => s.length > 0 && s.length <= 24 && seen.size < 25 && !seen.has(s) && seen.add(s))
    .map(toMassiveTicker);

  const results = await Promise.all(
    tickers.map(async (ticker): Promise<QuoteResult> => {
      const [prev, two] = await Promise.all([
        prevBar(ticker),
        lastTwoBars(ticker),
      ]);
      if (!prev) {
        // Distinguish honest states: the range call tells us
        // whether the plan/symbol simply lacks entitlement.
        const probe = await massive<AggsResponse>(
          `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/2026-01-01/2026-01-08`,
        );
        const err: QuoteResult = {
          symbol: ticker,
          ticker,
          price: null,
          change: null,
          changePerc: null,
          open: null,
          high: null,
          low: null,
          volume: null,
          asOf: null,
          granularity: "daily",
          source: "massive",
          error: probe.ok
            ? { kind: "no_data", message: "No daily bar for this ticker." }
            : { kind: probe.kind, message: probe.message },
        };
        return err;
      }
      const earlier = two.length >= 2 ? two[0] : two[0]?.t !== prev.t ? two[0] : undefined;
      const change = earlier && earlier.c ? prev.c - earlier.c : null;
      const changePerc = earlier && earlier.c
        ? Number((((prev.c - earlier.c) / earlier.c) * 100).toFixed(2))
        : null;
      return {
        symbol: ticker,
        ticker,
        price: prev.c,
        change,
        changePerc,
        open: prev.o,
        high: prev.h,
        low: prev.l,
        volume: prev.v,
        asOf: new Date(prev.t).toISOString(),
        granularity: "daily",
        source: "massive",
      };
    }),
  );

  // Evolve ARCHIE's crypto knowledge from what was observed.
  recordCryptoFacts(
    results
      .filter((r): r is QuoteResult & { price: number } => r.price !== null)
      .map((r) => ({ ticker: r.ticker, bar: { T: r.ticker, v: r.volume ?? 0, o: r.open ?? 0, c: r.price, h: r.high ?? 0, l: r.low ?? 0, t: new Date(r.asOf ?? 0).getTime() } })),
  ).catch(() => {});

  return { quotes: results };
}

async function actionHistory(symbol: string, days: number): Promise<Record<string, unknown>> {
  const ticker = toMassiveTicker(symbol);
  const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - span * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const r = await massive<AggsResponse>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${iso(from)}/${iso(to)}`,
  );
  if (!r.ok) {
    return { symbol: ticker, candles: [], error: { kind: r.kind, message: r.message } };
  }
  const candles = (r.data.results ?? [])
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((b) => ({
      time: b.t,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  return { symbol: ticker, granularity: "daily", candles };
}

interface TickerRef {
  ticker?: string;
  name?: string;
  market?: string;
  locale?: string;
  primary_exchange?: string;
  type?: string;
  active?: boolean;
  currency_name?: string;
  last_updated_utc?: string;
}

async function actionSearch(query: string, market: string, limit: number): Promise<Record<string, unknown>> {
  const q = query.trim().slice(0, 64);
  const lim = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const params = new URLSearchParams({
    active: "true",
    limit: String(lim),
  });
  if (q) params.set("search", q);
  if (market && ["stocks", "crypto", "fx", "forex"].includes(market)) {
    params.set("market", market === "forex" ? "fx" : market);
  }
  const r = await massive<{ results?: TickerRef[] }>(
    `/v3/reference/tickers?${params.toString()}`,
  );
  if (!r.ok) return { results: [], error: { kind: r.kind, message: r.message } };
  const results = (r.data.results ?? []).map((t) => ({
    ticker: t.ticker ?? "",
    name: t.name ?? "",
    market: t.market ?? "",
    exchange: t.primary_exchange ?? "",
    type: t.type ?? "",
    active: t.active ?? true,
    currency: t.currency_name ?? "",
  }));
  return { results };
}

interface IpoResult {
  ticker?: string;
  issuer_name?: string;
  ipo_status?: string;
  listing_date?: string;
  final_issue_price?: number;
  lowest_offer_price?: number;
  highest_offer_price?: number;
  total_offer_size?: number;
  primary_exchange?: string;
}

async function actionIpos(status: string, limit: number): Promise<Record<string, unknown>> {
  const lim = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
  const params = new URLSearchParams({ limit: String(lim) });
  const allowed = ["pending", "new", "rumor", "history", "withdrawn", "postponed", "direct_listing_process"];
  if (status && allowed.includes(status)) params.set("ipo_status", status);
  const r = await massive<{ results?: IpoResult[] }>(
    `/vX/reference/ipos?${params.toString()}`,
  );
  if (!r.ok) return { ipos: [], error: { kind: r.kind, message: r.message } };
  const ipos = (r.data.results ?? []).map((i) => ({
    ticker: i.ticker ?? "",
    issuer: i.issuer_name ?? "",
    status: i.ipo_status ?? "",
    listingDate: i.listing_date ?? "",
    finalPrice: i.final_issue_price ?? null,
    lowPrice: i.lowest_offer_price ?? null,
    highPrice: i.highest_offer_price ?? null,
    offerSize: i.total_offer_size ?? null,
    exchange: i.primary_exchange ?? "",
  }));
  return { ipos };
}

async function actionMarketStatus(): Promise<Record<string, unknown>> {
  const r = await massive<Record<string, unknown>>("/v1/marketstatus/now");
  if (!r.ok) return { error: { kind: r.kind, message: r.message } };
  return { status: r.data };
}

// ---------------------------------------------------------
// Handler
// ---------------------------------------------------------
serveWithCors(async (req: Request) => {
  const rl = checkRateLimit(getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined), RATE_LIMITS.GENERAL);
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return json(405, { error: "POST only." });

  // ---- authentication + owner/admin authorization ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "Invalid session." });

  const { data: profile } = await service<{ role: string }>(
    `/rest/v1/profiles?id=eq.${auth.user.id}&select=role`,
  ).then((r) =>
    Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r,
  );
  if (profile?.role !== "admin") {
    return json(403, {
      error:
        "Market data is Owner/Admin-only. Prices and IPO research are never exposed to non-owner accounts.",
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
  const action = String(payload.action ?? "");

  try {
    if (action === "quotes") {
      const raw = payload.symbols;
      const symbols = Array.isArray(raw)
        ? raw.map((s) => String(s)).slice(0, 25)
        : [];
      if (!symbols.length) return json(400, { error: "symbols (array, max 25) is required." });
      return json(200, await actionQuotes(symbols));
    }
    if (action === "history") {
      const symbol = String(payload.symbol ?? "");
      if (!symbol) return json(400, { error: "symbol is required." });
      return json(200, await actionHistory(symbol, Number(payload.days ?? 30)));
    }
    if (action === "search") {
      return json(200, await actionSearch(String(payload.query ?? ""), String(payload.market ?? ""), Number(payload.limit ?? 20)));
    }
    if (action === "ipos") {
      return json(200, await actionIpos(String(payload.status ?? ""), Number(payload.limit ?? 20)));
    }
    if (action === "marketstatus") {
      return json(200, await actionMarketStatus());
    }
    return json(400, {
      error: "Unknown action. Valid: quotes | history | search | ipos | marketstatus.",
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : "Market data failure.",
    });
  }
});
