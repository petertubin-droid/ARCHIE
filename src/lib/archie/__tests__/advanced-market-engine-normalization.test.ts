import { describe, it, expect } from "vitest";
import {
  normalizeAndValidateSeries,
  validateSingleCandle,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/normalization.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

function createCandles(count: number, intervalMs = 60000): MarketCandle[] {
  return Array.from({ length: count }, (_, i) => ({
    openTimeMs: 1000000 + i * intervalMs,
    closeTimeMs: 1000000 + (i + 1) * intervalMs - 1,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 1000,
    isFinalized: true,
    source: "TEST_FIXTURE",
  }));
}

describe("ARCHIE Market Data Normalization & Integrity Engine", () => {
  it("validates correctly formed OHLC candles", () => {
    const good: MarketCandle = {
      openTimeMs: 1000000,
      closeTimeMs: 1059999,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
      isFinalized: true,
    };

    const result = validateSingleCandle(good);
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("rejects non-finite numbers and impossible OHLC geometry", () => {
    const bad: MarketCandle = {
      openTimeMs: 1000000,
      closeTimeMs: 1059999,
      open: 100,
      high: 90, // High below open/close
      low: 95, // Low above high
      close: 102,
      volume: Number.NaN,
      isFinalized: true,
    };

    const result = validateSingleCandle(bad);
    expect(result.valid).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("sorts chronological, detects gaps, and rejects duplicates in the series", () => {
    const candles = createCandles(10);
    candles[5].openTimeMs += 60000; // Gap at candle 5
    candles[7] = candles[6]; // Duplicate candle 6

    const normalized = normalizeAndValidateSeries(candles, "1m");
    expect(normalized.normalizedCandles.length).toBeLessThan(candles.length);
    expect(normalized.report.duplicateCount).toBe(1);
    expect(normalized.report.missingIntervalGaps).toBeGreaterThan(0);
    expect(
      normalized.normalizedCandles.every(
        (c, i, arr) => i === 0 || c.openTimeMs > arr[i - 1].openTimeMs,
      ),
    ).toBe(true);
  });

  it("flags abstention when series has zero valid candles", () => {
    const badCandle: MarketCandle = {
      openTimeMs: 1000000,
      closeTimeMs: 1059999,
      open: 100,
      high: 50,
      low: 150,
      close: 100,
      volume: 0,
      isFinalized: true,
    };
    const normalized = normalizeAndValidateSeries([badCandle], "1m");
    expect(normalized.report.abstainFromAnalysis).toBe(true);
  });
});
