// =========================================================
// FRELUX PHASE 8b, OWNER CHANGE POLICY (pure logic)
//
// Which production changes require owner authorization, and
// which are additionally high-risk (engineering-review gate).
// Pure module: shared by the client, the edge function logic
// and the test suite.
// =========================================================
import type { OwnerChangeKind } from "./types";

export interface OwnerChangePolicy {
  changeKind: OwnerChangeKind;
  label: string;
  requiresEngineeringReview: boolean;
}

export const OWNER_CHANGE_POLICY: Readonly<
  Record<OwnerChangeKind, OwnerChangePolicy>
> = {
  CODE_CHANGE: {
    changeKind: "CODE_CHANGE",
    label: "FRELUX code change",
    requiresEngineeringReview: false,
  },
  CALCULATOR_ENGINE_CHANGE: {
    changeKind: "CALCULATOR_ENGINE_CHANGE",
    label: "Calculator engine change",
    requiresEngineeringReview: true,
  },
  DETERMINISTIC_LOGIC_CHANGE: {
    changeKind: "DETERMINISTIC_LOGIC_CHANGE",
    label: "Deterministic logic change",
    requiresEngineeringReview: true,
  },
  HIGH_RISK_CONFIG_CHANGE: {
    changeKind: "HIGH_RISK_CONFIG_CHANGE",
    label: "High-risk system configuration",
    requiresEngineeringReview: true,
  },
  KNOWLEDGE_PROMOTION: {
    changeKind: "KNOWLEDGE_PROMOTION",
    label: "Knowledge promotion",
    requiresEngineeringReview: false,
  },
  ARCHIE_MIGRATION: {
    changeKind: "ARCHIE_MIGRATION",
    label: "ARCHIE migration package (backup / migrate / restore)",
    // Migration moves ARCHIE's state between environments —
    // privileged and high-risk (spec §8, §24).
    requiresEngineeringReview: true,
  },
};

export function requiresOwnerAuth(changeKind: OwnerChangeKind): {
  ok: boolean;
  requiresEngineeringReview: boolean;
  error?: string;
} {
  const policy = OWNER_CHANGE_POLICY[changeKind];
  if (!policy) {
    return {
      ok: false,
      requiresEngineeringReview: false,
      error: `Unknown change kind: ${changeKind}`,
    };
  }
  return {
    ok: true,
    requiresEngineeringReview: policy.requiresEngineeringReview,
  };
}

export const HIGH_RISK_CHANGE_KINDS: readonly OwnerChangeKind[] = (
  Object.values(OWNER_CHANGE_POLICY) as OwnerChangePolicy[]
)
  .filter((p) => p.requiresEngineeringReview)
  .map((p) => p.changeKind);

// ---------------------------------------------------------
// Pure verification helpers shared with the edge function.
// Server-side only in production, but unit-testable here.
// ---------------------------------------------------------

/** Minimum owner-secret strength (checked server-side too). */
export function isSecretStrongEnough(secret: string): boolean {
  return secret.length >= 12 && !/^(.)\1+$/.test(secret);
}

/** PBKDF2 iteration count fixed by policy. */
export const OWNER_SECRET_ITERATIONS = 310_000;

/**
 * Constant-time-ish comparison for derived hashes. Both sides
 * are fixed-length base64 strings.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
