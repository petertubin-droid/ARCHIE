import { describe, it, expect } from "vitest";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";
import {
  resampleCandles,
  filterSynchronizedHtfCandles,
  evaluateMultiTimeframeAlignment,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

function create1mCandles(count: number, rawStartMs = 1700000000000): MarketCandle[] {
  // Align start to 15m boundary (900,000 ms)
  const startMs = Math.floor(rawStartMs / 900_000) * 900_000;
  const candles: MarketCandle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const openTimeMs = startMs + i * 60_000;
    const closeTimeMs = openTimeMs + 59_999;
    const open = price;
    price += (i % 2 === 0 ? 0.5 : -0.2);
    const close = price;
    const high = Math.max(open, close) + 0.3;
    const low = Math.min(open, close) - 0.3;
    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high,
      low,
      close,
      volume: 100,
      isFinalized: true,
    });
  }
  return candles;
}

describe("ARCHIE Multi-Timeframe Analysis Engine (Section 10)", () => {
  it("resamples lower timeframe candles into higher timeframe bars without lookahead", () => {
    // 60 1-minute candles = exactly 4 15-minute bars
    const base1m = create1mCandles(60);
    const resampled15m = resampleCandles(base1m, "15m");

    expect(resampled15m.length).toBe(4);
    // Check first 15m bar corresponds to the first 15 1m candles
    expect(resampled15m[0].open).toBe(base1m[0].open);
    expect(resampled15m[0].close).toBe(base1m[14].close);
    expect(resampled15m[0].volume).toBe(1500); // 15 * 100
  });

  it("strictly filters higher timeframe candles to eliminate lookahead bias", () => {
    const base1m = create1mCandles(120);
    const htf15m = resampleCandles(base1m, "15m");

    // Lower timeframe decision point at minute 47 (48 candles into the sequence)
    const decisionTime = base1m[47].closeTimeMs;
    const validHtf = filterSynchronizedHtfCandles(htf15m, decisionTime);

    // Minute 47 only allows 15m bars fully closed: minutes 0-14, 15-29, 30-44. (3 bars)
    expect(validHtf.length).toBe(3);
    for (const h of validHtf) {
      expect(h.closeTimeMs).toBeLessThanOrEqual(decisionTime);
    }
  });

  it("detects trend alignment and disagreement across timeframes", () => {
    const bullishHtf = {
      interval: "1d" as const,
      latestCandleTimestamp: 1000000,
      regime: "TRENDING_BULL" as const,
      trendDirection: "BULLISH" as const,
      trendStrengthAdx: 32,
      detectedPatterns: [],
    };

    const bullishItf = {
      interval: "4h" as const,
      latestCandleTimestamp: 1000000,
      regime: "TRENDING_BULL" as const,
      trendDirection: "BULLISH" as const,
      trendStrengthAdx: 28,
      detectedPatterns: [],
    };

    const bullishLtf = {
      interval: "1h" as const,
      latestCandleTimestamp: 1000000,
      regime: "TRENDING_BULL" as const,
      trendDirection: "BULLISH" as const,
      trendStrengthAdx: 25,
      detectedPatterns: [],
    };

    const alignedRes = evaluateMultiTimeframeAlignment(bullishHtf, bullishItf, bullishLtf);
    expect(alignedRes.isAligned).toBe(true);
    expect(alignedRes.confluenceScore).toBeGreaterThanOrEqual(0.70);
    expect(alignedRes.conflicts.length).toBe(0);

    // Now introduce conflict on LTF
    const bearishLtf = {
      ...bullishLtf,
      trendDirection: "BEARISH" as const,
    };

    const conflictedRes = evaluateMultiTimeframeAlignment(bullishHtf, bullishItf, bearishLtf);
    expect(conflictedRes.isAligned).toBe(false);
    expect(conflictedRes.conflicts.length).toBeGreaterThan(0);
    expect(conflictedRes.conflicts[0]).toContain("Trend direction conflict");
  });
});
