// =========================================================
// ADVERTISING-INTELLIGENCE TESTS (batch 23, fix 89)
// Recommendations need an observed basis (never fabricated);
// retargeting/exclusion needs legal+technical confirmation;
// spend authority is the Owner's alone.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  AD_SPEND_AUTHORITY,
  authorizeCampaignAction,
  canArchieSpend,
  prepareAdRecommendation,
} from "@/lib/archie/advertising-intelligence";

describe("prepareAdRecommendation", () => {
  const base = {
    kind: "creative_direction" as const,
    recommendation: "Lead with the coverage calculator in creative",
    observed_basis: "Heatmap shows 60% drop-off before the calculator",
  };

  it("requires an observed basis — audience info is never fabricated", () => {
    const r = prepareAdRecommendation({ ...base, observed_basis: "" });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toMatch(/never fabricates audience information/i);
  });

  it("requires recommendation content", () => {
    expect(prepareAdRecommendation({ ...base, recommendation: " " }).ok).toBe(
      false,
    );
  });

  it("requires legal+technical confirmation for retargeting/exclusion", () => {
    const r = prepareAdRecommendation({
      ...base,
      kind: "retargeting_opportunity" as never,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/legally and technically permitted/i);
    const ok = prepareAdRecommendation({
      ...base,
      kind: "retargeting_opportunity" as never,
      legally_and_technically_permitted: true,
    });
    expect(ok.ok).toBe(true);
  });
});

describe("spend authority", () => {
  it("keeps every spend/material change behind the Owner", () => {
    expect(canArchieSpend()).toBe(false);
    expect(AD_SPEND_AUTHORITY.archie_may_spend_advertising_money).toBe(false);
    expect(authorizeCampaignAction("ARCHIE").ok).toBe(false);
    expect(authorizeCampaignAction("OWNER")).toEqual({ ok: true });
  });
});
