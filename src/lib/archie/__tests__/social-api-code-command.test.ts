// =========================================================
// FRELUX ARCHIE EXTENSION TESTS, SOCIAL INTELLIGENCE, API
// GOVERNANCE & CODE COMMAND CONTROL
// =========================================================
import { describe, it, expect } from "vitest";

import {
  listSocialPlatforms,
  registerSocialPlatform,
  isPasswordConnectionAllowed,
  transitionConnection,
  mayArchieAccessAccount,
  TOKEN_GOVERNANCE,
  type ConnectedSocialAccount,
} from "../social-connections";
import {
  SOCIAL_INTELLIGENCE_CAPABILITIES,
  buildInsightReport,
  summarizeInsightKinds,
  SOCIAL_LEARNING_TOPICS,
  SOCIAL_DATA_PROMOTION_RULE,
  withinGrantedScope,
  type SocialInsight,
} from "../social-intelligence";
import {
  AD_RECOMMENDATION_KINDS,
  prepareAdRecommendation,
  canArchieSpend,
  authorizeCampaignAction,
  AD_SPEND_AUTHORITY,
} from "../advertising-intelligence";
import {
  OWNER_ADMIN_CONFIGURED_FIELDS,
  mayConfigureApiLimits,
  canSubscriberAlterLimits,
  API_KEYS_RLS_MODEL,
  API_ENFORCEMENT,
} from "../api-governance";
import {
  CODE_COMMAND_WORKFLOW,
  NOT_AUTHORIZATION,
  isAuthorization,
  beginCodeModification,
  advanceCodeCommand,
  buildCodeModificationRecord,
  OWNER_SECRET_SURFACES_FORBIDDEN,
} from "../code-command";
import {
  ARCHIE_CAN,
  ARCHIE_DOES_NOT,
  OPERATING_MODEL,
  isWithinBoundary,
} from "../authority-boundary";

const ownerAccount = (over: Partial<ConnectedSocialAccount> = {}): ConnectedSocialAccount => ({
  platform: "youtube",
  account_handle: "@FRELUX",
  status: "CONNECTED",
  connection_kind: "OWNER_BRAND_ACCOUNT",
  scopes: ["read_insights", "read_content"],
  owner_explicitly_authorized: true,
  ...over,
});

// =========================================================
// 1. Owner-only social media connection
// =========================================================
describe("extension 1: owner-only social connections", () => {
  it("supports the required platforms via their official mechanisms", () => {
    const platforms = listSocialPlatforms().map((p) => p.platform.toString());
    for (const p of ["google", "youtube", "facebook", "instagram", "whatsapp", "tiktok", "x", "linkedin"]) {
      expect(platforms).toContain(p);
    }
    for (const p of listSocialPlatforms()) {
      expect(["oauth2", "official_sign_in"]).toContain(p.auth_mechanism);
      expect(p.requires_owner_app_credentials.length).toBeGreaterThan(0);
    }
  });

  it("is extensible to additional legitimate platforms", () => {
    const before = listSocialPlatforms().length;
    const res = registerSocialPlatform({
      platform: "pinterest",
      label: "Pinterest",
      auth_mechanism: "oauth2",
      oauth_authorize_url: "https://www.pinterest.com/oauth/",
      requires_owner_app_credentials: ["PINTEREST_APP_ID"],
      note: "Official Pinterest OAuth.",
    });
    expect(res.ok).toBe(true);
    expect(listSocialPlatforms().length).toBe(before + 1);
    expect(
      registerSocialPlatform({
        platform: "bad",
        label: "Bad",
        auth_mechanism: "oauth2",
        oauth_authorize_url: "",
        requires_owner_app_credentials: [],
        note: "",
      }).ok,
    ).toBe(false);
  });

  it("never stores passwords, OAuth tokens only, encrypted server-side", () => {
    expect(isPasswordConnectionAllowed()).toBe(false);
    expect(TOKEN_GOVERNANCE.password_storage).toContain("NEVER");
    expect(TOKEN_GOVERNANCE.storage).toContain("server-side encrypted vault");
  });

  it("walks CONNECT → VIEW PERMISSIONS → SYNC → DISCONNECT → REVOKE", () => {
    expect(transitionConnection("DISCONNECTED", "CONNECT")).toEqual({ ok: true, next: "CONNECT_PENDING" });
    expect(transitionConnection("CONNECT_PENDING", "CONNECT").ok).toBe(false);
    expect(transitionConnection("CONNECTED", "VIEW PERMISSIONS").next).toBe("CONNECTED");
    expect(transitionConnection("CONNECTED", "SYNC")).toEqual({ ok: true, next: "SYNCED" });
    expect(transitionConnection("DISCONNECTED", "SYNC").ok).toBe(false);
    expect(transitionConnection("SYNCED", "DISCONNECT").next).toBe("DISCONNECTED");
    expect(transitionConnection("CONNECTED", "REVOKE ACCESS").next).toBe("DISCONNECTED");
    expect(transitionConnection("DISCONNECTED", "REVOKE ACCESS").ok).toBe(false);
  });

  it("ARCHIE may access ONLY owner-connected, explicitly authorized accounts", () => {
    expect(mayArchieAccessAccount(ownerAccount()).ok).toBe(true);
    // not the owner's brand account
    expect(mayArchieAccessAccount(ownerAccount({ connection_kind: "SUBSCRIBER_ACCOUNT" as never })).ok).toBe(false);
    // not explicitly authorized
    expect(mayArchieAccessAccount(ownerAccount({ owner_explicitly_authorized: false })).ok).toBe(false);
    // not connected
    expect(mayArchieAccessAccount(ownerAccount({ status: "DISCONNECTED" })).ok).toBe(false);
  });
});

// =========================================================
// 2. Social intelligence
// =========================================================
describe("extension 2: social intelligence", () => {
  it("covers all analysis capabilities", () => {
    for (const cap of [
      "understand audience interests",
      "recommend posting times",
      "analyze brand positioning",
      "identify international growth opportunities",
      "recommend cross-platform content strategies",
      "generate captions, scripts and content concepts",
    ]) {
      expect(SOCIAL_INTELLIGENCE_CAPABILITIES).toContain(cap);
    }
  });

  it("separates observed platform data from ARCHIE recommendations and assumptions", () => {
    const insights: SocialInsight[] = [
      { kind: "OBSERVED_PLATFORM_DATA", statement: "Tile content has 3x average watch time", basis: "youtube analytics: last 90 days" },
      { kind: "ARCHIE_RECOMMENDATION", statement: "Prioritize tile installation shorts", basis: "youtube analytics: last 90 days" },
      { kind: "ARCHIE_ASSUMPTION", statement: "Audience skews professional", basis: "no demographic data granted" },
    ];
    const r = buildInsightReport({ account: ownerAccount(), insights });
    expect(r.ok).toBe(true);
    const kinds = summarizeInsightKinds(r.report!);
    expect(kinds.OBSERVED_PLATFORM_DATA).toBe(1);
    expect(kinds.ARCHIE_RECOMMENDATION).toBe(1);
    expect(kinds.ARCHIE_ASSUMPTION).toBe(1);
    // unlabeled guesses are refused
    expect(
      buildInsightReport({ account: ownerAccount(), insights: [{ kind: "OBSERVED_PLATFORM_DATA", statement: "x", basis: "  " }] }).ok,
    ).toBe(false);
    // unauthorized accounts are refused
    expect(
      buildInsightReport({ account: ownerAccount({ owner_explicitly_authorized: false }), insights }).ok,
    ).toBe(false);
  });

  it("respects granted scopes and keeps learning isolated", () => {
    const acct = ownerAccount();
    expect(withinGrantedScope(acct, "read_insights")).toBe(true);
    expect(withinGrantedScope(acct, "read_private_messages")).toBe(false);
    expect(SOCIAL_LEARNING_TOPICS).toContain("campaign performance");
    expect(SOCIAL_DATA_PROMOTION_RULE).toContain("never automatically");
  });
});

// =========================================================
// 3. Targeted advertising intelligence
// =========================================================
describe("extension 3: advertising intelligence", () => {
  it("recommends across the full kind set but never fabricates", () => {
    expect(AD_RECOMMENDATION_KINDS.length).toBe(10);
    // no observed basis → refused
    expect(
      prepareAdRecommendation({ kind: "geographic_market", recommendation: "target Lagos", observed_basis: "" }).ok,
    ).toBe(false);
    const rec = prepareAdRecommendation({
      kind: "geographic_market",
      recommendation: "Target Lagos mainland first",
      observed_basis: "65% of estimate downloads originate from Lagos (observed in app analytics)",
    });
    expect(rec.ok).toBe(true);
    // retargeting requires legal+technical permission confirmation
    expect(
      prepareAdRecommendation({ kind: "retargeting_opportunity", recommendation: "retarget estimators", observed_basis: "web session data" }).ok,
    ).toBe(false);
    expect(
      prepareAdRecommendation({
        kind: "retargeting_opportunity",
        recommendation: "retarget estimators",
        observed_basis: "web session data",
        legally_and_technically_permitted: true,
      }).ok,
    ).toBe(true);
  });

  it("never spends or materially changes campaigns without Owner authorization", () => {
    expect(canArchieSpend()).toBe(false);
    expect(authorizeCampaignAction("ARCHIE").ok).toBe(false);
    expect(authorizeCampaignAction("OWNER").ok).toBe(true);
    expect(AD_SPEND_AUTHORITY.requires).toContain("Owner");
  });
});

// =========================================================
// 5. API subscriber limits
// =========================================================
describe("extension 5: API subscriber limit governance", () => {
  it("covers every owner/admin-configured field", () => {
    for (const field of [
      "endpoints", "capabilities", "rate_limits", "daily_quota", "monthly_quota",
      "multimodal_access", "subscription_entitlements", "scopes_and_permissions", "environment_access",
    ]) {
      expect(OWNER_ADMIN_CONFIGURED_FIELDS).toContain(field);
    }
  });

  it("subscribers can never alter limits; ARCHIE only with explicit owner authorization", () => {
    expect(canSubscriberAlterLimits()).toBe(false);
    expect(mayConfigureApiLimits("SUBSCRIBER").ok).toBe(false);
    expect(mayConfigureApiLimits("ARCHIE").ok).toBe(false);
    expect(mayConfigureApiLimits("ARCHIE", true).ok).toBe(true);
    expect(mayConfigureApiLimits("OWNER").ok).toBe(true);
    expect(mayConfigureApiLimits("ADMIN").ok).toBe(true);
  });

  it("documents the RLS fix that closed the self-escalation hole", () => {
    expect(API_KEYS_RLS_MODEL.subscriber_write).toBe(false);
    expect(API_KEYS_RLS_MODEL.rationale).toContain("update their own rate_limit_per_minute");
    expect(API_ENFORCEMENT).toBe("server-side (service-role key row is the single source of truth)");
  });
});


// =========================================================
// 6. Owner-only code modification
// =========================================================
describe("extension 6: code command control", () => {
  it("fixes the workflow order", () => {
    expect(CODE_COMMAND_WORKFLOW).toEqual([
      "OWNER COMMAND", "ARCHIE UNDERSTANDS", "INSPECT", "PLAN", "PROPOSE",
      "WRITE/TEST IN ISOLATION", "OWNER AUTHORIZATION", "APPLY",
      "REGRESSION TEST", "AUDIT", "VERSION", "DEPLOY",
    ]);
  });

  it("nothing except the owner's explicit authorized command is authorization", () => {
    expect(NOT_AUTHORIZATION).toContain("a detected bug");
    expect(NOT_AUTHORIZATION).toContain("a warning");
    expect(NOT_AUTHORIZATION).toContain("a recommendation");
    expect(NOT_AUTHORIZATION).toContain("a conversation");
    expect(NOT_AUTHORIZATION).toContain("ARCHIE's own decision");
    expect(NOT_AUTHORIZATION).toContain("an API subscriber request");
    for (const source of [
      "a detected bug",
      "a warning in the build",
      "ARCHIE's own decision to fix it",
      "an API subscriber request",
      "a conversation about the fix",
      "a recommendation from the review",
    ]) {
      expect(isAuthorization(source).authorized).toBe(false);
    }
    expect(isAuthorization("the owner's explicit command, server-verified").authorized).toBe(true);
  });

  it("refuses to begin without server-verified owner identity", () => {
    expect(beginCodeModification({ command_text: "fix the roof formula", owner_identity: "o", server_verified: false }).ok).toBe(false);
    expect(beginCodeModification({ command_text: "", owner_identity: "o", server_verified: true }).ok).toBe(false);
    expect(
      beginCodeModification({ command_text: "fix the roof formula", owner_identity: "owner-1", server_verified: true }),
    ).toEqual({ ok: true, stage: "ARCHIE UNDERSTANDS" });
  });

  it("ARCHIE advances to the gate; only server-verified owner authorization applies", () => {
    expect(advanceCodeCommand("ARCHIE UNDERSTANDS", "ARCHIE").next).toBe("INSPECT");
    expect(advanceCodeCommand("PLAN", "ARCHIE").next).toBe("PROPOSE");
    expect(advanceCodeCommand("PROPOSE", "ARCHIE").next).toBe("WRITE/TEST IN ISOLATION");
    // the gate: ARCHIE cannot pass OWNER AUTHORIZATION alone
    expect(advanceCodeCommand("WRITE/TEST IN ISOLATION", "ARCHIE").ok).toBe(false);
    expect(advanceCodeCommand("WRITE/TEST IN ISOLATION", "OWNER").ok).toBe(false);
    expect(
      advanceCodeCommand("WRITE/TEST IN ISOLATION", "OWNER", { server_verified_approval: true }).next,
    ).toBe("APPLY");
    // beyond the gate: owner-driven only
    expect(advanceCodeCommand("APPLY", "ARCHIE").ok).toBe(false);
    expect(advanceCodeCommand("APPLY", "OWNER").next).toBe("REGRESSION TEST");
    // sensitive changes keep the additional audit gate
    expect(
      advanceCodeCommand("AUDIT", "OWNER", { sensitive_change: true }).ok,
    ).toBe(false);
    expect(
      advanceCodeCommand("AUDIT", "OWNER", { sensitive_change: true, server_verified_approval: true }).next,
    ).toBe("VERSION");
  });

  it("records every authorized modification with identity, change, components, version, tests, timestamp, approval and rollback", () => {
    const base = {
      owner_identity: "owner-1",
      requested_change: "Round cement quantities to 2dp",
      affected_components: ["src/lib/calc.ts"],
      version: "1.2.0",
      tests: ["calc.test.ts"],
      timestamp: "2026-09-08T10:00:00Z",
      approval: { server_verified: true as const, authorization_record_id: "srv-1" },
      rollback: "git revert <sha>",
    };
    expect(buildCodeModificationRecord(base).ok).toBe(true);
    expect(buildCodeModificationRecord({ ...base, affected_components: [] }).ok).toBe(false);
    expect(buildCodeModificationRecord({ ...base, rollback: "" }).ok).toBe(false);
    expect(buildCodeModificationRecord({ ...base, approval: { server_verified: true, authorization_record_id: "" } }).ok).toBe(false);
    expect(buildCodeModificationRecord({ ...base, tests: [] }).ok).toBe(false);
  });

  it("forbids owner secrets on every exposed surface", () => {
    for (const surface of [
      "frontend source", "browser storage", "AI prompts", "voice transcripts",
      "ordinary logs", "public database fields", "API responses", "PDFs", "client-side JavaScript",
    ]) {
      expect(OWNER_SECRET_SURFACES_FORBIDDEN).toContain(surface);
    }
  });
});

// =========================================================
// 8. Absolute authority boundary
// =========================================================
describe("extension 8: absolute authority boundary", () => {
  it("states the complete CAN list", () => {
    for (const can of [
      "understand FRELUX",
      "understand its code",
      "learn programming and cybersecurity",
      "identify and explain bugs, warnings and vulnerabilities",
      "prepare and test fixes",
      "manage intelligence from Owner-authorized social accounts",
      "recommend targeted marketing strategies",
      "monitor permitted FRELUX activity for trust and safety",
      "assist with escrow and transaction intelligence",
    ]) {
      expect(ARCHIE_CAN).toContain(can);
    }
  });

  it("states the complete DOES-NOT list and enforces it", () => {
    for (const not of [
      "grant itself permissions",
      "access accounts the Owner has not authorized",
      "modify protected code without the Owner's explicit authorized command",
      "spend money without required authorization",
      "alter subscriber API limits without Owner authority",
      "bypass platform security or authentication",
      "store social-media passwords",
    ]) {
      expect(ARCHIE_DOES_NOT).toContain(not);
    }
    expect(isWithinBoundary("ARCHIE may prepare and test fixes").ok).toBe(true);
    expect(isWithinBoundary("ARCHIE may grant itself permissions").ok).toBe(false);
    expect(isWithinBoundary("ARCHIE may store social-media passwords").ok).toBe(false);
    expect(OPERATING_MODEL.archie).toContain("80%");
    expect(OPERATING_MODEL.owner).toContain("20%");
  });
});
