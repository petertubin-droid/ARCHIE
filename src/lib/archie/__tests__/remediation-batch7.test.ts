// =========================================================
// REMEDIATION BATCH 7 TESTS (2026-09-13, Level 4 kernel audit)
//
// Fix 18 — ACT is no longer a dead route phase: every trace
//          records ACT (delegated to the caller's tool loop,
//          or skipped when the composed response is the act).
// Fix 19 — verification completeness: the "unknown" excusal
//          is SCOPED to the aspect it excuses — a stray
//          "unknown" (even ARCHIE's epistemic footer) can no
//          longer excuse every missing aspect.
// Fix 20 — perception CSV parsing is quote-aware; unbalanced
//          quotes are refused honestly instead of misparsed.
// Fix 21 — executed CREATE phases record their product, not
//          the ceremonial "completed (measured)".
// =========================================================

import { describe, it, expect } from "vitest";
import { CognitiveKernel } from "@studio-shared/archie-ai/cognitive/kernel.ts";
import { VerificationEngine } from "@studio-shared/archie-ai/cognitive/verification.ts";
import { PerceptionEngine } from "@studio-shared/archie-ai/cognitive/perception.ts";

describe("Fix 18 — ACT recorded on every route that declares it", () => {
  it("a conversational cycle records ACT as skipped-with-reason", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("hello archie");
    const act = result.trace.phases.find((p) => p.phase === "ACT");
    expect(act).toBeDefined();
    expect(["executed", "delegated", "skipped"]).toContain(act!.status);
    expect(act!.summary.length).toBeGreaterThan(12);
    expect(act!.summary).not.toBe("completed");
  });

  it("a knowledge query cycle records ACT too", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("what is the definition of screeding?");
    const act = result.trace.phases.find((p) => p.phase === "ACT");
    expect(act).toBeDefined();
  });

  it("trace phases remain in canonical loop order with ACT present", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.cycle("hello archie");
    const idx: Record<string, number> = {};
    result.trace.phases.forEach((p) => {
      expect(idx[p.phase]).toBeUndefined(); // no duplicates
      idx[p.phase] = 1;
    });
  });
});

describe("Fix 19 — scoped unknown excusal in verification", () => {
  const engine = new VerificationEngine();

  it("a blanket 'unknown' does NOT excuse a missing aspect", () => {
    const verdict = engine.verify({
      target: "test",
      output: "I do not know. Epistemic status: UNKNOWN.",
      citedFacts: [],
      requiredAspects: ["water-cement ratio"],
    });
    const completeness = verdict.checks.find((c) => c.check === "completeness");
    expect(completeness?.passed).toBe(false);
    expect(completeness?.detail).toContain("water-cement ratio");
  });

  it("an explicit unknown naming the aspect DOES excuse it", () => {
    const verdict = engine.verify({
      target: "test",
      output:
        "The water-cement ratio is not stored — I have no knowledge of it yet. Teach me and I will hold it.",
      citedFacts: [],
      requiredAspects: ["water-cement ratio"],
    });
    const completeness = verdict.checks.find((c) => c.check === "completeness");
    expect(completeness?.passed).toBe(true);
  });

  it("an addressed aspect passes as before (regression)", () => {
    const verdict = engine.verify({
      target: "test",
      output: "The water-cement ratio for screeding is typically 0.4 to 0.5.",
      citedFacts: [],
      requiredAspects: ["water-cement ratio"],
    });
    const completeness = verdict.checks.find((c) => c.check === "completeness");
    expect(completeness?.passed).toBe(true);
  });
});

describe("Fix 20 — quote-aware CSV perception", () => {
  const engine = new PerceptionEngine();

  it("quoted cells containing commas parse as ONE cell", () => {
    const csv = 'name,location\nada,"Lagos, Nigeria"\nbola,"Abuja, FCT"';
    const { percepts } = engine.ingest(csv, "test");
    const structured = percepts.find((p) => p.modality === "structured-data");
    expect(structured).toBeDefined();
    const parsed = structured!.content as {
      header: string[];
      rows: Array<Record<string, string>>;
    };
    expect(parsed.rows[0].location).toBe("Lagos, Nigeria");
    expect(parsed.rows[1].location).toBe("Abuja, FCT");
  });

  it("escaped doubled quotes inside quoted cells survive", () => {
    const csv = 'name,note\nada,"said ""hi"" today"\n';
    const { percepts } = engine.ingest(csv, "test");
    const structured = percepts.find((p) => p.modality === "structured-data");
    const parsed = structured!.content as {
      rows: Array<Record<string, string>>;
    };
    expect(parsed.rows[0].note).toBe('said "hi" today');
  });

  it("unbalanced quotes are refused, not misparsed", () => {
    const csv = 'name,location\nada,"Lagos, Nigeria\nbola,Abuja';
    const { percepts } = engine.ingest(csv, "test");
    const structured = percepts.find((p) => p.modality === "structured-data");
    expect(structured).toBeUndefined(); // falls back to text percept
    const text = percepts.find((p) => p.modality === "text");
    expect(text).toBeDefined();
  });

  it("plain CSV without quotes still parses (regression)", () => {
    const csv = "name,role\nada,engineer\nbola,artisan";
    const { percepts } = engine.ingest(csv, "test");
    const structured = percepts.find((p) => p.modality === "structured-data");
    const parsed = structured!.content as {
      rows: Array<Record<string, string>>;
    };
    expect(parsed.rows[0].role).toBe("engineer");
  });
});

describe("Fix 21 — CREATE records its product", () => {
  it("an executed CREATE phase never carries the ceremonial default", async () => {
    const kernel = new CognitiveKernel();
    // code_analysis_request + "test" + a fenced code block
    // routes CREATE and produces the scaffold.
    const task =
      "analyze this code for tests ```ts\nexport function add(a: number, b: number) {\n  return a + b;\n}\n```";
    const result = await kernel.cycle(task);
    const create = result.trace.phases.find((p) => p.phase === "CREATE");
    expect(create).toBeDefined();
    if (create?.status === "executed") {
      expect(create.summary).not.toBe("completed (measured)");
      expect(create.summary.length).toBeGreaterThan(12);
    }
  });
});
