import { describe, it, expect } from "vitest";
import type { MarketCandle } from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";
import {
  globalMarketIntelligence,
  runAutomatedGateSuite,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

function generateSampleMarketCandles(count: number): MarketCandle[] {
  const candles: MarketCandle[] = [];
  let price = 50000;
  const startMs = 1700000000000;
  for (let i = 0; i < count; i++) {
    const openTimeMs = startMs + i * 60_000;
    const closeTimeMs = openTimeMs + 59_999;
    const open = price;
    price += (i % 3 === 0 ? 150 : -75);
    const close = price;
    const high = Math.max(open, close) + 50;
    const low = Math.min(open, close) - 50;
    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high,
      low,
      close,
      volume: 12.5,
      isFinalized: true,
    });
  }
  return candles;
}

describe("ARCHIE Unified Market API & Performance Gates (Components S & T)", () => {
  it("executes complete end-to-end analysis meeting Section 22 contract", async () => {
    const candles = generateSampleMarketCandles(70);

    const res = await globalMarketIntelligence.analyze({
      symbol: "BTCUSDT",
      category: "CRYPTO",
      interval: "1m",
      candles,
      callerId: "TEST_SUITE",
      recordPrediction: true,
    });

    expect(res.success).toBe(true);
    expect(res.recordedPredictionId).toBeDefined();

    const output = res.analysis;
    expect(output.instrumentIdentifier).toBe("BTCUSDT");
    expect(output.marketCategory).toBe("CRYPTO");
    expect(output.timeframe).toBe("1m");
    expect(output.candleInterpretation.latestGeometry).toBeDefined();
    expect(output.marketStructure).toBeDefined();
    expect(output.relevantIndicatorReadings.rsi14).not.toBeNull();
    expect(output.modelAndRuleVersions.modelArtifactVersion).toBeDefined();
    expect(["BULLISH", "BEARISH", "NEUTRAL", "INSUFFICIENT_EVIDENCE"]).toContain(output.finalClassification);
    expect(typeof output.noTradeStatus.isNoTrade).toBe("boolean");
  });

  it("passes all 12 independent performance gates (Gate A through Gate L)", () => {
    const referenceCandles = generateSampleMarketCandles(50);
    const gateReport = runAutomatedGateSuite(referenceCandles, { ownerApproved: true });

    expect(gateReport.results.length).toBe(12);
    for (const gate of gateReport.results) {
      expect(gate.passed).toBe(true);
    }
    expect(gateReport.allGatesPassed).toBe(true);
  });
});
