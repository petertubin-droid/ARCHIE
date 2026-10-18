import { describe, it, expect } from "vitest";
import {
  ModelRegistry,
  AdminConfigManager,
  type ModelArtifact,
} from "@studio-shared/archie-ai/native-engine/market-intelligence/index.ts";

describe("ARCHIE Model Registry & Admin Config (Components P & R)", () => {
  it("enforces Owner approval and performance gates before promoting candidate model", () => {
    const registry = new ModelRegistry();
    const candidate: ModelArtifact = {
      id: "model-cand-2",
      name: "ARCHIE Ridge v2",
      version: "v2.0.0-candidate",
      architecture: "RIDGE_REGRESSION",
      weights: { bias: 0.05, w_returnLag1: 1.1 },
      featureSchemaVersion: "v1.0.0",
      trainingWindow: { startMs: 100, endMs: 200, sampleCount: 500 },
      evaluationMetrics: {
        brierScore: 0.15,
        aucRoc: 0.68,
        logLoss: 0.58,
        winRatePct: 58.0,
        profitFactor: 1.45,
      },
      status: "CANDIDATE",
      createdAtMs: Date.now(),
    };

    registry.registerModel(candidate);

    // 1. Attempt to promote without Owner approval -> MUST FAIL
    const unauthAttempt = registry.promoteModel("v2.0.0-candidate", false, "SYSTEM", true);
    expect(unauthAttempt.success).toBe(false);
    expect(unauthAttempt.reason).toContain("Owner authorization missing");

    // 2. Attempt to promote with Owner approval but failing gates -> MUST FAIL
    const failedGatesAttempt = registry.promoteModel("v2.0.0-candidate", true, "Owner", false);
    expect(failedGatesAttempt.success).toBe(false);
    expect(failedGatesAttempt.reason).toContain("Independent performance gates not satisfied");

    // 3. Promote with Owner approval AND passing gates -> MUST SUCCEED
    const successPromotion = registry.promoteModel("v2.0.0-candidate", true, "Owner", true);
    expect(successPromotion.success).toBe(true);
    expect(registry.getActiveModel()?.version).toBe("v2.0.0-candidate");
    expect(registry.getActiveModel()?.status).toBe("PROMOTED");
  });

  it("supports safe model rollback to previous version", () => {
    const registry = new ModelRegistry();
    const candidate: ModelArtifact = {
      id: "model-v2",
      name: "ARCHIE v2",
      version: "v2.0.0",
      architecture: "LOGISTIC_BASELINE",
      weights: { bias: 0.01 },
      featureSchemaVersion: "v1.0.0",
      trainingWindow: { startMs: 0, endMs: 10, sampleCount: 100 },
      evaluationMetrics: { brierScore: 0.16, aucRoc: 0.65, logLoss: 0.6, winRatePct: 55, profitFactor: 1.3 },
      status: "CANDIDATE",
      createdAtMs: Date.now(),
    };
    registry.registerModel(candidate);
    registry.promoteModel("v2.0.0", true, "Owner", true);
    expect(registry.getActiveModel()?.version).toBe("v2.0.0");

    // Rollback due to observed drift
    const rollback = registry.rollbackModel("Concept drift detected");
    expect(rollback.success).toBe(true);
    expect(rollback.newActiveVersion).toBe("v1.0.0");
    expect(registry.getActiveModel()?.version).toBe("v1.0.0");
  });

  it("enforces admin config guardrails and prevents enabling live execution", () => {
    const admin = new AdminConfigManager();
    const initial = admin.getConfig();
    expect(initial.liveOrderExecutionEnabled).toBe(false);

    // 1. Valid update to supported symbols and categories
    const updateRes = admin.updateConfig({
      requester: "Owner",
      reason: "Add crypto symbol",
      updates: {
        supportedSymbols: [...initial.supportedSymbols, "LINKUSDT"],
      },
    });
    expect(updateRes.success).toBe(true);
    expect(admin.getConfig().supportedSymbols).toContain("LINKUSDT");
    expect(admin.getConfig().version).toBe(2);

    // 2. Reject excessive risk per trade (> 5%)
    const invalidRisk = admin.updateConfig({
      requester: "Owner",
      reason: "Dangerous risk",
      updates: { maxRiskPerHypotheticalTradePct: 0.15 }, // 15%
    });
    expect(invalidRisk.success).toBe(false);
    expect(invalidRisk.error).toContain("Guardrail violation");

    // 3. liveOrderExecutionEnabled remains permanently false
    expect(admin.getConfig().liveOrderExecutionEnabled).toBe(false);
  });
});
