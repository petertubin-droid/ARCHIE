// ============================================================================
// ARCHIE MARKET ENGINE — EXTENDED INTEGRATION & VERIFICATION SUITE
// Tests streaming manager, tree ensemble, HMM regime, GARCH volatility,
// square-root market impact, dynamic holding periods, and empirical gates.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  MarketStreamManager,
  ResilientWebSocketClient,
  BinanceKlineWebSocketConnector,
  type SocketLike,
  type SocketFactory,
  trainDecisionStumpEnsemble,
  predictDecisionStumpEnsemble,
  classifyMarketRegimeHMM,
  forecastVolatilityGarch,
  calculateSquareRootMarketImpact,
  calculateOvernightSwapFee,
  runBacktest,
  DEFAULT_BACKTEST_OPTIONS,
  runAutomatedGateSuite,
  type MarketCandle,
  type FeatureVector,
  type StreamingCandleUpdate,
  CryptoConnector,
} from "@/lib/archie/market-engine";

function createMockCandles(count = 60, startPrice = 100): MarketCandle[] {
  const candles: MarketCandle[] = [];
  const baseTime = 1700000000000;
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const openTimeMs = baseTime + i * 60_000;
    const closeTimeMs = openTimeMs + 59_999;
    // Gentle upward trending series with realistic momentum
    const delta = 0.15 + Math.sin(i * 0.1) * 0.08;
    const open = price;
    const close = open + delta;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    const volume = 100 + i;

    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high,
      low,
      close,
      volume,
      isFinalized: true,
      source: "synthetic_test",
      isSyntheticMock: true,
    });
    price = close;
  }
  return candles;
}

describe("ARCHIE Advanced Market Intelligence Engine — Extended Suite", () => {
  it("MarketStreamManager handles subscriptions, publishes updates, and tracks sequences", () => {
    const stream = new MarketStreamManager();
    const subId = stream.subscribe("BTCUSDT", "CRYPTO", "1m");
    expect(subId).toBe("CRYPTO:BTCUSDT:1m");
    expect(stream.getActiveSubscriptions().length).toBe(1);

    const receivedUpdates: StreamingCandleUpdate[] = [];
    const unsubscribe = stream.addListener((update) => {
      receivedUpdates.push(update);
    });

    const testCandle = createMockCandles(1)[0];
    stream.publishCandleUpdate("BTCUSDT", "CRYPTO", testCandle);

    expect(receivedUpdates.length).toBe(1);
    expect(receivedUpdates[0].symbol).toBe("BTCUSDT");
    expect(receivedUpdates[0].sequenceNumber).toBe(1);

    unsubscribe();
    stream.destroy();
    expect(stream.getActiveSubscriptions().length).toBe(0);
  });

  it("trains and predicts using Decision Stump Ensembles", () => {
    const dummyFeatures: FeatureVector = {
      returnLag1: 0.01,
      returnLag2: 0.005,
      returnLag3: -0.002,
      returnLag5: 0.008,
      returnLag8: 0.012,
      returnLag13: 0.015,
      returnLag21: 0.02,
      rangeToAtr: 1.2,
      bodyToRange: 0.8,
      upperWickToRange: 0.1,
      lowerWickToRange: 0.1,
      volToVolSma20: 1.5,
      rsiNormalized: 0.65,
      distFromEma9Atr: 0.4,
      distFromEma21Atr: 0.8,
      distFromEma50Atr: 1.2,
      distFromEma200Atr: 2.0,
      ema9CrossEma21: 1,
      bbPercentB: 0.85,
      bbBandwidth: 0.05,
      macdHistToAtr: 0.3,
      adxNormalized: 0.35,
      diSpreadNormalized: 0.25,
      distToRecentSwingHighAtr: -0.2,
      distToRecentSwingLowAtr: 1.8,
      isNearSupport: 0,
      isNearResistance: 1,
      orderBlockAlignment: 1,
      fvgAlignment: 0,
    };

    const trainingData = [
      { features: dummyFeatures, label: 1 as const },
      { features: { ...dummyFeatures, rsiNormalized: 0.2, bbPercentB: 0.1 }, label: 0 as const },
      { features: dummyFeatures, label: 1 as const },
      { features: { ...dummyFeatures, rsiNormalized: 0.15, bbPercentB: 0.1 }, label: 0 as const },
    ];

    const ensemble = trainDecisionStumpEnsemble(trainingData, { numStumps: 3 });
    expect(ensemble.stumps.length).toBe(3);

    const prob = predictDecisionStumpEnsemble(dummyFeatures, ensemble);
    expect(prob).toBeGreaterThan(0.5);
  });

  it("classifies market regime using Gaussian HMM", () => {
    const bullishReturns = [0.002, 0.003, 0.001, 0.004, 0.002, 0.003];
    const hmmBull = classifyMarketRegimeHMM(bullishReturns, 0.005);
    expect(hmmBull.mostLikelyRegime).toBe("TRENDING_BULL");
    expect(hmmBull.states.length).toBe(3);
    expect(hmmBull.entropy).toBeGreaterThan(0);

    const bearishReturns = [-0.003, -0.004, -0.002, -0.005, -0.003];
    const hmmBear = classifyMarketRegimeHMM(bearishReturns, 0.015);
    expect(hmmBear.mostLikelyRegime).toBe("TRENDING_BEAR");
  });

  it("forecasts forward volatility using GARCH(1,1)", () => {
    const returns = [0.01, -0.012, 0.015, -0.008, 0.02, -0.018, 0.014, -0.011];
    const forecast = forecastVolatilityGarch(returns, 100, 1.5, 10);

    expect(forecast.garchConditionalVolPct).toBeGreaterThan(0);
    expect(forecast.upperExpectedBand).toBeGreaterThan(100);
    expect(forecast.lowerExpectedBand).toBeLessThan(100);
    expect(forecast.forecastHorizonCandles).toBe(10);
  });

  it("calculates square-root market impact and overnight swap costs accurately", () => {
    const impact = calculateSquareRootMarketImpact(10_000, 1_000_000, 0.02, 0.5);
    expect(impact).toBeGreaterThan(0);
    expect(impact).toBeLessThan(0.02);

    const swap = calculateOvernightSwapFee(10_000, 3, 0.02);
    // 10,000 * (0.02 / 365) * 3 = 1.6438
    expect(swap).toBeCloseTo(1.644, 2);
  });

  it("backtesting engine dynamically calculates holding period and accumulated transaction costs", () => {
    const candles = createMockCandles(80, 100);

    const res = runBacktest(
      candles,
      (slice, idx) => {
        if (idx === 35) {
          return { action: "BUY", stopLossPrice: 95, takeProfitPrice: 110 };
        }
        return { action: "HOLD" };
      },
      {
        ...DEFAULT_BACKTEST_OPTIONS,
        useMarketImpact: true,
        annualSwapRatePct: 0.03,
      },
    );

    expect(res.metrics.totalCostPaid).toBeGreaterThan(0);
    expect(res.metrics.avgHoldingCandles).toBeGreaterThan(0);
    expect(res.positions.length).toBeGreaterThan(0);
  });

  it("verifies synthetic fallback provenance flag", async () => {
    const connector = new CryptoConnector();
    // In node test environment without real network access or invalid symbol, fallback activates
    const result = await connector.fetchHistoricalCandles({ symbol: "NON_EXISTENT_PAIR", category: "CRYPTO", interval: "1m", limit: 10 });
    const candles = result.candles;
    expect(candles.length).toBe(10);
    expect(candles[0].isSyntheticMock).toBe(true);
    expect(candles[0].source).toBe("synthetic_test");
  });

  it("empirically runs the 12 performance gates", () => {
    const candles = createMockCandles(60, 100);
    const gateSuite = runAutomatedGateSuite(candles, { ownerApproved: false });

    expect(gateSuite.results.length).toBe(12);

    // Gates A through K should pass empirically
    const gatesAToK = gateSuite.results.slice(0, 11);
    for (const g of gatesAToK) {
      expect(g.passed).toBe(true);
    }

    // Gate L requires explicit owner signoff and should be false when ownerApproved is false
    const gateL = gateSuite.results[11];
    expect(gateL.gateId).toBe("GATE_L_PRODUCTION_AUTHORIZATION");
    expect(gateL.passed).toBe(false);

    // When owner signs off:
    const authorizedSuite = runAutomatedGateSuite(candles, { ownerApproved: true });
    expect(authorizedSuite.allGatesPassed).toBe(true);
  });
});

describe("Live WebSocket Resilient Client & Binance Adapter", () => {
  it("ResilientWebSocketClient handles open, messages, and disconnect", async () => {
    let sentPayload: string | null = null;
    let closedWith: { code?: number; reason?: string } | null = null;
    let onOpenCb: any = null;
    let onMessageCb: any = null;

    const fakeSocket: SocketLike = {
      readyState: 1,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send(data: string) { sentPayload = data; },
      close(code?: number, reason?: string) {
        closedWith = { code, reason };
        if (this.onclose) this.onclose({ code: code ?? 1000, reason: reason ?? "" } as CloseEvent);
      },
    };

    const mockFactory: SocketFactory = () => fakeSocket;
    const receivedMessages: any[] = [];

    const client = new ResilientWebSocketClient(
      {
        providerId: "TEST_WS",
        name: "test-stream",
        url: "wss://test.stream.com/ws",
        heartbeatIntervalMs: 60000,
      },
      (msg) => receivedMessages.push(msg),
      (sock) => sock.send("READY"),
      mockFactory,
    );

    const connectPromise = client.connect();
    // Simulate socket open
    fakeSocket.onopen!({} as Event);
    await connectPromise;

    expect(client.getMetrics().status).toBe("CONNECTED");
    expect(sentPayload).toBe("READY");

    // Simulate incoming message
    fakeSocket.onmessage!({ data: JSON.stringify({ e: "kline", value: 123 }) } as MessageEvent);
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].value).toBe(123);

    // Disconnect
    client.disconnect();
    expect(client.getMetrics().status).toBe("DISCONNECTED");
  });

  it("BinanceKlineWebSocketConnector parses real kline frames with live provenance", async () => {
    let fakeSocket: any = null;
    const mockFactory: SocketFactory = () => {
      fakeSocket = {
        readyState: 1,
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send() {},
        close() {},
      };
      return fakeSocket;
    };

    const updates: any[] = [];
    const connector = new BinanceKlineWebSocketConnector(
      (update) => updates.push(update),
      mockFactory,
    );

    const subKeyPromise = connector.subscribe("BTC/USDT", "1m");
    fakeSocket.onopen({} as Event);
    const subKey = await subKeyPromise;

    expect(subKey).toBe("btcusdt@kline_1m");

    // Send a valid Binance kline payload
    const binanceKlineFrame = {
      e: "kline",
      E: 1672531200000,
      s: "BTCUSDT",
      k: {
        t: 1672531200000,
        T: 1672531259999,
        s: "BTCUSDT",
        i: "1m",
        o: "50000.00",
        c: "50100.00",
        h: "50200.00",
        l: "49950.00",
        v: "12.5",
        q: "625000.00",
        n: 150,
        x: true,
      },
    };

    fakeSocket.onmessage({ data: JSON.stringify(binanceKlineFrame) } as MessageEvent);

    expect(updates.length).toBe(1);
    expect(updates[0].symbol).toBe("BTCUSDT");
    expect(updates[0].category).toBe("CRYPTO");
    expect(updates[0].candle.close).toBe(50100);
    expect(updates[0].candle.source).toBe("provider_live");
    expect(updates[0].candle.isFinalized).toBe(true);

    connector.destroy();
  });
});
