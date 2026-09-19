// =========================================================
// ARCHIE NATIVE ENGINE — MARKET ANALYSIS
// supabase/functions/_shared/archie-ai/native-engine/crypto/market-analysis.ts
//
// Deterministic technical analysis over REAL candle data from
// the multi-venue gateway. Pure functions, no look-ahead,
// honest NaN/insufficiency handling: if there is not enough
// data for an indicator, the field is null — never a
// fabricated number.
// =========================================================

import type {
  Candle,
  FundingSnapshot,
  OrderBookSnapshot,
  TickerSnapshot,
} from "./market-data.ts";

// ---------------------------------------------------------
// 1. Core indicators
// ---------------------------------------------------------

/** Realized volatility (close-to-close, annualized).
 *  periodsPerYear: e.g. 365 for daily crypto candles. */
export function realizedVolatilityPct(
  candles: Candle[],
  periodsPerYear: number,
): number | null {
  if (candles.length < 21) return null;
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev <= 0) return null;
    rets.push(Math.log(candles[i].close / prev));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
}

/** Average True Range (Wilder). */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose),
      ),
    );
  }
  // Wilder smoothing
  let atrV = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrV = (atrV * (period - 1) + trs[i]) / period;
  }
  return atrV;
}

/** RSI (Wilder). */
export function rsi(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (12, 26, 9) over closes. */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (candles.length < slow + signal) return null;
  const closes = candles.map((c) => c.close);
  const ema = (vals: number[], p: number) => {
    const k = 2 / (p + 1);
    let e = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
    for (let i = p; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
    return e;
  };
  const emaSeries = (vals: number[], p: number) => {
    const k = 2 / (p + 1);
    const out: number[] = [];
    let e = vals.slice(0, p).reduce((a, b) => a + b, 0) / p;
    out.push(e);
    for (let i = p; i < vals.length; i++) {
      e = vals[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  // align: macd line computed from index where both exist
  const offset = fast - slow;
  const macdLine: number[] = [];
  for (let i = 0; i < slowSeries.length; i++) {
    const fIdx = i + offset;
    if (fIdx >= 0 && fIdx < fastSeries.length) {
      macdLine.push(fastSeries[fIdx] - slowSeries[i]);
    }
  }
  if (macdLine.length < signal) return null;
  const sig = ema(macdLine, signal);
  const m = macdLine[macdLine.length - 1];
  void ema;
  return { macd: m, signal: sig, histogram: m - sig };
}

/** Rate of change over `lookback` candles, percent. */
export function momentumPct(candles: Candle[], lookback = 10): number | null {
  if (candles.length < lookback + 1) return null;
  const past = candles[candles.length - 1 - lookback].close;
  if (past <= 0) return null;
  return ((candles[candles.length - 1].close - past) / past) * 100;
}

/** Volume z-score of the latest candle vs the prior window. */
export function volumeZScore(candles: Candle[], window = 30): number | null {
  if (candles.length < window + 1) return null;
  const vols = candles.slice(-window - 1, -1).map((c) => c.volumeBase);
  const mean = vols.reduce((a, b) => a + b, 0) / vols.length;
  const variance = vols.reduce((a, b) => a + (b - mean) ** 2, 0) / vols.length;
  // sd floor: a zero-variance window with a deviating latest
  // candle is an EXTREME spike, not a zero — a floor of
  // 1e-12 yields a huge finite z-score instead of undefined.
  const sd = Math.max(Math.sqrt(variance), 1e-12);
  return (candles[candles.length - 1].volumeBase - mean) / sd;
}

// ---------------------------------------------------------
// 2. Market structure
// ---------------------------------------------------------

export interface SwingPoint {
  ts: number;
  price: number;
}

/** Pivot highs/lows (fractal, left/right = 2). */
export function pivots(
  candles: Candle[],
  breadth = 2,
): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let i = breadth; i < candles.length - breadth; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - breadth; j <= i + breadth; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ ts: candles[i].ts, price: candles[i].high });
    if (isLow) lows.push({ ts: candles[i].ts, price: candles[i].low });
  }
  return { highs, lows };
}

export type TrendStructure =
  | "uptrend" // higher highs AND higher lows
  | "downtrend" // lower highs AND lower lows
  | "range" // mixed
  | "insufficient";

export function classifyTrend(candles: Candle[]): {
  structure: TrendStructure;
  recentHighs: SwingPoint[];
  recentLows: SwingPoint[];
} {
  const { highs, lows } = pivots(candles);
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);
  if (recentHighs.length < 2 || recentLows.length < 2) {
    return { structure: "insufficient", recentHighs, recentLows };
  }
  const hh =
    recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price >
      recentHighs[recentHighs.length - 2].price;
  const hl =
    recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price >
      recentLows[recentLows.length - 2].price;
  const lh =
    recentHighs.length >= 2 &&
    recentHighs[recentHighs.length - 1].price <
      recentHighs[recentHighs.length - 2].price;
  const ll =
    recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price <
      recentLows[recentLows.length - 2].price;
  if (hh && hl) return { structure: "uptrend", recentHighs, recentLows };
  if (lh && ll) return { structure: "downtrend", recentHighs, recentLows };
  return { structure: "range", recentHighs, recentLows };
}

/** Nearest resistance above / support below the last price,
 *  from the most recent pivots. */
export function supportResistance(candles: Candle[]): {
  lastPrice: number;
  resistance: SwingPoint | null;
  support: SwingPoint | null;
} {
  const last = candles[candles.length - 1];
  if (!last) return { lastPrice: 0, resistance: null, support: null };
  const { highs, lows } = pivots(candles);
  const resistance =
    [...highs]
      .filter((h) => h.price > last.close)
      .sort((a, b) => a.price - b.price)[0] ?? null;
  const support =
    [...lows]
      .filter((l) => l.price < last.close)
      .sort((a, b) => b.price - a.price)[0] ?? null;
  return { lastPrice: last.close, resistance, support };
}

/** Max drawdown of the candle window, percent. */
export function maxDrawdownPct(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  let peak = -Infinity;
  let mdd = 0;
  for (const c of candles) {
    peak = Math.max(peak, c.close);
    if (peak > 0) mdd = Math.max(mdd, (peak - c.close) / peak);
  }
  return mdd * 100;
}

// ---------------------------------------------------------
// 3. Order book & derivatives analytics
// ---------------------------------------------------------

export interface BookImbalance {
  bidDepth: number;
  askDepth: number;
  /** (bid-ask)/(bid+ask): +1 = all bids. */
  imbalance: number | null;
  spreadPct: number | null;
  bestBid: number | null;
  bestAsk: number | null;
}

export function orderBookImbalance(book: OrderBookSnapshot): BookImbalance {
  const bidDepth = book.bids.reduce((a, [p, s]) => a + p * s, 0);
  const askDepth = book.asks.reduce((a, [p, s]) => a + p * s, 0);
  const bestBid = book.bids.length ? book.bids[0][0] : null;
  const bestAsk = book.asks.length ? book.asks[0][0] : null;
  const imbalance =
    bidDepth + askDepth > 0
      ? (bidDepth - askDepth) / (bidDepth + askDepth)
      : null;
  const spreadPct =
    bestBid !== null && bestAsk !== null && bestBid > 0
      ? ((bestAsk - bestBid) / bestBid) * 100
      : null;
  return { bidDepth, askDepth, imbalance, spreadPct, bestBid, bestAsk };
}

export interface FundingAnalysis {
  /** Per-8h-period rate, percent. */
  ratePct: number | null;
  /** Annualized, percent (3 periods/day, compounding ignored). */
  annualizedPct: number | null;
  /** Crowded-long flag when funding is extreme. */
  crowdedLong: boolean;
  crowdedShort: boolean;
  venue: string;
}

export function analyzeFunding(f: FundingSnapshot): FundingAnalysis {
  const ratePct = f.fundingRatePct;
  const annualizedPct = ratePct === null ? null : ratePct * 3 * 365;
  return {
    ratePct,
    annualizedPct,
    // |annualized| > 30%/yr is an extreme (crowded side)
    crowdedLong: annualizedPct !== null && annualizedPct > 30,
    crowdedShort: annualizedPct !== null && annualizedPct < -30,
    venue: f.venue,
  };
}

// ---------------------------------------------------------
// 4. Composite market analysis (ANALYZE stage output)
// ---------------------------------------------------------

export interface MarketAnalysis {
  symbol: string;
  venue: string;
  intervalMinutes: number;
  candleCount: number;
  lastClose: number;
  realizedVolatilityPct: number | null;
  atr: number | null;
  atrPctOfPrice: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  momentumPct10: number | null;
  volumeZScore: number | null;
  trend: TrendStructure;
  support: SwingPoint | null;
  resistance: SwingPoint | null;
  maxDrawdownPct: number | null;
  anomalies: string[];
}

export function analyzeCandles(series: {
  symbol: string;
  venue: string;
  intervalMinutes: number;
  candles: Candle[];
}): MarketAnalysis | null {
  const { candles } = series;
  if (candles.length < 30) return null;
  const lastClose = candles[candles.length - 1].close;
  const atr14 = atr(candles, 14);
  const sr = supportResistance(candles);
  const trend = classifyTrend(candles);
  const periodsPerYear =
    series.intervalMinutes >= 1440
      ? 365
      : series.intervalMinutes >= 240
        ? 365 * 6
        : series.intervalMinutes >= 60
          ? 365 * 24
          : 365 * 24 * (60 / series.intervalMinutes);
  const anomalies: string[] = [];
  const vz = volumeZScore(candles, 30);
  if (vz !== null && vz > 4) anomalies.push("volume spike (z>4)");
  const rv = realizedVolatilityPct(candles, periodsPerYear);
  if (rv !== null && rv > 150)
    anomalies.push("extreme realized volatility (>150% ann.)");
  // staleness: gap between last two candles larger than 2 intervals
  if (candles.length >= 2) {
    const gap = candles[candles.length - 1].ts - candles[candles.length - 2].ts;
    if (gap > series.intervalMinutes * 60 * 2) {
      anomalies.push("stale/gapped candle series");
    }
  }
  return {
    symbol: series.symbol,
    venue: series.venue,
    intervalMinutes: series.intervalMinutes,
    candleCount: candles.length,
    lastClose,
    realizedVolatilityPct: rv,
    atr: atr14,
    atrPctOfPrice:
      atr14 !== null && lastClose > 0 ? (atr14 / lastClose) * 100 : null,
    rsi14: rsi(candles, 14),
    macd: macd(candles),
    momentumPct10: momentumPct(candles, 10),
    volumeZScore: vz,
    trend: trend.structure,
    support: sr.support,
    resistance: sr.resistance,
    maxDrawdownPct: maxDrawdownPct(candles),
    anomalies,
  };
}

/** Freshness check for gate use: a snapshot is fresh iff its
 *  fetch time is within `maxAgeMs` of `now`. */
export function isFresh(
  fetchedAt: string,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= maxAgeMs;
}

/** Aggregate per-venue ticker agreement summary for the
 *  CROSS-CHECK stage. */
export function summarizeTickerConsensus(snapshots: TickerSnapshot[]): {
  count: number;
  venues: string[];
  minPrice: number | null;
  maxPrice: number | null;
  spreadPct: number | null;
} {
  if (snapshots.length === 0) {
    return {
      count: 0,
      venues: [],
      minPrice: null,
      maxPrice: null,
      spreadPct: null,
    };
  }
  const prices = snapshots.map((s) => s.last);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return {
    count: snapshots.length,
    venues: snapshots.map((s) => s.venue),
    minPrice,
    maxPrice,
    spreadPct: minPrice > 0 ? ((maxPrice - minPrice) / minPrice) * 100 : null,
  };
}
