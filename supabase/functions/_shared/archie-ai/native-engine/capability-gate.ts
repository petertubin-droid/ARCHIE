// =========================================================
// ARCHIE NATIVE ENGINE — CAPABILITY GATE
//
// Owner-directed engine activation (owner directive
// 2026-09-14): the Engines panel toggles capabilities ON and
// OFF. This module is the single truth the engine consults
// before executing a gated capability. A disabled capability
// is refused HONESTLY — never silently skipped, never
// faked, never bypassed.
//
// Design rules (no theater):
//   * Only capabilities with a REAL dispatch gate are
//     toggleable (TOGGLEABLE_CAPABILITY_IDS). Core
//     cognition (conversation, memory, knowledge,
//     reasoning integrity, self-evaluation, learning) is
//     PROTECTED — switching it off would corrupt ARCHIE's
//     mind, so it has no toggle at all.
//   * The gate is per-isolate and refreshed from
//     archie_engine_states by the wiring layer (archie-chat
//     boot) with a short TTL, so a toggle lands within
//     seconds on every live surface.
//   * The honesty layer itself can never be gated: the
//     refusal reply for a disabled capability is a real
//     refusal, not a simulated engine result.
// =========================================================

/**
 * Capabilities the owner may toggle from the Engines panel.
 * Every id here MUST have a real dispatch gate in engine.ts —
 * an id without a gate must never appear in this list.
 */
export const TOGGLEABLE_CAPABILITY_IDS = [
  "web-research",
  "planning",
  "coding-intelligence-analysis",
  "market-intelligence-price-lookup",
  "system-adapters-documents-images-voice-social-family",
  "construction-calculators",
  "tool-orchestration",
] as const;

/** Protected capabilities — core cognition. Always on; the
 *  panel shows them with the reason instead of a toggle. */
export const PROTECTED_CAPABILITY_IDS = [
  "natural-conversation",
  "reasoning",
  "context-management",
  "persistent-memory-retrieval",
  "knowledge-acquisition",
  "self-evaluation",
  "outcome-learning",
] as const;

const disabled = new Set<string>();

/** Wiring layer (archie-chat boot) installs the live disabled
 *  set from archie_engine_states. Called on refresh. */
export function configureNativeEngineCapabilityGate(
  disabledCapabilityIds: string[],
): void {
  disabled.clear();
  for (const id of disabledCapabilityIds) {
    // Defense in depth: a corrupt or forged state row can only
    // ever disable a genuinely toggleable capability.
    if ((TOGGLEABLE_CAPABILITY_IDS as readonly string[]).includes(id)) {
      disabled.add(id);
    }
  }
}

/** The gate check — consulted at real dispatch points. */
export function isCapabilityEnabled(capabilityId: string): boolean {
  return !disabled.has(capabilityId);
}

/** Honest refusal text used by the dispatch gates. */
export function capabilityDisabledReply(
  capabilityId: string,
  surface: string,
): string {
  return `${surface} is switched OFF by the owner. I will not run it — this is the Engines panel state, not an error. Turn "${capabilityId}" back on from the Engines page to use it again.`;
}

/** Current disabled ids (diagnostics + tests). */
export function disabledCapabilityIds(): string[] {
  return Array.from(disabled);
}
