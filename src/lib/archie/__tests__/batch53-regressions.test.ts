// BATCH 53 REGRESSION TESTS (2026-10-23)
// Covers the eight fixes of remediation batch 53:
// 1. comma-grouped numbers parse ("15% of 250,000" = 37500,
//    "250,000 times 2" = 500000)
// 2. fraction-of composes ("3/4 of 120" = 90, not 0.75)
// 3. price product extraction strips question-word typos
//    ("waht is the price of cement" → "cement")
// 4. comparison questions are not stolen by the construction
//    calculator rule ("is cement stronger than concrete")
// 5. device-state questions get the honest no-sensors reply
//    ("is the gate open"), never a research dump
// 6. pronoun-only research requests resolve the antecedent or
//    ask back honestly ("can you research it for me")
// 7. negated research directives are acknowledged, never
//    knowledge-missed ("i do not want to research it")
// 8. retractions are simple acks ("never mind"), and
//    "never mind, whats 2+2" still answers the math
import { describe, expect, it } from "vitest";
import { understand } from "../../../../supabase/functions/_shared/archie-ai/native-engine/nlu.ts";

async function freshEngine() {
  const { ArchieNativeEngine } = await import(
    "../../../../supabase/functions/_shared/archie-ai/native-engine/engine.ts"
  );
  return new ArchieNativeEngine({ sessionKind: "owner" });
}

async function ask(engine: import("../../../../supabase/functions/_shared/archie-ai/native-engine/engine.ts").ArchieNativeEngine, q: string) {
  const r = await engine.generate({
    turns: [{ role: "owner", parts: [{ text: q }] }],
    tools: [],
    systemInstruction: "",
  });
  return (r.parts ?? []).map((p) => p.text).filter(Boolean).join("");
}

describe("batch 53 arithmetic", () => {
  it("parses comma-grouped numbers", async () => {
    const e = await freshEngine();
    expect(await ask(e, "what is 15% of 250,000")).toContain("37500");
    expect(await ask(e, "250,000 times 2")).toContain("500000");
  });
  it("composes fraction-of", async () => {
    const e = await freshEngine();
    expect(await ask(e, "what is 3/4 of 120")).toContain("90");
    expect(await ask(e, "what is 2/3 of 9000")).toContain("6000");
  });
});

describe("batch 53 honesty and routing", () => {
  it("strips question-word typos from the price product", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "waht is the price of cement");
    expect(reply).toContain('"cement"');
    expect(reply).not.toContain("waht");
  });
  it("keeps comparisons off the construction calculator", () => {
    const n = understand("is cement stronger than concrete", [], {
      rules: [],
    });
    expect(n.intent).not.toBe("construction_calc");
  });
  it("answers device-state questions honestly", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "is the gate open");
    expect(reply).toContain("no device sensors");
    expect(reply).not.toContain("public sources");
  });
  it("asks back on pronoun-only research without antecedent", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "can you research it for me");
    expect(reply).toContain("Research what");
  });
  it("resolves pronoun research to the previous topic", async () => {
    const e = await freshEngine();
    const r = await e.generate({
      turns: [
        { role: "owner", parts: [{ text: "what is screed flooring" }] },
        { role: "archie", parts: [{ text: "I do not have that yet." }] },
        { role: "owner", parts: [{ text: "can you research it for me" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    const reply = (r.parts ?? []).map((p) => p.text).filter(Boolean).join("");
    // The antecedent resolved (no pronoun ask-back, no literal
    // "it for me" search); the sandboxed research pipeline may
    // honestly report no reachable sources, which is fine.
    expect(reply).not.toContain("Research what");
    expect(reply).not.toContain('"it for me"');
  });
  it("acknowledges negated research directives", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "i do not want to research it");
    expect(reply).toContain("will not research");
    const scoped = await ask(e, "do not research that");
    expect(scoped).toContain("will not research");
  });
  it("treats retractions as simple acknowledgments", async () => {
    const e = await freshEngine();
    expect(await ask(e, "never mind")).toContain("dropped");
    const compound = await ask(e, "never mind, whats 2+2");
    expect(compound).toContain("4");
    expect(compound).not.toContain("asked me NOT to");
  });
  it("keeps real corrections on the correction route", () => {
    expect(understand("do not use that value", [], { rules: [] }).intent).toBe(
      "correction",
    );
  });
});
