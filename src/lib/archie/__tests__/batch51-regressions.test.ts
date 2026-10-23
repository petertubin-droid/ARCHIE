// BATCH 51 REGRESSION TESTS (2026-10-23)
// Covers the eight fixes of remediation batch 51:
// 1. explicit research requests are never intercepted by
//    the temporal strategy ("research the history of X"
//    researches instead of refusing "I hold no dated facts")
// 2. "what is todays date and time" reads the system clock,
//    not public web research about Unix epoch
// 3. "when is my birthday" answers honestly "not on record",
//    never a blind celebration
// 4. voice-system status questions reach the voice subsystem
//    rule (honest not-wired status), not a knowledge miss
// 5. "what about X" after a price question inherits the
//    price context (previous-owner-turn bug)
// 6. questions about ARCHIE's own past actions answer from
//    conversation history, honestly when nothing happened
// 7. compound teaching retains BOTH facts ("my name is X and
//    my company is Y"), never one mangled triple
// 8. the temporal strategy never fabricates a subject from
//    an unrelated top-ranked fact ("timeline of network")
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

describe("batch 51 intent routing", () => {
  it("routes 'what is todays date' variants to time_query", () => {
    expect(understand("what is todays date", [], { rules: [] }).intent).toBe(
      "time_query",
    );
    expect(
      understand("what is todays date and time", [], { rules: [] }).intent,
    ).toBe("time_query");
  });
  it("routes personal when-questions to knowledge_query, not celebration", () => {
    expect(understand("when is my birthday", [], { rules: [] }).intent).toBe(
      "knowledge_query",
    );
    expect(
      understand("when is my wedding anniversary", [], { rules: [] }).intent,
    ).toBe("knowledge_query");
  });
  it("routes voice-system status to voice_query", () => {
    expect(
      understand("status of your voice system", [], { rules: [] }).intent,
    ).toBe("voice_query");
    expect(
      understand("how is your voice system coming", [], { rules: [] }).intent,
    ).toBe("voice_query");
  });
  it("keeps explicit research requests on research_request", () => {
    expect(
      understand("research the history of cement in nigeria", [], {
        rules: [],
      }).intent,
    ).toBe("research_request");
  });
});

describe("batch 51 engine behaviors", () => {
  it("compound teaching retains both facts", async () => {
    const e = await freshEngine();
    const reply = await ask(
      e,
      "my name is peter and my company is tubin constructions",
    );
    expect(reply).toContain("2 facts");
    const name = await ask(e, "what is my name");
    expect(name.toLowerCase()).toContain("peter");
    const company = await ask(e, "what is my company");
    expect(company.toLowerCase()).toContain("tubin");
  });
  it("single teaching still retains one fact", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "remember that my gate code is 4712");
    expect(reply).toContain("Retained");
    expect(reply).not.toContain("2 facts");
  });
  it("birthday questions answer honestly without celebration", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "when is my birthday");
    expect(reply).toContain("not have your birthday on record");
    expect(reply).not.toContain("🎉");
    expect(reply).not.toContain("Congratulations");
  });
  it("what-about follow-up inherits price context from the previous turn", async () => {
    const e = await freshEngine();
    const reply = await e.generate({
      turns: [
        { role: "owner", parts: [{ text: "whats the price of granite" }] },
        { role: "archie", parts: [{ text: "I do not guess prices." }] },
        { role: "owner", parts: [{ text: "what about sharp sand" }] },
      ],
      tools: [],
      systemInstruction: "",
    });
    const text = (reply.parts ?? []).map((p) => p.text).filter(Boolean).join("");
    expect(text.toLowerCase()).toContain("sharp sand");
    expect(text).not.toContain("mortar definition");
  });
  it("questions about ARCHIE's own past actions answer honestly", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "tell me about the trade you evaluated yesterday");
    expect(reply).toContain("No such action");
  });
});
