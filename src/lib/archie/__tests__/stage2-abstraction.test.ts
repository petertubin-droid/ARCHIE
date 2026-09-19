import { describe, it, expect } from "vitest";
import {
  ARCHIE_OWN_MODEL_DESCRIPTOR,
  PROVIDER_INDEPENDENCE,
  RUNTIME_REGISTRY,
  runtimeIdentityLabel,
} from "../ai-abstraction";
import {
  MODEL_LIFECYCLE_CAPABILITIES,
  canRegisterOwnModelServing,
  modelLifecycleReport,
} from "../model-lifecycle";

describe("ARCHIE AI abstraction (spec §§1, 11, 39)", () => {
  it("registers ARCHIE's own model with the HONEST not-yet-available status", () => {
    expect(ARCHIE_OWN_MODEL_DESCRIPTOR.id).toBe("ARCHIE_OWN_MODEL");
    expect(ARCHIE_OWN_MODEL_DESCRIPTOR.kind).toBe("ARCHIE_NATIVE");
    expect(ARCHIE_OWN_MODEL_DESCRIPTOR.status).toBe("NOT_YET_AVAILABLE");
  });

  it("contains ZERO external adapters — Provider Independence Rule (Gemini is FRELUX-only)", () => {
    const adapters = RUNTIME_REGISTRY.filter(
      (r) => r.kind === "EXTERNAL_ADAPTER",
    );
    expect(adapters).toEqual([]);
    expect(RUNTIME_REGISTRY).toEqual([ARCHIE_OWN_MODEL_DESCRIPTOR]);
  });

  it("never brands ARCHIE as provider-powered (model-independence §39.2)", () => {
    for (const label of [
      runtimeIdentityLabel("FUTURE_REGISTERED_ENGINE"),
      runtimeIdentityLabel(""),
      ARCHIE_OWN_MODEL_DESCRIPTOR.label,
    ]) {
      expect(label).not.toMatch(
        /gemini-powered|openai-powered|claude-powered/i,
      );
    }
  });

  it("documents all §39 independence invariants", () => {
    const texts = PROVIDER_INDEPENDENCE.map((p) => p.invariant)
      .join(" ")
      .toLowerCase();
    for (const keyword of [
      "knowledge",
      "learning",
      "memory",
      "tool",
      "runtime",
      "adapter",
      "provider",
      "functionality",
    ]) {
      expect(texts).toContain(keyword);
    }
    expect(PROVIDER_INDEPENDENCE.length).toBeGreaterThanOrEqual(8);
  });
});

describe("model lifecycle honesty (spec §§10, 40)", () => {
  it("never claims training capabilities that do not exist", () => {
    for (const cap of MODEL_LIFECYCLE_CAPABILITIES) {
      if (
        cap.capability.toLowerCase().includes("training") ||
        cap.capability.toLowerCase().includes("dataset")
      ) {
        expect(cap.status).toBe("NOT_YET_IMPLEMENTED");
      }
    }
  });

  it("reports READY only for capabilities that are real today", () => {
    const ready = modelLifecycleReport().filter((c) => c.status === "READY");
    for (const c of ready) {
      expect([
        "Model registry",
        "Model versioning",
        "Inference serving",
        "Model rollback",
      ]).toContain(c.capability);
    }
  });

  it("refuses to register an unevaluated model as serving", () => {
    const res = canRegisterOwnModelServing([], "v1");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/evaluation/i);
    const ok = canRegisterOwnModelServing(
      [
        {
          id: "m",
          runtimeId: "ARCHIE_OWN_MODEL",
          version: "v1",
          status: "EVALUATED",
        },
      ],
      "v1",
    );
    expect(ok.ok).toBe(true);
  });
});
