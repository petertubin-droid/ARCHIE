import { describe, it, expect } from "vitest";
import {
  ConnectorManager,
  CryptoConnector,
  ForexConnector,
  StocksConnector,
  IndicesConnector,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

describe("ARCHIE Market Connectors & Ingestion Engine (Component A / Section 5)", () => {
  it("registers and routes across all 4 major market categories", async () => {
    const manager = new ConnectorManager();
    const cryptoRes = await manager.fetchMarketData({
      symbol: "BTCUSDT",
      category: "CRYPTO",
      interval: "1h",
      limit: 50,
    });
    expect(cryptoRes.providerId).toBe("CRYPTO_REST_PUBLIC");
    expect(cryptoRes.candles.length).toBe(50);
    expect(cryptoRes.freshness).toBe("HISTORICAL");

    const forexRes = await manager.fetchMarketData({
      symbol: "EURUSD",
      category: "FOREX",
      interval: "1h",
      limit: 30,
    });
    expect(forexRes.providerId).toBe("FOREX_INSTITUTIONAL_FEED");
    expect(forexRes.candles.length).toBe(30);

    const stocksRes = await manager.fetchMarketData({
      symbol: "AAPL",
      category: "STOCKS",
      interval: "1d",
      limit: 20,
    });
    expect(stocksRes.providerId).toBe("EQUITY_SIP_CONSOLIDATED");
    expect(stocksRes.candles.length).toBe(20);

    const indexRes = await manager.fetchMarketData({
      symbol: "SPY",
      category: "INDICES",
      interval: "1h",
      limit: 40,
    });
    expect(indexRes.providerId).toBe("INDEX_BENCHMARK_FEED");
    expect(indexRes.candles.length).toBe(40);
  });

  it("accurately detects Forex weekend closures", () => {
    const fx = new ForexConnector();
    // Saturday 12:00 UTC
    const saturday = new Date("2026-10-17T12:00:00Z").getTime();
    expect(fx.isWeekendClosed(saturday)).toBe(true);

    // Wednesday 14:00 UTC
    const wednesday = new Date("2026-10-14T14:00:00Z").getTime();
    expect(fx.isWeekendClosed(wednesday)).toBe(false);

    // Friday 22:00 UTC (after 21:00 UTC close)
    const fridayNight = new Date("2026-10-16T22:00:00Z").getTime();
    expect(fx.isWeekendClosed(fridayNight)).toBe(true);
  });

  it("accurately detects US regular stock market hours (9:30 - 16:00 EST)", () => {
    const stocks = new StocksConnector();
    // 15:00 UTC on Tuesday (11:00 AM EST) -> Open
    const tuesdayOpen = new Date("2026-10-13T15:00:00Z").getTime();
    expect(stocks.isMarketHours(tuesdayOpen)).toBe(true);

    // 04:00 UTC on Tuesday (midnight EST) -> Closed
    const tuesdayNight = new Date("2026-10-13T04:00:00Z").getTime();
    expect(stocks.isMarketHours(tuesdayNight)).toBe(false);

    // Sunday -> Closed
    const sunday = new Date("2026-10-18T15:00:00Z").getTime();
    expect(stocks.isMarketHours(sunday)).toBe(false);
  });

  it("identifies ETF proxy and futures derivative for indices", () => {
    const indices = new IndicesConnector();
    const spy = indices.resolveProxyInfo("SPY");
    expect(spy.isProxy).toBe(true);
    expect(spy.proxyType).toBe("ETF_TRACKER");

    const es = indices.resolveProxyInfo("ES_FRONT");
    expect(es.isProxy).toBe(true);
    expect(es.proxyType).toBe("FUTURES_DERIVATIVE");

    const cash = indices.resolveProxyInfo("^GSPC");
    expect(cash.isProxy).toBe(false);
  });

  it("handles health checks and circuit breaking", () => {
    const crypto = new CryptoConnector();
    const health = crypto.healthCheck();
    expect(health.isHealthy).toBe(true);
    expect(health.circuitBreakerOpen).toBe(false);
    expect(health.consecutiveFailures).toBe(0);
  });
});
