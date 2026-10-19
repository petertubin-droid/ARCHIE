// =========================================================
// ARCHIE TRADING BACKTESTING ENGINE TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { runStrategyBacktest } from "../trading/backtesting-engine";
import type { CandleData, MarketInstrument } from "../trading/types";

const mockInstrument: MarketInstrument = {
  symbol: "EUR/USD",
  name: "Euro",
  category: "FOREX",
  bid: 1.08,
  ask: 1.0801,
  spread: 1.0,
  change24h: 0.1,
  high24h: 1.09,
  low24h: 1.07,
  volume24h: "$10B",
  digits: 5,
  contractSize: 100000,
  pipSize: 0.0001,
  baseCurrency: "EUR",
  quoteCurrency: "USD",
};

describe("Strategy Backtesting Engine", () => {
  it("runs causal backtest without look-ahead error", () => {
    const candles: CandleData[] = [];
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      const price = 1.08 + Math.sin(i / 6) * 0.004;
      candles.push({
        time: now + i * 60000,
        open: price,
        high: price + 0.0008,
        low: price - 0.0008,
        close: price + (i % 2 === 0 ? 0.0002 : -0.0002),
        volume: 2000,
      });
    }

    const res = runStrategyBacktest("ARCHIE Trend Momentum", mockInstrument, "1h", candles, 10000);
    expect(res.totalCandlesTested).toBe(60);
    expect(res.finalBalanceQuote).toBeGreaterThan(0);
    expect(Array.isArray(res.trades)).toBe(true);
  });
});
