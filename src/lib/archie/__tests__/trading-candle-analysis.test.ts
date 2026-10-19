// =========================================================
// ARCHIE TRADING CANDLE ANALYSIS TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { analyzeSingleCandle, analyzeCandleSeries } from "../trading/candle-analysis";
import type { CandleData } from "../trading/types";

describe("Candle Reading Engine", () => {
  it("detects bullish pin bar rejection pattern", () => {
    const pinCandle: CandleData = {
      time: Date.now(),
      open: 104,
      high: 106,
      low: 95, // long lower wick (10 points)
      close: 105.5,
      volume: 1500,
    };
    const metrics = analyzeSingleCandle(0, [pinCandle], [5]);
    expect(metrics.direction).toBe("BULLISH");
    expect(metrics.detectedPatterns).toContain("PIN_BAR_BULLISH");
  });

  it("detects doji formation when body is compressed", () => {
    const dojiCandle: CandleData = {
      time: Date.now(),
      open: 100,
      high: 105,
      low: 95,
      close: 100.1, // tiny body
      volume: 1200,
    };
    const metrics = analyzeSingleCandle(0, [dojiCandle], [5]);
    expect(metrics.direction).toBe("NEUTRAL_DOJI");
    expect(metrics.detectedPatterns).toContain("DOJI");
  });

  it("analyzes entire candle series and tracks breakouts and runs", () => {
    const candles: CandleData[] = [];
    const now = Date.now();
    for (let i = 0; i < 25; i++) {
      candles.push({
        time: now + i * 60000,
        open: 100 + i,
        high: 101.5 + i,
        low: 99.5 + i,
        close: 101 + i, // consecutive bullish
        volume: 2000,
      });
    }
    const analysis = analyzeCandleSeries(candles, 20);
    expect(analysis.consecutiveBullish).toBeGreaterThan(0);
    expect(analysis.dominantBias).toBe("BULLISH");
  });
});
