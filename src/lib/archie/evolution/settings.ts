// =========================================================
// FRELUX ARCHIE SELF-EVOLUTION LAYER — OWNER SETTINGS (§17)
//
// The Evolution Control Center's data model. Defaults are the
// SAFEST configuration: language learning off, no automatic
// memory, no automatic proposals, no staging, no production
// modification, and approval required everywhere.
//
// Settings can never weaken the authority constants — those
// live in authority.ts and are not settings.
// =========================================================

import { PROTECTED_SURFACES } from "./authority";
import type {
  ChangeRisk,
  EvolutionSettings,
  LanguageValidationState,
} from "./types";

export const DEFAULT_EVOLUTION_SETTINGS: EvolutionSettings = {
  language: {
    enabled: false,
    autoLearning: false,
    autoMemory: false,
    externalResearch: false,
    dialectLearning: false,
    minConfidenceThreshold: 0.85,
    requireApprovalBeforePermanentMemory: true,
  },
  selfModification: {
    selfCodeAnalysis: true,
    automaticChangeProposals: false,
    stagingPermission: false,
    productionModification: false,
    requireExplicitApproval: true,
    automaticRollback: false,
    maxChangeRiskAllowed: "low",
    protectedPaths: [...PROTECTED_SURFACES],
  },
  updatedAt: new Date(0).toISOString(),
};

export type SettingsResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

/** Validate settings — ranges, invariants, and the rule that
 *  dangerous sub-switches cannot be on when their master
 *  switch is off. */
export function validateEvolutionSettings(
  settings: EvolutionSettings,
): SettingsResult<EvolutionSettings> {
  const { language, selfModification } = settings;
  if (
    typeof language.minConfidenceThreshold !== "number" ||
    language.minConfidenceThreshold < 0 ||
    language.minConfidenceThreshold > 1
  ) {
    return {
      ok: false,
      error: "The minimum confidence threshold must be between 0 and 1.",
    };
  }
  if (
    !["low", "medium", "high"].includes(selfModification.maxChangeRiskAllowed)
  ) {
    return {
      ok: false,
      error: "The maximum change risk must be low, medium or high.",
    };
  }
  // A sub-capability can never be enabled without its master switch.
  if (language.autoLearning && !language.enabled) {
    return {
      ok: false,
      error:
        "Automatic language learning requires universal language learning to be enabled.",
    };
  }
  if (language.autoMemory && !language.autoLearning) {
    return {
      ok: false,
      error: "Automatic language memory requires automatic language learning.",
    };
  }
  if (language.externalResearch && !language.enabled) {
    return {
      ok: false,
      error:
        "External language research requires language learning to be enabled.",
    };
  }
  if (
    selfModification.stagingPermission &&
    !selfModification.selfCodeAnalysis
  ) {
    return {
      ok: false,
      error: "Staging permission requires self-code analysis.",
    };
  }
  if (
    selfModification.productionModification &&
    !selfModification.stagingPermission
  ) {
    return {
      ok: false,
      error: "Production modification requires staging permission.",
    };
  }
  // Protected paths must always include the authority surfaces.
  const authorityMissing = PROTECTED_SURFACES.some(
    (s) => !selfModification.protectedPaths.includes(s),
  );
  if (authorityMissing) {
    return {
      ok: false,
      error:
        "Protected paths must always include every authority-layer surface — they cannot be removed from protection.",
    };
  }
  return { ok: true, data: settings };
}

/** Normalize an unknown settings object from storage. */
export function normalizeEvolutionSettings(
  raw: Record<string, unknown>,
): EvolutionSettings {
  const merged: EvolutionSettings = {
    language: {
      ...DEFAULT_EVOLUTION_SETTINGS.language,
      ...(raw.language as Partial<EvolutionSettings["language"]> | undefined),
    },
    selfModification: {
      ...DEFAULT_EVOLUTION_SETTINGS.selfModification,
      // Row shape is snake_case (self_modification) straight
      // from the table and camelCase in memory — accept both
      // so nothing resets to defaults on reload (owner report
      // 2026-09-14: evolution settings did not stick).
      ...((raw.selfModification ??
        raw.self_modification ??
        {}) as Partial<EvolutionSettings["selfModification"]>),
    },
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : typeof raw.updated_at === "string"
          ? raw.updated_at
          : DEFAULT_EVOLUTION_SETTINGS.updatedAt,
  };
  return merged;
}

// ---------------------------------------------------------
// Capability guards (used by every mutation path)
// ---------------------------------------------------------

/** May a language be learned right now? */
export function mayLearnLanguage(settings: EvolutionSettings): boolean {
  return settings.language.enabled;
}

/** May learned language information become PERMANENT memory
 *  automatically? False whenever approval is required — the
 *  owner then confirms explicitly. */
export function mayMemorizeLanguage(
  settings: EvolutionSettings,
  confidence: number | null,
): { ok: boolean; error?: string } {
  if (!settings.language.enabled) {
    return {
      ok: false,
      error: "Universal language learning is disabled by the owner.",
    };
  }
  if (
    !settings.language.autoMemory ||
    settings.language.requireApprovalBeforePermanentMemory
  ) {
    return {
      ok: false,
      error:
        "Permanent language memory requires owner approval (owner-configured policy).",
    };
  }
  if (confidence === null) {
    return {
      ok: false,
      error: "Confidence is unknown — cannot memorize uncertain information.",
    };
  }
  if (confidence < settings.language.minConfidenceThreshold) {
    return {
      ok: false,
      error: `Confidence ${(confidence * 100).toFixed(0)}% is below the owner's ${(settings.language.minConfidenceThreshold * 100).toFixed(0)}% threshold — the information stays provisional.`,
    };
  }
  return { ok: true };
}

/** May a proposed change proceed to staging? */
export function mayStageChange(settings: EvolutionSettings): {
  ok: boolean;
  error?: string;
} {
  if (!settings.selfModification.stagingPermission) {
    return { ok: false, error: "Staging is disabled by the owner." };
  }
  return { ok: true };
}

/** May a change be executed in production? Production also
 *  always requires the owner's separate explicit approval —
 *  settings can never make execution autonomous. */
export function mayExecuteChange(
  settings: EvolutionSettings,
  risk: ChangeRisk,
): { ok: boolean; error?: string } {
  if (!settings.selfModification.productionModification) {
    return {
      ok: false,
      error: "Production modification is disabled by the owner.",
    };
  }
  const order: Record<ChangeRisk, number> = { low: 0, medium: 1, high: 2 };
  if (order[risk] > order[settings.selfModification.maxChangeRiskAllowed]) {
    return {
      ok: false,
      error: `Change risk "${risk}" exceeds the owner's maximum allowed risk ("${settings.selfModification.maxChangeRiskAllowed}").`,
    };
  }
  if (settings.selfModification.requireExplicitApproval) {
    return { ok: true };
  }
  // Even with the toggle off, explicit approval is the floor.
  return { ok: true };
}

/** May ARCHIE automatically propose changes it identifies? */
export function mayAutoPropose(settings: EvolutionSettings): boolean {
  return settings.selfModification.automaticChangeProposals;
}

/** The validation state that qualifies as permanent memory. */
export function permanentMemoryStates(): readonly LanguageValidationState[] {
  return ["CONFIRMED"];
}
