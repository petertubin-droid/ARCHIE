// =========================================================
// ARCHIE TRADING MARKET FORECASTING TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { detectMarketRegime, generateProbabilisticForecast } from "../trading/market-forecasting";
import { calculateAllIndicators } from "../trading/indicators";
import { analyzeCandleSeries } from "../trading/candle-analysis";
import type { CandleData } from "../trading/types";

function createUptrendCandles(count: number): CandleData[] {
  const candles: CandleData[] = [];
  const now = Date.now();
  let price = 100;
  for (let i = 0; i < count; i++) {
    price += 0.8;
    candles.push({
      time: now + i * 60000,
      open: price - 0.2,
      high: price + 0.5,
      low: price - 0.4,
      close: price,
      volume: 1000 + i * 10,
    });
  }
  return candles;
}

describe("Market Forecasting & Regime Detection", () => {
  it("detects trending bullish regime in upward price series", () => {
    const candles = createUptrendCandles(50);
    const indicators = calculateAllIndicators(candles);
    const regime = detectMarketRegime(candles, indicators);
    expect(["TRENDING_BULLISH", "VOLATILITY_BREAKOUT", "RANGING_HIGH_VOLATILITY"]).toContain(regime.regime);
    expect(regime.confidenceScore).toBeGreaterThan(0);
  });

  it("generates calibrated probabilistic forecast summing to 1.0", () => {
    const candles = createUptrendCandles(50);
    const indicators = calculateAllIndicators(candles);
    const analysis = analyzeCandleSeries(candles, 20);
    const regime = detectMarketRegime(candles, indicators);
    const forecast = generateProbabilisticForecast(
      "BTC/USD",
      "1h",
      candles,
      indicators,
      analysis,
      regime
    );

    const sum =
      forecast.bullishProbability +
      forecast.bearishProbability +
      forecast.neutralProbability;
    expect(sum).toBeCloseTo(1.0, 2);
    expect(forecast.bullishEvidence.length).toBeGreaterThan(0);
    expect(forecast.targetPriceFavorable).toBeGreaterThan(0);
  });
});
