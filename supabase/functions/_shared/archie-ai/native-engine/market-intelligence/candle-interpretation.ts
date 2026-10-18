// ============================================================================
// ARCHIE MARKET INTELLIGENCE — DETERMINISTIC CANDLE INTERPRETATION ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/candle-interpretation.ts
//
// Pure, deterministic candlestick reading. Calculates exact geometry and
// evaluates multi-candle price action patterns with strict numerical thresholds.
// Zero-division safe, rule-versioned, and outputs invalidation levels.
// ============================================================================

import type {
  MarketCandle,
  CandleGeometry,
  PatternDetection,
  CandlestickPatternName,
} from "./types.ts";

export const CANDLE_RULE_VERSION = "v1.0.0-archie-candle-engine";

export interface CandleThresholds {
  dojiMaxBodyToRange: number;
  pinBarMinWickRatio: number;
  pinBarMaxBodyRatio: number;
  marubozuMinBodyRatio: number;
  engulfingMinSizeRatio: number;
}

export const DEFAULT_CANDLE_THRESHOLDS: CandleThresholds = {
  dojiMaxBodyToRange: 0.10, // Body <= 10% of range
  pinBarMinWickRatio: 0.60, // Wick >= 60% of total range
  pinBarMaxBodyRatio: 0.25, // Body <= 25% of total range
  marubozuMinBodyRatio: 0.85, // Body >= 85% of total range
  engulfingMinSizeRatio: 1.05, // Engulfing body >= 1.05x prior body
};

/**
 * Computes exact geometric properties of a candle.
 */
export function calculateCandleGeometry(
  candle: MarketCandle,
  index: number,
  recentAvgBody = 0,
  atr = 0,
): CandleGeometry {
  const totalRange = Math.max(0, candle.high - candle.low);
  const open = candle.open;
  const close = candle.close;
  const high = candle.high;
  const low = candle.low;

  const body = Math.abs(close - open);
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);

  const isBullish = close > open;
  const isBearish = close < open;
  const isDoji = totalRange > 0 ? body / totalRange <= DEFAULT_CANDLE_THRESHOLDS.dojiMaxBodyToRange : true;

  const safeRange = totalRange > 0 ? totalRange : 1;
  const bodyToRangeRatio = totalRange > 0 ? body / safeRange : 0;
  const upperWickToRangeRatio = totalRange > 0 ? upperWick / safeRange : 0;
  const lowerWickToRangeRatio = totalRange > 0 ? lowerWick / safeRange : 0;
  const closePositionInRange = totalRange > 0 ? (close - low) / safeRange : 0.5;

  const relativeBodyToRecentAvg = recentAvgBody > 0 ? body / recentAvgBody : 1;
  const rangeRelativeToAtr = atr > 0 ? totalRange / atr : 1;

  return {
    index,
    timestamp: candle.openTimeMs,
    open,
    high,
    low,
    close,
    body,
    totalRange,
    upperWick,
    lowerWick,
    isBullish,
    isBearish,
    isDoji,
    bodyToRangeRatio,
    upperWickToRangeRatio,
    lowerWickToRangeRatio,
    closePositionInRange,
    relativeBodyToRecentAvg,
    rangeRelativeToAtr,
  };
}

/**
 * Identifies single and multi-candle patterns across a series of candles.
 */
export function detectCandlePatterns(
  candles: MarketCandle[],
  lookback = 10,
): PatternDetection[] {
  if (candles.length < 2) return [];

  // Compute rolling ATR and avg body
  const geometries: CandleGeometry[] = [];
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - lookback);
    const window = candles.slice(start, i);
    const avgBody =
      window.length > 0
        ? window.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / window.length
        : Math.abs(candles[i].close - candles[i].open);
    
    // Quick TR
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].open;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    );

    geometries.push(calculateCandleGeometry(candles[i], i, avgBody, tr));
  }

  const detections: PatternDetection[] = [];
  const n = candles.length;
  const curr = geometries[n - 1];
  const prev = geometries[n - 2];
  const prev2 = n >= 3 ? geometries[n - 3] : null;

  // 1. DOJI
  if (curr.isDoji) {
    detections.push({
      name: "DOJI",
      startIndex: n - 1,
      endIndex: n - 1,
      timestamp: curr.timestamp,
      bias: "NEUTRAL",
      confidence: 0.75,
      ruleVersion: CANDLE_RULE_VERSION,
      evidence: [`Body/range ratio ${curr.bodyToRangeRatio.toFixed(3)} <= ${DEFAULT_CANDLE_THRESHOLDS.dojiMaxBodyToRange}`],
      invalidationLevel: curr.isBullish ? curr.low : curr.high,
    });
  }

  // 2. HAMMER & PIN BAR BULLISH
  // Lower wick >= 60% of range, upper wick small (<= 15%), small body
  if (
    curr.lowerWickToRangeRatio >= DEFAULT_CANDLE_THRESHOLDS.pinBarMinWickRatio &&
    curr.bodyToRangeRatio <= DEFAULT_CANDLE_THRESHOLDS.pinBarMaxBodyRatio &&
    curr.upperWickToRangeRatio <= 0.20
  ) {
    detections.push({
      name: "HAMMER",
      startIndex: n - 1,
      endIndex: n - 1,
      timestamp: curr.timestamp,
      bias: "BULLISH",
      confidence: 0.82,
      ruleVersion: CANDLE_RULE_VERSION,
      evidence: [
        `Long lower wick (${(curr.lowerWickToRangeRatio * 100).toFixed(1)}% of range)`,
        `Small body (${(curr.bodyToRangeRatio * 100).toFixed(1)}% of range)`,
        `Close near top (${(curr.closePositionInRange * 100).toFixed(1)}%)`,
      ],
      invalidationLevel: curr.low,
    });
    detections.push({
      name: "PIN_BAR_BULLISH",
      startIndex: n - 1,
      endIndex: n - 1,
      timestamp: curr.timestamp,
      bias: "BULLISH",
      confidence: 0.80,
      ruleVersion: CANDLE_RULE_VERSION,
      evidence: [`Rejection wick on lower side (${(curr.lowerWickToRangeRatio * 100).toFixed(1)}%)`],
      invalidationLevel: curr.low,
    });
  }

  // 3. SHOOTING STAR & PIN BAR BEARISH
  // Upper wick >= 60% of range, lower wick small (<= 15%), small body
  if (
    curr.upperWickToRangeRatio >= DEFAULT_CANDLE_THRESHOLDS.pinBarMinWickRatio &&
    curr.bodyToRangeRatio <= DEFAULT_CANDLE_THRESHOLDS.pinBarMaxBodyRatio &&
    curr.lowerWickToRangeRatio <= 0.20
  ) {
    detections.push({
      name: "SHOOTING_STAR",
      startIndex: n - 1,
      endIndex: n - 1,
      timestamp: curr.timestamp,
      bias: "BEARISH",
      confidence: 0.82,
      ruleVersion: CANDLE_RULE_VERSION,
      evidence: [
        `Long upper wick (${(curr.upperWickToRangeRatio * 100).toFixed(1)}% of range)`,
        `Small body (${(curr.bodyToRangeRatio * 100).toFixed(1)}% of range)`,
        `Close near bottom (${(curr.closePositionInRange * 100).toFixed(1)}%)`,
      ],
      invalidationLevel: curr.high,
    });
    detections.push({
      name: "PIN_BAR_BEARISH",
      startIndex: n - 1,
      endIndex: n - 1,
      timestamp: curr.timestamp,
      bias: "BEARISH",
      confidence: 0.80,
      ruleVersion: CANDLE_RULE_VERSION,
      evidence: [`Rejection wick on upper side (${(curr.upperWickToRangeRatio * 100).toFixed(1)}%)`],
      invalidationLevel: curr.high,
    });
  }

  // 4. MARUBOZU
  if (curr.bodyToRangeRatio >= DEFAULT_CANDLE_THRESHOLDS.marubozuMinBodyRatio) {
    if (curr.isBullish) {
      detections.push({
        name: "MARUBOZU_BULLISH",
        startIndex: n - 1,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BULLISH",
        confidence: 0.85,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [`Dominant bullish body (${(curr.bodyToRangeRatio * 100).toFixed(1)}% of total range)`],
        invalidationLevel: curr.low,
      });
    } else if (curr.isBearish) {
      detections.push({
        name: "MARUBOZU_BEARISH",
        startIndex: n - 1,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BEARISH",
        confidence: 0.85,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [`Dominant bearish body (${(curr.bodyToRangeRatio * 100).toFixed(1)}% of total range)`],
        invalidationLevel: curr.high,
      });
    }
  }

  // 5. BULLISH & BEARISH ENGULFING
  // 2-candle: prev was opposite, curr body engulfs prev body
  if (prev) {
    if (
      prev.isBearish &&
      curr.isBullish &&
      curr.close >= prev.open &&
      curr.open <= prev.close &&
      curr.body >= prev.body * DEFAULT_CANDLE_THRESHOLDS.engulfingMinSizeRatio
    ) {
      detections.push({
        name: "BULLISH_ENGULFING",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BULLISH",
        confidence: 0.84,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [
          `Bullish candle body (${curr.body.toFixed(4)}) engulfs previous bearish body (${prev.body.toFixed(4)})`,
          `Close ${curr.close} >= prior open ${prev.open}`,
        ],
        invalidationLevel: Math.min(curr.low, prev.low),
      });
    } else if (
      prev.isBullish &&
      curr.isBearish &&
      curr.close <= prev.open &&
      curr.open >= prev.close &&
      curr.body >= prev.body * DEFAULT_CANDLE_THRESHOLDS.engulfingMinSizeRatio
    ) {
      detections.push({
        name: "BEARISH_ENGULFING",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BEARISH",
        confidence: 0.84,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [
          `Bearish candle body (${curr.body.toFixed(4)}) engulfs previous bullish body (${prev.body.toFixed(4)})`,
          `Close ${curr.close} <= prior open ${prev.open}`,
        ],
        invalidationLevel: Math.max(curr.high, prev.high),
      });
    }

    // 6. INSIDE BAR & OUTSIDE BAR
    if (curr.high <= prev.high && curr.low >= prev.low) {
      detections.push({
        name: "INSIDE_BAR",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "NEUTRAL",
        confidence: 0.70,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [`Current range [${curr.low}, ${curr.high}] is strictly within prior range [${prev.low}, ${prev.high}]`],
        invalidationLevel: prev.high,
      });
    } else if (curr.high > prev.high && curr.low < prev.low) {
      detections.push({
        name: "OUTSIDE_BAR",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: curr.isBullish ? "BULLISH" : curr.isBearish ? "BEARISH" : "NEUTRAL",
        confidence: 0.76,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [`Current range [${curr.low}, ${curr.high}] completely engulfs prior range [${prev.low}, ${prev.high}]`],
        invalidationLevel: curr.isBullish ? curr.low : curr.high,
      });
    }

    // 7. HARAMI
    if (
      prev.isBearish &&
      curr.isBullish &&
      curr.open >= prev.close &&
      curr.close <= prev.open &&
      curr.body < prev.body * 0.7
    ) {
      detections.push({
        name: "BULLISH_HARAMI",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BULLISH",
        confidence: 0.72,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: ["Small bullish body contained inside prior bearish body"],
        invalidationLevel: prev.low,
      });
    } else if (
      prev.isBullish &&
      curr.isBearish &&
      curr.open <= prev.close &&
      curr.close >= prev.open &&
      curr.body < prev.body * 0.7
    ) {
      detections.push({
        name: "BEARISH_HARAMI",
        startIndex: n - 2,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BEARISH",
        confidence: 0.72,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: ["Small bearish body contained inside prior bullish body"],
        invalidationLevel: prev.high,
      });
    }
  }

  // 8. MORNING STAR & EVENING STAR (3-candle)
  if (prev2 && prev) {
    // Morning Star: 1=Bearish, 2=Small body/gap down, 3=Bullish closing > 50% into 1st body
    if (
      prev2.isBearish &&
      prev.bodyToRangeRatio <= 0.35 &&
      curr.isBullish &&
      curr.close >= prev2.open - prev2.body * 0.5
    ) {
      detections.push({
        name: "MORNING_STAR",
        startIndex: n - 3,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BULLISH",
        confidence: 0.88,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [
          "3-bar reversal formation: large bear bar, followed by compression star, followed by strong bull recovery",
        ],
        invalidationLevel: Math.min(prev2.low, prev.low, curr.low),
      });
    }

    // Evening Star: 1=Bullish, 2=Small body/gap up, 3=Bearish closing > 50% into 1st body
    if (
      prev2.isBullish &&
      prev.bodyToRangeRatio <= 0.35 &&
      curr.isBearish &&
      curr.close <= prev2.open + prev2.body * 0.5
    ) {
      detections.push({
        name: "EVENING_STAR",
        startIndex: n - 3,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BEARISH",
        confidence: 0.88,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: [
          "3-bar reversal formation: large bull bar, followed by compression star, followed by strong bear breakdown",
        ],
        invalidationLevel: Math.max(prev2.high, prev.high, curr.high),
      });
    }

    // Three White Soldiers: 3 consecutive bullish bars with higher closes
    if (
      prev2.isBullish &&
      prev.isBullish &&
      curr.isBullish &&
      curr.close > prev.close &&
      prev.close > prev2.close &&
      curr.bodyToRangeRatio >= 0.5 &&
      prev.bodyToRangeRatio >= 0.5
    ) {
      detections.push({
        name: "THREE_WHITE_SOLDIERS",
        startIndex: n - 3,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BULLISH",
        confidence: 0.86,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: ["Three consecutive strong bullish candles with advancing closes"],
        invalidationLevel: prev2.low,
      });
    }

    // Three Black Crows: 3 consecutive bearish bars with lower closes
    if (
      prev2.isBearish &&
      prev.isBearish &&
      curr.isBearish &&
      curr.close < prev.close &&
      prev.close < prev2.close &&
      curr.bodyToRangeRatio >= 0.5 &&
      prev.bodyToRangeRatio >= 0.5
    ) {
      detections.push({
        name: "THREE_BLACK_CROWS",
        startIndex: n - 3,
        endIndex: n - 1,
        timestamp: curr.timestamp,
        bias: "BEARISH",
        confidence: 0.86,
        ruleVersion: CANDLE_RULE_VERSION,
        evidence: ["Three consecutive strong bearish candles with declining closes"],
        invalidationLevel: prev2.high,
      });
    }
  }

  return detections;
}
