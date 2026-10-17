// ============================================================
// ARCHIE SIMULATION ENGINE — TESTS
// Deterministic parse, numeric projection with shown
// derivation, qualitative honesty, zero-fabrication refusals.
// ============================================================

import { describe, expect, it } from "vitest";
import type { WorldTimelineTransition } from "../native-engine/engine.ts";
import {
  parseHypothetical,
  projectHypothetical,
} from "./simulation.ts";

function transitions(
  ...rows: Array<[string, string, string, string]>
): WorldTimelineTransition[] {
  return rows.map(([relation, fromValue, toValue, when]) => ({
    subject: "cement",
    relation,
    fromValue,
    toValue,
    fromObservedAt: "2026-09-01T00:00:00Z",
    toObservedAt: when,
    confidence: 0.8,
  }));
}

describe("parseHypothetical — deterministic", () => {
  it("parses a what-happens-if question", () => {
    expect(
      parseHypothetical("What happens if the price of cement rises 20%?"),
    ).toMatchObject({ subject: "price of cement", premise: "price of cement rises 20%" });
  });

  it("parses 'what if' and 'suppose' triggers", () => {
    expect(parseHypothetical("What if cement falls by 500?")?.subject).toBe("cement");
    expect(parseHypothetical("Suppose the site becomes flooded")?.subject).toBe("site");
  });

  it("articles stripped from the subject for world-model matching", () => {
    expect(parseHypothetical("What happens if the site doubles?")?.subject).toBe("site");
  });

  it("non-hypothetical questions return null (no misfire)", () => {
    expect(parseHypothetical("What is the price of cement?")).toBeNull();
    expect(parseHypothetical("How did the site change over time?")).toBeNull();
    expect(parseHypothetical("")).toBeNull();
  });

  it("determinism: same input → same parse", () => {
    const q = "What happens if cement rises 15% next quarter?";
    expect(parseHypothetical(q)).toEqual(parseHypothetical(q));
  });
});

describe("projectHypothetical — numeric projection with derivation", () => {
  const base = transitions(
    ["state", "4200", "4500", "2026-10-01T00:00:00Z"],
  );

  it("percent rise shows base + delta = projected, labeled PROJECTION", () => {
    const r = projectHypothetical(base, {
      subject: "cement",
      premise: "cement rises 20%",
    });
    expect(r.numeric).toBe(true);
    expect(r.text).toContain("PROJECTION, not an observation");
    expect(r.text).toContain("4500");
    expect(r.text).toContain("5400");
    expect(r.text).toContain("+ 20%");
    expect(r.text).toContain("4500 + 20%" as string);
    expect(r.confidence).toBeLessThanOrEqual(0.45);
  });

  it("percent fall projects down with the minus shown", () => {
    const r = projectHypothetical(base, {
      subject: "cement",
      premise: "cement falls 10%",
    });
    expect(r.text).toContain("4050");
    expect(r.text).toContain("- 10%");
  });

  it("doubles and halves", () => {
    const r1 = projectHypothetical(base, { subject: "cement", premise: "cement doubles" });
    expect(r1.text).toContain("9000");
    const r2 = projectHypothetical(base, { subject: "cement", premise: "cement halves" });
    expect(r2.text).toContain("2250");
  });

  it("absolute delta: falls by 500", () => {
    const r = projectHypothetical(base, { subject: "cement", premise: "cement falls by 500" });
    expect(r.text).toContain("4000");
  });

  it("refuses to invent downstream effects — stated, not hinted", () => {
    const r = projectHypothetical(base, { subject: "cement", premise: "cement rises 20%" });
    expect(r.text).toContain("will not invent downstream effects");
  });
});

describe("projectHypothetical — honesty boundaries", () => {
  it("no recorded observations → honest refusal, no projection", () => {
    const r = projectHypothetical([], { subject: "cement", premise: "cement rises 20%" });
    expect(r.numeric).toBe(false);
    expect(r.text).toContain("no recorded observations");
    expect(r.text).not.toContain("projected to");
  });

  it("qualitative premise lists the recorded basis and asks for follow-through", () => {
    const base = transitions(
      ["state", "muddy", "dry", "2026-10-05T00:00:00Z"],
    );
    const r = projectHypothetical(base, { subject: "site", premise: "site becomes flooded" });
    expect(r.numeric).toBe(false);
    expect(r.text).toContain("PROJECTION, not an observation");
    expect(r.text).toContain("muddy → dry");
    expect(r.text).toContain("will not invent downstream effects");
    expect(r.confidence).toBeLessThanOrEqual(0.45);
  });

  it("numeric premise but non-numeric records → qualitative path, no fake arithmetic", () => {
    const base = transitions(["state", "muddy", "dry", "2026-10-05T00:00:00Z"]);
    const r = projectHypothetical(base, { subject: "site", premise: "site rises 20%" });
    expect(r.numeric).toBe(false);
    expect(r.text).not.toContain("projected to");
  });

  it("determinism: same inputs → identical projection", () => {
    const base = transitions(["state", "4200", "4500", "2026-10-01T00:00:00Z"]);
    const run = () =>
      projectHypothetical(base, { subject: "cement", premise: "cement rises 20%" });
    expect(run()).toEqual(run());
  });
});
