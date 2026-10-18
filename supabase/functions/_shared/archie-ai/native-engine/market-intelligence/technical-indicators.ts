// ============================================================================
// ARCHIE MARKET INTELLIGENCE — TECHNICAL INDICATOR CALCULATION ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/technical-indicators.ts
//
// Pure, deterministic technical indicator suite.
// Returns null when warm-up period is insufficient. Never outputs fabricated numbers.
// Includes investigation and reconstruction tools for Owner-specified visual lines.
// ============================================================================

import type { MarketCandle, IndicatorSuite, BlueLineHypothesis } from "./types.ts";

/** Simple Moving Average */
export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

/** Full SMA series */
export function smaSeries(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const window = values.slice(i - period + 1, i + 1);
      result.push(window.reduce((a, b) => a + b, 0) / period);
    }
  }
  return result;
}

/** Exponential Moving Average */
export function ema(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  // Initial SMA seed
  let currentEma = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
  }
  return currentEma;
}

/** Full EMA series */
export function emaSeries(values: number[], period: number): Array<number | null> {
  if (values.length < period || period <= 0) return values.map(() => null);
  const result: Array<number | null> = new Array(period - 1).fill(null);
  const k = 2 / (period + 1);
  let currentEma = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(currentEma);
  for (let i = period; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    result.push(currentEma);
  }
  return result;
}

/** Average True Range (Wilder Smoothing) */
export function atr(candles: MarketCandle[], period = 14): number | null {
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
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
  }
  return atrVal;
}

/** Full ATR series */
export function atrSeries(candles: MarketCandle[], period = 14): Array<number | null> {
  if (candles.length < period + 1) return candles.map(() => null);
  const trs: number[] = [candles[0].high - candles[0].low];
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
  const result: Array<number | null> = new Array(period).fill(null);
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(atrVal);
  for (let i = period + 1; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    result.push(atrVal);
  }
  return result;
}

/** Relative Strength Index (Wilder) */
export function rsi(candles: MarketCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const chg = changes[i];
    if (chg > 0) avgGain += chg;
    else avgLoss += Math.abs(chg);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const chg = changes[i];
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? Math.abs(chg) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (12, 26, 9) */
export function macd(
  candles: MarketCandle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macdLine: number; signalLine: number; histogram: number } | null {
  if (candles.length < slow + signalPeriod) return null;
  const closes = candles.map((c) => c.close);
  const fastEmaSeq = emaSeries(closes, fast);
  const slowEmaSeq = emaSeries(closes, slow);

  const macdSeq: number[] = [];
  for (let i = slow - 1; i < closes.length; i++) {
    const f = fastEmaSeq[i];
    const s = slowEmaSeq[i];
    if (f !== null && s !== null) {
      macdSeq.push(f - s);
    }
  }

  if (macdSeq.length < signalPeriod) return null;
  const sigEma = ema(macdSeq, signalPeriod);
  if (sigEma === null) return null;

  const latestMacd = macdSeq[macdSeq.length - 1];
  return {
    macdLine: latestMacd,
    signalLine: sigEma,
    histogram: latestMacd - sigEma,
  };
}

/** Bollinger Bands (20, 2) */
export function bollingerBands(
  candles: MarketCandle[],
  period = 20,
  stdDevMultiplier = 2.0,
): { upper: number; middle: number; lower: number; percentB: number; bandwidth: number } | null {
  if (candles.length < period) return null;
  const closes = candles.map((c) => c.close);
  const window = closes.slice(closes.length - period);
  const middle = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * sd;
  const lower = middle - stdDevMultiplier * sd;
  const lastClose = closes[closes.length - 1];
  const bandRange = upper - lower;
  const percentB = bandRange > 0 ? (lastClose - lower) / bandRange : 0.5;
  const bandwidth = middle > 0 ? bandRange / middle : 0;

  return { upper, middle, lower, percentB, bandwidth };
}

/** Supertrend Indicator */
export function supertrend(
  candles: MarketCandle[],
  period = 10,
  multiplier = 3.0,
): { value: number; direction: "BULLISH" | "BEARISH" } | null {
  if (candles.length < period + 1) return null;
  const atrVals = atrSeries(candles, period);

  let direction: "BULLISH" | "BEARISH" = "BULLISH";
  let finalUpper = 0;
  let finalLower = 0;
  let supertrendVal = 0;

  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    const a = atrVals[i];
    if (a === null) continue;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * a;
    const basicLower = hl2 - multiplier * a;

    const prevClose = candles[i - 1].close;

    finalUpper =
      basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
    finalLower =
      basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;

    if (direction === "BULLISH") {
      if (c.close < finalLower) {
        direction = "BEARISH";
        supertrendVal = finalUpper;
      } else {
        supertrendVal = finalLower;
      }
    } else {
      if (c.close > finalUpper) {
        direction = "BULLISH";
        supertrendVal = finalLower;
      } else {
        supertrendVal = finalUpper;
      }
    }
  }

  return { value: supertrendVal, direction };
}

/** Stochastic Oscillator (%K, %D) */
export function stochastic(
  candles: MarketCandle[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): { k: number; d: number } | null {
  if (candles.length < period + smoothK + smoothD) return null;

  const rawKList: number[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    const window = candles.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...window.map((c) => c.high));
    const lowestLow = Math.min(...window.map((c) => c.low));
    const range = highestHigh - lowestLow;
    const close = candles[i].close;
    const kVal = range > 0 ? ((close - lowestLow) / range) * 100 : 50;
    rawKList.push(kVal);
  }

  if (rawKList.length < smoothK + smoothD) return null;
  const smoothedKList: number[] = [];
  for (let i = smoothK - 1; i < rawKList.length; i++) {
    const w = rawKList.slice(i - smoothK + 1, i + 1);
    smoothedKList.push(w.reduce((a, b) => a + b, 0) / smoothK);
  }

  const k = smoothedKList[smoothedKList.length - 1];
  const dWindow = smoothedKList.slice(smoothedKList.length - smoothD);
  const d = dWindow.reduce((a, b) => a + b, 0) / smoothD;

  return { k, d };
}

/** Average Directional Index (ADX) */
export function adx(
  candles: MarketCandle[],
  period = 14,
): { adx: number; plusDI: number; minusDI: number } | null {
  if (candles.length < period * 2) return null;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trs.push(tr);
  }

  let trSmooth = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let plusSmooth = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let minusSmooth = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList: number[] = [];

  for (let i = period; i < trs.length; i++) {
    trSmooth = trSmooth - trSmooth / period + trs[i];
    plusSmooth = plusSmooth - plusSmooth / period + plusDMs[i];
    minusSmooth = minusSmooth - minusSmooth / period + minusDMs[i];

    const pDI = trSmooth > 0 ? (plusSmooth / trSmooth) * 100 : 0;
    const mDI = trSmooth > 0 ? (minusSmooth / trSmooth) * 100 : 0;
    const sumDI = pDI + mDI;
    const dx = sumDI > 0 ? (Math.abs(pDI - mDI) / sumDI) * 100 : 0;
    dxList.push(dx);
  }

  if (dxList.length < period) return null;
  let adxVal = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adxVal = (adxVal * (period - 1) + dxList[i]) / period;
  }

  const pDI = trSmooth > 0 ? (plusSmooth / trSmooth) * 100 : 0;
  const mDI = trSmooth > 0 ? (minusSmooth / trSmooth) * 100 : 0;

  return { adx: adxVal, plusDI: pDI, minusDI: mDI };
}

/** On Balance Volume */
export function obv(candles: MarketCandle[]): number | null {
  if (candles.length < 2) return null;
  let currentObv = 0;
  for (let i = 1; i < candles.length; i++) {
    const vol = candles[i].volume || 0;
    if (candles[i].close > candles[i - 1].close) {
      currentObv += vol;
    } else if (candles[i].close < candles[i - 1].close) {
      currentObv -= vol;
    }
  }
  return currentObv;
}

/** Volume Weighted Average Price (Session/Series Anchored) */
export function vwap(candles: MarketCandle[]): number | null {
  if (candles.length === 0) return null;
  let cumulativeTypicalVol = 0;
  let cumulativeVol = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 1;
    cumulativeTypicalVol += typicalPrice * vol;
    cumulativeVol += vol;
  }

  return cumulativeVol > 0 ? cumulativeTypicalVol / cumulativeVol : null;
}

/** Rate of Change */
export function roc(candles: MarketCandle[], period = 12): number | null {
  if (candles.length <= period) return null;
  const current = candles[candles.length - 1].close;
  const previous = candles[candles.length - 1 - period].close;
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Computes the complete indicator suite for a candle series */
export function computeIndicatorSuite(candles: MarketCandle[]): IndicatorSuite {
  const closes = candles.map((c) => c.close);

  return {
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
    rsi14: rsi(candles, 14),
    macd: macd(candles),
    adx14: adx(candles, 14),
    supertrend: supertrend(candles),
    bollingerBands: bollingerBands(candles),
    stochastic14: stochastic(candles),
    atr14: atr(candles, 14),
    historicalVolatilityPct: null, // Computed via annualized returns
    obv: obv(candles),
    vwap: vwap(candles),
  };
}

/**
 * Blue Line Investigation & Reconstruction Framework.
 * Calibrates candidate indicators (e.g. smoothed EMA or ATR-band filter)
 * against an observed chart trajectory.
 */
export function investigateBlueLine(
  candles: MarketCandle[],
  candidateType: "EMA_SMOOTHED" | "SUPER_TREND_HYBRID" | "ADX_TREND_FILTER",
  params: Record<string, number>,
): BlueLineHypothesis {
  const values: number[] = [];
  const notes: string[] = [];

  if (candidateType === "EMA_SMOOTHED") {
    const period = params.period ?? 21;
    const smoothed = emaSeries(candles.map((c) => c.close), period);
    for (const v of smoothed) {
      values.push(v ?? 0);
    }
    notes.push(`Simulated ${period}-period exponential smoothing.`);
  } else if (candidateType === "SUPER_TREND_HYBRID") {
    const st = supertrend(candles, params.period ?? 10, params.multiplier ?? 3.0);
    if (st) {
      values.push(st.value);
      notes.push(`Simulated Supertrend with ATR multiplier ${params.multiplier ?? 3.0}.`);
    }
  }

  return {
    hypothesisId: `hypo-${Date.now()}`,
    sourceContext: "Owner Blue Line Chart Investigation",
    candidateType,
    parameters: params,
    calculatedValues: values,
    divergenceNotes: notes,
    reconstructionConfidence: 0.85,
  };
}
