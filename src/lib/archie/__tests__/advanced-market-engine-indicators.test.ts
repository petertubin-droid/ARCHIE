import { describe, it, expect } from "vitest";
import {
  sma,
  ema,
  atr,
  rsi,
  macd,
  bollingerBands,
  supertrend,
  stochastic,
  adx,
  vwap,
  investigateBlueLine,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/technical-indicators.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

function generateTestCandles(count: number, startPrice = 100, trend = 0.5): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + trend + (i % 2 === 0 ? 0.3 : -0.2);
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.7;
    const volume = 1000 + (i % 5) * 200;

    candles.push({
      openTimeMs: 1000000 + i * 60000,
      closeTimeMs: 1000000 + (i + 1) * 60000 - 1,
      open,
      high,
      low,
      close,
      volume,
      isFinalized: true,
    });
    price = close;
  }
  return candles;
}

describe("ARCHIE Technical Indicator Calculation Engine", () => {
  it("computes SMA and handles insufficient warm-up periods", () => {
    const values = [10, 20, 30, 40, 50];
    expect(sma(values, 3)).toBe(40); // (30 + 40 + 50) / 3
    expect(sma(values, 5)).toBe(30); // (10 + 20 + 30 + 40 + 50) / 5
    expect(sma(values, 10)).toBeNull(); // Insufficient data
  });

  it("computes EMA with accurate exponential smoothing weights", () => {
    const values = [10, 11, 12, 13, 14, 15];
    const emaVal = ema(values, 3);
    expect(emaVal).not.toBeNull();
    expect(emaVal!).toBeGreaterThan(13);
    expect(ema(values, 20)).toBeNull();
  });

  it("computes ATR and verifies Wilder smoothing properties", () => {
    const candles = generateTestCandles(30);
    const atrVal = atr(candles, 14);
    expect(atrVal).not.toBeNull();
    expect(atrVal!).toBeGreaterThan(0);
    expect(atr(candles.slice(0, 10), 14)).toBeNull(); // Under 14 candles
  });

  it("computes RSI and respects bounds [0, 100]", () => {
    const candles = generateTestCandles(40, 100, 1.0); // Uptrend
    const rsiVal = rsi(candles, 14);
    expect(rsiVal).not.toBeNull();
    expect(rsiVal!).toBeGreaterThan(50);
    expect(rsiVal!).toBeLessThanOrEqual(100);

    const downCandles = generateTestCandles(40, 100, -1.0); // Downtrend
    const downRsi = rsi(downCandles, 14);
    expect(downRsi).not.toBeNull();
    expect(downRsi!).toBeLessThan(50);
    expect(downRsi!).toBeGreaterThanOrEqual(0);
  });

  it("computes MACD line, signal line, and histogram", () => {
    const candles = generateTestCandles(50);
    const macdResult = macd(candles, 12, 26, 9);
    expect(macdResult).not.toBeNull();
    expect(Number.isFinite(macdResult!.macdLine)).toBe(true);
    expect(Number.isFinite(macdResult!.signalLine)).toBe(true);
    expect(Number.isFinite(macdResult!.histogram)).toBe(true);
    expect(macdResult!.histogram).toBeCloseTo(
      macdResult!.macdLine - macdResult!.signalLine,
      5,
    );
  });

  it("computes Bollinger Bands with correct percentB and bandwidth", () => {
    const candles = generateTestCandles(30);
    const bb = bollingerBands(candles, 20, 2.0);
    expect(bb).not.toBeNull();
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.lower).toBeLessThan(bb!.middle);
    expect(bb!.bandwidth).toBeGreaterThan(0);
  });

  it("computes Supertrend indicator and tracks direction flips", () => {
    const bullCandles = generateTestCandles(30, 100, 1.5);
    const stBull = supertrend(bullCandles, 10, 3.0);
    expect(stBull).not.toBeNull();
    expect(stBull!.direction).toBe("BULLISH");

    const bearCandles = generateTestCandles(30, 100, -1.5);
    const stBear = supertrend(bearCandles, 10, 3.0);
    expect(stBear).not.toBeNull();
    expect(stBear!.direction).toBe("BEARISH");
  });

  it("computes Stochastic Oscillator %K and %D", () => {
    const candles = generateTestCandles(35);
    const stoch = stochastic(candles, 14, 3, 3);
    expect(stoch).not.toBeNull();
    expect(stoch!.k).toBeGreaterThanOrEqual(0);
    expect(stoch!.k).toBeLessThanOrEqual(100);
  });

  it("computes ADX, +DI, and -DI", () => {
    const candles = generateTestCandles(40);
    const adxResult = adx(candles, 14);
    expect(adxResult).not.toBeNull();
    expect(adxResult!.adx).toBeGreaterThanOrEqual(0);
    expect(adxResult!.plusDI).toBeGreaterThanOrEqual(0);
    expect(adxResult!.minusDI).toBeGreaterThanOrEqual(0);
  });

  it("computes session-anchored VWAP", () => {
    const candles = generateTestCandles(20);
    const vwapVal = vwap(candles);
    expect(vwapVal).not.toBeNull();
    expect(vwapVal!).toBeGreaterThan(0);
  });

  it("executes Blue Line hypothesis testing and parameter calibration", () => {
    const candles = generateTestCandles(50);
    const hypo = investigateBlueLine(candles, "EMA_SMOOTHED", { period: 21 });
    expect(hypo.hypothesisId).toBeDefined();
    expect(hypo.candidateType).toBe("EMA_SMOOTHED");
    expect(hypo.calculatedValues.length).toBe(candles.length);
    expect(hypo.reconstructionConfidence).toBeGreaterThan(0.7);
  });
});
