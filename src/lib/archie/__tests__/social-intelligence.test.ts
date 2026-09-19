// =========================================================
// SOCIAL-INTELLIGENCE TESTS (batch 24, fix 95)
// Only Owner-connected brand accounts; observed data,
// recommendations and assumptions stay labeled and separate;
// scope checks respect platform grants.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  buildInsightReport,
  SOCIAL_DATA_PROMOTION_RULE,
  summarizeInsightKinds,
  withinGrantedScope,
  type SocialInsight,
} from "@/lib/archie/social-intelligence";
import type { ConnectedSocialAccount } from "@/lib/archie/social-connections";

function account(
  over: Partial<ConnectedSocialAccount> = {},
): ConnectedSocialAccount {
  return {
    platform: "instagram",
    account_handle: "@frelux",
    status: "CONNECTED",
    connection_kind: "OWNER_BRAND_ACCOUNT",
    scopes: ["basic_profile", "insights"],
    owner_explicitly_authorized: true,
    ...over,
  } as ConnectedSocialAccount;
}

describe("buildInsightReport", () => {
  it("refuses accounts ARCHIE may not access", () => {
    const thirdParty = buildInsightReport({
      account: account({
        connection_kind: "SUBSCRIBER" as never,
        owner_explicitly_authorized: true,
      }),
      insights: [],
    });
    expect(thirdParty.ok).toBe(false);
    expect(
      buildInsightReport({
        account: account({ owner_explicitly_authorized: false }),
        insights: [],
      }).ok,
    ).toBe(false);
    expect(
      buildInsightReport({
        account: account({ status: "DISCONNECTED" as never }),
        insights: [],
      }).ok,
    ).toBe(false);
  });

  it("refuses empty reports and unlabeled guesses", () => {
    const empty = buildInsightReport({ account: account(), insights: [] });
    expect(empty.ok).toBe(false);
    const unlabeled = buildInsightReport({
      account: account(),
      insights: [
        { kind: "ARCHIE_RECOMMENDATION", statement: "post more", basis: " " },
      ] as SocialInsight[],
    });
    expect(unlabeled.ok).toBe(false);
    if (!unlabeled.ok)
      expect(unlabeled.error).toMatch(/unlabeled guesses are refused/i);
  });

  it("returns the labeled report as-is (kinds never merged)", () => {
    const insights: SocialInsight[] = [
      {
        kind: "OBSERVED_PLATFORM_DATA",
        statement: "reach up 12%",
        basis: "insights API",
      },
      {
        kind: "ARCHIE_RECOMMENDATION",
        statement: "post at 7pm",
        basis: "observed engagement peak",
      },
      {
        kind: "ARCHIE_ASSUMPTION",
        statement: "audience skews professional",
        basis: "comment tone",
      },
    ];
    const r = buildInsightReport({ account: account(), insights });
    expect(r.ok).toBe(true);
    expect(r.report).toEqual(insights);
    expect(summarizeInsightKinds(insights)).toEqual({
      OBSERVED_PLATFORM_DATA: 1,
      ARCHIE_RECOMMENDATION: 1,
      ARCHIE_ASSUMPTION: 1,
    });
  });
});

describe("scope and promotion rules", () => {
  it("respects granted scopes only (wildcard honored)", () => {
    expect(withinGrantedScope(account(), "insights")).toBe(true);
    expect(withinGrantedScope(account(), "dm_read")).toBe(false);
    expect(withinGrantedScope(account({ scopes: ["*"] }), "dm_read")).toBe(
      true,
    );
    expect(
      withinGrantedScope(
        account({ owner_explicitly_authorized: false }),
        "insights",
      ),
    ).toBe(false);
  });

  it("never auto-promotes private account data to global knowledge", () => {
    expect(SOCIAL_DATA_PROMOTION_RULE).toMatch(/never automatically/i);
  });
});
