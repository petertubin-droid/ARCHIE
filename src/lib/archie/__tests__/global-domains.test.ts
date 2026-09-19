// =========================================================
// GLOBAL-DOMAINS TESTS (batch 26, fix 107)
// The global expansion registry is honest data: every domain
// is labeled, active and risk-classed; authorization-gated
// domains are a subset of the registry (gated ≠ unstudiable).
// =========================================================

import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_GATED_DOMAINS,
  GLOBAL_EXPANSION_DOMAINS,
} from "@/lib/archie/global-domains";

describe("GLOBAL_EXPANSION_DOMAINS", () => {
  it("is an extensible registry with honest, complete entries", () => {
    expect(GLOBAL_EXPANSION_DOMAINS.length).toBeGreaterThan(15);
    for (const d of GLOBAL_EXPANSION_DOMAINS) {
      expect(d.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(d.label.trim().length).toBeGreaterThan(2);
      expect(["STANDARD", "ENGINEERING_REVIEW", "DETERMINISTIC"]).toContain(
        d.risk_class,
      );
    }
  });

  it("keeps every domain active — no silently disabled knowledge", () => {
    const inactive = GLOBAL_EXPANSION_DOMAINS.filter((d) => !d.active);
    expect(inactive).toEqual([]);
  });

  it("covers engineering, market and security domains globally", () => {
    const keys = GLOBAL_EXPANSION_DOMAINS.map((d) => d.key);
    expect(keys).toContain("cybersecurity");
    expect(keys).toContain("cloud_infrastructure");
    expect(keys).toContain("emerging_technologies");
  });
});

describe("AUTHORIZATION_GATED_DOMAINS", () => {
  it("gates exactly the security-operational domains, all of which exist in the registry", () => {
    expect([...AUTHORIZATION_GATED_DOMAINS]).toEqual([
      "cybersecurity",
      "defensive_security",
      "penetration_testing",
      "vulnerability_research",
      "secure_architecture",
    ]);
    for (const key of AUTHORIZATION_GATED_DOMAINS) {
      expect(GLOBAL_EXPANSION_DOMAINS.some((d) => d.key === key)).toBe(true);
    }
  });
});
