// =========================================================
// EVOLUTION-SETTINGS TESTS (batch 28, fix 128)
// Owner-configured settings with structural invariants:
// sub-switches cannot be on without their masters, authority
// surfaces cannot be removed from protection, production
// execution can never be autonomous, and permanent memory
// always respects the owner's approval policy and threshold.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVOLUTION_SETTINGS,
  mayAutoPropose,
  mayExecuteChange,
  mayLearnLanguage,
  mayMemorizeLanguage,
  mayStageChange,
  normalizeEvolutionSettings,
  permanentMemoryStates,
  validateEvolutionSettings,
} from "@/lib/archie/evolution/settings";
import type { EvolutionSettings } from "@/lib/archie/evolution/types";

function settings(
  over: {
    language?: Partial<EvolutionSettings["language"]>;
    selfModification?: Partial<EvolutionSettings["selfModification"]>;
  } = {},
): EvolutionSettings {
  return {
    language: { ...DEFAULT_EVOLUTION_SETTINGS.language, ...over.language },
    selfModification: {
      ...DEFAULT_EVOLUTION_SETTINGS.selfModification,
      ...over.selfModification,
    },
    updatedAt: DEFAULT_EVOLUTION_SETTINGS.updatedAt,
  };
}

describe("defaults — the honest starting state", () => {
  it("starts language learning and self-modification OFF", () => {
    expect(DEFAULT_EVOLUTION_SETTINGS.language.enabled).toBe(false);
    expect(DEFAULT_EVOLUTION_SETTINGS.language.autoLearning).toBe(false);
    expect(DEFAULT_EVOLUTION_SETTINGS.selfModification.stagingPermission).toBe(
      false,
    );
    expect(
      DEFAULT_EVOLUTION_SETTINGS.selfModification.productionModification,
    ).toBe(false);
    expect(
      DEFAULT_EVOLUTION_SETTINGS.selfModification.requireExplicitApproval,
    ).toBe(true);
    expect(
      DEFAULT_EVOLUTION_SETTINGS.language.minConfidenceThreshold,
    ).toBeCloseTo(0.85);
  });
});

describe("validateEvolutionSettings — structural invariants", () => {
  it("rejects out-of-range thresholds and risks", () => {
    expect(
      validateEvolutionSettings(
        settings({ language: { minConfidenceThreshold: 1.5 } }),
      ).ok,
    ).toBe(false);
    expect(
      validateEvolutionSettings(
        settings({
          selfModification: { maxChangeRiskAllowed: "extreme" as never },
        }),
      ).ok,
    ).toBe(false);
  });

  it("enforces the master-switch chain", () => {
    expect(
      validateEvolutionSettings(
        settings({ language: { autoLearning: true, enabled: false } }),
      ).ok,
    ).toBe(false);
    expect(
      validateEvolutionSettings(
        settings({ language: { autoMemory: true, autoLearning: false } }),
      ).ok,
    ).toBe(false);
    expect(
      validateEvolutionSettings(
        settings({
          selfModification: {
            stagingPermission: true,
            selfCodeAnalysis: false,
          },
        }),
      ).ok,
    ).toBe(false);
    expect(
      validateEvolutionSettings(
        settings({
          selfModification: {
            productionModification: true,
            stagingPermission: false,
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it("refuses removal of authority-layer surfaces from protection", () => {
    const stripped = settings({ selfModification: { protectedPaths: [] } });
    const r = validateEvolutionSettings(stripped);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot be removed from protection/i);
    expect(validateEvolutionSettings(settings()).ok).toBe(true);
  });
});

describe("normalizeEvolutionSettings — settings survive reload", () => {
  it("merges over defaults and accepts both camelCase and snake_case row shapes", () => {
    const normalized = normalizeEvolutionSettings({
      self_modification: { stagingPermission: true },
      updatedAt: "2026-09-15T00:00:00Z",
    });
    expect(normalized.selfModification.stagingPermission).toBe(true); // owner report fix: settings must stick
    expect(normalized.updatedAt).toBe("2026-09-15T00:00:00Z");
    const camel = normalizeEvolutionSettings({
      selfModification: { protectedPaths: [] },
    });
    expect(camel.selfModification.automaticChangeProposals).toBe(false); // default preserved
    expect(
      normalizeEvolutionSettings({}).language.minConfidenceThreshold,
    ).toBeCloseTo(0.85);
  });
});

describe("capability guards", () => {
  it("gates learning, staging and auto-propose on the owner's toggles", () => {
    expect(mayLearnLanguage(settings())).toBe(false);
    expect(mayLearnLanguage(settings({ language: { enabled: true } }))).toBe(
      true,
    );
    expect(mayStageChange(settings())).toMatchObject({ ok: false });
    expect(
      mayStageChange(
        settings({ selfModification: { stagingPermission: true } }),
      ),
    ).toEqual({ ok: true });
    expect(mayAutoPropose(settings())).toBe(false);
  });

  it("never makes production execution autonomous", () => {
    expect(mayExecuteChange(settings(), "low")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/disabled/i),
    });
    const on = settings({
      selfModification: {
        productionModification: true,
        maxChangeRiskAllowed: "low",
      },
    });
    expect(mayExecuteChange(on, "high")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/exceeds/i),
    });
    expect(mayExecuteChange(on, "low")).toEqual({ ok: true }); // STILL requires the separate owner approval flow
  });

  it("honors the approval policy and confidence threshold for permanent memory", () => {
    expect(mayMemorizeLanguage(settings(), 0.99)).toMatchObject({ ok: false });
    const auto = settings({
      language: {
        enabled: true,
        autoMemory: true,
        requireApprovalBeforePermanentMemory: false,
      },
    });
    expect(mayMemorizeLanguage(auto, null)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/unknown/i),
    });
    expect(mayMemorizeLanguage(auto, 0.5)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/below the owner/i),
    });
    expect(mayMemorizeLanguage(auto, 0.9)).toEqual({ ok: true });
  });

  it("accepts only CONFIRMED language knowledge as permanent", () => {
    expect(permanentMemoryStates()).toEqual(["CONFIRMED"]);
  });
});
