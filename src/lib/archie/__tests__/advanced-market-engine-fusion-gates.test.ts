import { describe, it, expect } from "vitest";
import { fuseMarketAnalysis } from "@studio-shared/archie-ai/native-engine/market-intelligence/reasoning-fusion.ts";
import { evaluatePerformanceGates } from "@studio-shared/archie-ai/native-engine/market-intelligence/performance-gates.ts";
import {
  evaluateDrift,
  evaluateModelPromotion,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/continuous-learning.ts";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/types.ts";

function generateCandles(count: number, trend = 0.5): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const move = trend + (i % 2 === 0 ? 0.4 : -0.3);
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + 0.6;
    const low = Math.min(open, close) - 0.6;
    const volume = 1500;
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

describe("ARCHIE Reasoning Fusion & Independent Release Gates", () => {
  it("executes end-to-end market analysis fulfilling Section 22 contract", () => {
    const candles = generateCandles(50, 0.5);
    const output = fuseMarketAnalysis({
      symbol: "EUR/USD",
      category: "FOREX",
      candles,
      interval: "1h",
      dataProvider: "ALPHA_PROVIDER",
    });

    expect(output.instrumentIdentifier).toBe("EUR/USD");
    expect(output.marketCategory).toBe("FOREX");
    expect(output.candleInterpretation).toBeDefined();
    expect(output.marketStructure).toBeDefined();
    expect(output.relevantIndicatorReadings).toBeDefined();
    expect(output.bullishEvidence.length + output.bearishEvidence.length).toBeGreaterThan(0);
    expect(["BULLISH", "BEARISH", "NEUTRAL", "INSUFFICIENT_EVIDENCE"]).toContain(
      output.finalClassification,
    );
  });

  it("triggers NO TRADE and INSUFFICIENT_EVIDENCE when candle data is too short or corrupt", () => {
    const shortCandles = generateCandles(5);
    const output = fuseMarketAnalysis({
      symbol: "BTC/USDT",
      category: "CRYPTO",
      candles: shortCandles,
      interval: "1m",
    });

    expect(output.finalClassification).toBe("INSUFFICIENT_EVIDENCE");
    expect(output.noTradeStatus.isNoTrade).toBe(true);
    expect(output.noTradeStatus.reason).toMatch(/Insufficient/i);
  });

  it("verifies all 12 independent release gates (Gates A through L)", () => {
    const evaluation = evaluatePerformanceGates({
      corruptCandlesCount: 0,
      indicatorToleranceErrors: 0,
      futureInformationLeakageDetected: false,
      reproducibleResultsMatch: true,
      chronologicalValidationPassed: true,
      transactionCostsModeled: true,
      outOfSampleEvaluated: true,
      brierScore: 0.18,
      noTradeControlsEnforced: true,
      secretExposureDetected: false,
      maxLatencyMs: 45,
      ownerApprovalRecorded: true,
    });

    expect(evaluation.allGatesPassed).toBe(true);
    expect(evaluation.results).toHaveLength(12);
  });

  it("fails release gates if any single gate fails", () => {
    const failedEval = evaluatePerformanceGates({
      corruptCandlesCount: 0,
      indicatorToleranceErrors: 0,
      futureInformationLeakageDetected: false,
      reproducibleResultsMatch: true,
      chronologicalValidationPassed: true,
      transactionCostsModeled: true,
      outOfSampleEvaluated: true,
      brierScore: 0.18,
      noTradeControlsEnforced: true,
      secretExposureDetected: false,
      maxLatencyMs: 45,
      ownerApprovalRecorded: false, // Owner approval missing
    });

    expect(failedEval.allGatesPassed).toBe(false);
    const gateL = failedEval.results.find((r) => r.gateId === "GATE_L_PRODUCTION_AUTHORIZATION");
    expect(gateL?.passed).toBe(false);
  });

  it("enforces continuous learning drift detection and blocks unapproved model promotion", () => {
    const drift = evaluateDrift(0.15, [
      { prob: 0.9, outcome: 0 },
      { prob: 0.8, outcome: 0 },
      { prob: 0.9, outcome: 0 },
      ...Array(20).fill({ prob: 0.9, outcome: 0 }),
    ]);

    expect(drift.hasConceptDrift).toBe(true);
    expect(drift.alerts.length).toBeGreaterThan(0);

    const promotionWithoutApproval = evaluateModelPromotion("v2.0.0", 1.8, 1.2, false);
    expect(promotionWithoutApproval.approvedForPromotion).toBe(false);
    expect(promotionWithoutApproval.blockReason).toMatch(/OWNER_AUTHORIZATION_REQUIRED/);

    const promotionWithApproval = evaluateModelPromotion("v2.0.0", 1.8, 1.2, true);
    expect(promotionWithApproval.approvedForPromotion).toBe(true);
  });
});
