import { describe, it, expect } from "vitest";
import {
  detectCausalSwings,
  analyzeMarketStructure,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/market-structure.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

function generateWaveCandles(peaksAndTroughs: number[]): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let time = 1000000;

  for (let p = 0; p < peaksAndTroughs.length - 1; p++) {
    const start = peaksAndTroughs[p];
    const end = peaksAndTroughs[p + 1];
    const steps = 5;

    for (let s = 0; s < steps; s++) {
      const price = start + ((end - start) * s) / steps;
      candles.push({
        openTimeMs: time,
        closeTimeMs: time + 59999,
        open: price,
        high: price + 0.5,
        low: price - 0.5,
        close: price + ((end - start) / steps) * 0.8,
        volume: 500,
        isFinalized: true,
      });
      time += 60000;
    }
  }
  return candles;
}

describe("ARCHIE Market Structure & Regime Detection Engine", () => {
  it("enforces causal confirmation on swing points without lookahead bias", () => {
    // 30 candles with clear wave: 100 -> 120 -> 90 -> 130 -> 80
    const candles = generateWaveCandles([100, 120, 90, 130, 80]);
    const swings = detectCausalSwings(candles, 3, 2);

    expect(swings.length).toBeGreaterThan(0);
    for (const sw of swings) {
      // The confirmed timestamp must strictly be AFTER the candle timestamp!
      expect(sw.confirmedAtTimestamp).toBeGreaterThan(sw.candleTimestamp);
    }
  });

  it("detects higher highs and higher lows in trending bull structure", () => {
    // Bullish trend: 100 -> 115 -> 108 -> 125 -> 118 -> 135
    const bullCandles = generateWaveCandles([100, 115, 108, 125, 118, 135, 128, 145]);
    const analysis = analyzeMarketStructure(bullCandles);

    expect(analysis.higherHighsCount).toBeGreaterThanOrEqual(1);
    expect(analysis.regime).toBe("TRENDING_BULL");
    expect(analysis.regimeConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it("identifies support and resistance zones from clustered swing points", () => {
    // Oscillating range between 100 and 120
    const rangeCandles = generateWaveCandles([100, 120, 101, 120, 100.5, 119.5, 100]);
    const analysis = analyzeMarketStructure(rangeCandles);

    expect(analysis.supportZones.length).toBeGreaterThan(0);
    expect(analysis.resistanceZones.length).toBeGreaterThan(0);
  });
});
