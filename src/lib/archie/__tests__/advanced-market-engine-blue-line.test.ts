import { describe, it, expect } from "vitest";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";
import {
  investigateBlueLineReconstruction,
  emaSeries,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

function generateTestCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 50;
  const startMs = 1700000000000;
  for (let i = 0; i < count; i++) {
    const openTimeMs = startMs + i * 3600_000;
    const closeTimeMs = openTimeMs + 3599_999;
    const open = price;
    price += (i % 2 === 0 ? 0.8 : -0.4);
    const close = price;
    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 500,
      isFinalized: true,
    });
  }
  return candles;
}

describe("ARCHIE Blue Line Investigation & Reconstruction Engine (Section 9)", () => {
  it("scientifically identifies and ranks candidate formulas against observed line points", () => {
    const candles = generateTestCandles(80);

    // Synthesize an observed blue line that was actually produced by an EMA(21)
    const trueEma21 = emaSeries(candles.map((c) => c.close), 21);
    const observedPoints: Array<{ timestampMs: number; observedValue: number }> = [];

    for (let i = 25; i < candles.length; i += 2) {
      if (trueEma21[i] !== null) {
        observedPoints.push({
          timestampMs: candles[i].closeTimeMs,
          observedValue: trueEma21[i]!,
        });
      }
    }

    const report = investigateBlueLineReconstruction(candles, observedPoints);

    expect(report.targetSeriesLength).toBe(observedPoints.length);
    expect(report.bestCandidate).toBeDefined();
    // EMA_21 must be the top candidate with near-perfect correlation and near-zero MAE!
    expect(report.bestCandidate?.candidateName).toBe("EMA_21");
    expect(report.bestCandidate?.pearsonCorrelation).toBeGreaterThan(0.99);
    expect(report.bestCandidate?.meanAbsoluteError).toBeLessThan(0.05);
    expect(report.isDefinitivelyIdentified).toBe(true);
    expect(report.allEvaluations.length).toBeGreaterThan(1);
  });

  it("preserves uncertainty when observed line cannot be definitively identified", () => {
    const candles = generateTestCandles(60);
    // Arbitrary random noisy points not matching any standard formula
    const randomPoints = [
      { timestampMs: candles[30].closeTimeMs, observedValue: 120 },
      { timestampMs: candles[35].closeTimeMs, observedValue: 30 },
      { timestampMs: candles[40].closeTimeMs, observedValue: 95 },
      { timestampMs: candles[45].closeTimeMs, observedValue: 10 },
    ];

    const report = investigateBlueLineReconstruction(candles, randomPoints);
    expect(report.isDefinitivelyIdentified).toBe(false);
    expect(report.uncertaintyNotes.length).toBeGreaterThan(0);
    expect(report.uncertaintyNotes[0]).toContain("No candidate indicator achieved");
  });
});
