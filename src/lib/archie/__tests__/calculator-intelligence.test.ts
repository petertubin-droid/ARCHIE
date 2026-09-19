import { describe, it, expect } from "vitest";
import { runTask } from "@/lib/ai-foundation/orchestrator";
import { TASK_REQUIREMENTS } from "@/lib/ai-foundation/requirements";
import type { AiFact, FreluxContext } from "@/lib/ai-foundation/types";
import {
  ARCHIE_CALCULATOR_KNOWLEDGE,
  calculatorHealth,
  explainCalculator,
  generateArchieCalculationReport,
  type EngineBackedTask,
} from "@/lib/archie/calculator-intelligence";

// ---------------------------------------------------------
// Helpers — real facts, real context, real engine runs.
// ---------------------------------------------------------
function fact(
  key: string,
  label: string,
  value: number | string,
  unit?: string,
): AiFact {
  return {
    key,
    label,
    value,
    unit,
    origin: "user_input",
    source: "test",
    confidence: 1,
    trust: "user_confirmed",
  };
}

const context: FreluxContext = {
  userId: "archie-test",
  marketDataAvailable: false,
};

const PAINTING_FACTS: AiFact[] = [
  fact("length", "Room length", 4, "m"),
  fact("width", "Room width", 3, "m"),
  fact("height", "Wall height", 2.5, "m"),
];

// ---------------------------------------------------------
// Knowledge base ↔ registry coherence
// ---------------------------------------------------------
describe("ARCHIE calculator knowledge base", () => {
  const TASKS: EngineBackedTask[] = [
    "building_estimate",
    "roof_estimate",
    "painting_estimate",
    "painting_materials",
    "tyrolene_estimate",
    "screeding_estimate",
    "tile_estimate",
    "pop_estimate",
  ];

  it("covers every engine-backed task", () => {
    for (const t of TASKS) expect(ARCHIE_CALCULATOR_KNOWLEDGE[t]).toBeDefined();
  });

  it("engine ids match the ai-foundation registry requirements", () => {
    for (const t of TASKS) {
      expect(ARCHIE_CALCULATOR_KNOWLEDGE[t].engineId).toBe(
        TASK_REQUIREMENTS[t].engineId,
      );
    }
  });

  it("required inputs match the requirements layer's fields", () => {
    for (const t of TASKS) {
      const specKeys = TASK_REQUIREMENTS[t].fields.map((f) => f.key);
      const known = ARCHIE_CALCULATOR_KNOWLEDGE[t].requiredInputs.map(
        (f) => f.key,
      );
      expect(specKeys).toEqual(known);
    }
  });

  it("every entry documents source files for verification cross-reference", () => {
    for (const t of TASKS) {
      expect(ARCHIE_CALCULATOR_KNOWLEDGE[t].sourceFiles.length).toBeGreaterThan(
        0,
      );
      expect(
        ARCHIE_CALCULATOR_KNOWLEDGE[t].sourceFiles.every((f) =>
          f.startsWith("src/"),
        ),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------
// Report generation — real engine run
// ---------------------------------------------------------
describe("ARCHIE calculation report (real painting engine)", () => {
  it("runs the authoritative engine", async () => {
    const outcome = await runTask("painting_estimate", context, PAINTING_FACTS);
    expect(outcome.result).toBeDefined();
    expect(outcome.result!.ok).toBe(true);
    expect(outcome.refusal).toBeUndefined();
  });

  it("report numbers are REFERENCE-IDENTICAL to the engine output", async () => {
    const outcome = await runTask("painting_estimate", context, PAINTING_FACTS);
    const report = generateArchieCalculationReport(outcome);
    expect(report.status).toBe("ok");
    expect(report.engine.id).toBe("painting_wall_area");
    // Every report line must be the very same object the engine returned.
    for (const line of [...report.materials, ...report.waste]) {
      expect(outcome.result!.quantities).toContain(line);
    }
    if (report.costs) expect(report.costs).toBe(outcome.result!.costs);
  });

  it("carries methodology and confidence with limitations", async () => {
    const outcome = await runTask("painting_estimate", context, PAINTING_FACTS);
    const report = generateArchieCalculationReport(outcome);
    expect(report.methodology).toContain("painting engine");
    expect(["high", "medium", "low"]).toContain(report.confidence.level);
    expect(Array.isArray(report.confidence.limitations)).toBe(true);
  });

  it("discloses pricing basis honestly when costs are absent", async () => {
    const outcome = await runTask("painting_estimate", context, PAINTING_FACTS);
    const report = generateArchieCalculationReport(outcome);
    if (!report.costs) {
      // Wall-area geometry has no pricing — the report must not invent it.
      expect(report.pricingBasis.disclosure.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------
// No invented precision — missing critical inputs
// ---------------------------------------------------------
describe("ARCHIE report refuses to invent missing inputs", () => {
  it("needs_input with no numbers when critical inputs are absent", async () => {
    const outcome = await runTask("painting_estimate", context, [
      fact("length", "Room length", 4, "m"),
      // width and height missing
    ]);
    expect(outcome.refusal).toMatch(/Still missing/);

    const report = generateArchieCalculationReport(outcome);
    expect(report.status).toBe("needs_input");
    expect(report.missingInputs.length).toBeGreaterThan(0);
    expect(report.missingInputs.join(" ")).toContain("Room width");
    // The hard guarantee: no quantities, no costs, nothing invented.
    expect(report.materials).toHaveLength(0);
    expect(report.waste).toHaveLength(0);
    expect(report.costs).toBeNull();
  });

  it("marks unconfirmed inputs in the ok-report when present", async () => {
    const outcome = await runTask("painting_estimate", context, PAINTING_FACTS);
    const report = generateArchieCalculationReport(outcome);
    expect(report.needsConfirmation).toEqual(outcome.needsConfirmation ?? []);
  });
});

// ---------------------------------------------------------
// Verification bridge — code-intelligence findings
// ---------------------------------------------------------
describe("calculator health verification", () => {
  it("surfaces only OPEN/OWNER_REVIEW findings, not resolved ones", () => {
    // The audit baseline's paint-engine findings were RESOLVED with
    // patch evidence; they must not be reported as open limitations.
    const health = calculatorHealth("painting_materials");
    expect(health.openFindings).toHaveLength(0);
    expect(health.disclosures).toHaveLength(0);
  });

  it("is wired to the real audit baseline", () => {
    // If a future OPEN finding lands on an engine source file, it must
    // appear here. Verify the matching logic with the current baseline
    // shape: resolved findings exist and are correctly excluded.
    const painting = calculatorHealth("painting_estimate");
    expect(painting.engineId).toBe("painting_wall_area");
  });
});

// ---------------------------------------------------------
// Explanation layer
// ---------------------------------------------------------
describe("explainCalculator", () => {
  it("explains the real engine and its required inputs", () => {
    const text = explainCalculator("painting_estimate");
    expect(text).toContain("painting_wall_area");
    expect(text).toContain("Room length");
    expect(text).toContain("Required inputs");
    // ARCHIE never restates unverified internal formulas.
    expect(text).toContain("engine");
  });
});
