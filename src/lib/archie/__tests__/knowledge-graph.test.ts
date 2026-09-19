// =========================================================
// KNOWLEDGE-GRAPH TESTS (batch 22, fix 80)
// Typed links with guards, numeric contradiction detection
// with region semantics, evidence-ranked resolution that
// always defers to a human, gap identification, retrieval
// ranking.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  connectKnowledge,
  detectContradictions,
  evidenceRank,
  identifyGaps,
  rankForQuestion,
  regionsOverlap,
  resolveConflict,
  type KnowledgeNode,
} from "@/lib/archie/knowledge-graph";

function node(over: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: "n1",
    domain: "architecture",
    topic: "paint-coverage",
    region: null,
    scope: "GLOBAL",
    evidence_state: "USER_CONFIRMED",
    confidence: 0.6,
    content: { liters_per_10m2: 1.2 },
    version: 1,
    ingested_at: "2026-09-10T00:00:00Z",
    ...over,
  };
}

describe("evidenceRank", () => {
  it("ranks ACTUAL_OUTCOME strongest and unknown states at 99", () => {
    expect(evidenceRank("ACTUAL_OUTCOME")).toBe(0);
    expect(evidenceRank("SYSTEM_VERIFIED")).toBeGreaterThan(
      evidenceRank("ACTUAL_OUTCOME"),
    );
    expect(evidenceRank("BOGUS" as never)).toBe(99);
  });
});

describe("connectKnowledge guards", () => {
  it("refuses self-links and rolled-back items", () => {
    const a = node();
    expect(
      connectKnowledge(a, a, "SUPPORTS", { created_by: "x", reason: "r" }).ok,
    ).toBe(false);
    expect(
      connectKnowledge(
        a,
        node({ id: "rb", status: "ROLLED_BACK" }),
        "SUPPORTS",
        {
          created_by: "x",
          reason: "r",
        },
      ).ok,
    ).toBe(false);
  });

  it("SUPERSEDES only flows newer → older", () => {
    const older = node({ id: "old", ingested_at: "2026-09-01T00:00:00Z" });
    const newer = node({ id: "new", ingested_at: "2026-09-10T00:00:00Z" });
    expect(
      connectKnowledge(newer, older, "SUPERSEDES", {
        created_by: "x",
        reason: "r",
      }).ok,
    ).toBe(true);
    const bad = connectKnowledge(older, newer, "SUPERSEDES", {
      created_by: "x",
      reason: "r",
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/newer item to supersede the older/i);
  });
});

describe("regionsOverlap semantics", () => {
  it("treats null as GLOBAL and refuses to overlap two different regions", () => {
    expect(regionsOverlap(null, "lagos")).toBe(true);
    expect(regionsOverlap("lagos", null)).toBe(true);
    expect(regionsOverlap("lagos", "lagos")).toBe(true);
    expect(regionsOverlap("lagos", "nairobi")).toBe(false);
  });
});

describe("detectContradictions", () => {
  it("flags conflicting numeric facts in the same domain/topic/region", () => {
    const records = detectContradictions([
      node({ id: "a", content: { liters: 2 } }),
      node({ id: "b", content: { liters: 5 } }),
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].item_a_id).toBe("a");
    expect(records[0].item_b_id).toBe("b");
    expect(records[0].status).toBe("OPEN");
    expect(records[0].detail).toMatch(/field "liters": 2 vs 5/);
  });

  it("does NOT flag regional differences or matching values", () => {
    expect(
      detectContradictions([
        node({ id: "a", region: "lagos", content: { liters: 2 } }),
        node({ id: "b", region: "nairobi", content: { liters: 5 } }),
      ]),
    ).toHaveLength(0);
    expect(
      detectContradictions([
        node({ id: "a", content: { liters: 2 } }),
        node({ id: "b", content: { liters: 2 } }),
      ]),
    ).toHaveLength(0);
  });

  it("ignores rolled-back knowledge", () => {
    expect(
      detectContradictions([
        node({ id: "a", content: { liters: 2 } }),
        node({ id: "b", status: "ROLLED_BACK", content: { liters: 9 } }),
      ]),
    ).toHaveLength(0);
  });
});

describe("resolveConflict", () => {
  it("ranks by evidence state then confidence, and always defers to a human", () => {
    const r = resolveConflict([
      node({ id: "guess", evidence_state: "USER_CONFIRMED", confidence: 0.9 }),
      node({
        id: "measured",
        evidence_state: "ACTUAL_OUTCOME",
        confidence: 0.2,
      }),
    ]);
    expect(r).not.toBeNull();
    expect(r!.winner_id).toBe("measured");
    expect(r!.loser_ids).toEqual(["guess"]);
    expect(r!.requires_human_decision).toBe(true);
    expect(r!.rationale).toMatch(/human closes the contradiction/i);
  });

  it("returns null below two items", () => {
    expect(resolveConflict([node()])).toBeNull();
  });
});

describe("identifyGaps", () => {
  it("reports coverage, verification and confidence gaps honestly", () => {
    const gaps = identifyGaps(
      [
        node({
          domain: "construction",
          confidence: 0.3,
          evidence_state: "ESTIMATED",
        }),
      ],
      [{ key: "construction" }, { key: "climate_environment" }],
    );
    const types = gaps.map((g) => g.gap_type);
    expect(types).toContain("COVERAGE");
    expect(types).toContain("VERIFICATION");
    expect(types).toContain("CONFIDENCE");
  });
});

describe("rankForQuestion", () => {
  it("prefers matching domain, overlapping region and stronger evidence", () => {
    const ranked = rankForQuestion(
      { domain: "architecture", region: "lagos" },
      [
        node({ id: "other-domain", domain: "construction", region: "lagos" }),
        node({
          id: "match",
          domain: "architecture",
          region: "lagos",
          evidence_state: "ACTUAL_OUTCOME",
        }),
        node({
          id: "weak",
          domain: "architecture",
          region: "nairobi",
          evidence_state: "USER_CONFIRMED",
          confidence: 0.1,
        }),
      ],
    );
    expect(ranked[0].node.id).toBe("match");
    expect(ranked[ranked.length - 1].node.id).not.toBe("match");
  });
});
