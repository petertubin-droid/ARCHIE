// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, DATA FRESHNESS (§17)
//
// Every prediction considers data age. A prediction built on old
// data can NEVER look equivalent to one built on current data.
// Thresholds align with the market-intelligence price-validator
// (fresh ≤ 30d, recent ≤ 90d) so project data and market data
// age on the same scale.
// =========================================================

import type {
  ConfidenceAssessment,
  ConfidenceBand,
  DataFreshness,
} from "./types";

export const FRESH_MAX_AGE_DAYS = 30;
export const STALE_MAX_AGE_DAYS = 90;

/** Days between two ISO instants (fractional, ≥ 0). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return Number.POSITIVE_INFINITY;
  return Math.max(0, (to - from) / (1000 * 60 * 60 * 24));
}

/** Classify the age of a dated value relative to the analysis time. */
export function classifyFreshness(
  recordedAt: string | null | undefined,
  nowIso: string,
): DataFreshness {
  if (!recordedAt) return "unavailable";
  const days = daysBetween(recordedAt, nowIso);
  if (days <= FRESH_MAX_AGE_DAYS) return "current";
  if (days <= STALE_MAX_AGE_DAYS) return "stale";
  return "outdated";
}

/** The most conservative freshness across a set of dated records. */
export function worstFreshness(
  dates: Array<string | null | undefined>,
  nowIso: string,
): DataFreshness {
  if (dates.length === 0) return "unavailable";
  const order: Record<DataFreshness, number> = {
    current: 0,
    stale: 1,
    outdated: 2,
    unavailable: 3,
  };
  return dates.reduce<DataFreshness>((worst, d) => {
    const f = classifyFreshness(d, nowIso);
    return order[f] > order[worst] ? f : worst;
  }, "current");
}

// ---------------------------------------------------------
// Deterministic confidence (§14/§18)
// ---------------------------------------------------------

/**
 * Confidence from measurable data properties ONLY:
 *   score = coverage × 0.5 + freshness × 0.3 + verification × 0.2
 *
 * - coverage:   fraction of required data points present
 * - freshness:  1 (current) / 0.6 (stale) / 0.2 (outdated) / 0 (unavailable)
 * - verification: fraction of evidence that is user/system/admin-verified
 *
 * The formula is public, deterministic and shown verbatim in `method`.
 */
export function assessConfidence(input: {
  coverage: number; // 0–1, required data points present
  freshness: DataFreshness;
  verifiedShare: number; // 0–1, share of evidence rows that are verified
  context: string; // e.g. "cost overrun", for the method text
}): ConfidenceAssessment {
  const clampedCoverage = Math.max(0, Math.min(1, input.coverage));
  const clampedVerified = Math.max(0, Math.min(1, input.verifiedShare));
  const freshnessScore =
    input.freshness === "current"
      ? 1
      : input.freshness === "stale"
        ? 0.6
        : input.freshness === "outdated"
          ? 0.2
          : 0;
  const score =
    Math.round(
      (clampedCoverage * 0.5 + freshnessScore * 0.3 + clampedVerified * 0.2) *
        100,
    ) / 100;
  const band: ConfidenceBand =
    score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low";
  return {
    score,
    band,
    method: `${input.context}: coverage ${(clampedCoverage * 100).toFixed(0)}% ×0.5 + freshness ${input.freshness} ×0.3 + verified evidence ${(clampedVerified * 100).toFixed(0)}% ×0.2 → ${score.toFixed(2)}`,
  };
}

/** Share of evidence entries that come from verified sources. */
export function verifiedShareOf(
  evidence: Array<{ verification: string }>,
): number {
  if (evidence.length === 0) return 0;
  const verified = evidence.filter(
    (e) =>
      e.verification === "user_recorded" ||
      e.verification === "user_confirmed" ||
      e.verification === "system_verified" ||
      e.verification === "admin_verified",
  ).length;
  return verified / evidence.length;
}
