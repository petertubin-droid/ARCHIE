// =========================================================
// ARCHIE GLOBAL INTELLIGENCE — KNOWLEDGE VALIDATION (§11)
//
// Every piece of learned knowledge carries its validation
// state and full provenance:
//
//   VERIFIED        — passed human verification (the existing
//                     EXTERNAL_SOURCE_VERIFIED bar)
//   OWNER_PROVIDED  — supplied directly by the Owner
//   CONFIGURED      — FRELUX/system configuration (the
//                     authoritative source for calculators)
//   INFERRED        — reasoned from evidence, labeled as such
//   UNVERIFIED      — observed but not yet verified
//
// Rules:
//  - An UNVERIFIED item is NEVER silently converted to fact.
//  - INFERRED knowledge always states its basis.
//  - Confidence decays with age; stale knowledge surfaces as
//    needing re-validation instead of being trusted forever.
//  - Configured values are never overridden by observations
//    (market-intelligence.ts contract, unchanged).
// =========================================================

export type ValidationState =
  "VERIFIED" | "OWNER_PROVIDED" | "CONFIGURED" | "INFERRED" | "UNVERIFIED";

/** Allowed state transitions. The only path to VERIFIED from
 *  UNVERIFIED passes through human verification; ARCHIE can
 *  never verify its own knowledge. */
const VALIDATION_TRANSITIONS: Record<
  ValidationState,
  readonly ValidationState[]
> = {
  UNVERIFIED: ["VERIFIED", "INFERRED"], // VERIFIED requires human evidence; INFERRED records a basis
  INFERRED: ["VERIFIED", "UNVERIFIED"],
  OWNER_PROVIDED: [], // terminal — owner statements stand as given
  CONFIGURED: [], // terminal — configuration is authoritative
  VERIFIED: ["UNVERIFIED"], // re-opened only when new evidence contradicts
};

export function canTransition(
  from: ValidationState,
  to: ValidationState,
): boolean {
  return VALIDATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Which states count as fact for reasoning. */
export function isFact(state: ValidationState): boolean {
  return (
    state === "VERIFIED" || state === "OWNER_PROVIDED" || state === "CONFIGURED"
  );
}

/** A validated knowledge record. */
export interface ValidatedKnowledge {
  key: string;
  domain: string;
  statement: string;
  validation_state: ValidationState;
  /** Provenance (§11): every record names its source. */
  source: string;
  /** ISO date the knowledge was learned. */
  learned_at: string;
  confidence: number; // 0..1
  /** Version of the knowledge item (monotonic). */
  version: number;
  /** Jurisdiction / context the knowledge applies to. */
  jurisdiction?: string;
  /** For INFERRED: the basis is mandatory. */
  inference_basis?: string;
  /** For VERIFIED: human verification evidence pointer. */
  verification_evidence?: string;
}

/** Confidence decay: knowledge loses weight as it ages, so
 *  stale facts resurface for re-validation instead of being
 *  trusted forever. Half-life model in days. */
export function decayedConfidence(
  k: ValidatedKnowledge,
  now = new Date(),
): number {
  const HALF_LIFE_DAYS = 365;
  const learned = new Date(k.learned_at).getTime();
  const days = Math.max(0, (now.getTime() - learned) / (1000 * 60 * 60 * 24));
  const factor = Math.pow(0.5, days / HALF_LIFE_DAYS);
  return k.confidence * factor;
}

/** A record needs re-validation when its decayed confidence
 *  has fallen below the bar for its state. */
export function needsRevalidation(
  k: ValidatedKnowledge,
  now = new Date(),
): boolean {
  const threshold = k.validation_state === "VERIFIED" ? 0.4 : 0.5;
  return decayedConfidence(k, now) < threshold;
}

/**
 * Register learned knowledge. Enforces the §11 contract:
 *  - every field of provenance present
 *  - INFERRED requires inference_basis
 *  - VERIFIED requires verification_evidence AND cannot be
 *    reached by ARCHIE — callers must pass humanVerified=true
 *    only from the human verification step (governance.ts).
 */
export function registerKnowledge(
  input: Omit<ValidatedKnowledge, "version"> & {
    humanVerified?: boolean;
    previousVersion?: number;
  },
): { ok: true; knowledge: ValidatedKnowledge } | { ok: false; error: string } {
  const state = input.validation_state;

  if (state === "VERIFIED") {
    if (!input.humanVerified) {
      return {
        ok: false,
        error:
          "VERIFIED is only reachable through human verification. ARCHIE cannot verify its own knowledge.",
      };
    }
    if (!input.verification_evidence?.trim()) {
      return {
        ok: false,
        error: "VERIFIED knowledge requires verification evidence.",
      };
    }
  }
  if (state === "INFERRED" && !input.inference_basis?.trim()) {
    return {
      ok: false,
      error: "INFERRED knowledge requires its inference basis.",
    };
  }
  if (state === "OWNER_PROVIDED" && input.source !== "OWNER") {
    return {
      ok: false,
      error: "OWNER_PROVIDED knowledge must name the Owner as source.",
    };
  }
  if (input.confidence < 0 || input.confidence > 1) {
    return { ok: false, error: "Confidence must be within 0..1." };
  }

  return {
    ok: true,
    knowledge: {
      ...input,
      version: (input.previousVersion ?? 0) + 1,
    },
  };
}

/** Rank candidates by decayed confidence before retrieval. */
export function rankForRetrieval(
  items: readonly ValidatedKnowledge[],
  now = new Date(),
): ValidatedKnowledge[] {
  return [...items].sort(
    (a, b) => decayedConfidence(b, now) - decayedConfidence(a, now),
  );
}

/**
 * Evidence labeling for reasoning output: statements derived
 * from unverified knowledge are always labeled, so no
 * unverified observation is ever presented as fact.
 */
export function labelStatement(
  k: ValidatedKnowledge,
  now = new Date(),
): string {
  const c = decayedConfidence(k, now);
  const stale = needsRevalidation(k, now);
  if (k.validation_state === "UNVERIFIED") {
    return `[UNVERIFIED · confidence ${c.toFixed(2)}] ${k.statement}`;
  }
  if (k.validation_state === "INFERRED") {
    return `[INFERRED · confidence ${c.toFixed(2)}] ${k.statement}`;
  }
  if (stale) {
    return `[${k.validation_state} · aging, revalidate] ${k.statement}`;
  }
  return k.statement;
}
