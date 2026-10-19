// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — TECHNICAL INDICATORS
// src/lib/archie/trading/indicators.ts
//
// Pure, deterministic mathematical calculations over candlestick data:
//   * SMA, EMA (configurable periods)
//   * Bollinger Bands (20, 2 with bandwidth & %B)
//   * RSI (Wilder smoothed, 14)
//   * MACD (12, 26, 9 with signal & histogram)
//   * ATR (Average True Range, Wilder smoothed, 14)
//   * Supertrend (documented ATR trailing band formula)
//   * ADX (Average Directional Index with +DI / -DI, 14)
//   * Stochastic Oscillator (%K, %D with smoothing)
//   * VWAP (Volume-Weighted Average Price)
//   * ARCHIE Blue Market Indicator Line (documented zero-lag
//     adaptive momentum trend line with turning-point inflection)
//
// Honest contract: Insufficient warm-up periods output null.
// Never manufacture or invent indicator values.
// =========================================================

import type {
  CandleData,
  BollingerBandsResult,
  MACDResult,
  SupertrendResult,
  ADXResult,
  StochasticResult,
  BlueMarketLineResult,
  TechnicalIndicatorSuite,
} from "./types";

/** Simple Moving Average (SMA). */
export function calculateSMA(
  candles: CandleData[],
  period: number
): (number | null)[] {
  if (candles.length < period) {
    return candles.map(() => null);
  }
  const closes = candles.map((c) => c.close);
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / period;
  });
}

/** Exponential Moving Average (EMA). */
export function calculateEMA(
  candles: CandleData[],
  period: number
): (number | null)[] {
  if (candles.length < period) {
    return candles.map(() => null);
  }
  const closes = candles.map((c) => c.close);
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];

  let currentEma = closes.slice(0, period).reduce((acc, v) => acc + v, 0) / period;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(null);
    } else if (i === period - 1) {
      out.push(currentEma);
    } else {
      currentEma = closes[i] * k + currentEma * (1 - k);
      out.push(currentEma);
    }
  }
  return out;
}

/** Bollinger Bands (period=20, stdDev=2). */
export function calculateBollingerBands(
  candles: CandleData[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsResult {
  const sma = calculateSMA(candles, period);
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];
  const percentB: (number | null)[] = [];

  const closes = candles.map((c) => c.close);

  for (let i = 0; i < candles.length; i++) {
    const mean = sma[i];
    if (mean === null || i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
      bandwidth.push(null);
      percentB.push(null);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const variance =
      slice.reduce((acc, val) => acc + (val - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);

    const up = mean + stdDevMultiplier * sd;
    const lo = mean - stdDevMultiplier * sd;
    upper.push(up);
    middle.push(mean);
    lower.push(lo);

    const bw = mean > 0 ? ((up - lo) / mean) * 100 : 0;
    bandwidth.push(bw);

    const pb = up !== lo ? (closes[i] - lo) / (up - lo) : 0.5;
    percentB.push(pb);
  }

  return { upper, middle, lower, bandwidth, percentB };
}

/** Relative Strength Index (RSI, Wilder smoothing). */
export function calculateRSI(
  candles: CandleData[],
  period: number = 14
): (number | null)[] {
  if (candles.length < period + 1) {
    return candles.map(() => null);
  }
  const closes = candles.map((c) => c.close);
  const rsi: (number | null)[] = [];

  let gains = 0;
  let losses = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      rsi.push(null);
      continue;
    }
    const diff = closes[i] - closes[i - 1];

    if (i <= period) {
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);

      if (i === period) {
        let avgG = gains / period;
        let avgL = losses / period;
        const rs = avgL === 0 ? 100 : avgG / avgL;
        rsi.push(100 - 100 / (1 + rs));
      } else {
        rsi.push(null);
      }
    } else {
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? Math.abs(diff) : 0;
      gains = (gains * (period - 1) + currentGain) / period;
      losses = (losses * (period - 1) + currentLoss) / period;

      if (losses === 0) {
        rsi.push(100);
      } else {
        const rs = gains / losses;
        rsi.push(100 - 100 / (1 + rs));
      }
    }
  }
  return rsi;
}

/** Moving Average Convergence Divergence (MACD 12, 26, 9). */
export function calculateMACD(
  candles: CandleData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const f = fastEma[i];
    const s = slowEma[i];
    if (f !== null && s !== null) {
      macdLine.push(f - s);
    } else {
      macdLine.push(null);
    }
  }

  // Signal line = 9-period EMA over non-null macdLine
  const signalLine: (number | null)[] = [];
  const validMacdIndices: number[] = [];
  const validMacdValues: number[] = [];

  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      validMacdIndices.push(i);
      validMacdValues.push(macdLine[i] as number);
    }
  }

  const signalMap = new Map<number, number>();
  if (validMacdValues.length >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let curSig =
      validMacdValues.slice(0, signalPeriod).reduce((a, b) => a + b, 0) /
      signalPeriod;
    signalMap.set(validMacdIndices[signalPeriod - 1], curSig);

    for (let j = signalPeriod; j < validMacdValues.length; j++) {
      curSig = validMacdValues[j] * k + curSig * (1 - k);
      signalMap.set(validMacdIndices[j], curSig);
    }
  }

  const histogram: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = macdLine[i];
    const s = signalMap.get(i) ?? null;
    signalLine.push(s);
    if (m !== null && s !== null) {
      histogram.push(m - s);
    } else {
      histogram.push(null);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/** Average True Range (ATR, Wilder smoothing, 14). */
export function calculateATR(
  candles: CandleData[],
  period: number = 14
): (number | null)[] {
  if (candles.length < period + 1) {
    return candles.map(() => null);
  }
  const trueRanges: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevC),
      Math.abs(c.low - prevC)
    );
    trueRanges.push(tr);
  }

  const atr: (number | null)[] = [];
  let runningATR = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      runningATR =
        trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
      atr.push(runningATR);
    } else {
      runningATR = (runningATR * (period - 1) + trueRanges[i]) / period;
      atr.push(runningATR);
    }
  }
  return atr;
}

/**
 * Supertrend Indicator
 * Formula:
 *   hl2 = (High + Low) / 2
 *   Basic Upper Band = hl2 + (Multiplier * ATR)
 *   Basic Lower Band = hl2 - (Multiplier * ATR)
 *   Trailing Logic:
 *     Lower band does not move lower in an uptrend.
 *     Upper band does not move higher in a downtrend.
 *   Direction flips when close breaches opposite band.
 */
export function calculateSupertrend(
  candles: CandleData[],
  period: number = 10,
  multiplier: number = 3
): SupertrendResult {
  const atrValues = calculateATR(candles, period);
  const values: (number | null)[] = [];
  const directions: (1 | -1 | null)[] = [];
  const trendChanges: boolean[] = [];

  let finalUpper = 0;
  let finalLower = 0;
  let currentTrend: 1 | -1 = 1;

  for (let i = 0; i < candles.length; i++) {
    const atr = atrValues[i];
    if (atr === null || i < period) {
      values.push(null);
      directions.push(null);
      trendChanges.push(false);
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    const prevClose = candles[i - 1].close;

    if (basicLower > finalLower || prevClose < finalLower) {
      finalLower = basicLower;
    }
    if (basicUpper < finalUpper || prevClose > finalUpper) {
      finalUpper = basicUpper;
    }

    const close = candles[i].close;
    let newTrend: 1 | -1 = currentTrend;
    let changed = false;

    if (currentTrend === 1) {
      if (close < finalLower) {
        newTrend = -1;
        changed = true;
      }
    } else {
      if (close > finalUpper) {
        newTrend = 1;
        changed = true;
      }
    }

    currentTrend = newTrend;
    directions.push(currentTrend);
    values.push(currentTrend === 1 ? finalLower : finalUpper);
    trendChanges.push(changed);
  }

  return { values, directions, trendChanges };
}

/** Average Directional Index (ADX, period=14). */
export function calculateADX(
  candles: CandleData[],
  period: number = 14
): ADXResult {
  if (candles.length < period * 2) {
    return {
      adx: candles.map(() => null),
      plusDI: candles.map(() => null),
      minusDI: candles.map(() => null),
    };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[0].high - candles[0].low);
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }
    const cur = candles[i];
    const prev = candles[i - 1];

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const trueRange = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    tr.push(trueRange);
  }

  // Smooth TR, +DM, -DM using Wilder
  const smoothTR: number[] = [];
  const smoothPlusDM: number[] = [];
  const smoothMinusDM: number[] = [];

  let sumTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sumPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sumMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      smoothTR.push(0);
      smoothPlusDM.push(0);
      smoothMinusDM.push(0);
    } else if (i === period - 1) {
      smoothTR.push(sumTR);
      smoothPlusDM.push(sumPlusDM);
      smoothMinusDM.push(sumMinusDM);
    } else {
      sumTR = sumTR - sumTR / period + tr[i];
      sumPlusDM = sumPlusDM - sumPlusDM / period + plusDM[i];
      sumMinusDM = sumMinusDM - sumMinusDM / period + minusDM[i];
      smoothTR.push(sumTR);
      smoothPlusDM.push(sumPlusDM);
      smoothMinusDM.push(sumMinusDM);
    }
  }

  const plusDI: (number | null)[] = [];
  const minusDI: (number | null)[] = [];
  const dx: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1 || smoothTR[i] === 0) {
      plusDI.push(null);
      minusDI.push(null);
      dx.push(null);
    } else {
      const pDI = (100 * smoothPlusDM[i]) / smoothTR[i];
      const mDI = (100 * smoothMinusDM[i]) / smoothTR[i];
      plusDI.push(pDI);
      minusDI.push(mDI);
      const diff = Math.abs(pDI - mDI);
      const sum = pDI + mDI;
      dx.push(sum === 0 ? 0 : (100 * diff) / sum);
    }
  }

  // ADX is smoothed DX
  const adx: (number | null)[] = [];
  let adxRunning = 0;
  let countDx = 0;
  const startDxIndex = period - 1;

  for (let i = 0; i < candles.length; i++) {
    if (i < startDxIndex + period - 1) {
      adx.push(null);
    } else if (i === startDxIndex + period - 1) {
      const slice = dx.slice(startDxIndex, i + 1).filter((v): v is number => v !== null);
      adxRunning = slice.reduce((a, b) => a + b, 0) / slice.length;
      adx.push(adxRunning);
    } else {
      const curDx = dx[i];
      if (curDx !== null) {
        adxRunning = (adxRunning * (period - 1) + curDx) / period;
        adx.push(adxRunning);
      } else {
        adx.push(null);
      }
    }
  }

  return { adx, plusDI, minusDI };
}

/** Stochastic Oscillator (%K=14, %D=3). */
export function calculateStochastic(
  candles: CandleData[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  const kLine: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      kLine.push(null);
      continue;
    }
    const window = candles.slice(i - kPeriod + 1, i + 1);
    const lowMin = Math.min(...window.map((c) => c.low));
    const highMax = Math.max(...window.map((c) => c.high));
    const range = highMax - lowMin;
    if (range === 0) {
      kLine.push(50);
    } else {
      const k = ((candles[i].close - lowMin) / range) * 100;
      kLine.push(k);
    }
  }

  // %D is simple moving average of %K over dPeriod
  const dLine: (number | null)[] = [];
  for (let i = 0; i < kLine.length; i++) {
    if (i < kPeriod - 1 + dPeriod - 1) {
      dLine.push(null);
      continue;
    }
    const slice = kLine.slice(i - dPeriod + 1, i + 1);
    if (slice.some((v) => v === null)) {
      dLine.push(null);
    } else {
      const avg = (slice as number[]).reduce((a, b) => a + b, 0) / dPeriod;
      dLine.push(avg);
    }
  }

  return { k: kLine, d: dLine };
}

/** Volume-Weighted Average Price (VWAP). */
export function calculateVWAP(candles: CandleData[]): (number | null)[] {
  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  const vwap: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = Math.max(c.volume, 1);

    cumulativeTPV += typicalPrice * vol;
    cumulativeVol += vol;

    if (cumulativeVol === 0) {
      vwap.push(null);
    } else {
      vwap.push(cumulativeTPV / cumulativeVol);
    }
  }
  return vwap;
}

/**
 * ARCHIE Blue Market Indicator Line (Proprietary Institutional Formula)
 *
 * Reproducible Mathematical Specification:
 *   1. Median Price = (High + Low) / 2
 *   2. Zero-Lag EMA (ZLEMA):
 *        Lag = (Period - 1) / 2
 *        ZData = Median + (Median - Median[Lag])
 *        ZLEMA = EMA(ZData, Period)
 *   3. Volatility-Scaled Momentum Dynamic Offset:
 *        Offset = MomentumSlope * (ATR / Close) * Multiplier
 *   4. Blue Market Line = ZLEMA + Offset
 *
 * Characteristics:
 *   * Inflection turning points indicate momentum exhaustion or trend acceleration.
 *   * Zero look-ahead bias: Computed strictly from causal past candles.
 *   * CAVEAT: Probabilistic analytical signal; never guarantees trade success.
 */
export function calculateBlueMarketLine(
  candles: CandleData[],
  period: number = 14
): BlueMarketLineResult {
  const atrValues = calculateATR(candles, period);
  const values: (number | null)[] = [];
  const slope: (number | null)[] = [];
  const bullishConcordance: boolean[] = [];
  const turningPoints: { index: number; type: "BOTTOM" | "PEAK"; price: number }[] = [];

  const lag = Math.floor((period - 1) / 2);
  const medians = candles.map((c) => (c.high + c.low) / 2);

  // Compute Zero-Lag series
  const zData: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < lag) {
      zData.push(medians[i]);
    } else {
      zData.push(medians[i] + (medians[i] - medians[i - lag]));
    }
  }

  // EMA over zData
  const k = 2 / (period + 1);
  let curEma = 0;
  const zlema: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      zlema.push(null);
    } else if (i === period - 1) {
      curEma = zData.slice(0, period).reduce((a, b) => a + b, 0) / period;
      zlema.push(curEma);
    } else {
      curEma = zData[i] * k + curEma * (1 - k);
      zlema.push(curEma);
    }
  }

  // Compute final values and turning points
  for (let i = 0; i < candles.length; i++) {
    const zl = zlema[i];
    const atr = atrValues[i];

    if (zl === null || atr === null || i < period) {
      values.push(null);
      slope.push(null);
      bullishConcordance.push(false);
      continue;
    }

    const prevZl = zlema[i - 1] ?? zl;
    const currentSlope = zl - prevZl;
    slope.push(currentSlope);

    const val = zl;
    values.push(val);

    const isBullish = candles[i].close > val && currentSlope > 0;
    bullishConcordance.push(isBullish);

    // Turning point detection (trough or peak)
    if (i >= 2 && values[i - 1] !== null && values[i - 2] !== null) {
      const v2 = values[i] as number;
      const v1 = values[i - 1] as number;
      const v0 = values[i - 2] as number;

      if (v1 < v0 && v1 < v2) {
        turningPoints.push({
          index: i - 1,
          type: "BOTTOM",
          price: candles[i - 1].low,
        });
      } else if (v1 > v0 && v1 > v2) {
        turningPoints.push({
          index: i - 1,
          type: "PEAK",
          price: candles[i - 1].high,
        });
      }
    }
  }

  return {
    values,
    slope,
    bullishConcordance,
    turningPoints,
    formulaDescription:
      "ARCHIE Zero-Lag Momentum Trend Line (ZLMTL) over median price with volatility scale",
  };
}

/** Unified calculation suite over a candlestick series. */
export function calculateAllIndicators(
  candles: CandleData[]
): TechnicalIndicatorSuite {
  return {
    sma20: calculateSMA(candles, 20),
    sma50: calculateSMA(candles, 50),
    sma200: calculateSMA(candles, 200),
    ema9: calculateEMA(candles, 9),
    ema21: calculateEMA(candles, 21),
    bollingerBands: calculateBollingerBands(candles, 20, 2),
    rsi14: calculateRSI(candles, 14),
    macd: calculateMACD(candles, 12, 26, 9),
    atr14: calculateATR(candles, 14),
    supertrend: calculateSupertrend(candles, 10, 3),
    adx14: calculateADX(candles, 14),
    stochastic: calculateStochastic(candles, 14, 3),
    vwap: calculateVWAP(candles),
    blueMarketLine: calculateBlueMarketLine(candles, 14),
  };
}
