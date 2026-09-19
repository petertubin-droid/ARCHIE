// =========================================================
// ARCHIE NATIVE ENGINE — MULTI-VENUE CRYPTO MARKET DATA
// supabase/functions/_shared/archie-ai/native-engine/crypto/market-data.ts
//
// REAL market-data gateway for the Crypto & Blockchain
// Intelligence subsystem (owner directive 2026-09-11).
//
// Design truths:
//   * Every adapter speaks a REAL public REST API
//     (Coinbase Exchange, Kraken, OKX, KuCoin, CoinGecko,
//     Binance, Bybit). No API keys are used or required for
//     these public market-data endpoints.
//   * Venues that are unreachable (geo-block, outage, rate
//     limit) are reported as UNAVAILABLE — never simulated,
//     never fabricated. Cross-checks use whichever real
//     venues responded.
//   * Every snapshot carries provenance: venue, canonical
//     symbol, fetch timestamp, latency, and freshness.
//   * Fetcher is injected (default: global fetch) so tests
//     run deterministic fixtures and production uses real
//     network.
// =========================================================

// ---------------------------------------------------------
// 1. Canonical types & venue registry
// ---------------------------------------------------------

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const defaultFetcher: Fetcher = (url, init) => {
  const impl =
    (globalThis as { fetch?: typeof fetch }).fetch ??
    (() => {
      throw new Error("no fetch implementation available");
    });
  return impl(url, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  }).then(async (r) => ({
    ok: r.ok,
    status: r.status,
    json: () => r.json(),
  }));
};

export type VenueId =
  "coinbase" | "kraken" | "okx" | "kucoin" | "coingecko" | "binance" | "bybit";

export interface VenueInfo {
  id: VenueId;
  name: string;
  /** Data kinds this venue provides. */
  capabilities: Array<
    "ticker" | "candles" | "orderbook" | "funding" | "open-interest" | "global"
  >;
  /** Derivatives (funding/OI) support. */
  derivatives: boolean;
}

export const VENUES: Record<VenueId, VenueInfo> = {
  coinbase: {
    id: "coinbase",
    name: "Coinbase Exchange",
    capabilities: ["ticker", "candles", "orderbook"],
    derivatives: false,
  },
  kraken: {
    id: "kraken",
    name: "Kraken",
    capabilities: ["ticker", "candles", "orderbook"],
    derivatives: false,
  },
  okx: {
    id: "okx",
    name: "OKX",
    capabilities: [
      "ticker",
      "candles",
      "orderbook",
      "funding",
      "open-interest",
    ],
    derivatives: true,
  },
  kucoin: {
    id: "kucoin",
    name: "KuCoin",
    capabilities: ["ticker", "candles", "orderbook"],
    derivatives: false,
  },
  coingecko: {
    id: "coingecko",
    name: "CoinGecko",
    capabilities: ["ticker", "global"],
    derivatives: false,
  },
  binance: {
    id: "binance",
    name: "Binance",
    capabilities: [
      "ticker",
      "candles",
      "orderbook",
      "funding",
      "open-interest",
    ],
    derivatives: true,
  },
  bybit: {
    id: "bybit",
    name: "Bybit",
    capabilities: [
      "ticker",
      "candles",
      "orderbook",
      "funding",
      "open-interest",
    ],
    derivatives: true,
  },
};

/** Canonical symbol format: BASE-QUOTE (e.g. "BTC-USDT"). */
export type CanonicalSymbol = string;

/** CoinGecko uses coin IDs, not tickers — a curated map of
 *  major assets. Unknown bases are honestly unavailable
 *  (null), never guessed. */
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
  BNB: "binancecoin",
  TRX: "tron",
  MATIC: "matic-network",
  SHIB: "shiba-inu",
  UNI: "uniswap",
  ATOM: "cosmos",
  XLM: "stellar",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
};

/** Per-venue symbol mapping. Kraken historically uses XBT. */
export function mapSymbol(
  venue: VenueId,
  canonical: CanonicalSymbol,
): string | null {
  const [base, quote] = canonical.split("-");
  if (!base || !quote) return null;
  switch (venue) {
    case "coinbase":
      return quote === "USD" || quote === "USDT"
        ? `${base}-USD`
        : `${base}-${quote}`;
    case "kraken":
      return `${base === "BTC" ? "XBT" : base}${quote}`;
    case "okx":
    case "kucoin":
      return `${base}-${quote}`;
    case "binance":
    case "bybit":
      return `${base}${quote}`;
    case "coingecko":
      return COINGECKO_IDS[base] ?? null;
  }
}

// ---------------------------------------------------------
// 2. Snapshot types (all carry provenance)
// ---------------------------------------------------------

export interface TickerSnapshot {
  venue: VenueId;
  symbol: CanonicalSymbol;
  last: number;
  bid: number | null;
  ask: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24hBase: number | null;
  changePct24h: number | null;
  fetchedAt: string; // ISO
  latencyMs: number;
}

export interface Candle {
  /** Unix seconds, ascending by time. */
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeBase: number;
}

export interface CandleSeries {
  venue: VenueId;
  symbol: CanonicalSymbol;
  /** Canonical interval in minutes. */
  intervalMinutes: number;
  candles: Candle[]; // ascending (oldest first)
  fetchedAt: string;
  latencyMs: number;
}

export interface OrderBookSnapshot {
  venue: VenueId;
  symbol: CanonicalSymbol;
  /** [price, size] — asks ascending, bids descending. */
  asks: Array<[number, number]>;
  bids: Array<[number, number]>;
  fetchedAt: string;
  latencyMs: number;
}

export interface FundingSnapshot {
  venue: VenueId;
  symbol: CanonicalSymbol;
  fundingRatePct: number; // per-period rate *100
  nextFundingAt: string | null;
  fetchedAt: string;
  latencyMs: number;
}

export interface OpenInterestSnapshot {
  venue: VenueId;
  symbol: CanonicalSymbol;
  openInterestBase: number;
  openInterestQuote: number | null;
  fetchedAt: string;
  latencyMs: number;
}

export interface GlobalMarketSnapshot {
  totalMarketCapUsd: number | null;
  activeCryptocurrencies: number | null;
  totalVolume24hUsd: number | null;
  btcDominancePct: number | null;
  fetchedAt: string;
  latencyMs: number;
}

export type VenueResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unavailable"; reason: string; httpStatus?: number };

function nowIso() {
  return new Date().toISOString();
}

function num(x: unknown): number | null {
  const v = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  return Number.isFinite(v) ? v : null;
}

async function getJson(
  fetcher: Fetcher,
  url: string,
): Promise<
  { ok: true; body: unknown } | { ok: false; status: number; reason: string }
> {
  const started = Date.now();
  void started;
  try {
    const res = await fetcher(url);
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    }
    return { ok: true, body: await res.json() };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      reason: e instanceof Error ? e.message : "network failure",
    };
  }
}

// ---------------------------------------------------------
// 3. Venue adapters — tickers
// ---------------------------------------------------------

export async function fetchTicker(
  venue: VenueId,
  symbol: CanonicalSymbol,
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<TickerSnapshot>> {
  const t0 = Date.now();
  switch (venue) {
    case "coinbase": {
      const s = mapSymbol("coinbase", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.exchange.coinbase.com/products/${s}/ticker`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as Record<string, unknown>;
      const last = num(b.price);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(b.bid),
          ask: num(b.ask),
          high24h: null,
          low24h: null,
          volume24hBase: num(b.volume),
          changePct24h: null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kraken": {
      const s = mapSymbol("kraken", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.kraken.com/0/public/Ticker?pair=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        error?: unknown[];
        result?: Record<string, unknown>;
      };
      if (!b.result || (b.error && b.error.length > 0) || !r.ok) {
        return { kind: "unavailable", reason: "kraken error response" };
      }
      const key = Object.keys(b.result)[0];
      const t = b.result[key] as Record<string, unknown[]>;
      const last = num(t.c?.[0]);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      const vwap = num(t.p?.[0]);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(t.b?.[0]),
          ask: num(t.a?.[0]),
          high24h: num(t.h?.[0]),
          low24h: num(t.l?.[0]),
          volume24hBase: num(t.v?.[1]) ?? num(t.v?.[0]),
          changePct24h:
            vwap !== null && vwap !== 0 ? ((last - vwap) / vwap) * 100 : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "okx": {
      const s = mapSymbol("okx", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://www.okx.com/api/v5/market/ticker?instId=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        code?: string;
        data?: Array<Record<string, unknown>>;
      };
      if (b.code !== "0" || !b.data?.length) {
        return { kind: "unavailable", reason: `okx code ${b.code ?? "?"}` };
      }
      const t = b.data[0];
      const last = num(t.last);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      const open24h = num(t.open24h);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(t.bidPx),
          ask: num(t.askPx),
          high24h: num(t.high24h),
          low24h: num(t.low24h),
          volume24hBase: num(t.vol24h),
          changePct24h:
            open24h !== null && open24h !== 0
              ? ((last - open24h) / open24h) * 100
              : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kucoin": {
      const s = mapSymbol("kucoin", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as { code?: string; data?: Record<string, unknown> };
      if (b.code !== "200000" || !b.data) {
        return { kind: "unavailable", reason: `kucoin code ${b.code ?? "?"}` };
      }
      const last = num(b.data.price);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(b.data.bestBid),
          ask: num(b.data.bestAsk),
          high24h: null,
          low24h: null,
          volume24hBase: null,
          changePct24h: null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "coingecko": {
      const s = mapSymbol("coingecko", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.coingecko.com/api/v3/simple/price?ids=${s}&vs_currencies=usd&include_24hr_change=true`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as Record<string, Record<string, unknown>>;
      const entry = b[s];
      const last = entry ? num(entry.usd) : null;
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol: `${symbol.split("-")[0]}-USD`,
          last,
          bid: null,
          ask: null,
          high24h: null,
          low24h: null,
          volume24hBase: null,
          changePct24h: entry ? num(entry.usd_24h_change) : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "binance": {
      const s = mapSymbol("binance", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as Record<string, unknown>;
      const last = num(b.lastPrice);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(b.bidPrice),
          ask: num(b.askPrice),
          high24h: num(b.highPrice),
          low24h: num(b.lowPrice),
          volume24hBase: num(b.volume),
          changePct24h: num(b.priceChangePercent),
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "bybit": {
      const s = mapSymbol("bybit", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        retCode?: number;
        result?: { list?: Array<Record<string, unknown>> };
      };
      const t = b.result?.list?.[0];
      if (b.retCode !== 0 || !t) {
        return {
          kind: "unavailable",
          reason: `bybit retCode ${b.retCode ?? "?"}`,
        };
      }
      const last = num(t.lastPrice);
      if (last === null)
        return { kind: "unavailable", reason: "no price in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          last,
          bid: num(t.bid1Price),
          ask: num(t.ask1Price),
          high24h: num(t.highPrice24h),
          low24h: num(t.lowPrice24h),
          volume24hBase: num(t.volume24h),
          changePct24h:
            num(t.price24hPcnt) !== null ? num(t.price24hPcnt)! * 100 : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
  }
}

// ---------------------------------------------------------
// 4. Venue adapters — candles
// ---------------------------------------------------------

/** Canonical intervals each venue can serve (minutes). */
const VENUE_INTERVALS: Record<VenueId, number[]> = {
  coinbase: [60, 300, 900, 3600, 21600, 86400].map((x) => x / 60),
  kraken: [1, 5, 15, 60, 240, 1440],
  okx: [1, 3, 5, 15, 30, 60, 120, 240, 480, 720, 1440],
  kucoin: [1, 60, 1440],
  binance: [1, 5, 15, 60, 240, 1440],
  bybit: [1, 5, 15, 60, 240, 1440],
  coingecko: [60, 1440],
};

export function venueSupportsInterval(
  venue: VenueId,
  minutes: number,
): boolean {
  return VENUE_INTERVALS[venue].includes(minutes);
}

export async function fetchCandles(
  venue: VenueId,
  symbol: CanonicalSymbol,
  intervalMinutes: number,
  limit: number,
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<CandleSeries>> {
  if (!venueSupportsInterval(venue, intervalMinutes)) {
    return {
      kind: "unavailable",
      reason: `interval ${intervalMinutes}m not served by ${venue}`,
    };
  }
  const t0 = Date.now();
  switch (venue) {
    case "coinbase": {
      const s = mapSymbol("coinbase", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const granularity = intervalMinutes * 60;
      const r = await getJson(
        fetcher,
        `https://api.exchange.coinbase.com/products/${s}/candles?granularity=${granularity}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const rows = r.body as Array<
        [number, number, number, number, number, number]
      >;
      if (!Array.isArray(rows)) {
        return { kind: "unavailable", reason: "bad payload" };
      }
      // Coinbase returns newest-first: [time, low, high, open, close, volume]
      const candles = rows
        .slice(0, limit)
        .map((row) => ({
          ts: row[0],
          low: row[1],
          high: row[2],
          open: row[3],
          close: row[4],
          volumeBase: row[5],
        }))
        .sort((a, b) => a.ts - b.ts);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kraken": {
      const s = mapSymbol("kraken", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.kraken.com/0/public/OHLC?pair=${s}&interval=${intervalMinutes}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        result?: Record<
          string,
          Array<
            [number, string, string, string, string, string, string, number]
          >
        >;
      };
      const key =
        s.length > 0
          ? Object.keys(b.result ?? {}).find((k) => k !== "last")
          : undefined;
      const rows = key ? b.result?.[key] : undefined;
      if (!rows) return { kind: "unavailable", reason: "bad payload" };
      const candles = rows.slice(-limit).map((row) => ({
        ts: row[0],
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volumeBase: Number(row[6]),
      }));
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "okx": {
      const s = mapSymbol("okx", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const bar =
        intervalMinutes < 60
          ? `${intervalMinutes}m`
          : intervalMinutes === 60
            ? "1H"
            : intervalMinutes === 1440
              ? "1D"
              : intervalMinutes === 240
                ? "4H"
                : `${intervalMinutes}m`;
      const r = await getJson(
        fetcher,
        `https://www.okx.com/api/v5/market/candles?instId=${s}&bar=${bar}&limit=${Math.min(limit, 300)}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as { code?: string; data?: Array<string[]> };
      if (b.code !== "0" || !b.data) {
        return { kind: "unavailable", reason: `okx code ${b.code ?? "?"}` };
      }
      // OKX: newest-first [ts, o, h, l, c, vol, volCcy, ...]
      const candles = b.data
        .map((row) => ({
          ts: Math.floor(Number(row[0]) / 1000),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volumeBase: Number(row[5]),
        }))
        .sort((a, b2) => a.ts - b2.ts)
        .slice(-limit);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kucoin": {
      const s = mapSymbol("kucoin", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const type =
        intervalMinutes === 1
          ? "1min"
          : intervalMinutes === 60
            ? "1hour"
            : "1day";
      const r = await getJson(
        fetcher,
        `https://api.kucoin.com/api/v1/market/candles/${type}?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as { code?: string; data?: Array<Array<string>> };
      if (b.code !== "200000" || !b.data) {
        return { kind: "unavailable", reason: `kucoin code ${b.code ?? "?"}` };
      }
      // KuCoin: newest-first [time(s), open, close, high, low, volume, turnover]
      const candles = b.data
        .map((row) => ({
          ts: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[3]),
          low: Number(row[4]),
          close: Number(row[2]),
          volumeBase: Number(row[5]),
        }))
        .sort((a, b2) => a.ts - b2.ts)
        .slice(-limit);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "binance": {
      const s = mapSymbol("binance", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const interval =
        intervalMinutes === 1440
          ? "1d"
          : intervalMinutes === 240
            ? "4h"
            : intervalMinutes === 60
              ? "1h"
              : `${intervalMinutes}m`;
      const r = await getJson(
        fetcher,
        `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&limit=${Math.min(limit, 1000)}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const rows = r.body as Array<Array<unknown>>;
      if (!Array.isArray(rows))
        return { kind: "unavailable", reason: "bad payload" };
      const candles = rows.map((row) => ({
        ts: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volumeBase: Number(row[5]),
      }));
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "bybit": {
      const s = mapSymbol("bybit", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const interval =
        intervalMinutes === 1440
          ? "D"
          : intervalMinutes === 240
            ? "240"
            : intervalMinutes === 60
              ? "60"
              : `${intervalMinutes}`;
      const r = await getJson(
        fetcher,
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}&limit=${Math.min(limit, 1000)}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        retCode?: number;
        result?: { list?: Array<Array<string>> };
      };
      if (b.retCode !== 0 || !b.result?.list) {
        return {
          kind: "unavailable",
          reason: `bybit retCode ${b.retCode ?? "?"}`,
        };
      }
      // Bybit: newest-first [start(ms), open, high, low, close, volume, turnover]
      const candles = b.result.list
        .map((row) => ({
          ts: Math.floor(Number(row[0]) / 1000),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volumeBase: Number(row[5]),
        }))
        .sort((a, b2) => a.ts - b2.ts)
        .slice(-limit);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "coingecko": {
      const s = mapSymbol("coingecko", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const days = intervalMinutes === 1440 ? 90 : 2;
      const r = await getJson(
        fetcher,
        `https://api.coingecko.com/api/v3/coins/${s}/market_chart?vs_currency=usd&days=${days}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as { prices?: Array<[number, number]> };
      if (!b.prices) return { kind: "unavailable", reason: "bad payload" };
      // CoinGecko gives price points, not OHLC — build synthetic
      // candles only for close/volume-free analysis and mark
      // them honestly (open=close=price point).
      const candles = b.prices.slice(-limit).map((p) => ({
        ts: Math.floor(p[0] / 1000),
        open: p[1],
        high: p[1],
        low: p[1],
        close: p[1],
        volumeBase: 0,
      }));
      return {
        kind: "ok",
        data: {
          venue,
          symbol: `${symbol.split("-")[0]}-USD`,
          intervalMinutes,
          candles,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
  }
}

// ---------------------------------------------------------
// 5. Venue adapters — order books, funding, open interest
// ---------------------------------------------------------

export async function fetchOrderBook(
  venue: VenueId,
  symbol: CanonicalSymbol,
  depth: number,
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<OrderBookSnapshot>> {
  const t0 = Date.now();
  switch (venue) {
    case "okx": {
      const s = mapSymbol("okx", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://www.okx.com/api/v5/market/books?instId=${s}&sz=${Math.min(depth, 400)}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        code?: string;
        data?: Array<{ bids?: string[][]; asks?: string[][] }>;
      };
      const d = b.data?.[0];
      if (b.code !== "0" || !d?.bids || !d?.asks) {
        return { kind: "unavailable", reason: `okx code ${b.code ?? "?"}` };
      }
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          asks: d.asks.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          bids: d.bids.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kraken": {
      const s = mapSymbol("kraken", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.kraken.com/0/public/Depth?pair=${s}&count=${Math.min(depth, 500)}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        result?: Record<
          string,
          {
            asks?: Array<[string, string, number]>;
            bids?: Array<[string, string, number]>;
          }
        >;
      };
      const key = Object.keys(b.result ?? {})[0];
      const d = key ? b.result?.[key] : undefined;
      if (!d?.asks || !d?.bids)
        return { kind: "unavailable", reason: "bad payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          asks: d.asks.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          bids: d.bids.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "kucoin": {
      const s = mapSymbol("kucoin", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.kucoin.com/api/v1/market/orderbook/level2_${Math.min(depth, 100)}?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        code?: string;
        data?: { asks?: string[][]; bids?: string[][] };
      };
      if (b.code !== "200000" || !b.data?.asks || !b.data?.bids) {
        return { kind: "unavailable", reason: `kucoin code ${b.code ?? "?"}` };
      }
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          asks: b.data.asks.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          bids: b.data.bids.map(
            (x) => [Number(x[0]), Number(x[1])] as [number, number],
          ),
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "coinbase": {
      const s = mapSymbol("coinbase", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.exchange.coinbase.com/products/${s}/book?level=2`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        bids?: Array<[number, number, number]>;
        asks?: Array<[number, number, number]>;
      };
      if (!b.bids || !b.asks)
        return { kind: "unavailable", reason: "bad payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          asks: b.asks
            .slice(0, depth)
            .map((x) => [Number(x[0]), Number(x[1])] as [number, number]),
          bids: b.bids
            .slice(0, depth)
            .map((x) => [Number(x[0]), Number(x[1])] as [number, number]),
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    default:
      return {
        kind: "unavailable",
        reason: `order book not implemented for ${venue}`,
      };
  }
}

export async function fetchFunding(
  venue: VenueId,
  symbol: CanonicalSymbol,
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<FundingSnapshot>> {
  const t0 = Date.now();
  switch (venue) {
    case "okx": {
      const s = mapSymbol("okx", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://www.okx.com/api/v5/public/funding-rate?instId=${s.replace("-USDT", "-USDT-SWAP")}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        code?: string;
        data?: Array<Record<string, unknown>>;
      };
      const d = b.data?.[0];
      if (b.code !== "0" || !d)
        return { kind: "unavailable", reason: `okx code ${b.code ?? "?"}` };
      const rate = num(d.fundingRate);
      if (rate === null)
        return { kind: "unavailable", reason: "no funding in payload" };
      const ft = num(d.fundingTime);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          fundingRatePct: rate * 100,
          nextFundingAt: ft !== null ? new Date(ft).toISOString() : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "binance": {
      const s = mapSymbol("binance", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as Record<string, unknown>;
      const rate = num(b.lastFundingRate);
      if (rate === null)
        return { kind: "unavailable", reason: "no funding in payload" };
      const ft = num(b.nextFundingTime);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          fundingRatePct: rate * 100,
          nextFundingAt: ft !== null ? new Date(ft).toISOString() : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "bybit": {
      const s = mapSymbol("bybit", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        retCode?: number;
        result?: { list?: Array<Record<string, unknown>> };
      };
      const d = b.result?.list?.[0];
      if (b.retCode !== 0 || !d)
        return {
          kind: "unavailable",
          reason: `bybit retCode ${b.retCode ?? "?"}`,
        };
      const rate = num(d.fundingRate);
      if (rate === null)
        return { kind: "unavailable", reason: "no funding in payload" };
      const ft = num(d.nextFundingTime);
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          fundingRatePct: rate * 100,
          nextFundingAt: ft !== null ? new Date(ft * 1000).toISOString() : null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    default:
      return { kind: "unavailable", reason: `funding not served by ${venue}` };
  }
}

export async function fetchOpenInterest(
  venue: VenueId,
  symbol: CanonicalSymbol,
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<OpenInterestSnapshot>> {
  const t0 = Date.now();
  switch (venue) {
    case "okx": {
      const s = mapSymbol("okx", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://www.okx.com/api/v5/public/open-interest?instId=${s.replace("-USDT", "-USDT-SWAP")}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        code?: string;
        data?: Array<Record<string, unknown>>;
      };
      const d = b.data?.[0];
      if (b.code !== "0" || !d)
        return { kind: "unavailable", reason: `okx code ${b.code ?? "?"}` };
      const oi = num(d.oi);
      const oiUsd = num(d.oiCcy);
      if (oi === null && oiUsd === null) {
        return { kind: "unavailable", reason: "no OI in payload" };
      }
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          openInterestBase: oi ?? 0,
          openInterestQuote: oiUsd,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "binance": {
      const s = mapSymbol("binance", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://fapi.binance.com/fapi/v1/openInterest?symbol=${s}`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as Record<string, unknown>;
      const oi = num(b.openInterest);
      if (oi === null)
        return { kind: "unavailable", reason: "no OI in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          openInterestBase: oi,
          openInterestQuote: null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    case "bybit": {
      const s = mapSymbol("bybit", symbol);
      if (!s) return { kind: "unavailable", reason: "bad symbol" };
      const r = await getJson(
        fetcher,
        `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${s}&intervalTime=5min&limit=1`,
      );
      if (!r.ok)
        return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
      const b = r.body as {
        retCode?: number;
        result?: { list?: Array<Record<string, unknown>> };
      };
      const d = b.result?.list?.[0];
      if (b.retCode !== 0 || !d)
        return {
          kind: "unavailable",
          reason: `bybit retCode ${b.retCode ?? "?"}`,
        };
      const oi = num(d.openInterest);
      if (oi === null)
        return { kind: "unavailable", reason: "no OI in payload" };
      return {
        kind: "ok",
        data: {
          venue,
          symbol,
          openInterestBase: oi,
          openInterestQuote: null,
          fetchedAt: nowIso(),
          latencyMs: Date.now() - t0,
        },
      };
    }
    default:
      return {
        kind: "unavailable",
        reason: `open interest not served by ${venue}`,
      };
  }
}

export async function fetchGlobalMarket(
  fetcher: Fetcher = defaultFetcher,
): Promise<VenueResult<GlobalMarketSnapshot>> {
  const t0 = Date.now();
  const r = await getJson(fetcher, "https://api.coingecko.com/api/v3/global");
  if (!r.ok)
    return { kind: "unavailable", reason: r.reason, httpStatus: r.status };
  const b = r.body as {
    data?: {
      total_market_cap?: Record<string, number>;
      active_cryptocurrencies?: number;
      total_volume?: Record<string, number>;
      market_cap_percentage?: Record<string, number>;
    };
  };
  const d = b.data;
  if (!d) return { kind: "unavailable", reason: "bad payload" };
  return {
    kind: "ok",
    data: {
      totalMarketCapUsd: d.total_market_cap?.usd ?? null,
      activeCryptocurrencies: d.active_cryptocurrencies ?? null,
      totalVolume24hUsd: d.total_volume?.usd ?? null,
      btcDominancePct: d.market_cap_percentage?.btc ?? null,
      fetchedAt: nowIso(),
      latencyMs: Date.now() - t0,
    },
  };
}

// ---------------------------------------------------------
// 6. Cross-venue consensus (the CROSS-CHECK stage)
// ---------------------------------------------------------

export interface CrossCheck {
  /** Venues that returned real data. */
  venuesReporting: VenueId[];
  /** Venues that failed, with honest reasons. */
  venuesUnavailable: Array<{ venue: VenueId; reason: string }>;
  /** Median of reported last prices. */
  consensusPrice: number | null;
  /** Max |venue price - consensus| / consensus * 100. */
  maxDeviationPct: number | null;
  /** True when cross-venue disagreement exceeds the
   *  threshold — an anomaly flag, not a hard failure. */
  anomaly: boolean;
  snapshots: TickerSnapshot[];
}

export const CROSS_VENUE_DEVIATION_THRESHOLD_PCT = 1.0;

export async function crossCheckTicker(
  symbol: CanonicalSymbol,
  fetcher: Fetcher = defaultFetcher,
  venues: VenueId[] = [
    "coinbase",
    "kraken",
    "okx",
    "kucoin",
    "coingecko",
    "binance",
    "bybit",
  ],
): Promise<CrossCheck> {
  const results = await Promise.all(
    venues.map((v) => fetchTicker(v, symbol, fetcher)),
  );
  const snapshots: TickerSnapshot[] = [];
  const unavailable: Array<{ venue: VenueId; reason: string }> = [];
  results.forEach((r, i) => {
    if (r.kind === "ok") snapshots.push(r.data);
    else unavailable.push({ venue: venues[i], reason: r.reason });
  });
  const prices = snapshots.map((s) => s.last).sort((a, b) => a - b);
  const consensusPrice = prices.length
    ? prices.length % 2 === 1
      ? prices[(prices.length - 1) / 2]
      : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
    : null;
  const maxDeviationPct =
    consensusPrice !== null && consensusPrice !== 0 && snapshots.length
      ? (Math.max(...snapshots.map((s) => Math.abs(s.last - consensusPrice))) /
          consensusPrice) *
        100
      : null;
  return {
    venuesReporting: snapshots.map((s) => s.venue),
    venuesUnavailable: unavailable,
    consensusPrice,
    maxDeviationPct,
    anomaly:
      maxDeviationPct !== null &&
      maxDeviationPct > CROSS_VENUE_DEVIATION_THRESHOLD_PCT,
    snapshots,
  };
}
