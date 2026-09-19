// =========================================================
// FRELUX ARCHIE EXTENSION, SOCIAL INTELLIGENCE
//
// For accounts the Owner explicitly connected and authorized,
// ARCHIE may analyze permitted information to understand
// audiences, identify performance patterns, recommend topics,
// posting strategies, captions/scripts, high-performing
// content, posting times, brand positioning, potential
// audiences, cross-platform strategies and international
// growth opportunities.
//
// HARD RULE: observed platform data, ARCHIE recommendations
// and ARCHIE assumptions are ALWAYS distinct, labeled record
// kinds. They are never merged or passed off as each other.
//
// Learning from connected accounts contributes to ARCHIE's
// understanding of brand strategy, audience preferences,
// content effectiveness, terminology, regional interests,
// campaign performance and communication patterns, but
// private information stays isolated and NEVER automatically
// becomes global FRELUX knowledge, and every platform's
// terms, permissions, privacy requirements and data
// restrictions are respected.
// =========================================================

import { mayArchieAccessAccount, type ConnectedSocialAccount } from "./social-connections";

export const SOCIAL_INTELLIGENCE_CAPABILITIES: readonly string[] = [
  "understand audience interests",
  "identify content-performance patterns",
  "recommend content topics",
  "recommend posting strategies",
  "generate captions, scripts and content concepts",
  "identify high-performing content",
  "recommend posting times",
  "analyze brand positioning",
  "identify potential audiences",
  "compare platform performance",
  "identify international growth opportunities",
  "recommend cross-platform content strategies",
];

export type InsightKind =
  | "OBSERVED_PLATFORM_DATA"
  | "ARCHIE_RECOMMENDATION"
  | "ARCHIE_ASSUMPTION";

export interface SocialInsight {
  kind: InsightKind;
  statement: string;
  /** For OBSERVED data: the platform metric/record this was
   *  read from. For RECOMMENDATIONS/ASSUMPTIONS: what observed
   *  data (if any) the statement builds on. */
  basis: string;
}

/** Build an insight report for an authorized account.
 *  Refuses accounts ARCHIE may not access and refuses any
 *  unlabeled statement. */
export function buildInsightReport(input: {
  account: ConnectedSocialAccount;
  insights: SocialInsight[];
}): { ok: boolean; error?: string; report?: SocialInsight[] } {
  const access = mayArchieAccessAccount(input.account);
  if (!access.ok) return { ok: false, error: access.error };
  if (input.insights.length === 0) {
    return { ok: false, error: "An insight report requires insights" };
  }
  for (const i of input.insights) {
    if (!i.statement.trim() || !i.basis.trim()) {
      return {
        ok: false,
        error: "Every insight requires a statement and a basis, unlabeled guesses are refused",
      };
    }
  }
  return { ok: true, report: input.insights };
}

/** Count of each labeled kind, used to prove separation of
 *  observed data from ARCHIE recommendations in reports. */
export function summarizeInsightKinds(report: readonly SocialInsight[]): Record<InsightKind, number> {
  const out: Record<InsightKind, number> = {
    OBSERVED_PLATFORM_DATA: 0,
    ARCHIE_RECOMMENDATION: 0,
    ARCHIE_ASSUMPTION: 0,
  };
  for (const i of report) out[i.kind] += 1;
  return out;
}

// ---------------------------------------------------------
// Social learning
// ---------------------------------------------------------
export const SOCIAL_LEARNING_TOPICS: readonly string[] = [
  "brand strategy",
  "audience preferences",
  "content effectiveness",
  "terminology",
  "regional interests",
  "campaign performance",
  "communication patterns",
];

/** Promotion of social-account information to global FRELUX
 *  knowledge requires explicit Owner verification, NEVER
 *  automatic. Private account data stays isolated. */
export const SOCIAL_DATA_PROMOTION_RULE =
  "Owner-verified promotion only. Private information from connected accounts is isolated and never automatically becomes global FRELUX knowledge.";

/** Platform respect: analyses must stay within the scopes
 *  the platform granted and the platform's terms, privacy
 *  requirements and data restrictions. */
export function withinGrantedScope(
  account: ConnectedSocialAccount,
  requestedScope: string,
): boolean {
  const access = mayArchieAccessAccount(account);
  if (!access.ok) return false;
  return account.scopes.includes(requestedScope) || account.scopes.includes("*");
}
