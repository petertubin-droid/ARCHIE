// =========================================================
// ARCHIE PWA — MARKET DATA CLIENT (Massive.com via edge)
//
// Real market prices for the trading console: stocks, crypto,
// forex daily aggregates, the full ticker catalog, the IPO
// calendar and live market status. All calls go through the
// owner-gated archie-market-data edge function — the Massive
// API key never reaches the browser.
//
// HONESTY CONTRACT: prices are DAILY aggregates (EOD/delayed
// on the current plan). The UI must always show the asOf time;
// entitlement failures are surfaced as errors, never faked.
// =========================================================

import { supabase } from "@/lib/supabase";

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
  granularity: "daily";
  source: "massive";
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
    // Same convention as trading-client: surface the real edge
    // error context, never a generic non-2xx message.
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
 * Massive ticker used by the backend (mirror of the edge-side
 * mapping, for client-side display alignment).
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
