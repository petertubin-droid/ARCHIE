import { describe, it, expect } from "vitest";
import {
  PredictionTracker,
  type PredictionRecord,
  type MarketCandle,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

function createForwardCandles(basePrice: number, count = 10, trend = 0.5): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let current = basePrice;
  const startMs = 1700000000000;
  for (let i = 0; i < count; i++) {
    const open = current;
    current += trend;
    const close = current;
    candles.push({
      openTimeMs: startMs + i * 60_000,
      closeTimeMs: startMs + (i + 1) * 60_000 - 1,
      open,
      high: Math.max(open, close) + 0.2,
      low: Math.min(open, close) - 0.2,
      close,
      volume: 100,
      isFinalized: true,
    });
  }
  return candles;
}

describe("ARCHIE Prediction Recording & Outcome Tracking (Component K / Section 14)", () => {
  it("immutably records predictions and prevents overwriting", () => {
    const tracker = new PredictionTracker();
    const pred: PredictionRecord = {
      id: "pred-btc-1",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      category: "CRYPTO",
      timeframe: "1h",
      latestEligibleCandleTimestamp: 1699999999000,
      featureSchemaVersion: "v1.0.0",
      modelVersion: "v1.1.0",
      ruleVersion: "v1.0.0",
      probBullish: 0.70,
      probBearish: 0.15,
      probNeutral: 0.15,
      targetPrice: 105,
      stopLossPrice: 95,
      horizonCandles: 5,
      marketRegime: "TRENDING_BULL",
      status: "UNRESOLVED",
    };

    tracker.recordPrediction(pred);
    expect(tracker.getPrediction("pred-btc-1")).toBeDefined();

    // Attempting to record duplicate ID must throw
    expect(() => tracker.recordPrediction(pred)).toThrowError(/Immutable write error/);
  });

  it("evaluates outcome when price hits target", () => {
    const tracker = new PredictionTracker();
    tracker.recordPrediction({
      id: "pred-target-hit",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      category: "CRYPTO",
      timeframe: "1h",
      latestEligibleCandleTimestamp: 1700000000000,
      featureSchemaVersion: "v1.0.0",
      modelVersion: "v1.1.0",
      ruleVersion: "v1.0.0",
      probBullish: 0.75,
      probBearish: 0.15,
      probNeutral: 0.10,
      targetPrice: 103,
      stopLossPrice: 97,
      horizonCandles: 8,
      marketRegime: "TRENDING_BULL",
      status: "UNRESOLVED",
    });

    const forward = createForwardCandles(100, 10, 1.0); // Price rises to 101, 102, 103...
    const resolved = tracker.evaluateOutcomes(forward);

    expect(resolved.length).toBe(1);
    expect(resolved[0].resolutionStatus).toBe("HIT_TARGET");
    expect(resolved[0].directionalCorrectness).toBe(true);
    expect(resolved[0].realizedReturnPct).toBeGreaterThan(0);
    expect(resolved[0].brierScore).toBeLessThan(0.20);
  });

  it("resolves same-candle stop and target collision conservatively (stop loss executed first)", () => {
    const tracker = new PredictionTracker();
    tracker.recordPrediction({
      id: "pred-collision",
      timestamp: Date.now(),
      symbol: "ETHUSDT",
      category: "CRYPTO",
      timeframe: "1h",
      latestEligibleCandleTimestamp: 1700000000000,
      featureSchemaVersion: "v1.0.0",
      modelVersion: "v1.1.0",
      ruleVersion: "v1.0.0",
      probBullish: 0.80,
      probBearish: 0.10,
      probNeutral: 0.10,
      targetPrice: 110,
      stopLossPrice: 90,
      horizonCandles: 5,
      marketRegime: "HIGH_VOLATILITY",
      status: "UNRESOLVED",
    });

    // Extreme candle where both high >= 110 AND low <= 90 happen in the same bar
    const wildCandle: MarketCandle = {
      openTimeMs: 1700000000000,
      closeTimeMs: 1700000059999,
      open: 100,
      high: 115,
      low: 85,
      close: 105,
      volume: 500,
      isFinalized: true,
    };

    const resolved = tracker.evaluateOutcomes([wildCandle]);
    expect(resolved.length).toBe(1);
    // CONSERVATIVE COLLISION: Must be HIT_STOP_LOSS!
    expect(resolved[0].resolutionStatus).toBe("HIT_STOP_LOSS");
    expect(resolved[0].directionalCorrectness).toBe(false);
  });

  it("calculates aggregated summary statistics and calibration buckets", () => {
    const tracker = new PredictionTracker();
    tracker.recordPrediction({
      id: "pred-1",
      timestamp: Date.now(),
      symbol: "BTCUSDT",
      category: "CRYPTO",
      timeframe: "1h",
      latestEligibleCandleTimestamp: 1700000000000,
      featureSchemaVersion: "v1.0.0",
      modelVersion: "v1.1.0",
      ruleVersion: "v1.0.0",
      probBullish: 0.80,
      probBearish: 0.10,
      probNeutral: 0.10,
      targetPrice: 105,
      stopLossPrice: 95,
      horizonCandles: 5,
      marketRegime: "TRENDING_BULL",
      status: "UNRESOLVED",
    });

    const forward = createForwardCandles(100, 10, 1.5);
    tracker.evaluateOutcomes(forward);

    const summary = tracker.getVerificationSummary();
    expect(summary.totalPredictions).toBe(1);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.unresolvedCount).toBe(0);
    expect(summary.directionalAccuracyPct).toBe(100);
    expect(summary.calibrationBuckets.length).toBe(10);
  });
});
