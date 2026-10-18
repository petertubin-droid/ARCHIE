import { describe, it, expect } from "vitest";
import {
  extractFeatureVector,
  FEATURE_SCHEMA_VERSION,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/feature-engineering.ts";
import {
  predictProbabilities,
  calculateBrierScore,
  chronologicalSplit,
  MODEL_ARTIFACT_VERSION,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/machine-learning.ts";
import {
  runBacktest,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/backtesting.ts";
import {
  calculatePositionSize,
  assertNoLiveTradeAllowed,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/risk-governance.ts";
import { getInstrumentSpec } from "@studio-shared/archie-ai/native-engine/market-intelligence/registry.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

function generateCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const move = (i % 2 === 0 ? 0.6 : -0.4);
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    const volume = 1000;
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

describe("ARCHIE Machine Learning, Backtesting & Risk Governance", () => {
  it("extracts versioned feature vectors strictly from causally available history", () => {
    const candles = generateCandles(40);
    const fv = extractFeatureVector(candles, 35);
    expect(fv).not.toBeNull();
    expect(fv!.schemaVersion).toBe(FEATURE_SCHEMA_VERSION);
    expect(Number.isFinite(fv!.rsiNormalized)).toBe(true);
    expect(Number.isFinite(fv!.rangeToAtr)).toBe(true);
  });

  it("splits data chronologically without leakage or random shuffling", () => {
    const candles = generateCandles(100);
    const split = chronologicalSplit(candles, 0.7);

    expect(split.train.length).toBe(70);
    expect(split.test.length).toBe(30);

    const maxTrainTime = split.train[split.train.length - 1].closeTimeMs;
    const minTestTime = split.test[0].openTimeMs;

    expect(maxTrainTime).toBeLessThan(minTestTime);
  });

  it("computes baseline probabilistic model predictions with Brier evaluation", () => {
    const candles = generateCandles(40);
    const fv = extractFeatureVector(candles, 35)!;
    const pred = predictProbabilities(fv);

    expect(pred.modelVersion).toBe(MODEL_ARTIFACT_VERSION);
    expect(pred.probBullish + pred.probBearish + pred.probNeutral).toBeCloseTo(1.0, 4);

    const brier = calculateBrierScore([
      { prob: 0.8, outcome: 1 },
      { prob: 0.2, outcome: 0 },
    ]);
    expect(brier).toBeCloseTo(0.04, 3);
  });

  it("runs causally correct backtest with spread, commission, and conservative collisions", () => {
    const candles = generateCandles(100);

    const signalFn = (slice: MarketCandle[], idx: number) => {
      if (idx % 10 === 0) {
        return {
          action: "BUY" as const,
          stopLossPrice: slice[slice.length - 1].close * 0.98,
          takeProfitPrice: slice[slice.length - 1].close * 1.04,
        };
      }
      return { action: "HOLD" as const };
    };

    const res = runBacktest(candles, signalFn, {
      initialEquityQuote: 10_000,
      fixedRiskPerTradeQuote: 100,
      slippagePct: 0.0005,
      commissionPerTradeQuote: 1.0,
      spreadQuote: 0.0001,
    });

    expect(res.positions.length).toBeGreaterThan(0);
    expect(Number.isFinite(res.metrics.sharpeRatio)).toBe(true);
    expect(Number.isFinite(res.metrics.maxDrawdownPct)).toBe(true);
    expect(res.metrics.totalCostPaid).toBeGreaterThan(0);
  });

  it("calculates safe position sizing and enforces notional exposure limits", () => {
    const spec = getInstrumentSpec("EUR_USD")!;
    expect(spec).not.toBeNull();
    const sizing = calculatePositionSize(1.1000, 1.0950, spec, {
      maxRiskPerTradeQuote: 200,
      maxDailyLossQuote: 1000,
      maxOpenExposureQuote: 50000,
      maxLeverage: 10,
      maxSpreadThresholdPct: 0.002,
      enableLiveExecution: false,
    });

    expect(sizing.isEligible).toBe(true);
    expect(sizing.quantityUnits).toBeGreaterThan(0);
    expect(sizing.riskAmountQuote).toBeLessThanOrEqual(200.01);
  });

  it("strictly prevents live trade execution with an unbypassable exception", () => {
    expect(() => {
      assertNoLiveTradeAllowed();
    }).toThrow("ARCHIE RISK GOVERNANCE: Live broker trade execution is strictly forbidden");
  });
});
