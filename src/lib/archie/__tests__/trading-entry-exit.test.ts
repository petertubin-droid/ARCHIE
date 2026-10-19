// =========================================================
// ARCHIE TRADING ENTRY & EXIT ENGINE TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import {
  evaluateEntrySignal,
  calculateStopLossPlan,
  updateDynamicTrailingStop,
  evaluateExitIntelligence,
} from "../trading/entry-exit-engine";
import { calculateAllIndicators } from "../trading/indicators";
import { analyzeCandleSeries } from "../trading/candle-analysis";
import { detectMarketRegime, generateProbabilisticForecast } from "../trading/market-forecasting";
import type { CandleData, MarketInstrument, DynamicTrailingStopState } from "../trading/types";

const mockInstrument: MarketInstrument = {
  symbol: "EUR/USD",
  name: "Euro vs US Dollar",
  category: "FOREX",
  bid: 1.0842,
  ask: 1.08426,
  spread: 0.6,
  change24h: 0.12,
  high24h: 1.087,
  low24h: 1.081,
  volume24h: "$50B",
  digits: 5,
  contractSize: 100000,
  pipSize: 0.0001,
  baseCurrency: "EUR",
  quoteCurrency: "USD",
};

describe("Entry Signal & Stop-Loss Engine", () => {
  const candles: CandleData[] = [];
  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    candles.push({
      time: now + i * 60000,
      open: 1.08 + i * 0.0002,
      high: 1.0805 + i * 0.0002,
      low: 1.0795 + i * 0.0002,
      close: 1.0802 + i * 0.0002,
      volume: 5000,
    });
  }

  it("calculates stop loss plan with valid side boundary", () => {
    const buyPlan = calculateStopLossPlan("BUY", 1.085, candles, mockInstrument, 10000);
    expect(buyPlan.isValid).toBe(true);
    expect(buyPlan.stopPrice).toBeLessThan(1.085);
    expect(buyPlan.stopDistancePips).toBeGreaterThan(0);

    const sellPlan = calculateStopLossPlan("SELL", 1.085, candles, mockInstrument, 10000);
    expect(sellPlan.isValid).toBe(true);
    expect(sellPlan.stopPrice).toBeGreaterThan(1.085);
  });

  it("manages dynamic trailing stop and moves to break-even after 1R gain", () => {
    const initialState: DynamicTrailingStopState = {
      positionId: "pos_1",
      symbol: "EUR/USD",
      side: "BUY",
      entryPrice: 1.085,
      currentPrice: 1.085,
      initialStopPrice: 1.082, // 30 pips risk
      currentStopPrice: 1.082,
      recommendedStopPrice: 1.082,
      breakEvenTriggered: false,
      highestFavorablePrice: 1.085,
      lowestFavorablePrice: 1.085,
      trailingMode: "ATR_TRAILING",
      brokerNativeSupported: true,
    };

    // Price advances by 35 pips (more than 30 pips 1R)
    const updated = updateDynamicTrailingStop(initialState, 1.0885, 0.001);
    expect(updated.breakEvenTriggered).toBe(true);
    expect(updated.recommendedStopPrice).toBeGreaterThanOrEqual(1.085);
  });

  it("evaluates exit intelligence when target is reached", () => {
    const alert = evaluateExitIntelligence(
      "pos_1",
      "EUR/USD",
      "BUY",
      1.085,
      1.082,
      1.09,
      1.0905, // reached target
      0.001,
      false
    );
    expect(alert).not.toBeNull();
    expect(alert?.urgency).toBe("HIGH_PRIORITY");
    expect(alert?.recommendedAction).toBe("CLOSE_IMMEDIATELY");
  });
});
