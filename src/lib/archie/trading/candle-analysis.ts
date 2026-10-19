// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — CANDLE READING ENGINE
// src/lib/archie/trading/candle-analysis.ts
//
// Deterministic candle analysis & multi-candle formation recognition:
//   * OHLC structural relationships & candle metrics
//   * Body-to-range ratios & close positioning
//   * Range vs ATR normalization (compression NR7 vs expansion)
//   * Formations: Doji, Hammer, Shooting Star, Engulfing,
//     Inside Bar, Outside Bar, Pin Bars, Stars, Soldiers
//   * Breakout & price gap detection
//   * Look-ahead bias prevention: All metrics use causal bar sequences
// =========================================================

import type {
  CandleData,
  CandleDirection,
  CandlePatternName,
  SingleCandleMetrics,
  CandleSeriesAnalysis,
} from "./types";
import { calculateATR } from "./indicators";

/** Analyze a single candle and its immediate preceding context. */
export function analyzeSingleCandle(
  index: number,
  candles: CandleData[],
  atrValues: (number | null)[]
): SingleCandleMetrics {
  const c = candles[index];
  const range = Math.max(c.high - c.low, 1e-8);
  const bodySize = Math.abs(c.close - c.open);
  const bodyPctOfRange = (bodySize / range) * 100;

  const isBullish = c.close > c.open;
  const isBearish = c.close < c.open;
  const isDoji = bodyPctOfRange <= 10;

  const direction: CandleDirection = isDoji
    ? "NEUTRAL_DOJI"
    : isBullish
    ? "BULLISH"
    : "BEARISH";

  const upperWickSize = isBullish ? c.high - c.close : c.high - c.open;
  const lowerWickSize = isBullish ? c.open - c.low : c.close - c.low;
  const closePositionInRange = (c.close - c.low) / range;

  const currentATR = atrValues[index];
  const rangeVsATR = currentATR && currentATR > 0 ? range / currentATR : null;

  const isCompressed = rangeVsATR !== null && rangeVsATR < 0.65;
  const isExpanded = rangeVsATR !== null && rangeVsATR > 1.75;

  const detectedPatterns: CandlePatternName[] = [];

  // 1. Doji patterns
  if (isDoji) {
    if (lowerWickSize >= range * 0.65 && upperWickSize <= range * 0.1) {
      detectedPatterns.push("DRAGONFLY_DOJI");
    } else if (upperWickSize >= range * 0.65 && lowerWickSize <= range * 0.1) {
      detectedPatterns.push("GRAVESTONE_DOJI");
    } else {
      detectedPatterns.push("DOJI");
    }
  }

  // 2. Pin bars (rejection bars with >= 60% wick)
  if (lowerWickSize >= range * 0.6 && closePositionInRange >= 0.6) {
    detectedPatterns.push("PIN_BAR_BULLISH");
  }
  if (upperWickSize >= range * 0.6 && closePositionInRange <= 0.4) {
    detectedPatterns.push("PIN_BAR_BEARISH");
  }

  // 3. Hammer & Inverted Hammer
  if (
    lowerWickSize >= bodySize * 2 &&
    upperWickSize <= range * 0.15 &&
    closePositionInRange >= 0.65
  ) {
    detectedPatterns.push("HAMMER");
  }
  if (
    upperWickSize >= bodySize * 2 &&
    lowerWickSize <= range * 0.15 &&
    closePositionInRange <= 0.35
  ) {
    detectedPatterns.push("SHOOTING_STAR");
  }

  // Multi-candle context patterns (requires index > 0)
  if (index > 0) {
    const prev = candles[index - 1];
    const prevRange = Math.max(prev.high - prev.low, 1e-8);
    const prevBody = Math.abs(prev.close - prev.open);

    // Inside Bar: current high <= prev high and current low >= prev low
    if (c.high <= prev.high && c.low >= prev.low) {
      detectedPatterns.push("INSIDE_BAR");
    }

    // Outside Bar: current high > prev high and current low < prev low
    if (c.high > prev.high && c.low < prev.low) {
      detectedPatterns.push("OUTSIDE_BAR");
    }

    // Engulfing patterns
    if (
      isBullish &&
      prev.close < prev.open &&
      c.close >= prev.open &&
      c.open <= prev.close &&
      bodySize > prevBody
    ) {
      detectedPatterns.push("BULLISH_ENGULFING");
    }
    if (
      isBearish &&
      prev.close > prev.open &&
      c.close <= prev.open &&
      c.open >= prev.close &&
      bodySize > prevBody
    ) {
      detectedPatterns.push("BEARISH_ENGULFING");
    }
  }

  // 3-candle patterns (requires index >= 2)
  if (index >= 2) {
    const p1 = candles[index - 2];
    const p2 = candles[index - 1];
    const p3 = c;

    // Morning Star: Long bearish -> small body -> strong bullish
    const p1Bearish = p1.close < p1.open;
    const p2Small = Math.abs(p2.close - p2.open) <= (p1.high - p1.low) * 0.35;
    const p3Bullish = p3.close > p3.open && p3.close > (p1.open + p1.close) / 2;
    if (p1Bearish && p2Small && p3Bullish) {
      detectedPatterns.push("MORNING_STAR");
    }

    // Evening Star: Long bullish -> small body -> strong bearish
    const p1Bullish = p1.close > p1.open;
    const p3Bearish = p3.close < p3.open && p3.close < (p1.open + p1.close) / 2;
    if (p1Bullish && p2Small && p3Bearish) {
      detectedPatterns.push("EVENING_STAR");
    }

    // Three White Soldiers / Black Crows
    if (
      p1.close > p1.open &&
      p2.close > p2.open &&
      p3.close > p3.open &&
      p3.close > p2.close &&
      p2.close > p1.close
    ) {
      detectedPatterns.push("THREE_WHITE_SOLDIERS");
    }
    if (
      p1.close < p1.open &&
      p2.close < p2.open &&
      p3.close < p3.open &&
      p3.close < p2.close &&
      p2.close < p1.close
    ) {
      detectedPatterns.push("THREE_BLACK_CROWS");
    }
  }

  return {
    index,
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    range,
    bodySize,
    bodyPctOfRange,
    upperWickSize,
    lowerWickSize,
    closePositionInRange,
    direction,
    rangeVsATR,
    isCompressed,
    isExpanded,
    detectedPatterns,
  };
}

/** Analyze an entire candlestick series. */
export function analyzeCandleSeries(
  candles: CandleData[],
  lookbackCount: number = 30
): CandleSeriesAnalysis {
  if (candles.length === 0) {
    return {
      recentCandles: [],
      consecutiveBullish: 0,
      consecutiveBearish: 0,
      latestBreakout: { type: "NONE", level: null },
      gapDetected: { type: "NONE", size: 0 },
      dominantBias: "BALANCED",
    };
  }

  const atrValues = calculateATR(candles, 14);
  const startIndex = Math.max(0, candles.length - lookbackCount);
  const recentCandles: SingleCandleMetrics[] = [];

  for (let i = startIndex; i < candles.length; i++) {
    recentCandles.push(analyzeSingleCandle(i, candles, atrValues));
  }

  // Count consecutive bullish / bearish runs at the tail
  let consecutiveBullish = 0;
  let consecutiveBearish = 0;

  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].close > candles[i].open) {
      if (consecutiveBearish > 0) break;
      consecutiveBullish++;
    } else if (candles[i].close < candles[i].open) {
      if (consecutiveBullish > 0) break;
      consecutiveBearish++;
    } else {
      break;
    }
  }

  // Detect recent swing breakout (prior 15 bars)
  let latestBreakout: CandleSeriesAnalysis["latestBreakout"] = {
    type: "NONE",
    level: null,
  };

  if (candles.length >= 16) {
    const window = candles.slice(candles.length - 16, candles.length - 1);
    const swingHigh = Math.max(...window.map((c) => c.high));
    const swingLow = Math.min(...window.map((c) => c.low));
    const current = candles[candles.length - 1];

    if (current.close > swingHigh) {
      latestBreakout = { type: "BREAKOUT_HIGH", level: swingHigh };
    } else if (current.close < swingLow) {
      latestBreakout = { type: "BREAKOUT_LOW", level: swingLow };
    } else if (current.high > swingHigh && current.close < swingHigh) {
      latestBreakout = { type: "FAILED_BREAKOUT", level: swingHigh };
    }
  }

  // Detect price gaps between last two bars
  let gapDetected: CandleSeriesAnalysis["gapDetected"] = {
    type: "NONE",
    size: 0,
  };

  if (candles.length >= 2) {
    const cur = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    if (cur.low > prev.high) {
      gapDetected = { type: "GAP_UP", size: cur.low - prev.high };
    } else if (cur.high < prev.low) {
      gapDetected = { type: "GAP_DOWN", size: prev.low - cur.high };
    }
  }

  // Dominant bias over recent window
  const bullishCount = recentCandles.filter((c) => c.direction === "BULLISH").length;
  const bearishCount = recentCandles.filter((c) => c.direction === "BEARISH").length;

  let dominantBias: "BULLISH" | "BEARISH" | "BALANCED" = "BALANCED";
  if (bullishCount >= recentCandles.length * 0.58) {
    dominantBias = "BULLISH";
  } else if (bearishCount >= recentCandles.length * 0.58) {
    dominantBias = "BEARISH";
  }

  return {
    recentCandles,
    consecutiveBullish,
    consecutiveBearish,
    latestBreakout,
    gapDetected,
    dominantBias,
  };
}
