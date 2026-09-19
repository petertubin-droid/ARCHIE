// Tests for ARCHIE's FRELUX Code Intelligence: provenance
// classification, the nine-step trace chain, evidence-gated
// findings, and owner-approval-gated patches.

import { describe, expect, it } from "vitest";
import {
  applyPatch,
  approvePatch,
  AUDITED_CLEAN_EVIDENCE,
  EDGE_FUNCTION_SCAN_RESULT,
  FRELUX_AUDIT_BASELINE,
  FRELUX_CODEBASE_LAYERS,
  proposePatch,
  recordCodeFinding,
  testPatch,
  TRACE_STEPS,
  validateTrace,
  type TraceStepRecord,
} from "../code-intelligence";
import { AuthorizationRegistry } from "../capability-authority";

const NOW = 1_800_000_000_000;

/** A fully honest, deterministic trace. */
function realTrace(): TraceStepRecord[] {
  const loc = (i: number) => `src/lib/measurement/step${i}.ts:${i}`;
  return TRACE_STEPS.map((step, i) => ({
    step,
    location: loc(i + 1),
    provenance: "REAL_DETERMINISTIC_CODE" as const,
    evidence: `verified deterministic logic for ${step}`,
  }));
}

describe("§codebase inventory", () => {
  it("covers every layer ARCHIE must understand", () => {
    for (const expected of [
      "calculators",
      "measurement_engine",
      "pricing",
      "waste_rules",
      "unit_conversions",
      "edge_functions",
      "build_to_roof",
      "image_estimation",
      "pdf_generation",
    ]) {
      expect(FRELUX_CODEBASE_LAYERS).toContain(expected);
    }
  });
});

describe("§calculation trace chain", () => {
  it("defines the full nine-step chain in order", () => {
    expect(TRACE_STEPS).toEqual([
      "USER_INPUT",
      "VALIDATION",
      "MEASUREMENT",
      "RULES",
      "FORMULA",
      "MATERIAL_QUANTITY",
      "WASTE",
      "ROUNDING",
      "RESULT",
    ]);
  });

  it("accepts a real deterministic trace", () => {
    const v = validateTrace(realTrace());
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.disclosures).toHaveLength(0);
      expect(v.notes).toHaveLength(9);
    }
  });

  it("rejects a trace with a missing step — a UI number proves nothing", () => {
    const steps = realTrace().filter((s) => s.step !== "WASTE");
    const v = validateTrace(steps);
    expect(v.valid).toBe(false);
    if (!v.valid) {
      expect(v.step).toBe("WASTE");
      expect(v.reason).toContain("proves nothing");
    }
  });

  it("rejects placeholder provenance anywhere in the chain", () => {
    const steps = realTrace();
    steps[4] = {
      step: "FORMULA",
      location: "src/lib/example.ts:10",
      provenance: "PLACEHOLDER",
      evidence: "theoretical = buckets * 20; // placeholder",
    };
    const v = validateTrace(steps);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toContain("PLACEHOLDER");
  });

  it("rejects hardcoded fallback provenance and requires owner review", () => {
    const steps = realTrace();
    steps[3] = {
      step: "RULES",
      location: "src/lib/calc.ts:386",
      provenance: "HARDCODED_FALLBACK",
      evidence:
        "falls back to hardcoded surface-condition factor when DB config absent",
    };
    const v = validateTrace(steps);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.ownerReviewRequired).toBe(true);
  });

  it("requires disclosure of AI inference — valid but never silent", () => {
    const steps = realTrace();
    steps[8] = {
      step: "RESULT",
      location: "supabase/functions/ai-building-estimation/index.ts",
      provenance: "AI_INFERENCE",
      evidence: "result produced by model inference from image",
    };
    const v = validateTrace(steps);
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.disclosures.join(" ")).toContain("AI_INFERENCE");
  });

  it("rejects steps with no evidence — no fake success", () => {
    const steps = realTrace();
    steps[2] = {
      step: "MEASUREMENT",
      location: "src/lib/x.ts:1",
      provenance: "REAL_DETERMINISTIC_CODE",
      evidence: "   ",
    };
    const v = validateTrace(steps);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toContain("no evidence");
  });
});

describe("§code findings — evidence-gated", () => {
  it("refuses findings without real observed evidence", () => {
    const r = recordCodeFinding({
      layer: "pricing",
      type: "MOCK_RESULT",
      location: "src/lib/example.ts:5",
      evidence: "",
    });
    expect(r.ok).toBe(false);
  });

  it("sends unknown-rule findings to OWNER_REVIEW, never invents a fix", () => {
    const r = recordCodeFinding({
      layer: "material_rules",
      type: "DUPLICATED_RULE",
      location: "src/lib/estimation/paint-engine.ts",
      evidence: "two live engines for paint estimation",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finding.status).toBe("OWNER_REVIEW");
  });

  it("opens findings where a fix is known", () => {
    const r = recordCodeFinding({
      layer: "material_rules",
      type: "HARDCODED_VALUE",
      location: "src/lib/calc.ts:386",
      evidence: "hardcoded fallback factors",
      proposedFix: "Migrate factors to admin configuration",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.finding.status).toBe("OPEN");
  });

  it("the audit baseline carries file:line evidence for every finding", () => {
    expect(FRELUX_AUDIT_BASELINE.length).toBeGreaterThan(0);
    for (const f of FRELUX_AUDIT_BASELINE) {
      expect(f.evidence.trim().length).toBeGreaterThan(0);
      expect(f.location).toMatch(/\.ts|table|function|:/);
    }
  });

  it("clean-audit evidence is recorded honestly, not as a blanket pass", () => {
    for (const c of AUDITED_CLEAN_EVIDENCE) {
      expect(c.evidence).toContain("comment");
    }
  });

  it("edge-function scan reports missing entry points truthfully", () => {
    expect(EDGE_FUNCTION_SCAN_RESULT.missing).toEqual([]);
    expect(EDGE_FUNCTION_SCAN_RESULT.note).toContain("future work");
  });
});

describe("§patch pipeline — owner approval enforced", () => {
  it("refuses patches that fix nothing", () => {
    const r = proposePatch([], "does nothing");
    expect(r.ok).toBe(false);
  });

  it("refuses to advance a patch without real test evidence", () => {
    const p = proposePatch(["cf1"], "Fix hardcoded factor");
    if (!p.ok) throw new Error(p.error);
    const t = testPatch(p.patch, []);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toContain("Test evidence");
  });

  it("blocks approval and application without recorded owner authorization", () => {
    const reg = new AuthorizationRegistry(); // no grant
    const p = proposePatch(
      ["cf_calc_hardcoded_fallbacks"],
      "Migrate factors to DB",
    );
    if (!p.ok) throw new Error(p.error);
    const t = testPatch(p.patch, ["vitest: 41/41 pass; typecheck clean"]);
    if (!t.ok) throw new Error(t.error);
    const a = approvePatch(p.patch, reg, NOW);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toContain("Owner approves");
    // Even skipping approve, apply refuses:
    const applied = applyPatch(p.patch);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toContain("owner approval");
  });

  it("applies a patch only after registry-backed owner approval", () => {
    const reg = new AuthorizationRegistry();
    reg.grant({
      id: "auth-patch-1",
      authority: "apply_patch",
      scope: "patch_x",
      granted_at: NOW - 1000,
      expires_at: NOW + 60_000,
      evidence: "owner-click-approve",
    });
    const p = proposePatch(["cf1"], "Fix", new Date(NOW).toISOString());
    if (!p.ok) throw new Error(p.error);
    // authorization is scoped to the real patch id
    p.patch.id = "patch_x";
    const t = testPatch(p.patch, ["vitest: all pass"]);
    if (!t.ok) throw new Error(t.error);
    const a = approvePatch(p.patch, reg, NOW);
    expect(a.ok).toBe(true);
    const applied = applyPatch(p.patch);
    expect(applied.ok).toBe(true);
    expect(p.patch.status).toBe("APPLIED");
  });
});
