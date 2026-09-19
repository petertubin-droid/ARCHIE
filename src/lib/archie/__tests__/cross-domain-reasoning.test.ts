// =========================================================
// CROSS-DOMAIN-REASONING TESTS (batch 22, fix 81)
// Reasoning follows REGISTERED relations only; unconnected
// domains are excluded with an explicit reason; unregistered
// claimed connections are flagged, never accepted.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assertRelationJustified,
  DOMAIN_RELATIONS,
  relationBetween,
  selectRelevantDomains,
} from "@/lib/archie/cross-domain-reasoning";

describe("relationBetween", () => {
  it("finds relations in both directions", () => {
    expect(relationBetween("architecture", "construction")?.relation).toBe(
      "executed_through",
    );
    expect(relationBetween("construction", "architecture")?.relation).toBe(
      "executed_through",
    );
  });

  it("returns undefined for unregistered pairs", () => {
    expect(relationBetween("architecture", "weather")).toBeUndefined();
  });
});

describe("selectRelevantDomains — BFS over registered relations", () => {
  const ALL = ["architecture", "construction", "costing", "weather"];

  it("selects domains within the hop budget and excludes the rest explicitly", () => {
    // architecture → construction (hop 1); construction → costing (hop 2)
    const one = selectRelevantDomains({
      anchor_domains: ["architecture"],
      all_domains: ALL,
      max_hops: 1,
    });
    expect(one.selected).toContain("architecture");
    expect(one.selected).toContain("construction");
    expect(one.selected).not.toContain("costing");
    expect(one.excluded.some((e) => e.domain === "costing")).toBe(true);

    const two = selectRelevantDomains({
      anchor_domains: ["architecture"],
      all_domains: ALL,
      max_hops: 2,
    });
    expect(two.selected).toContain("costing");
  });

  it("never fabricates context for unconnected domains", () => {
    const r = selectRelevantDomains({
      anchor_domains: ["architecture"],
      all_domains: ALL,
      max_hops: 2,
    });
    const weather = r.excluded.find((e) => e.domain === "weather");
    expect(weather?.reason).toMatch(/never fabricated/i);
  });

  it("ignores anchor domains not present in all_domains", () => {
    const r = selectRelevantDomains({
      anchor_domains: ["architecture", "ghost"],
      all_domains: ALL,
      max_hops: 1,
    });
    expect(r.selected).not.toContain("ghost");
  });
});

describe("assertRelationJustified", () => {
  it("accepts registered relations and flags unregistered claims", () => {
    expect(
      assertRelationJustified("architecture", "construction"),
    ).toMatchObject({
      ok: true,
    });
    const bad = assertRelationJustified("architecture", "weather");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/explicit registered relation/i);
  });
});

describe("DOMAIN_RELATIONS integrity", () => {
  it("every registered relation carries a rationale", () => {
    for (const r of DOMAIN_RELATIONS) {
      expect(r.rationale.trim().length).toBeGreaterThan(10);
    }
  });
});
