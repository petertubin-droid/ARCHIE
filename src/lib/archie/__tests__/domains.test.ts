// =========================================================
// DOMAINS TESTS (batch 28, fix 123)
// The domain registry is honest data with no artificial
// ceiling: every seed domain complete and active, the
// architecture core always present, duplicates refused,
// and the verification bar (risk class + math capability)
// forces engineering review where it must.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ARCHIE_SEED_DOMAINS,
  archieDomains,
  ArchieDomainRegistry,
  PROTECTED_DOMAIN_KEYS,
} from "@/lib/archie/domains";

describe("ARCHIE_SEED_DOMAINS — honest, complete registry entries", () => {
  it("carries label, description, risk class and active state for every domain", () => {
    expect(ARCHIE_SEED_DOMAINS.length).toBeGreaterThan(8);
    for (const d of ARCHIE_SEED_DOMAINS) {
      expect(d.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(d.label.trim().length).toBeGreaterThan(2);
      expect((d.description ?? "").trim().length).toBeGreaterThan(20);
      expect(["STANDARD", "ENGINEERING_REVIEW", "DETERMINISTIC"]).toContain(
        d.risk_class,
      );
      expect(d.active).toBe(true); // no silently disabled seed domains
    }
  });

  it("keeps exactly one core domain: architecture", () => {
    const cores = ARCHIE_SEED_DOMAINS.filter((d) => d.is_core);
    expect(cores).toHaveLength(1);
    expect(cores[0].key).toBe("architecture");
  });
});

describe("ArchieDomainRegistry — the registry contract", () => {
  it("reads, lists actives, and exposes risk classes with a STANDARD default", () => {
    const r = new ArchieDomainRegistry();
    expect(r.exists("construction")).toBe(true);
    expect(r.get("construction")!.label).toBeTruthy();
    expect(r.list().every((d) => d.active)).toBe(true);
    expect(r.riskClass("structural")).toBe("DETERMINISTIC"); // structural math is deterministic
    expect(r.riskClass("nonexistent_domain")).toBe("STANDARD");
  });

  it("adds any legitimate domain (no ceiling) and refuses duplicates", () => {
    const r = new ArchieDomainRegistry();
    r.addDomain({
      key: "test_registry_domain",
      label: "T",
      is_core: false,
      risk_class: "STANDARD",
      active: true,
      description: "temp",
    });
    expect(r.exists("test_registry_domain")).toBe(true);
    expect(() => r.addDomain({ ...r.get("construction")! })).toThrow(
      /already exists/i,
    );
  });

  it("always finds the core domain and throws if it is missing", () => {
    expect(archieDomains.getCore().key).toBe("architecture");
    const r = new ArchieDomainRegistry(
      ARCHIE_SEED_DOMAINS.filter((d) => !d.is_core),
    );
    expect(() => r.getCore()).toThrow(/core domain.*missing/i);
  });

  it("forces engineering review for high-risk domains and math capabilities", () => {
    const r = new ArchieDomainRegistry();
    expect(r.requiresEngineeringReview("structural")).toBe(true);
    expect(r.requiresEngineeringReview("planning_productivity")).toBe(false);
    expect(
      r.requiresEngineeringReview("planning_productivity", "painting"),
    ).toBe(true); // a deterministic math capability
  });

  it("protects the architecture core keys", () => {
    for (const key of PROTECTED_DOMAIN_KEYS) {
      expect(archieDomains.get(key)).toBeDefined();
    }
    expect([...PROTECTED_DOMAIN_KEYS]).toContain("safety");
  });

  it("seeds the singleton with seed + global expansion domains", () => {
    expect(archieDomains.exists("cybersecurity")).toBe(true); // global expansion
    expect(archieDomains.exists("construction")).toBe(true); // FRELUX seed
  });
});
