// =========================================================
// MODEL-LIFECYCLE TESTS (batch 25, fix 103)
// The Owner-facing report is honest about what exists vs what
// is not implemented (no invented progress); a model version
// may only serve after passing evaluation.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  canRegisterOwnModelServing,
  MODEL_LIFECYCLE_CAPABILITIES,
  modelLifecycleReport,
  type ModelVersion,
} from "@/lib/archie/model-lifecycle";

function version(
  version: string,
  status: ModelVersion["status"],
): ModelVersion {
  return {
    id: `mv_${version}`,
    runtimeId: "ARCHIE_OWN_MODEL",
    version,
    status,
  };
}

describe("modelLifecycleReport", () => {
  it("returns an honest report the UI renders verbatim", () => {
    const report = modelLifecycleReport();
    expect(report).toHaveLength(MODEL_LIFECYCLE_CAPABILITIES.length);
    expect(report).toEqual([...MODEL_LIFECYCLE_CAPABILITIES]);
  });

  it("states NOT_YET_IMPLEMENTED where nothing exists yet", () => {
    const statuses = new Set(MODEL_LIFECYCLE_CAPABILITIES.map((c) => c.status));
    expect(statuses.has("NOT_YET_IMPLEMENTED")).toBe(true);
    const training = MODEL_LIFECYCLE_CAPABILITIES.find(
      (c) => c.capability === "Supervised training",
    );
    expect(training?.status).toBe("NOT_YET_IMPLEMENTED");
  });

  it("marks the registry, serving and rollback READY through the abstraction", () => {
    const ready = MODEL_LIFECYCLE_CAPABILITIES.filter(
      (c) => c.status === "READY",
    );
    expect(ready.map((c) => c.capability)).toEqual([
      "Model registry",
      "Model versioning",
      "Inference serving",
      "Model rollback",
    ]);
    expect(
      MODEL_LIFECYCLE_CAPABILITIES.find(
        (c) => c.capability === "Inference serving",
      )?.note,
    ).toMatch(/AI Abstraction/i);
  });
});

describe("canRegisterOwnModelServing — no fabricated graduation", () => {
  it("refuses versions that were never evaluated", () => {
    const r = canRegisterOwnModelServing(
      [version("1.0.0", "REGISTERED"), version("1.0.0", "IN_TRAINING")],
      "1.0.0",
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only after passing evaluation/i);
  });

  it("accepts only the exact evaluated version", () => {
    const r = canRegisterOwnModelServing(
      [version("1.0.0", "EVALUATED")],
      "1.0.0",
    );
    expect(r.ok).toBe(true);
    expect(
      canRegisterOwnModelServing([version("1.0.0", "EVALUATED")], "2.0.0").ok,
    ).toBe(false);
  });
});
