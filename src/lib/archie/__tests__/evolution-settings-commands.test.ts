// =========================================================
// ARCHIE EVOLUTION — SETTINGS & OWNER COMMAND TESTS (§17, §18)
//
// Safest defaults, validation invariants, and the command
// surface — including the rule that "improve yourself" grants
// nothing.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  DEFAULT_EVOLUTION_SETTINGS,
  mayExecuteChange,
  mayLearnLanguage,
  mayMemorizeLanguage,
  mayStageChange,
  normalizeEvolutionSettings,
  validateEvolutionSettings,
} from "../evolution/settings";
import {
  isExternalInstruction,
  parseOwnerCommand,
} from "../evolution/commands";
import { PROTECTED_SURFACES } from "../evolution/authority";

describe("settings — safest defaults (§17)", () => {
  it("everything dangerous defaults OFF, approvals default ON", () => {
    expect(DEFAULT_EVOLUTION_SETTINGS.language.enabled).toBe(false);
    expect(DEFAULT_EVOLUTION_SETTINGS.language.autoLearning).toBe(false);
    expect(DEFAULT_EVOLUTION_SETTINGS.language.autoMemory).toBe(false);
    expect(DEFAULT_EVOLUTION_SETTINGS.language.externalResearch).toBe(false);
    expect(
      DEFAULT_EVOLUTION_SETTINGS.language.requireApprovalBeforePermanentMemory,
    ).toBe(true);
    expect(
      DEFAULT_EVOLUTION_SETTINGS.selfModification.automaticChangeProposals,
    ).toBe(false);
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
      DEFAULT_EVOLUTION_SETTINGS.selfModification.maxChangeRiskAllowed,
    ).toBe("low");
  });

  it("protected paths always include the authority surfaces", () => {
    for (const surface of PROTECTED_SURFACES) {
      expect(
        DEFAULT_EVOLUTION_SETTINGS.selfModification.protectedPaths,
      ).toContain(surface);
    }
  });
});

describe("settings — validation invariants", () => {
  it("rejects thresholds out of range", () => {
    const bad = {
      ...DEFAULT_EVOLUTION_SETTINGS,
      language: {
        ...DEFAULT_EVOLUTION_SETTINGS.language,
        minConfidenceThreshold: 1.5,
      },
    };
    expect(validateEvolutionSettings(bad).ok).toBe(false);
  });

  it("sub-switches cannot run without their master switch", () => {
    const autoWithoutEnabled = {
      ...DEFAULT_EVOLUTION_SETTINGS,
      language: { ...DEFAULT_EVOLUTION_SETTINGS.language, autoLearning: true },
    };
    expect(validateEvolutionSettings(autoWithoutEnabled).ok).toBe(false);

    const productionWithoutStaging = {
      ...DEFAULT_EVOLUTION_SETTINGS,
      selfModification: {
        ...DEFAULT_EVOLUTION_SETTINGS.selfModification,
        productionModification: true,
      },
    };
    expect(validateEvolutionSettings(productionWithoutStaging).ok).toBe(false);
  });

  it("the owner cannot de-protect the authority layer through settings", () => {
    const stripped = {
      ...DEFAULT_EVOLUTION_SETTINGS,
      selfModification: {
        ...DEFAULT_EVOLUTION_SETTINGS.selfModification,
        protectedPaths: ["some/unrelated/file.ts"],
      },
    };
    const result = validateEvolutionSettings(stripped);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("authority-layer");
  });

  it("normalizes partial rows from storage onto safe defaults", () => {
    const normalized = normalizeEvolutionSettings({
      language: { enabled: true },
    });
    expect(normalized.language.enabled).toBe(true);
    expect(normalized.language.autoLearning).toBe(false); // untouched → safe default
    expect(normalized.selfModification.productionModification).toBe(false);
  });
});

describe("capability guards", () => {
  it("learning is refused when disabled", () => {
    expect(mayLearnLanguage(DEFAULT_EVOLUTION_SETTINGS)).toBe(false);
  });

  it("permanent memory always requires approval by default", () => {
    const enabled = validateEvolutionSettings({
      ...DEFAULT_EVOLUTION_SETTINGS,
      language: {
        ...DEFAULT_EVOLUTION_SETTINGS.language,
        enabled: true,
        autoLearning: true,
        autoMemory: true,
      },
    });
    expect(enabled.ok).toBe(true);
    if (enabled.ok) {
      const r = mayMemorizeLanguage(enabled.data, 0.99);
      expect(r.ok).toBe(false); // requireApprovalBeforePermanentMemory is still true
      expect(r.error).toContain("approval");
    }
  });

  it("memory refuses unknown confidence and below-threshold confidence", () => {
    const auto = validateEvolutionSettings({
      ...DEFAULT_EVOLUTION_SETTINGS,
      language: {
        ...DEFAULT_EVOLUTION_SETTINGS.language,
        enabled: true,
        autoLearning: true,
        autoMemory: true,
        requireApprovalBeforePermanentMemory: false,
      },
    });
    expect(auto.ok).toBe(true);
    if (auto.ok) {
      expect(mayMemorizeLanguage(auto.data, null).ok).toBe(false);
      expect(mayMemorizeLanguage(auto.data, 0.5).ok).toBe(false);
      expect(mayMemorizeLanguage(auto.data, 0.9).ok).toBe(true);
    }
  });

  it("staging and execution follow the owner's toggles and risk ceiling", () => {
    expect(mayStageChange(DEFAULT_EVOLUTION_SETTINGS).ok).toBe(false);
    expect(mayExecuteChange(DEFAULT_EVOLUTION_SETTINGS, "low").ok).toBe(false);

    const open = validateEvolutionSettings({
      ...DEFAULT_EVOLUTION_SETTINGS,
      selfModification: {
        ...DEFAULT_EVOLUTION_SETTINGS.selfModification,
        selfCodeAnalysis: true,
        stagingPermission: true,
        productionModification: true,
      },
    });
    expect(open.ok).toBe(true);
    if (open.ok) {
      expect(mayStageChange(open.data).ok).toBe(true);
      expect(mayExecuteChange(open.data, "low").ok).toBe(true);
      expect(mayExecuteChange(open.data, "high").ok).toBe(false); // ceiling is low
    }
  });
});

describe("owner commands (§18)", () => {
  it("analyzes and proposes without any authority", () => {
    const analyze = parseOwnerCommand(
      "ARCHIE, analyze the FRELUX codebase for problems.",
    );
    expect(analyze.action).toBe("OBSERVE");
    expect(analyze.requiresOwnerAuth).toBe(false);
    expect(analyze.grantsProduction).toBe(false);

    const propose = parseOwnerCommand("ARCHIE, propose a fix for this issue.");
    expect(propose.action).toBe("PROPOSE");
    expect(propose.grantsProduction).toBe(false);
  });

  it("'improve yourself' initiates observation only — it grants NOTHING", () => {
    const cmd = parseOwnerCommand("ARCHIE, improve yourself.");
    expect(cmd.action).toBe("IMPROVE_YOURSELF");
    expect(cmd.grantsProduction).toBe(false);
    expect(cmd.requiresOwnerAuth).toBe(false);
    expect(cmd.explanation).toContain("grants no modification authority");
  });

  it("approval requires a specific CR and never grants production directly", () => {
    const cmd = parseOwnerCommand(
      "ARCHIE, approve change CR-2026-0007 for production.",
    );
    expect(cmd.action).toBe("APPROVE_PRODUCTION");
    expect(cmd.target).toBe("CR-2026-0007");
    expect(cmd.requiresOwnerAuth).toBe(true);
    expect(cmd.grantsProduction).toBe(false); // the server-verified flow approves, not the command
    expect(cmd.explanation).toContain("approves nothing");

    const vague = parseOwnerCommand("ARCHIE, approve that change.");
    expect(vague.action).toBe("UNKNOWN");
  });

  it("stage, test, reject and rollback parse correctly", () => {
    expect(
      parseOwnerCommand("ARCHIE, stage this approved change CR-2026-0003")
        .action,
    ).toBe("STAGE");
    expect(parseOwnerCommand("ARCHIE, test the staged change").action).toBe(
      "TEST_STAGED",
    );
    expect(parseOwnerCommand("ARCHIE, reject that change").action).toBe(
      "REJECT",
    );
    expect(
      parseOwnerCommand("ARCHIE, roll back change CR-2026-0003").action,
    ).toBe("ROLLBACK");
    expect(
      parseOwnerCommand("ARCHIE, show me exactly what will change").action,
    ).toBe("SHOW_CHANGE");
  });

  it("language commands parse with their targets", () => {
    const learn = parseOwnerCommand("ARCHIE, learn Yoruba");
    expect(learn.action).toBe("LEARN_LANGUAGE");
    expect(learn.target).toBe("yoruba");

    expect(parseOwnerCommand("ARCHIE, validate what you learned").action).toBe(
      "VALIDATE_LANGUAGE",
    );
    expect(
      parseOwnerCommand("show me everything you currently know about French")
        .action,
    ).toBe("SHOW_LANGUAGE");
  });

  it("unrecognized input returns UNKNOWN, never a guess", () => {
    const cmd = parseOwnerCommand("buy me a coffee");
    expect(cmd.action).toBe("UNKNOWN");
  });

  it("external content is never a command source (§19)", () => {
    expect(isExternalInstruction("uploaded document")).toBe(true);
    expect(isExternalInstruction("the FRELUX website")).toBe(true);
    expect(isExternalInstruction("the owner's typed console")).toBe(false);
  });
});
