// =========================================================
// ARCHIE TRADING INDICATORS TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateSupertrend,
  calculateADX,
  calculateStochastic,
  calculateVWAP,
  calculateBlueMarketLine,
  calculateAllIndicators,
} from "../trading/indicators";
import type { CandleData } from "../trading/types";

function createMockCandles(count: number, basePrice: number = 100): CandleData[] {
  const candles: CandleData[] = [];
  let price = basePrice;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const change = Math.sin(i / 5) * 2;
    price += change;
    const high = price + 1.5;
    const low = price - 1.2;
    const open = price - change * 0.5;
    const close = price;
    candles.push({
      time: now + i * 60000,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 5) * 200,
    });
  }
  return candles;
}

describe("Technical Indicator Suite", () => {
  const candles = createMockCandles(60, 100);

  it("calculates SMA and respects warm-up period", () => {
    const sma20 = calculateSMA(candles, 20);
    expect(sma20.length).toBe(candles.length);
    expect(sma20[0]).toBeNull();
    expect(sma20[18]).toBeNull();
    expect(typeof sma20[19]).toBe("number");
    expect(sma20[19]!).toBeGreaterThan(0);
  });

  it("calculates EMA correctly", () => {
    const ema9 = calculateEMA(candles, 9);
    expect(ema9[0]).toBeNull();
    expect(ema9[7]).toBeNull();
    expect(typeof ema9[8]).toBe("number");
  });

  it("calculates Bollinger Bands with upper, middle, lower and bandwidth", () => {
    const bb = calculateBollingerBands(candles, 20, 2);
    expect(bb.middle[19]).not.toBeNull();
    expect(bb.upper[19]!).toBeGreaterThan(bb.middle[19]!);
    expect(bb.lower[19]!).toBeLessThan(bb.middle[19]!);
    expect(bb.bandwidth[19]!).toBeGreaterThan(0);
  });

  it("calculates RSI and stays bounded within 0 and 100", () => {
    const rsi14 = calculateRSI(candles, 14);
    for (let i = 14; i < rsi14.length; i++) {
      if (rsi14[i] !== null) {
        expect(rsi14[i]!).toBeGreaterThanOrEqual(0);
        expect(rsi14[i]!).toBeLessThanOrEqual(100);
      }
    }
  });

  it("calculates MACD with histogram matching difference", () => {
    const macdRes = calculateMACD(candles, 12, 26, 9);
    const validIdx = candles.length - 1;
    if (macdRes.macd[validIdx] !== null && macdRes.signal[validIdx] !== null) {
      expect(macdRes.histogram[validIdx]).toBeCloseTo(
        macdRes.macd[validIdx]! - macdRes.signal[validIdx]!,
        5
      );
    }
  });

  it("calculates Supertrend with valid trend directions", () => {
    const st = calculateSupertrend(candles, 10, 3);
    const validIdx = candles.length - 1;
    expect([1, -1]).toContain(st.directions[validIdx]);
    expect(st.values[validIdx]).toBeGreaterThan(0);
  });

  it("calculates ADX with positive DI and minus DI", () => {
    const adxRes = calculateADX(candles, 14);
    const validIdx = candles.length - 1;
    if (adxRes.adx[validIdx] !== null) {
      expect(adxRes.adx[validIdx]!).toBeGreaterThanOrEqual(0);
      expect(adxRes.plusDI[validIdx]!).toBeGreaterThanOrEqual(0);
      expect(adxRes.minusDI[validIdx]!).toBeGreaterThanOrEqual(0);
    }
  });

  it("calculates Stochastic Oscillator %K and %D bounded 0-100", () => {
    const stoch = calculateStochastic(candles, 14, 3);
    const validIdx = candles.length - 1;
    if (stoch.k[validIdx] !== null) {
      expect(stoch.k[validIdx]!).toBeGreaterThanOrEqual(0);
      expect(stoch.k[validIdx]!).toBeLessThanOrEqual(100);
    }
  });

  it("calculates VWAP correctly", () => {
    const vwap = calculateVWAP(candles);
    expect(vwap[0]).toBeCloseTo((candles[0].high + candles[0].low + candles[0].close) / 3, 2);
    expect(vwap[candles.length - 1]!).toBeGreaterThan(0);
  });

  it("calculates the ARCHIE Blue Market Indicator Line with inflection turning points", () => {
    const blueLine = calculateBlueMarketLine(candles, 14);
    expect(blueLine.formulaDescription).toContain("ARCHIE Zero-Lag Momentum Trend Line");
    expect(blueLine.values.length).toBe(candles.length);
    expect(Array.isArray(blueLine.turningPoints)).toBe(true);
  });

  it("calculateAllIndicators bundles all indicators simultaneously", () => {
    const all = calculateAllIndicators(candles);
    expect(all.sma20).toBeDefined();
    expect(all.ema9).toBeDefined();
    expect(all.supertrend).toBeDefined();
    expect(all.blueMarketLine).toBeDefined();
  });
});
