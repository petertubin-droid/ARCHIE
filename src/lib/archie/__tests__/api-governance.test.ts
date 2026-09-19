// =========================================================
// API-GOVERNANCE TESTS (batch 23, fix 83)
// Only Owner/Admin configure subscriber limits;
// subscribers can NEVER alter their own limits; ARCHIE only
// with explicit owner authorization.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  API_ENFORCEMENT,
  API_KEYS_RLS_MODEL,
  canSubscriberAlterLimits,
  mayConfigureApiLimits,
  OWNER_ADMIN_CONFIGURED_FIELDS,
} from "@/lib/archie/api-governance";

describe("mayConfigureApiLimits", () => {
  it("allows OWNER and ADMIN", () => {
    expect(mayConfigureApiLimits("OWNER")).toEqual({ ok: true });
    expect(mayConfigureApiLimits("ADMIN")).toEqual({ ok: true });
  });

  it("refuses ARCHIE without explicit owner authorization", () => {
    const r = mayConfigureApiLimits("ARCHIE");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Owner's explicit authorization/i);
    expect(mayConfigureApiLimits("ARCHIE", true)).toEqual({ ok: true });
  });

  it("refuses subscribers absolutely", () => {
    const r = mayConfigureApiLimits("SUBSCRIBER");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/never increase, alter or bypass/i);
  });
});

describe("hard boundaries", () => {
  it("canSubscriberAlterLimits is statically false", () => {
    expect(canSubscriberAlterLimits()).toBe(false);
    expect(OWNER_ADMIN_CONFIGURED_FIELDS).toContain("daily_quota");
    expect(OWNER_ADMIN_CONFIGURED_FIELDS).toContain("scopes_and_permissions");
  });

  it("documents server-side enforcement and the fixed RLS model", () => {
    expect(API_ENFORCEMENT).toMatch(/server-side/i);
    expect(API_KEYS_RLS_MODEL.subscriber_write).toBe(false);
    expect(API_KEYS_RLS_MODEL.subscriber_select_own_metadata).toBe(true);
    expect(API_KEYS_RLS_MODEL.rationale).toMatch(
      /subscribers update their own rate_limit_per_minute/i,
    );
  });
});
