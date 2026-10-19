// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — MARKET FEED & STALE MONITOR
// src/lib/archie/trading/market-feed.ts
//
// Ingestion, WebSocket/REST quote normalization & stale data guardrails:
//   * Normalizes incoming quotes across Forex, Crypto, Equities, Indices
//   * Stale data detection: flags frozen or delayed feeds (> 15s forex/crypto, > 60s equities)
//   * Automatic circuit breaker disabling trade signals when feeds fail
// =========================================================

import type { CandleData, MarketInstrument } from "./types";

export interface LiveMarketTick {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume24h: number;
  timestampMs: number;
}

export interface FeedHealthStatus {
  symbol: string;
  isFresh: boolean;
  ageMs: number;
  warning?: string;
}

const STALE_THRESHOLD_FAST_MS = 15_000; // Forex & Crypto
const STALE_THRESHOLD_EQUITY_MS = 60_000; // Equities & Indices

/**
 * Validates freshness of the incoming market data feed.
 */
export function checkFeedHealth(
  instrument: MarketInstrument,
  lastTickTimeMs: number,
  nowMs: number = Date.now()
): FeedHealthStatus {
  const ageMs = Math.max(0, nowMs - lastTickTimeMs);
  const threshold =
    instrument.category === "FOREX" || instrument.category === "CRYPTO"
      ? STALE_THRESHOLD_FAST_MS
      : STALE_THRESHOLD_EQUITY_MS;

  const isFresh = ageMs <= threshold;
  return {
    symbol: instrument.symbol,
    isFresh,
    ageMs,
    warning: isFresh
      ? undefined
      : `Market feed for ${instrument.symbol} is stale (${(ageMs / 1000).toFixed(1)}s old). Signals paused.`,
  };
}

/**
 * Incorporate a live tick into the ongoing 1-minute candlestick.
 */
export function updateCandleWithTick(
  currentCandle: CandleData,
  tick: LiveMarketTick
): CandleData {
  return {
    time: currentCandle.time,
    open: currentCandle.open,
    high: Math.max(currentCandle.high, tick.last),
    low: Math.min(currentCandle.low, tick.last),
    close: tick.last,
    volume: currentCandle.volume + 1,
  };
}

/**
 * Convert raw provider payload to standardized CandleData.
 */
export function parseNormalizedCandle(raw: {
  t: number | string;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v?: number | string;
}): CandleData {
  return {
    time: typeof raw.t === "string" ? new Date(raw.t).getTime() : raw.t,
    open: Number(raw.o),
    high: Number(raw.h),
    low: Number(raw.l),
    close: Number(raw.c),
    volume: raw.v ? Number(raw.v) : 0,
  };
}
