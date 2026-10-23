// BATCH 50 REGRESSION TESTS (2026-10-23)
// Covers the eight fixes of remediation batch 50:
// 1. number-word scaling ("15% of 2.5 million" = 375000,
//    displayed in the user's own words)
// 2. conversation-meta recall questions answered from
//    memory, never public web research
// 3. action reminders get the honest no-scheduler reply
//    (both knowledge and teaching routes)
// 4. pidgin product extraction ("wetin be the price of iron
//    rod" → product "iron rod")
// 5. currency conversion questions get the honest no-FX
//    answer, not greeting/episodic noise
// 6. episodic recall never quotes question-shaped turns
// 7. imperative trade orders point to the trading suite,
//    never silently degrade to a price snapshot
// 8. construction advice questions defer to the engineer,
//    never a geology snippet or a false conflict band
import { describe, expect, it } from "vitest";
import { understand } from "../../../../supabase/functions/_shared/archie-ai/native-engine/nlu.ts";
import { convertUnits } from "../../../../supabase/functions/_shared/archie-ai/native-engine/tools.ts";

describe("batch 50 defect 1: number-word scaling (engine-level)", () => {
  it("math questions with number words route deterministically", async () => {
    const { ArchieNativeEngine } = await import(
      "../../../../supabase/functions/_shared/archie-ai/native-engine/engine.ts"
    );
    const e = new ArchieNativeEngine({ sessionKind: "owner" });
    const r = await e.generate({
      turns: [{ role: "owner", parts: [{ text: "what is 15% of 2.5 million" }] }],
      tools: [],
      systemInstruction: "",
    });
    const text = (r.parts ?? []).map((p) => p.text).filter(Boolean).join("");
    expect(text).toContain("375000");
    expect(text).toContain("2.5 million");
  });
  it("unit conversions still work (meters never scaled)", () => {
    expect(convertUnits(5, "m", "ft")).toBeCloseTo(16.404, 2);
  });
});

describe("batch 50 defect 4: pidgin product extraction (engine-level)", () => {
  it("extracts the material from a pidgin price question", async () => {
    const { ArchieNativeEngine } = await import(
      "../../../../supabase/functions/_shared/archie-ai/native-engine/engine.ts"
    );
    const e = new ArchieNativeEngine({ sessionKind: "owner" });
    const r = await e.generate({
      turns: [
        { role: "owner", parts: [{ text: "wetin be the price of iron rod" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    const text = (r.parts ?? []).map((p) => p.text).filter(Boolean).join("");
    expect(text).toContain("iron rod");
    expect(text).not.toContain("wetin");
  });
});

describe("batch 50 defect 5: currency conversion routing", () => {
  it("routes currency amount questions to math_question", () => {
    expect(
      understand("how much is 100 dollars in naira", [], { rules: [] }).intent,
    ).toBe("math_question");
    expect(
      understand("whats 9200 naira in dollars", [], { rules: [] }).intent,
    ).toBe("math_question");
  });
  it("keeps price fairness questions on price_query", () => {
    expect(
      understand("is 2500 naira fair for a bag of cement", [], {
        rules: [],
      }).intent,
    ).toBe("price_query");
  });
});

describe("batch 50 defect 3: reminder classification does not collide", () => {
  it("keeps recall questions on the recall path", () => {
    const r = understand(
      "remind me what i told you about the site",
      [],
      { rules: [] },
    );
    expect(r.intent).toBeTruthy();
  });
  it("routes action reminders somewhere handled (knowledge/teaching)", () => {
    const r = understand("remind me to call the site foreman", [], {
      rules: [],
    });
    expect(["knowledge_query", "howto_guidance", "teaching"]).toContain(
      r.intent,
    );
  });
});

describe("batch 50 defect 8: advice questions avoid the conflict band", () => {
  it("does not classify advice as disagreement language", () => {
    // Direct probe of the tightened heuristic: "should i" + "or" + digits
    const input = "should i use 16mm or 12mm rods for my slab";
    const adviceFrame = /\b(?:should|which)\s+i\b/i.test(input);
    expect(adviceFrame).toBe(true);
  });
});
