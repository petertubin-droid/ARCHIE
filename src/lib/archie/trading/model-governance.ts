// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — MODEL GOVERNANCE & JOURNAL
// src/lib/archie/trading/model-governance.ts
//
// Continuous learning, calibration ledger & explainable trade journal:
//   * Prediction outcome tracking & Brier score calibration
//   * Model drift detection & performance degradation alerts
//   * Explainable trade journal with setup rationale & opposing evidence
//   * Strict audit trails for simulated and live orders
// =========================================================

import type {
  PredictionAuditRecord,
  ModelPerformanceMetrics,
  TradeJournalEntry,
} from "./types";

export const INITIAL_PREDICTION_AUDIT: PredictionAuditRecord[] = [
  {
    predictionId: "pred_20261018_01",
    symbol: "BTC/USD",
    timeframe: "1h",
    generatedAtIso: "2026-10-18T14:00:00Z",
    predictedDirection: "BULLISH",
    predictedProbability: 0.68,
    targetPrice: 69500.0,
    invalidationPrice: 67800.0,
    horizonBars: 4,
    actualOutcome: "TARGET_HIT",
    actualReturnPct: 1.82,
    brierScore: 0.1024, // (0.68 - 1.0)^2
  },
  {
    predictionId: "pred_20261018_02",
    symbol: "EUR/USD",
    timeframe: "1h",
    generatedAtIso: "2026-10-18T16:00:00Z",
    predictedDirection: "BEARISH",
    predictedProbability: 0.62,
    targetPrice: 1.081,
    invalidationPrice: 1.0865,
    horizonBars: 4,
    actualOutcome: "TARGET_HIT",
    actualReturnPct: 0.35,
    brierScore: 0.1444, // (0.62 - 1.0)^2
  },
  {
    predictionId: "pred_20261019_01",
    symbol: "XAU/USD",
    timeframe: "1h",
    generatedAtIso: "2026-10-19T09:00:00Z",
    predictedDirection: "BULLISH",
    predictedProbability: 0.58,
    targetPrice: 2745.0,
    invalidationPrice: 2720.0,
    horizonBars: 4,
    actualOutcome: "STOPPED_OUT",
    actualReturnPct: -0.65,
    brierScore: 0.3364, // (0.58 - 0.0)^2
  },
];

export const INITIAL_TRADE_JOURNAL: TradeJournalEntry[] = [
  {
    id: "tj_001",
    timestampIso: "2026-10-18T14:30:00Z",
    symbol: "BTC/USD",
    mode: "PAPER",
    broker: "Exness OpenAPI",
    side: "BUY",
    orderType: "MARKET",
    volumeLots: 0.25,
    entryPrice: 68420.0,
    exitPrice: 69500.0,
    stopLoss: 67800.0,
    takeProfit: 69500.0,
    realizedPnlQuote: 270.0,
    feesQuote: 1.75,
    setupRationale: "Trending Bullish regime + Bullish Pin Bar rejection at 4h support + Blue Line slope > 0.",
    opposingEvidence: "RSI in upper neutral quartile (64) approaching resistance.",
    exitReason: "Take-Profit Target 1 Hit.",
    postTradeReview: "Execution aligned precisely with dynamic trailing stop and trade gate rules.",
  },
  {
    id: "tj_002",
    timestampIso: "2026-10-18T17:15:00Z",
    symbol: "EUR/USD",
    mode: "PAPER",
    broker: "Exness OpenAPI",
    side: "SELL",
    orderType: "MARKET",
    volumeLots: 1.0,
    entryPrice: 1.0842,
    exitPrice: 1.0812,
    stopLoss: 1.0865,
    takeProfit: 1.081,
    realizedPnlQuote: 300.0,
    feesQuote: 3.5,
    setupRationale: "Bearish Engulfing pattern + Supertrend trend change to Bearish + Macro USD strength.",
    opposingEvidence: "Near session low with declining volume.",
    exitReason: "Take-profit achieved near key support.",
    postTradeReview: "Target attained with low drawdown. Trailing stop ratcheted to break-even appropriately.",
  },
];

/**
 * Calculate model calibration metrics over prediction audit history.
 */
export function calculateModelMetrics(
  records: PredictionAuditRecord[] = INITIAL_PREDICTION_AUDIT
): ModelPerformanceMetrics {
  const resolved = records.filter((r) => r.brierScore !== null);
  const totalPredictions = records.length;
  const resolvedPredictions = resolved.length;

  if (resolvedPredictions === 0) {
    return {
      totalPredictions,
      resolvedPredictions: 0,
      overallBrierScore: 0.25,
      directionalAccuracyPct: 50.0,
      isDriftDetected: false,
      lastUpdatedIso: new Date().toISOString(),
    };
  }

  const sumBrier = resolved.reduce((acc, r) => acc + (r.brierScore ?? 0.25), 0);
  const overallBrierScore = Number((sumBrier / resolvedPredictions).toFixed(4));

  const correctPredictions = resolved.filter((r) => r.actualOutcome === "TARGET_HIT").length;
  const directionalAccuracyPct = Number(((correctPredictions / resolvedPredictions) * 100).toFixed(1));

  // Drift detection: Brier score > 0.22 implies predictive decay vs baseline
  const isDriftDetected = overallBrierScore > 0.22 || directionalAccuracyPct < 52.0;

  return {
    totalPredictions,
    resolvedPredictions,
    overallBrierScore,
    directionalAccuracyPct,
    isDriftDetected,
    lastUpdatedIso: new Date().toISOString(),
  };
}
