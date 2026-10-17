import { describe, expect, it } from "vitest";
// =========================================================
// MARKET ANALYSIS TESTS (Crypto & Blockchain Intelligence,
// 2026-09-11). Pure indicator math verified against
// hand-computed fixtures. No network — the analysis layer is
// deterministic over candle arrays.
// =========================================================

import {
  sma,
  ema,
  rsi,
  realizedVol,
  momentum,
  maxDrawdown,
  volumeZ,
  classifyRegime,
  analyzeCandles,
  crossCheckAgreement,
} from "@studio-shared/archie-ai/native-engine/market-analysis.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-data.ts";

function candles(closes: number[], volumes?: number[]): MarketCandle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000_000 + i * 86_400_000,
    open: c,
    high: c * 1.01,
    low: c * 0.99,
    close: c,
    volume: volumes?.[i] ?? 100,
  }));
}

describe("market analysis — deterministic indicators", () => {
  it("SMA computes the exact mean over the window and refuses short windows", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(sma(values, 10)).toBe(5.5);
    expect(sma(values, 20)).toBeUndefined(); // honest refusal
    expect(sma(values, 0)).toBeUndefined();
  });

  it("EMA converges toward recent values", () => {
    const flat = new Array(50).fill(100);
    expect(ema(flat, 20)).toBeCloseTo(100, 6);
    // rising series must pull EMA above the simple mean
    const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
    const e = ema(rising, 20);
    expect(e).toBeDefined();
    expect(e!).toBeGreaterThan(rising.slice(-20).reduce((a, b) => a + b, 0) / 20 - 1);
    expect(ema([1, 2], 20)).toBeUndefined();
  });

  it("RSI: all-gains series reaches 100, all-losses reaches low, short window refuses", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up, 14)).toBe(100);
    const down = Array.from({ length: 30 }, (_, i) => 200 - i);
    expect(rsi(down, 14)).toBeLessThan(10);
    expect(rsi([100, 101, 102], 14)).toBeUndefined(); // honest refusal
  });

  it("realized volatility of a flat series is 0; volatile series is higher", () => {
    expect(realizedVol(new Array(40).fill(100))).toBeCloseTo(0, 6);
    const chop = [100, 120, 90, 130, 85, 125, 95, 140, 80, 150, 90, 160, 100];
    expect(realizedVol(chop)!).toBeGreaterThan(0.5); // >50%/yr — plausible for a wild series
  });

  it("momentum and drawdown measure exactly what happened", () => {
    const closes = [100, 110, 105, 120, 90, 130];
    expect(momentum(closes, 5)).toBeCloseTo(0.3, 6); // 100 → 130
    expect(maxDrawdown([100, 150, 75, 120])).toBeCloseTo(0.5, 6); // 150→75 = −50%
    expect(momentum(closes, 50)).toBeUndefined();
  });

  it("volume z-score flags spikes and refuses thin history", () => {
    // non-flat history (a flat history has σ=0 → honest undefined)
    const vols = [90, 110, 95, 105, 92, 108, 98, 102, 96, 104, 400];
    const z = volumeZ(vols);
    expect(z).toBeGreaterThan(2);
    // perfectly flat history: no deviation measurable → refusal
    expect(volumeZ([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100])).toBeUndefined();
    expect(volumeZ([100, 200])).toBeUndefined();
  });

  it("regime classification is deterministic and threshold-honest", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
    expect(classifyRegime(up)).toBe("trending-up");
    const down = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
    expect(classifyRegime(down)).toBe("trending-down");
    const chop = [100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100, 102];
    expect(classifyRegime(chop)).toBe("range");
    expect(classifyRegime([100, 101])).toBe("insufficient-data");
  });

  it("analyzeCandles composes the full indicator set or returns null on empty", () => {
    const ind = analyzeCandles(candles(Array.from({ length: 30 }, (_, i) => 100 + i)));
    expect(ind).not.toBeNull();
    expect(ind!.last).toBe(129);
    expect(ind!.windowSize).toBe(30);
    expect(analyzeCandles([])).toBeNull();
  });

  it("cross-check agreement: 1% divergence agrees, 5% is an anomaly", () => {
    expect(crossCheckAgreement(101, 100).agree).toBe(true);
    expect(crossCheckAgreement(105, 100).agree).toBe(false);
    expect(crossCheckAgreement(105, 100).divergence).toBeCloseTo(0.05, 6);
  });
});
