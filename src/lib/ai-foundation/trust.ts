// =========================================================
// FRELUX AI FOUNDATION, Trust / Verification Layer
//
// State machine for every AI-derived value:
//   Detected → Needs Confirmation → User Confirmed / System Verified
//   (+ rejected / corrected / unknown / insufficient evidence)
//
// HARD RULES
//   1. An uncertain AI inference is NEVER silently converted into a
//      verified construction fact. Transitions require an explicit
//      event (user confirmation or a deterministic validator).
//   2. Deterministic sources (user input, engines, verified market
//      data, canonical location data) are trusted by origin, they
//      are not "AI inferences" and need no extra confirmation.
//   3. Interop with the pre-existing vocabularies is provided :
//      measurement/verification-states and construction-extraction
//      statuses map cleanly in both directions.
//
// Additive only. No existing module is modified.
// =========================================================

import type { AiFact, Provenance, TrustStatus } from "./types";

/**
 * Origins whose values are authoritative by construction.
 * Anything NOT in this list entered the system as an inference
 * and must be confirmed (or deterministically validated) before
 * it can drive an authoritative calculation.
 */
export const AUTHORITATIVE_ORIGINS: ReadonlySet<Provenance> = new Set([
  "user_input",
  "user_confirmed",
  // Data retrieved from the user's own saved FRELUX project was entered
  // or verified through the app (e.g. a verified plan extraction), it
  // is authoritative, matching its ORIGIN_PRIORITY rank.
  "project_data",
  "engine_calculation",
  "market_data",
  "location_data",
]);

/** Trust states a value may hold while still being usable in a calculation. */
export const USABLE_TRUST: ReadonlySet<TrustStatus> = new Set([
  "user_confirmed",
  "system_verified",
]);

export type TrustEvent =
  | { type: "user_confirmed" }
  | { type: "user_edited"; value: AiFact["value"] }
  | { type: "user_rejected" }
  | { type: "system_verified"; validator: string; evidence?: string }
  | { type: "insufficient_evidence"; reason?: string };

/**
 * Classify the initial trust of a fact from its origin + confidence.
 * `detected` for inferences, usable states for authoritative origins.
 */
export function classifyFact(fact: Omit<AiFact, "trust">): TrustStatus {
  if (fact.confidence < 0.2) return "insufficient_evidence";
  if (fact.origin === "unknown") return "unknown";
  if (AUTHORITATIVE_ORIGINS.has(fact.origin)) {
    return "system_verified";
  }
  // smart defaults are visible assumptions, usable but clearly labelled,
  // the user can correct them any time (they are product defaults, not
  // AI inferences, so they do not block calculation).
  if (fact.origin === "smart_default") return "detected";
  return "needs_confirmation";
}

/** Create a fact with correct initial trust. */
export function createFact(fact: Omit<AiFact, "trust">): AiFact {
  return { ...fact, trust: classifyFact(fact) };
}

/**
 * Apply a trust event. The ONLY ways to reach a verified state are
 * an explicit user action or a deterministic validator. There is no
 * code path that upgrades an inference on its own.
 */
export function applyTrustEvent(
  fact: AiFact,
  event: TrustEvent,
  now = new Date().toISOString(),
): AiFact {
  const stamped = { ...fact, verifiedAt: now };
  switch (event.type) {
    case "user_confirmed":
      return {
        ...stamped,
        trust: "user_confirmed",
        origin: "user_confirmed",
        confidence: 1,
      };
    case "user_edited":
      return {
        ...stamped,
        trust: "corrected",
        origin: "user_confirmed",
        value: event.value,
        confidence: 1,
      };
    case "user_rejected":
      return { ...stamped, trust: "rejected", confidence: 0 };
    case "system_verified":
      return {
        ...stamped,
        trust: "system_verified",
        evidence: event.evidence ?? `Validated by ${event.validator}`,
      };
    case "insufficient_evidence":
      return {
        ...stamped,
        trust: "insufficient_evidence",
        confidence: 0,
        evidence: event.reason,
      };
  }
}

/**
 * May this fact's value be fed into an authoritative engine input?
 *
 * Authoritative origins: yes. Inferences: only when confirmed or
 * deterministically verified. Smart defaults: yes (they are product
 * defaults the engine already uses, but they are surfaced to the
 * user as assumptions and never hidden).
 */
export function canUseInCalculation(fact: AiFact): boolean {
  if (
    fact.trust === "rejected" ||
    fact.trust === "insufficient_evidence" ||
    fact.trust === "unknown"
  ) {
    return false;
  }
  if (fact.origin === "smart_default") return true;
  if (AUTHORITATIVE_ORIGINS.has(fact.origin)) return true;
  return USABLE_TRUST.has(fact.trust);
}

/**
 * Does this fact still require user attention before the task completes?
 * Used to build the "Please confirm" step, never silently skipped.
 */
export function requiresUserAttention(fact: AiFact): boolean {
  return fact.trust === "needs_confirmation";
}

// =========================================================
// INTEROP with existing vocabularies
// =========================================================

export type MeasurementVerificationState =
  | "manual_input"
  | "ai_detected"
  | "ai_detected_review_required"
  | "user_verified"
  | "imported"
  | "calculated"
  | "market_price_verified";

/** Map a foundation trust state to the pre-existing unified vocabulary. */
export function toMeasurementVerificationState(
  fact: AiFact,
): MeasurementVerificationState {
  if (fact.origin === "engine_calculation") return "calculated";
  if (fact.origin === "market_data") return "market_price_verified";
  if (fact.origin === "user_input") return "manual_input";
  if (fact.trust === "user_confirmed" || fact.trust === "corrected")
    return "user_verified";
  if (fact.trust === "needs_confirmation") return "ai_detected_review_required";
  if (fact.trust === "system_verified") return "imported";
  return "ai_detected";
}

export type ExtractionVerificationStatus =
  | "ai_detected"
  | "requires_confirmation"
  | "user_confirmed"
  | "user_edited"
  | "rejected";

/** Map a construction-extraction status to the foundation vocabulary. */
export function fromExtractionStatus(
  status: ExtractionVerificationStatus,
): TrustStatus {
  switch (status) {
    case "user_confirmed":
      return "user_confirmed";
    case "user_edited":
      return "corrected";
    case "rejected":
      return "rejected";
    case "requires_confirmation":
      return "needs_confirmation";
    default:
      return "detected";
  }
}

/** Human-readable badge for UI surfaces (no fake "verified" labels). */
export function trustBadge(fact: AiFact): string {
  switch (fact.trust) {
    case "user_confirmed":
      return "Confirmed by you";
    case "system_verified":
      return fact.origin === "engine_calculation"
        ? "Calculated by FRELUX engine"
        : "Verified";
    case "corrected":
      return "Corrected by you";
    case "rejected":
      return "Rejected";
    case "needs_confirmation":
      return "Needs your confirmation";
    case "insufficient_evidence":
      return "Insufficient evidence";
    case "unknown":
      return "Unknown origin";
    default:
      return "Detected, assumption";
  }
}
