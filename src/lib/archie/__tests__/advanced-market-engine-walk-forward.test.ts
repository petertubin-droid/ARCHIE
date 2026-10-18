import { describe, it, expect } from "vitest";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";
import { executeWalkForwardValidation } from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

function generateLongSyntheticCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 100;
  const startMs = 1600000000000;
  for (let i = 0; i < count; i++) {
    const openTimeMs = startMs + i * 3600_000;
    const closeTimeMs = openTimeMs + 3599_999;
    const open = price;
    // Periodic wave to create realistic swings
    const delta = Math.sin(i / 15) * 1.5 + (i % 3 === 0 ? 0.3 : -0.2);
    price = Math.max(50, price + delta);
    const close = price;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high,
      low,
      close,
      volume: 1000,
      isFinalized: true,
    });
  }
  return candles;
}

describe("ARCHIE Walk-Forward Validation Engine (Component M / Section 16)", () => {
  it("executes multi-fold walk-forward validation with purging and embargo", () => {
    // 350 bars allows multiple rolling folds with train=100, val=25, test=35, step=35
    const candles = generateLongSyntheticCandles(350);
    const report = executeWalkForwardValidation(candles);

    expect(report.foldsCount).toBeGreaterThan(1);
    expect(report.folds.length).toBe(report.foldsCount);

    // Verify chronological ordering of folds and purge gap
    for (let i = 1; i < report.folds.length; i++) {
      const prevFold = report.folds[i - 1];
      const currFold = report.folds[i];
      expect(currFold.trainStartMs).toBeGreaterThan(prevFold.trainStartMs);
      // Purge gap ensures test slice starts strictly after train slice
      expect(currFold.testStartMs).toBeGreaterThan(currFold.trainEndMs);
    }

    expect(typeof report.meanSharpeRatio).toBe("number");
    expect(typeof report.stabilityScore).toBe("number");
    expect(report.stabilityScore).toBeGreaterThanOrEqual(0);
    expect(report.stabilityScore).toBeLessThanOrEqual(1.0);
  });
});
