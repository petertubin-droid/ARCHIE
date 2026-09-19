// =========================================================
// TOOL-ROUTER TESTS (batch 25, fix 100)
// Calculation intent resolves to a registered deterministic
// engine or an honest refusal to approximate; numeric answers
// without engine provenance are labeled AI estimates; quantity
// candidates are born flagged.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  assertAuthority,
  candidateMathDiscipline,
  selectTool,
} from "@/lib/archie/tool-router";

describe("selectTool", () => {
  it("routes construction math to the canonical engine, never re-derives", () => {
    const r = selectTool("How many bags of cement do I need for 40 blocks?");
    expect(r.intent).toBe("CALCULATION");
    expect(r.must_use_deterministic_engine).toBe(true);
    expect(r.rationale).toMatch(/never re-derives/i);
  });

  it("refuses to approximate a calculation with no matching engine", () => {
    const r = selectTool("Calculate the area of the rug");
    expect(r.intent).toBe("CALCULATION");
    expect(r.must_use_deterministic_engine).toBe(true);
    expect(r.rationale).toMatch(/will not approximate/i);
  });

  it("routes calculation-flavoured questions on non-deterministic capabilities as data", () => {
    const r = selectTool("How much is the price of cement in the market?");
    expect(r.intent).toBe("PROJECT_DATA");
    expect(r.capability?.key).toBe("market_intelligence");
    expect(r.must_use_deterministic_engine).toBe(false);
  });

  it("routes non-math questions to governed knowledge or data systems", () => {
    const data = selectTool("Find me a contractor in Lekki");
    expect(data.intent).toBe("PROJECT_DATA");
    const knowledge = selectTool("Who designed the Eiffel Tower?");
    expect(knowledge.intent).toBe("GENERAL_KNOWLEDGE");
    expect(knowledge.must_use_deterministic_engine).toBe(false);
  });
});

describe("assertAuthority — engine provenance decides RESULT vs ESTIMATE", () => {
  it("marks numbers without engine provenance as gated AI estimates", () => {
    const r = assertAuthority({
      text: "about 32 bags",
      numeric_values: { bags: 32 },
    });
    expect(r.presentation).toBe("AI_ESTIMATE");
    if (r.presentation === "AI_ESTIMATE") {
      expect(r.must_label_as_estimate).toBe(true);
      expect(r.requires_engineering_review).toBe(true);
      expect(r.reason).toMatch(/No engine provenance/i);
    }
  });

  it("marks unregistered engines as estimates too", () => {
    const r = assertAuthority({
      text: "result",
      engine_id: "totally_fake_engine",
      numeric_values: { area: 42 },
    });
    expect(r.presentation).toBe("AI_ESTIMATE");
  });

  it("accepts registered engines as deterministic results", () => {
    const r = assertAuthority({
      text: "result",
      engine_id: "painting_wall_area",
      numeric_values: { area: 42 },
    });
    expect(r.presentation).toBe("DETERMINISTIC_RESULT");
    if (r.presentation === "DETERMINISTIC_RESULT") {
      expect(r.verified).toBe(true);
    }
  });

  it("ignores engine ids attached to answers without numeric values", () => {
    const r = assertAuthority({
      text: "done",
      engine_id: "painting_wall_area",
    });
    expect(r.presentation).toBe("AI_ESTIMATE");
  });
});

describe("candidateMathDiscipline", () => {
  it("flags quantity-bearing candidates as AI-extracted estimates", () => {
    expect(
      candidateMathDiscipline({ content: { paint_litres: 12, bags: 3 } }).flag,
    ).toBe("QUANTITY_CANDIDATE");
    expect(candidateMathDiscipline({ content: { note: "hello" } }).flag).toBe(
      "PLAIN_CANDIDATE",
    );
  });
});
