// =========================================================
// MARKET ANALYSIS — pure deterministic indicator math over
// real fetched candles (Crypto & Blockchain Intelligence,
// 2026-09-11). Every function is pure: no network, no
// guessing, no fabricated values. Insufficient data yields
// explicit undefined — callers refuse instead of estimating.
// =========================================================

import type { MarketCandle } from "./market-data.ts";

export interface IndicatorSet {
  last: number;
  sma20: number | undefined;
  ema20: number | undefined;
  rsi14: number | undefined;
  /** Realized volatility: stdev of daily log returns,
   *  annualized (×√365), as a fraction (0.60 = 60%/yr). */
  realizedVol: number | undefined;
  /** N-period momentum as a fraction (0.05 = +5%). */
  momentum14: number | undefined;
  /** Max peak-to-trough drawdown over the window, as a
   *  positive fraction (0.30 = −30% worst drawdown). */
  maxDrawdown: number;
  /** Volume of the last candle vs the mean of the window
   *  (z-score). > 2 = volume spike. */
  volumeZ: number | undefined;
  /** Trend regime — deterministic classification. */
  regime: "trending-up" | "trending-down" | "range" | "insufficient-data";
  windowSize: number;
}

export function sma(values: number[], period: number): number | undefined {
  if (values.length < period || period <= 0) return undefined;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | undefined {
  if (values.length < period || period <= 0) return undefined;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/** Wilder's RSI. Insufficient window → undefined (never a
 *  neutral 50 fabrication). */
export function rsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function realizedVol(closes: number[]): number | undefined {
  if (closes.length < 3) return undefined;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

export function momentum(closes: number[], period: number): number | undefined {
  if (closes.length < period + 1) return undefined;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - period];
  return (now - then) / then;
}

export function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 0;
  let dd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const d = (peak - c) / peak;
    if (d > dd) dd = d;
  }
  return dd;
}

export function volumeZ(volumes: number[]): number | undefined {
  if (volumes.length < 10) return undefined;
  const hist = volumes.slice(0, -1);
  const last = volumes[volumes.length - 1];
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const variance =
    hist.reduce((a, v) => a + (v - mean) ** 2, 0) / hist.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return undefined;
  return (last - mean) / sd;
}

/** Deterministic regime classification (no ML claim):
 *  trending-up = last above SMA20 AND momentum14 > +1%,
 *  trending-down = last below SMA20 AND momentum14 < −1%,
 *  otherwise range. Insufficient window is honest. */
export function classifyRegime(closes: number[]): IndicatorSet["regime"] {
  if (closes.length < 21) return "insufficient-data";
  const sma20 = sma(closes, 20);
  const m = momentum(closes, 14);
  if (sma20 === undefined || m === undefined) return "insufficient-data";
  const last = closes[closes.length - 1];
  if (last > sma20 && m > 0.01) return "trending-up";
  if (last < sma20 && m < -0.01) return "trending-down";
  return "range";
}

export function analyzeCandles(candles: MarketCandle[]): IndicatorSet | null {
  if (candles.length === 0) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  return {
    last: closes[closes.length - 1],
    sma20: sma(closes, 20),
    ema20: ema(closes, 20),
    rsi14: rsi(closes, 14),
    realizedVol: realizedVol(closes),
    momentum14: momentum(closes, 14),
    maxDrawdown: maxDrawdown(closes),
    volumeZ: volumeZ(volumes),
    regime: classifyRegime(closes),
    windowSize: candles.length,
  };
}

/** Cross-check the candle-derived last price against the
 *  independent spot quote. Agreement = within 2% (two honest
 *  providers drift on timing). Divergence is an ANOMALY the
 *  trade gate refuses. */
export function crossCheckAgreement(
  lastCandle: number,
  quote: number,
): { agree: boolean; divergence: number } {
  const divergence = Math.abs(lastCandle - quote) / quote;
  return { agree: divergence <= 0.02, divergence };
}
