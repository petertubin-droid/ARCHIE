import { describe, expect, it } from "vitest";
import {
  buildFeedFacts,
  formatValidatedKnowledge,
  type NativeFactRow,
} from "./feed-core.ts";

describe("tree feed roots — candidate facts from FRELUX usage", () => {
  it("builds aggregate-only facts (never user data)", () => {
    const facts = buildFeedFacts(
      [
        { usage_date: "2026-10-17", uses_consumed: 12 },
        { usage_date: "2026-10-16", uses_consumed: 8 },
      ],
      [
        { feature_key: "copilot", credits_spent: 40, runs: 10 },
        { feature_key: "plan_extraction", credits_spent: 100, runs: 4 },
      ],
      3,
    );
    expect(facts).toHaveLength(3);
    const usage = facts.find((f) => f.id === "frelux-usage-estimation-30d")!;
    expect(usage.object).toEqual({ uses: 20, days: 2 });
    expect(usage.provenance.source).toBe("frelux-usage");
    expect(usage.status).toBe("candidate");
    // no user ids anywhere
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain("user_id");
  });

  it("orders AI features by credits and caps at top 5", () => {
    const features = Array.from({ length: 7 }, (_, i) => ({
      feature_key: `f${i}`,
      credits_spent: i * 10,
      runs: i + 1,
    }));
    const facts = buildFeedFacts([], features, 0);
    const byFeature = facts.find((f) => f.id === "frelux-usage-ai-features-30d")!;
    const object = byFeature.object as { top_features: string[] };
    expect(object.top_features).toHaveLength(5);
    expect(object.top_features[0]).toContain("f6");
  });

  it("records the open gap count as a candidate fact", () => {
    const facts = buildFeedFacts([], [], 7);
    const gaps = facts.find((f) => f.id === "frelux-usage-knowledge-gaps")!;
    expect(gaps.object).toEqual({ open_gaps: 7 });
  });
});

describe("oxygen release — validated knowledge only", () => {
  const validated: NativeFactRow = {
    id: "f1",
    subject: "cement",
    predicate: "cures_to_full_strength_in",
    object: "28 days",
    confidence: 0.9,
    provenance: { source: "owner" },
    status: "validated",
  };
  const candidate: NativeFactRow = {
    id: "f2",
    subject: "secret topic",
    predicate: "p",
    object: "v",
    confidence: 0.5,
    provenance: { source: "research" },
    status: "candidate",
  };

  it("returns ONLY validated facts — candidates never leak to FRELUX", () => {
    const out = formatValidatedKnowledge([validated, candidate]);
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe("cement");
    expect(out[0].text).toContain("28 days");
  });

  it("plain sentences, no confidence or provenance narration", () => {
    const out = formatValidatedKnowledge([validated]);
    expect(out[0].text).not.toContain("confidence");
    expect(out[0].text).not.toContain("%");
    expect(out[0].text).not.toContain("provenance");
  });

  it("respects the limit", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      ...validated,
      id: `x${i}`,
    }));
    expect(formatValidatedKnowledge(rows, 20)).toHaveLength(20);
  });
});
