// =========================================================
// ARCHIE CORE PRINCIPLE — PROVIDER INDEPENDENCE
// (GEMINI SEPARATION RULE)
//
// This is a PERMANENT ARCHITECTURAL PRINCIPLE of ARCHIE,
// encoded in core code and persisted in ARCHIE's durable
// store (frelux_archie_core_principles, seeded at birth and
// never overwritten). It is NOT a user-facing prompt, NOT a
// temporary instruction, NOT a mock or placeholder, and it
// must survive upgrades, migrations, devices and deployments.
//
// ARCHIE is an independent intelligence system. No external
// provider — Gemini in particular — is part of ARCHIE's core
// intelligence, memory, learning system, Coding Studio,
// reasoning engine, self-evolution system or PWA.
//
// The same independence holds for OpenAI: no OpenAI API,
// key, model or SDK may exist anywhere in ARCHIE's core
// intelligence, memory, learning, Coding Studio, reasoning,
// self-evolution, voice/ears system or PWA. ARCHIE's voice
// features run on the owner's own voice bank (deterministic
// math, no cloud AI) and native browser/OS speech
// recognition. OpenAI remains available ONLY to the FRELUX
// application layer under the same conditions as Gemini.
// =========================================================

export const PROVIDER_INDEPENDENCE_PRINCIPLE_ID = "provider_independence";

/** The rule, stated verbatim as a permanent ARCHIE
 *  architectural principle. */
export const PROVIDER_INDEPENDENCE = {
  principleId: PROVIDER_INDEPENDENCE_PRINCIPLE_ID,
  title: "ARCHIE Provider Independence (Gemini Separation Rule)",
  rule:
    "ARCHIE is an independent intelligence system. Gemini must NOT be part " +
    "of ARCHIE's core intelligence, memory, learning system, Coding " +
    "Studio, reasoning engine, self-evolution system, or PWA. ARCHIE must " +
    "operate independently using its own learned knowledge, coding " +
    "intelligence, memory, tools, and authorized capabilities.",
  geminiScope:
    "Gemini belongs ONLY to the FRELUX application as a secondary " +
    "fallback intelligence service.",
  /** The ONLY conditions under which Gemini may be called. */
  allowedConditions: [
    "ARCHIE determines that it does not have sufficient validated " +
      "knowledge to solve a specific FRELUX problem, OR",
    "ARCHIE determines that it cannot reliably complete the requested " +
      "task with its current capabilities.",
  ] as const,
  prohibitions: [
    "ARCHIE must never automatically delegate normal work to Gemini " +
      "simply because Gemini is available.",
    "Before requesting Gemini assistance, ARCHIE must attempt the task " +
      "using its own capabilities.",
    "Any Gemini response must be treated as external assistance " +
      "requiring ARCHIE's own analysis and validation before being " +
      "accepted into its knowledge or workflow.",
    "Gemini must not be copied into ARCHIE's core architecture.",
    "ARCHIE must not be made dependent on Gemini.",
    "Gemini must not be ARCHIE's hidden backend, fallback model, coding " +
      "engine, or reasoning engine.",
  ] as const,
  /** The independent Coding Studio workflow — no external
   *  provider anywhere in it. */
  studioWorkflow: [
    "Owner instruction",
    "ARCHIE reasoning",
    "code generation",
    "sandbox",
    "testing",
    "verification",
    "live preview",
    "Owner review",
  ] as const,
  /** Subsystems that must contain ZERO Gemini dependency. */
  protectedSubsystems: [
    "ARCHIE Core",
    "ARCHIE Coding Studio",
    "ARCHIE Memory",
    "ARCHIE Learning",
    "ARCHIE Evolution",
    "ARCHIE PWA",
  ] as const,
  /** Where external inference engines DO connect: ARCHIE's own
   *  provider-agnostic AI abstraction (neutral engine ids,
   *  never provider names in consumer code) — so future models
   *  can be added or changed without redesign, and no external
   *  provider ever substitutes for ARCHIE silently. */
  engineContract:
    "All ARCHIE inference resolves through ARCHIE's provider-agnostic " +
    "engine registry (neutral engine ids only). No engine operational " +
    "means an honest not-operational result — never a silent provider " +
    "substitution and never a faked result.",
  governing: "Owner Authority Layer",
  permanence:
    "Permanent architectural principle. Persisted across upgrades, " +
    "migrations, devices and deployments. Never implemented as a " +
    "temporary instruction, mock, placeholder or hardcoded conversational " +
    "response.",
} as const;

/**
 * Verification helper — used by tests and the integrity
 * pipeline. A subsystem is Gemini-independent when the rule is
 * encoded, the studio workflow is provider-agnostic, and every
 * protected subsystem is covered by the principle.
 */
export interface ProviderIndependenceIntegrity {
  encoded: boolean;
  studioWorkflowIndependent: boolean;
  protectedSubsystems: readonly string[];
  geminiFreluxOnly: boolean;
}

// ---------------------------------------------------------
// OPENAI SEPARATION RULE — the same independence, extended
// to OpenAI by direct owner instruction (2026-09-10):
// "ARCHIE is independent — remove OpenAI from ARCHIE's
// system. I have a voice bank in the database, use that
// instead of OpenAI."
// ---------------------------------------------------------

export const OPENAI_SEPARATION_PRINCIPLE_ID = "openai_separation";

export const OPENAI_SEPARATION = {
  principleId: OPENAI_SEPARATION_PRINCIPLE_ID,
  title: "ARCHIE Provider Independence (OpenAI Separation Rule)",
  rule:
    "ARCHIE is an independent intelligence system. OpenAI must NOT be part " +
    "of ARCHIE's core intelligence, memory, learning system, Coding " +
    "Studio, reasoning engine, self-evolution system, voice/ears system, " +
    "or PWA. ARCHIE must operate independently using its own learned " +
    "knowledge, coding intelligence, memory, tools, and authorized " +
    "capabilities.",
  openaiScope:
    "OpenAI belongs ONLY to the FRELUX application as a secondary " +
    "fallback intelligence service, under the same conditions as Gemini.",
  voiceIndependence:
    "ARCHIE's voice features are provider-free by construction: replies " +
    "are spoken through the owner's own voice bank (deterministic " +
    "pitch/pace math on recorded samples — no cloud AI), and speech is " +
    "understood through native on-device speech recognition. No OpenAI " +
    "key, API or model may power any part of ARCHIE's ears or voice.",
  prohibitions: [
    "No OpenAI API endpoint, key, model id or SDK may appear in any " +
      "ARCHIE-owned function, module, page or test.",
    "ARCHIE must never delegate transcription, synthesis, reasoning or " +
      "any other work to OpenAI.",
    "A missing or removed OpenAI key must never make an ARCHIE subsystem " +
      "fail or claim NOT_OPERATIONAL — ARCHIE subsystems do not depend " +
      "on it at all.",
    "OpenAI must not be ARCHIE's hidden backend, fallback model, coding " +
      "engine, reasoning engine, transcription engine or voice engine.",
  ] as const,
  protectedSubsystems: [
    "ARCHIE Core",
    "ARCHIE Coding Studio",
    "ARCHIE Memory",
    "ARCHIE Learning",
    "ARCHIE Evolution",
    "ARCHIE Ears / Voice",
    "ARCHIE PWA",
  ] as const,
  governing: "Owner Authority Layer",
  permanence:
    "Permanent architectural principle. Persisted across upgrades, " +
    "migrations, devices and deployments. Never implemented as a " +
    "temporary instruction, mock, placeholder or hardcoded conversational " +
    "response.",
} as const;

export interface OpenAiSeparationIntegrity {
  encoded: boolean;
  voiceBankNative: boolean;
  protectedSubsystems: readonly string[];
  openaiFreluxOnly: boolean;
}

export function verifyOpenAiSeparationIntegrity(): OpenAiSeparationIntegrity {
  return {
    encoded:
      OPENAI_SEPARATION.rule.includes("independent intelligence system") &&
      OPENAI_SEPARATION.rule.includes("OpenAI must NOT be part"),
    voiceBankNative:
      OPENAI_SEPARATION.voiceIndependence.includes("voice bank") &&
      OPENAI_SEPARATION.voiceIndependence.includes("native on-device"),
    protectedSubsystems: OPENAI_SEPARATION.protectedSubsystems,
    openaiFreluxOnly: OPENAI_SEPARATION.openaiScope.includes(
      "ONLY to the FRELUX application",
    ),
  };
}

export function verifyProviderIndependenceIntegrity(): ProviderIndependenceIntegrity {
  return {
    encoded:
      PROVIDER_INDEPENDENCE.rule.includes("independent intelligence system") &&
      PROVIDER_INDEPENDENCE.rule.includes("Gemini must NOT be part"),
    studioWorkflowIndependent:
      PROVIDER_INDEPENDENCE.studioWorkflow.length === 8 &&
      !PROVIDER_INDEPENDENCE.studioWorkflow.some((step) =>
        /gemini|openai|claude|provider/i.test(step),
      ),
    protectedSubsystems: PROVIDER_INDEPENDENCE.protectedSubsystems,
    geminiFreluxOnly: PROVIDER_INDEPENDENCE.geminiScope.includes(
      "ONLY to the FRELUX application",
    ),
  };
}
