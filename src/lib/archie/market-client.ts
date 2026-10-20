// =========================================================
// ARCHIE PWA — MARKET DATA CLIENT (Massive.com + Free Real-Time Fallbacks)
//
// Real market prices for the trading console: stocks, crypto,
// forex, commodities, and index aggregates.
// Supports:
//   1. Supabase edge function 'archie-market-data' (Massive.com API)
//   2. High-speed, free, public real-time APIs (Binance REST klines
//      and Open Exchange Rates) when Massive key is unprovisioned,
//      expired, or non-crypto instruments are requested.
//   3. Direct integration with the ARCHIE Unified Engine Bus
//      so live market ticks are instantly published to all subsystems.
// =========================================================

import { supabase } from "@/lib/supabase";
import { archieEngineBus } from "./unified-engine-bus";

export interface MarketQuote {
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
  granularity: "daily" | "realtime";
  source: "massive" | "binance" | "open-rates" | "live-stream";
  error?: { kind: string; message?: string };
}

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerSearchResult {
  ticker: string;
  name: string;
  market: string;
  exchange: string;
  type: string;
  active: boolean;
  currency: string;
}

export interface IpoEntry {
  ticker: string;
  issuer: string;
  status: string;
  listingDate: string;
  finalPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  offerSize: number | null;
  exchange: string;
}

/** Typed invocation helper for the archie-market-data function. */
export async function invokeMarketData<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("archie-market-data", {
    body,
  });
  if (error) {
    const ctx = (error as { context?: { message?: string } }).context;
    const detail = ctx?.message ?? error.message;
    throw new Error(`archie-market-data: ${detail}`);
  }
  return data as T;
}

export async function fetchMarketQuotes(
  symbols: string[],
): Promise<MarketQuote[]> {
  const res = await invokeMarketData<{ quotes: MarketQuote[] }>({
    action: "quotes",
    symbols,
  });
  return res.quotes ?? [];
}

export async function fetchMarketHistory(
  symbol: string,
  days = 90,
): Promise<MarketCandle[]> {
  const res = await invokeMarketData<{ candles: MarketCandle[] }>({
    action: "history",
    symbol,
    days,
  });
  return res.candles ?? [];
}

export async function searchTickers(
  query: string,
  market?: "stocks" | "crypto" | "forex",
): Promise<TickerSearchResult[]> {
  const res = await invokeMarketData<{ results: TickerSearchResult[] }>({
    action: "search",
    query,
    market,
    limit: 20,
  });
  return res.results ?? [];
}

export async function fetchIpos(
  status?: "pending" | "new" | "history",
): Promise<IpoEntry[]> {
  const res = await invokeMarketData<{ ipos: IpoEntry[] }>({
    action: "ipos",
    status,
    limit: 30,
  });
  return res.ipos ?? [];
}

export interface MarketStatus {
  afterHours?: boolean;
  market?: string;
  currencies?: Record<string, string>;
  exchanges?: Record<string, string>;
  indicesGroups?: Record<string, string>;
}

export async function fetchMarketStatus(): Promise<MarketStatus | null> {
  const res = await invokeMarketData<{ status?: MarketStatus }>({
    action: "marketstatus",
  });
  return res.status ?? null;
}

/**
 * Map an ARCHIE console instrument symbol (e.g. "BTC/USD") to the
 * Massive ticker used by the backend.
 */
export function consoleSymbolToTicker(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  const cryptoBase = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "LTC", "LINK", "AVAX", "TRX", "TON"];
  const forexBase = ["EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "USDT"];
  const m = s.match(/^([A-Z0-9]+)\/?USD$/);
  if (m) {
    if (cryptoBase.includes(m[1])) return `X:${m[1]}USD`;
    if (forexBase.includes(m[1])) return `C:${m[1]}USD`;
  }
  const rev = s.match(/^USD\/([A-Z]{3})$/);
  if (rev) return `C:USD${rev[1]}`;
  return s;
}

// =========================================================
// FREE REAL-TIME PUBLIC MARKET DATA & MULTI-TIMEFRAME ENGINE
//
// When Massive is absent, returns errors, or has rate limits,
// these free public streams deliver real-time prices & klines.
// =========================================================

const CRYPTO_BINANCE_MAP: Record<string, string> = {
  "X:BTCUSD": "BTCUSDT",
  "X:ETHUSD": "ETHUSDT",
  "X:SOLUSD": "SOLUSDT",
  "X:XRPUSD": "XRPUSDT",
  "X:DOGEUSD": "DOGEUSDT",
  "X:BNBUSD": "BNBUSDT",
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
  "DOGE/USD": "DOGEUSDT",
};

/**
 * Free real-time quote fetcher using Binance public API & open rates.
 */
export async function fetchFreePublicMarketQuotes(symbols: string[]): Promise<MarketQuote[]> {
  if (!symbols.length) return [];
  const quotes: MarketQuote[] = [];

  // Group crypto for batch query
  const cryptoBinancePairs: { ticker: string; original: string; pair: string }[] = [];
  const otherSymbols: { ticker: string; original: string }[] = [];

  for (const sym of symbols) {
    const ticker = consoleSymbolToTicker(sym);
    const pair = CRYPTO_BINANCE_MAP[ticker] || CRYPTO_BINANCE_MAP[sym];
    if (pair) {
      cryptoBinancePairs.push({ ticker, original: sym, pair });
    } else {
      otherSymbols.push({ ticker, original: sym });
    }
  }

  // 1. Fetch Binance for crypto
  if (cryptoBinancePairs.length > 0) {
    try {
      const pairsQuery = JSON.stringify(cryptoBinancePairs.map((p) => p.pair));
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(pairsQuery)}`);
      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          const matched = cryptoBinancePairs.find((p) => p.pair === item.symbol);
          if (matched) {
            const price = parseFloat(item.lastPrice);
            const change = parseFloat(item.priceChange);
            const changePerc = parseFloat(item.priceChangePercent);
            const quote: MarketQuote = {
              symbol: matched.original,
              ticker: matched.ticker,
              price,
              change,
              changePerc,
              open: parseFloat(item.openPrice),
              high: parseFloat(item.highPrice),
              low: parseFloat(item.lowPrice),
              volume: parseFloat(item.volume),
              asOf: new Date().toISOString(),
              granularity: "realtime",
              source: "binance",
            };
            quotes.push(quote);

            // Broadcast tick to unified engine bus
            archieEngineBus.publish("MARKET_TICK", "markets", {
              symbol: matched.original,
              price,
              bid: price * 0.9999,
              ask: price * 1.0001,
              change24h: changePerc,
              volume: item.volume,
              source: "binance",
            });
          }
        }
      }
    } catch (err) {
      console.warn("[MarketClient] Binance quote fetch failed:", err);
    }
  }

  // 2. Fetch Forex from open reference rates
  if (otherSymbols.length > 0) {
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const rates = res.ok ? (await res.json()).rates : null;

      for (const item of otherSymbols) {
        let price: number | null = null;
        let changePerc: number | null = null;
        const sym = item.original.toUpperCase();

        if (rates) {
          if (sym.includes("EUR")) {
            price = rates.EUR ? Number((1 / rates.EUR).toFixed(5)) : null;
          } else if (sym.includes("GBP")) {
            price = rates.GBP ? Number((1 / rates.GBP).toFixed(5)) : null;
          } else if (sym.includes("JPY")) {
            price = rates.JPY ? Number(rates.JPY.toFixed(3)) : null;
          } else if (sym.includes("AUD")) {
            price = rates.AUD ? Number((1 / rates.AUD).toFixed(5)) : null;
          } else if (sym.includes("CAD")) {
            price = rates.CAD ? Number(rates.CAD.toFixed(5)) : null;
          } else if (sym.includes("CHF")) {
            price = rates.CHF ? Number(rates.CHF.toFixed(5)) : null;
          }
        }

        if (price !== null) {
          const quote: MarketQuote = {
            symbol: item.original,
            ticker: item.ticker,
            price,
            change: null,
            changePerc: null,
            open: null,
            high: null,
            low: null,
            volume: null,
            asOf: new Date().toISOString(),
            granularity: "realtime",
            source: "open-rates",
          };
          quotes.push(quote);

          archieEngineBus.publish("MARKET_TICK", "markets", {
            symbol: item.original,
            price,
            bid: price,
            ask: price,
            change24h: 0,
            volume: 0,
            source: "open-rates",
          });
        } else {
          // Honest unavailable status for equities/commodities with no active free provider
          quotes.push({
            symbol: item.original,
            ticker: item.ticker,
            price: null,
            change: null,
            changePerc: null,
            open: null,
            high: null,
            low: null,
            volume: null,
            asOf: null,
            granularity: "realtime",
            source: "open-rates",
            error: {
              kind: "feed_unavailable",
              message: "Free public feed does not cover this instrument without broker connector.",
            },
          });
        }
      }
    } catch (err) {
      console.warn("[MarketClient] Reference rates fetch failed:", err);
    }
  }

  return quotes;
}

/**
 * Free candlestick history provider using verified public Binance REST klines.
 * Does not synthesize artificial price bars when a feed is unavailable.
 */
export async function fetchFreePublicMarketHistory(
  symbol: string,
  days = 90,
  timeframe = "1d",
): Promise<MarketCandle[]> {
  const ticker = consoleSymbolToTicker(symbol);
  const binancePair = CRYPTO_BINANCE_MAP[ticker] || CRYPTO_BINANCE_MAP[symbol];

  // Map timeframe to Binance interval
  const intervalMap: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1D": "1d",
  };
  const interval = intervalMap[timeframe] || "1d";

  if (binancePair) {
    try {
      const limit = Math.min(Math.max(days, 30), 100);
      const url = `https://api.binance.com/api/v3/klines?symbol=${binancePair}&interval=${interval}&limit=${limit}`;
      const res = await fetch(url);
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          return raw.map((k: any[]) => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        }
      }
    } catch (err) {
      console.warn("[MarketClient] Binance klines failed:", err);
    }
  }

  // If not supported by public crypto feed or call failed, return empty array.
  // ARCHIE shows an honest empty state with provider switcher rather than fabricated candles.
  return [];
}

/**
 * Resilient multi-source quote fetcher: tries backend edge first,
 * automatically falls back to free public stream if edge returns empty or fails.
 */
export async function fetchRobustMarketQuotes(symbols: string[]): Promise<MarketQuote[]> {
  try {
    const edgeQuotes = await fetchMarketQuotes(symbols);
    if (edgeQuotes.length > 0 && edgeQuotes.some((q) => q.price !== null)) {
      return edgeQuotes;
    }
  } catch {
    // Edge failed or missing credentials, seamlessly fall through to free stream
  }
  return fetchFreePublicMarketQuotes(symbols);
}

/**
 * Resilient multi-source candle fetcher: tries backend edge first,
 * automatically falls back to free public klines if edge returns empty or fails.
 */
export async function fetchRobustMarketHistory(
  symbol: string,
  days = 90,
  timeframe = "1d",
): Promise<MarketCandle[]> {
  try {
    const edgeCandles = await fetchMarketHistory(symbol, days);
    if (edgeCandles.length > 0) {
      return edgeCandles;
    }
  } catch {
    // Edge failed or missing credentials, seamlessly fall through to free stream
  }
  return fetchFreePublicMarketHistory(symbol, days, timeframe);
}
