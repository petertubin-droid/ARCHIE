// =========================================================
// ARCHIE TRADING MODEL GOVERNANCE TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { calculateModelMetrics, INITIAL_PREDICTION_AUDIT } from "../trading/model-governance";

describe("Model Governance & Calibration Ledger", () => {
  it("calculates Brier score and directional accuracy correctly", () => {
    const metrics = calculateModelMetrics(INITIAL_PREDICTION_AUDIT);
    expect(metrics.totalPredictions).toBe(INITIAL_PREDICTION_AUDIT.length);
    expect(metrics.overallBrierScore).toBeGreaterThanOrEqual(0);
    expect(metrics.overallBrierScore).toBeLessThanOrEqual(1);
    expect(metrics.directionalAccuracyPct).toBeGreaterThan(0);
  });
});
