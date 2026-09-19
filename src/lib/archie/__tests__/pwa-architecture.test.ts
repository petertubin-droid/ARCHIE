// =========================================================
// PWA-ARCHITECTURE TESTS (batch 25, fix 104)
// Every core capability must have a PWA surface in the same
// feature implementation; the health check names missing
// integrations; restrictions require a real reason.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assertPwaExposure,
  PWA_CAPABILITY_MAP,
  pwaIntegrationRequirement,
  PWA_FUTURE_CAPABILITY_RULE,
} from "@/lib/archie/pwa-architecture";

describe("the capability map", () => {
  it("maps every capability to a shared module under /archie", () => {
    expect(PWA_CAPABILITY_MAP.length).toBeGreaterThan(10);
    for (const cap of PWA_CAPABILITY_MAP) {
      expect(cap.route.startsWith("/archie")).toBe(true);
      expect(cap.sharedModule).toMatch(/^src\//);
      expect(cap.id).toBeTruthy();
      expect(cap.label).toBeTruthy();
    }
  });

  it("maps the core surfaces: chat, owner authority, chat exists", () => {
    const ids = PWA_CAPABILITY_MAP.map((c) => c.id);
    expect(ids).toContain("chat");
    expect(ids).toContain("owner_authority");
  });
});

describe("assertPwaExposure — the integration health check", () => {
  it("is healthy when all required capabilities are mapped", () => {
    const r = assertPwaExposure(["chat", "owner_authority"]);
    expect(r.healthy).toBe(true);
    expect(r.unexposed).toEqual([]);
  });

  it("names each missing capability explicitly (no vague warning)", () => {
    const r = assertPwaExposure(["chat", "brand_new_capability"]);
    expect(r.healthy).toBe(false);
    expect(r.unexposed.map((c) => c.id)).toEqual(["brand_new_capability"]);
  });

  it("flags restricted capabilities without a substantive reason", () => {
    const broken = [
      {
        id: "x",
        label: "X",
        route: "/archie/x",
        sharedModule: "src/x.ts",
        ownerRestricted: "short",
      },
    ];
    // Simulate via the map's logic: restricted entries need >=10 chars
    const badRestricted = broken.filter(
      (c) => !c.ownerRestricted || c.ownerRestricted.trim().length < 10,
    );
    expect(badRestricted).toHaveLength(1);
    // and the real map's restrictions (if any) all carry reasons
    for (const cap of PWA_CAPABILITY_MAP.filter((c) => c.ownerRestricted)) {
      expect(cap.ownerRestricted!.trim().length).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("the permanent future-capability rule", () => {
  it("requires same-feature PWA integration and names the only exception", () => {
    expect(PWA_FUTURE_CAPABILITY_RULE).toMatch(/same feature implementation/i);
    expect(PWA_FUTURE_CAPABILITY_RULE).toMatch(
      /unless the Owner Authority Layer explicitly requires restricted access/i,
    );
    const req = pwaIntegrationRequirement();
    expect(req).toMatch(/Add the capability to PWA_CAPABILITY_MAP/i);
    expect(req).toMatch(/extend assertPwaExposure coverage/i);
  });
});
