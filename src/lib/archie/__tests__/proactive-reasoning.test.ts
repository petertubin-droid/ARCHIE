// =========================================================
// PROACTIVE-REASONING TESTS (batch 22, fix 79)
// Nine-lens frames with mandatory cited evidence; surfacing
// policy by severity with evidence bar and dedupe; sweeps
// never return silence.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  ALL_LENSES,
  buildReasoningFrame,
  rankFindings,
  recordSweep,
  shouldSurface,
  type ProactiveFinding,
  type ReasoningAnswer,
} from "@/lib/archie/proactive-reasoning";

function answer(
  lens: ReasoningAnswer["lens"],
  over: Partial<ReasoningAnswer> = {},
): ReasoningAnswer {
  return { lens, statement: "s", evidence: ["e"], confidence: 0.5, ...over };
}

describe("buildReasoningFrame", () => {
  it("builds a frame and records unanswered lenses as gaps", () => {
    const r = buildReasoningFrame("Paint coverage", [
      answer("WHAT"),
      answer("WHY"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.frame.unansweredLenses).toEqual(
        ALL_LENSES.filter((l) => l !== "WHAT" && l !== "WHY"),
      );
    }
  });

  it("refuses an empty subject", () => {
    expect(buildReasoningFrame("  ", [])).toMatchObject({ ok: false });
  });

  it("refuses unknown lenses and empty statements", () => {
    expect(buildReasoningFrame("s", [answer("NOPE" as never)])).toMatchObject({
      ok: false,
    });
    expect(
      buildReasoningFrame("s", [answer("WHAT", { statement: " " })]),
    ).toMatchObject({ ok: false });
  });

  it("refuses statements without cited evidence — no evidence → GAP", () => {
    const r = buildReasoningFrame("s", [answer("WHAT", { evidence: [] })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/record it as a GAP instead/i);
  });

  it("refuses confidence outside 0..1 and duplicate lenses", () => {
    expect(
      buildReasoningFrame("s", [answer("WHAT", { confidence: 1.5 })]),
    ).toMatchObject({ ok: false });
    expect(
      buildReasoningFrame("s", [answer("WHAT"), answer("WHAT")]),
    ).toMatchObject({ ok: false });
  });
});

function finding(over: Partial<ProactiveFinding> = {}): ProactiveFinding {
  return {
    id: "f1",
    title: "Coverage drift in calculator",
    detail: "d",
    severity: "HIGH",
    origin: "src/lib/calc.ts",
    evidence: ["diff shown"],
    created_at: 100,
    ...over,
  };
}

describe("shouldSurface — the surfacing policy", () => {
  it("never surfaces findings without evidence (evidence bar)", () => {
    const r = shouldSurface(finding({ evidence: [] }), []);
    expect(r).toMatchObject({ surface: false, mode: "REPORT_ONLY" });
    expect(r.reason).toMatch(/not surfaced until evidenced/i);
  });

  it("suppresses duplicates by origin + normalized title", () => {
    const dup = shouldSurface(
      finding({ title: "Coverage  DRIFT in calculator!" }),
      [finding()],
    );
    expect(dup).toMatchObject({ surface: false });
  });

  it("surfaces CRITICAL/HIGH immediately, MEDIUM as digest, LOW in reports", () => {
    expect(shouldSurface(finding({ severity: "CRITICAL" }), [])).toMatchObject({
      surface: true,
      mode: "IMMEDIATE",
    });
    expect(shouldSurface(finding({ severity: "HIGH" }), [])).toMatchObject({
      surface: true,
      mode: "IMMEDIATE",
    });
    expect(shouldSurface(finding({ severity: "MEDIUM" }), [])).toMatchObject({
      surface: true,
      mode: "DIGEST",
    });
    expect(shouldSurface(finding({ severity: "LOW" }), [])).toMatchObject({
      surface: false,
      mode: "REPORT_ONLY",
    });
  });
});

describe("rankFindings", () => {
  it("orders by severity first, then newest first", () => {
    const ranked = rankFindings([
      finding({ id: "low", severity: "LOW", created_at: 500 }),
      finding({ id: "high-new", severity: "HIGH", created_at: 200 }),
      finding({ id: "high-old", severity: "HIGH", created_at: 100 }),
      finding({ id: "crit", severity: "CRITICAL", created_at: 1 }),
    ]);
    expect(ranked.map((f) => f.id)).toEqual([
      "crit",
      "high-new",
      "high-old",
      "low",
    ]);
  });
});

describe("recordSweep", () => {
  it("filters unevidenced findings and records an explicit all-clear", () => {
    const sweep = recordSweep("frelux:calculators", [
      finding({ evidence: [] }),
    ]);
    expect(sweep.all_clear).toBe(true);
    expect(sweep.findings).toHaveLength(0);
    expect(sweep.note).toMatch(/All clear recorded explicitly/i);
  });

  it("keeps evidenced findings and never returns silence", () => {
    const sweep = recordSweep("frelux:calculators", [
      finding(),
      finding({ id: "f2", evidence: [] }),
    ]);
    expect(sweep.all_clear).toBe(false);
    expect(sweep.findings).toHaveLength(1);
    expect(sweep.note).toMatch(/1 evidenced finding\(s\)/i);
  });
});
