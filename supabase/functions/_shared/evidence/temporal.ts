// =========================================================
// ARCHIE EVIDENCE & TRUTH ENGINE — TEMPORAL TRUTH
//
// Spec §12: a statement can be historically supported,
// currently supported, future-dated, expired, superseded or
// undetermined. Old information is NEVER automatically
// current. All judgments come from STORED dates only —
// nothing is invented.
// =========================================================

import type { ClaimRecord, TemporalState } from "./types.ts";

function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Evaluate the temporal validity of a claim at `now`.
 * Pure function over the claim's stored temporal metadata.
 */
export function evaluateTemporalValidity(
  claim: Pick<
    ClaimRecord,
    | "applicable_from"
    | "applicable_until"
    | "supersedes_claim_id"
    | "retrieved_at"
  > & { version?: number },
  now: string,
): TemporalState {
  const nowMs = ts(now) ?? 0;
  const from = ts(claim.applicable_from);
  const until = ts(claim.applicable_until);

  // Superseded: a newer version of this information exists.
  if (claim.supersedes_claim_id) return "SUPERSEDED";

  if (from !== null && from > nowMs) return "FUTURE_DATED";
  if (until !== null && until < nowMs) return "EXPIRED";
  if (from !== null) return "HISTORICAL"; // began in the past, not expired
  if (until !== null && until >= nowMs) return "CURRENT";

  // No applicable window at all: validity cannot be
  // determined from temporal metadata alone — honest answer.
  return "UNDETERMINED";
}

/** Whether a temporal state means the claim is currently
 *  applicable. UNDETERMINED (no temporal metadata at all —
 *  nothing restricts the claim) counts as applicable: absent
 *  restrictions never expire a claim, and absence of
 *  evidence of expiry is not evidence of expiry. */
export function isCurrentlyApplicable(state: TemporalState): boolean {
  return (
    state === "CURRENT" || state === "HISTORICAL" || state === "UNDETERMINED"
  );
}
