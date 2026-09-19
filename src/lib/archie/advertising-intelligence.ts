// =========================================================
// FRELUX ARCHIE EXTENSION, TARGETED ADVERTISING INTELLIGENCE
//
// ARCHIE may analyze permitted advertising/audience
// information and recommend geographic markets, customer
// segments, construction/property audiences, professional
// audiences, campaign objectives, creative direction, budget
// strategies, audience exclusions, campaign experiments and
// retargeting opportunities (where legally and technically
// permitted).
//
// HARD RULES:
//   * Never fabricate audience information, every
//     recommendation requires an observed basis.
//   * ARCHIE never spends advertising money and never
//     materially changes campaigns without the required
//     Owner authorization.
// =========================================================

export type AdRecommendationKind =
  | "geographic_market"
  | "customer_segment"
  | "construction_property_audience"
  | "professional_audience"
  | "campaign_objective"
  | "creative_direction"
  | "budget_strategy"
  | "audience_exclusion"
  | "campaign_experiment"
  | "retargeting_opportunity";

export const AD_RECOMMENDATION_KINDS: readonly AdRecommendationKind[] = [
  "geographic_market",
  "customer_segment",
  "construction_property_audience",
  "professional_audience",
  "campaign_objective",
  "creative_direction",
  "budget_strategy",
  "audience_exclusion",
  "campaign_experiment",
  "retargeting_opportunity",
];

export interface AdRecommendation {
  kind: AdRecommendationKind;
  recommendation: string;
  /** The observed data the recommendation builds on.
   *  Recommendations without an observed basis are refused :
   *  ARCHIE never fabricates audience information. */
  observed_basis: string;
  /** Retargeting recommendations must confirm legal and
   *  technical permission. */
  legally_and_technically_permitted?: boolean;
}

export function prepareAdRecommendation(input: {
  kind: AdRecommendationKind;
  recommendation: string;
  observed_basis: string;
  legally_and_technically_permitted?: boolean;
}): { ok: boolean; error?: string; rec?: AdRecommendation } {
  if (!input.observed_basis.trim()) {
    return {
      ok: false,
      error: "Advertising recommendations require an observed basis, ARCHIE never fabricates audience information",
    };
  }
  if (!input.recommendation.trim()) {
    return { ok: false, error: "A recommendation requires content" };
  }
  if (
    (input.kind === "retargeting_opportunity" || input.kind === "audience_exclusion") &&
    input.legally_and_technically_permitted !== true
  ) {
    return {
      ok: false,
      error: "Retargeting/exclusion recommendations require confirmation they are legally and technically permitted",
    };
  }
  return {
    ok: true,
    rec: {
      kind: input.kind,
      recommendation: input.recommendation,
      observed_basis: input.observed_basis,
      legally_and_technically_permitted: input.legally_and_technically_permitted,
    },
  };
}

// ---------------------------------------------------------
// Spend & campaign-change authority
// ---------------------------------------------------------

export const AD_SPEND_AUTHORITY = {
  archie_may_send_campaigns: false,
  archie_may_spend_advertising_money: false,
  archie_may_materially_change_campaigns: false,
  requires: "authenticated Owner authorization for every spend or material campaign change",
} as const;

/** Can ARCHIE spend or materially change campaigns on its own? */
export function canArchieSpend(): false {
  return false;
}

/** The only path to authorized spend/change, the Owner. */
export function authorizeCampaignAction(actor: "ARCHIE" | "OWNER"): {
  ok: boolean;
  error?: string;
} {
  if (actor !== "OWNER") {
    return {
      ok: false,
      error: "Only the Owner authorizes advertising spend or material campaign changes",
    };
  }
  return { ok: true };
}
