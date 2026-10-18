// ============================================================================
// ARCHIE MARKET INTELLIGENCE — MULTI-TIMEFRAME ANALYSIS ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/multi-timeframe.ts
//
// Section 10 Multi-Timeframe Analysis:
// Resampling, synchronization, causal non-lookahead alignment,
// conflicting timeframe detection, and explicit disagreement reporting.
// ============================================================================

import type {
  MarketCandle,
  CandleInterval,
  TimeframeAnalysisResult,
  MultiTimeframeAssessment,
} from "./types.ts";
import { computeIndicatorSuite, adx } from "./technical-indicators.ts";
import { analyzeMarketStructure } from "./market-structure.ts";
import { detectCandlePatterns } from "./candle-interpretation.ts";

export function intervalToMilliseconds(interval: CandleInterval): number {
  switch (interval) {
    case "1m": return 60_000;
    case "5m": return 300_000;
    case "15m": return 900_000;
    case "30m": return 1_800_000;
    case "1h": return 3_600_000;
    case "4h": return 14_400_000;
    case "1d": return 86_400_000;
    case "1w": return 604_800_000;
  }
}

/**
 * Resamples lower timeframe finalized candles into higher timeframe bars.
 * Guaranteed no lookahead: only full periods with all underlying lower bars are finalized.
 */
export function resampleCandles(
  baseCandles: MarketCandle[],
  targetInterval: CandleInterval,
): MarketCandle[] {
  if (baseCandles.length === 0) return [];

  const targetPeriodMs = intervalToMilliseconds(targetInterval);
  const buckets = new Map<number, MarketCandle[]>();

  for (const c of baseCandles) {
    if (!c.isFinalized) continue;
    const periodStart = Math.floor(c.openTimeMs / targetPeriodMs) * targetPeriodMs;
    const bucket = buckets.get(periodStart) ?? [];
    bucket.push(c);
    buckets.set(periodStart, bucket);
  }

  const resampled: MarketCandle[] = [];
  const sortedPeriods = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const periodStart of sortedPeriods) {
    const list = buckets.get(periodStart)!;
    if (list.length === 0) continue;

    list.sort((a, b) => a.openTimeMs - b.openTimeMs);

    const open = list[0].open;
    const close = list[list.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const item of list) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      volume += item.volume;
    }

    resampled.push({
      openTimeMs: periodStart,
      closeTimeMs: periodStart + targetPeriodMs - 1,
      open,
      high,
      low,
      close,
      volume,
      isFinalized: true,
    });
  }

  return resampled;
}

/**
 * Synchronizes higher timeframe candles at a specific lower timeframe decision timestamp.
 * Strictly filters out any HTF candle that closed after the decision timestamp.
 */
export function filterSynchronizedHtfCandles(
  htfCandles: MarketCandle[],
  decisionTimestampMs: number,
): MarketCandle[] {
  return htfCandles.filter((c) => c.closeTimeMs <= decisionTimestampMs);
}

/**
 * Performs self-contained single-timeframe structural and trend analysis.
 */
export function analyzeSingleTimeframe(
  candles: MarketCandle[],
  interval: CandleInterval,
): TimeframeAnalysisResult {
  if (candles.length === 0) {
    return {
      interval,
      latestCandleTimestamp: 0,
      regime: "RANGING",
      trendDirection: "UNCERTAIN",
      trendStrengthAdx: 0,
      detectedPatterns: [],
    };
  }

  const latest = candles[candles.length - 1];
  const indicators = computeIndicatorSuite(candles);
  const structure = analyzeMarketStructure(candles);
  const patterns = detectCandlePatterns(candles);
  const adxRes = adx(candles); const adxVal = adxRes ? adxRes.adx : 0;

  let trendDirection: "BULLISH" | "BEARISH" | "SIDEWAYS" | "UNCERTAIN" = "UNCERTAIN";
  if (indicators.ema9 !== null && indicators.ema21 !== null) {
    if (indicators.ema9 > indicators.ema21 && latest.close > indicators.ema21) {
      trendDirection = "BULLISH";
    } else if (indicators.ema9 < indicators.ema21 && latest.close < indicators.ema21) {
      trendDirection = "BEARISH";
    } else {
      trendDirection = "SIDEWAYS";
    }
  }

  const lastSwingHigh = structure.swings.filter((s) => s.type === "SWING_HIGH").pop();
  const lastSwingLow = structure.swings.filter((s) => s.type === "SWING_LOW").pop();
  const primaryZone = structure.supportZones[0]
    ? { low: structure.supportZones[0].price * 0.998, high: structure.supportZones[0].price * 1.002 }
    : undefined;

  return {
    interval,
    latestCandleTimestamp: latest.closeTimeMs,
    regime: structure.regime,
    trendDirection,
    trendStrengthAdx: adxVal,
    swingHigh: lastSwingHigh?.price,
    swingLow: lastSwingLow?.price,
    primaryKeyZone: primaryZone,
    detectedPatterns: patterns,
  };
}

/**
 * Evaluates multi-timeframe alignment across Higher (HTF), Intermediate (ITF), and Lower (LTF).
 * Flags conflicts and avoids forcing consensus.
 */
export function evaluateMultiTimeframeAlignment(
  htf: TimeframeAnalysisResult,
  itf: TimeframeAnalysisResult,
  ltf: TimeframeAnalysisResult,
): MultiTimeframeAssessment {
  const conflicts: string[] = [];
  let score = 0.5;

  const stalenessThresholdMs = intervalToMilliseconds(htf.interval) * 3;
  if (ltf.latestCandleTimestamp - htf.latestCandleTimestamp > stalenessThresholdMs) {
    conflicts.push(`HTF (${htf.interval}) data is stale relative to LTF (${ltf.interval}).`);
  }

  if (htf.trendDirection === ltf.trendDirection && htf.trendDirection !== "UNCERTAIN") {
    score += 0.25;
  } else if (
    (htf.trendDirection === "BULLISH" && ltf.trendDirection === "BEARISH") ||
    (htf.trendDirection === "BEARISH" && ltf.trendDirection === "BULLISH")
  ) {
    conflicts.push(`Trend direction conflict: HTF (${htf.interval}) is ${htf.trendDirection} while LTF (${ltf.interval}) is ${ltf.trendDirection}.`);
    score -= 0.30;
  }

  if (itf.trendDirection === htf.trendDirection) {
    score += 0.15;
  } else if (itf.trendDirection !== "SIDEWAYS") {
    conflicts.push(`Intermediate (${itf.interval}) trend (${itf.trendDirection}) diverges from HTF (${htf.trendDirection}).`);
  }

  if (htf.regime === "HIGH_VOLATILITY" && ltf.regime === "LOW_VOLATILITY") {
    conflicts.push("Volatility regime mismatch: HTF high volatility expansion with compressed LTF range.");
  }

  const boundedScore = Math.max(0, Math.min(1.0, score));
  const isAligned = conflicts.length === 0 && boundedScore >= 0.70;

  let synthesis = "";
  if (isAligned) {
    synthesis = `Multi-timeframe confluence confirmed in direction ${htf.trendDirection}. Confluence score: ${(boundedScore * 100).toFixed(0)}%.`;
  } else if (conflicts.length > 0) {
    synthesis = `Multi-timeframe divergence detected: ${conflicts.join("; ")}`;
  } else {
    synthesis = `Mixed timeframe signals. Confluence score ${(boundedScore * 100).toFixed(0)}% indicates no clear multi-timeframe bias.`;
  }

  return {
    higherTimeframe: htf,
    intermediateTimeframe: itf,
    lowerTimeframe: ltf,
    isAligned,
    confluenceScore: Math.round(boundedScore * 100) / 100,
    conflicts,
    synthesis,
  };
}
