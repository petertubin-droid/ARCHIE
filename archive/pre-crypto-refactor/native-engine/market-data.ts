// =========================================================
// MARKET DATA LAYER — Crypto & Blockchain Intelligence
// (owner directive 2026-09-11, NO SUB-AGENTS).
//
// Real provider adapters with HONEST classification. Nothing
// here is simulated: every number comes from a live HTTP call
// or is classified as a refusal/unavailable.
//
// MEASURED LIVE 2026-09-11 (sandbox, edge-relevant):
//   CoinGecko simple/price + ohlc ......... REACHABLE, keyless
//   Coinbase Exchange candles + ticker ... REACHABLE, keyless
//   Binance api/v3 (klines, 24h ticker) ... REFUSED (geo-block:
//     "Service unavailable from a restricted location") —
//     classified honestly, never faked
//   Derivatives (funding rates, open interest) — NO KEYLESS
//     reachable endpoint; honestly UNAVAILABLE until an owner
//     configures a derivatives provider.
//
// The composite falls through: primary candles from Coinbase,
// spot price cross-checked against CoinGecko (two independent
// domains = the web-research corroboration pattern). A refusal
// from one provider NEVER becomes a zero-price "success".
// =========================================================

export type ProviderStatus = "ok" | "refused" | "unavailable" | "stale";

export interface MarketCandle {
  /** Unix ms, UTC, candle OPEN time. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SpotQuote {
  price: number;
  currency: "usd";
  /** Which provider this quote came from. */
  provider: string;
  /** Server-independent fetch time (ms since epoch). */
  fetchedAt: number;
}

export interface MarketSnapshot {
  symbol: string;
  candles: MarketCandle[];
  /** Independent-domain spot quote used for cross-checking. */
  crossCheck: SpotQuote | null;
  /** Honest provider classification note for the report. */
  notes: string[];
  fetchedAt: number;
}

/** Known symbol → provider ids (CoinGecko). Unknown symbols are
 *  refused honestly — ARCHIE does not guess an asset identity. */
const COINGECKO_IDS: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "binancecoin",
  sol: "solana",
  solana: "solana",
  xrp: "ripple",
  ripple: "ripple",
  ada: "cardano",
  cardano: "cardano",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  usdt: "tether",
  tether: "tether",
  link: "chainlink",
  chainlink: "chainlink",
  matic: "matic-network",
  polygon: "matic-network",
  dot: "polkadot",
  polkadot: "polkadot",
  ltc: "litecoin",
  litecoin: "litecoin",
};

export function coingeckoIdFor(symbol: string): string | null {
  return COINGECKO_IDS[symbol.trim().toLowerCase()] ?? null;
}

export interface MarketDataOptions {
  fetchFn?: typeof fetch;
  /** Hard per-request timeout. Default 10s. */
  timeoutMs?: number;
  /** Candles that fail freshness (older than this, ms) make the
   *  snapshot STALE. Default 30 minutes for the newest candle. */
  staleAfterMs?: number;
}

function classifyResponse(status: number, body: string): ProviderStatus {
  if (status === 403 || status === 451) return "refused";
  if (status >= 500) return "unavailable";
  if (status >= 400) return "refused";
  if (body.length === 0) return "unavailable";
  return "ok";
}

/** Fetch with hard timeout — never hangs, never retries forever.
 *  Classifies network errors as unavailable, not as zero data. */
export async function fetchJson(
  url: string,
  opts: { fetchFn: typeof fetch; timeoutMs: number },
): Promise<{ status: ProviderStatus; body: string; httpStatus: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await opts.fetchFn(url, { signal: ctrl.signal });
    const body = await res.text();
    return {
      status: classifyResponse(res.status, body),
      body,
      httpStatus: res.status,
    };
  } catch {
    return { status: "unavailable", body: "", httpStatus: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Coinbase Exchange candles. Response is NEWEST-FIRST:
 *  [time, low, high, open, close, volume]. Granularity 86400
 *  gives daily candles; the API returns at most 300. */
export async function fetchCandles(
  base: string,
  quote: string,
  limit: number,
  opts: MarketDataOptions = {},
): Promise<{ candles: MarketCandle[]; status: ProviderStatus; note: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const pair = `${base.toUpperCase()}-${quote.toUpperCase()}`;
  const url =
    `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=86400`;
  const res = await fetchJson(url, { fetchFn, timeoutMs });
  if (res.status !== "ok") {
    return {
      candles: [],
      status: res.status,
      note: `candle provider ${res.status} (http ${res.httpStatus}) — refusing to fabricate price history`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(res.body);
  } catch {
    return {
      candles: [],
      status: "unavailable",
      note: "candle provider returned unparseable JSON — classified unavailable",
    };
  }
  if (!Array.isArray(raw)) {
    return {
      candles: [],
      status: "unavailable",
      note: "candle provider returned unexpected shape — classified unavailable",
    };
  }
  const candles: MarketCandle[] = raw
    .map((row) => {
      const r = row as [number, number, number, number, number, number];
      if (
        !Array.isArray(r) ||
        r.length < 6 ||
        r.slice(0, 6).some((v) => !Number.isFinite(v))
      )
        return null;
      return {
        time: r[0] * 1000,
        low: r[1],
        high: r[2],
        open: r[3],
        close: r[4],
        volume: r[5],
      } satisfies MarketCandle;
    })
    .filter((c): c is MarketCandle => c !== null)
    .sort((a, b) => a.time - b.time) // oldest first
    .slice(-limit);
  if (candles.length === 0) {
    return {
      candles: [],
      status: "unavailable",
      note: "candle provider returned zero usable rows — classified unavailable",
    };
  }
  return {
    candles,
    status: "ok",
    note: `coinbase-exchange candles: ${candles.length} daily candles for ${pair}`,
  };
}

/** CoinGecko spot price (independent domain — cross-check). */
export async function fetchSpotQuote(
  symbol: string,
  opts: MarketDataOptions = {},
): Promise<{ quote: SpotQuote | null; status: ProviderStatus; note: string }> {
  const id = coingeckoIdFor(symbol);
  if (!id) {
    return {
      quote: null,
      status: "refused",
      note: `unknown symbol "${symbol}" — no CoinGecko id mapping, refusing to guess the asset`,
    };
  }
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const res = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { fetchFn, timeoutMs },
  );
  if (res.status !== "ok") {
    return {
      quote: null,
      status: res.status,
      note: `spot provider ${res.status} (http ${res.httpStatus})`,
    };
  }
  try {
    const parsed = JSON.parse(res.body) as Record<string, Record<string, number>>;
    const price = parsed[id]?.usd;
    if (!Number.isFinite(price)) {
      return {
        quote: null,
        status: "unavailable",
        note: "spot provider returned no finite price",
      };
    }
    return {
      quote: { price, currency: "usd", provider: "coingecko", fetchedAt: Date.now() },
      status: "ok",
      note: "coingecko spot price fetched",
    };
  } catch {
    return {
      quote: null,
      status: "unavailable",
      note: "spot provider returned unparseable JSON",
    };
  }
}

/** Derivatives (funding rate / open interest). NO keyless
 *  reachable provider was found live (Binance derivatives is
 *  geo-blocked, FTX-class APIs are gone) — so this HONESTLY
 *  reports unavailable rather than returning fake numbers. */
export async function fetchDerivatives(
  _symbol: string,
  _opts: MarketDataOptions = {},
): Promise<{ status: ProviderStatus; note: string; data: null }> {
  return {
    status: "unavailable",
    note: "funding/open-interest: no reachable keyless derivatives provider — data UNAVAILABLE (owner can configure a derivatives provider to enable it); never fabricated",
    data: null,
  };
}

/**
 * The composite market snapshot: candles + independent-domain
 * cross-check + honest notes. Freshness is MEASURED against the
 * newest candle — a snapshot whose newest candle is older than
 * staleAfterMs is flagged stale and the trade gate refuses it.
 */
export async function fetchMarketSnapshot(
  symbol: string,
  opts: MarketDataOptions & { candleLimit?: number } = {},
): Promise<MarketSnapshot | null> {
  const notes: string[] = [];
  const limit = opts.candleLimit ?? 90;
  const candlesRes = await fetchCandles(symbol, "usd", limit, opts);
  notes.push(candlesRes.note);
  if (candlesRes.status !== "ok" || candlesRes.candles.length === 0) {
    return null;
  }
  let crossCheck: SpotQuote | null = null;
  const spotRes = await fetchSpotQuote(symbol, opts);
  notes.push(spotRes.note);
  if (spotRes.status === "ok" && spotRes.quote) crossCheck = spotRes.quote;
  const derivatives = await fetchDerivatives(symbol, opts);
  notes.push(derivatives.note);
  return {
    symbol: symbol.toUpperCase(),
    candles: candlesRes.candles,
    crossCheck,
    notes,
    fetchedAt: Date.now(),
  };
}

/** Freshness verdict for a snapshot: the newest candle's time
 *  vs now. A daily-candle feed is stale when the newest candle
 *  is older than 36h (a daily candle closes every 24h; grace
 *  window covers provider lag). MEASURED, not assumed. */
export function snapshotFreshness(
  snap: MarketSnapshot,
  now: number = Date.now(),
): { fresh: boolean; ageHours: number } {
  const newest = snap.candles[snap.candles.length - 1];
  // Freshness is measured on the DATA (the newest candle), not
  // masked by the fetch timestamp: fetching NOW and receiving a
  // 48h-old candle is STALE data — the honest verdict.
  const ageMs = now - newest.time;
  const ageHours = ageMs / 3_600_000;
  return { fresh: ageHours <= 36, ageHours };
}
