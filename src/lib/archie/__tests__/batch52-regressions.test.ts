// BATCH 52 REGRESSION TESTS (2026-10-23)
// Covers the nine fixes of remediation batch 52:
// 1. roots/powers/squares compute ("square root of 144" = 12)
// 2. negative numbers keep their sign ("-5 plus 3" = -2)
// 3. percent chains compose ("10% of 500 plus 20" = 70)
// 4. word operators compute ("add 15 and 27" = 42)
// 5. hedged teaching ("i think the cement price is X")
//    retains the assertion, never a garbled price lookup
// 6. forget directives delete owner-taught facts (store +
//    persistent row), never claiming deletion that did not
//    happen
// 7. translation requests get the honest no-capability
//    reply, not a greeting
// 8. language questions reach the capability answer
// 9. "how do i convert/calculate" reaches the deterministic
//    tools, not public-web research
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

describe("batch 52 arithmetic (engine-level)", () => {
  it("computes roots, powers and negatives", async () => {
    const e = await freshEngine();
    expect(await ask(e, "what is the square root of 144")).toContain("12");
    expect(await ask(e, "what is -5 plus 3")).toContain("-2");
    expect(await ask(e, "what is 2 to the power of 10")).toContain("1024");
    expect(await ask(e, "5 squared")).toContain("25");
  });
  it("composes percent chains and word operators", async () => {
    const e = await freshEngine();
    expect(await ask(e, "10 percent of 500 plus 20")).toContain("70");
    expect(await ask(e, "whats 15% commission on 85000")).toContain("12750");
    expect(await ask(e, "add 15 and 27")).toContain("42");
    expect(await ask(e, "subtract 7 from 100")).toContain("93");
    expect(await ask(e, "multiply 4 by 5")).toContain("20");
  });
});

describe("batch 52 teaching and memory (engine-level)", () => {
  it("hedged teaching retains the assertion", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "i think the cement price is 9200 naira");
    expect(reply).toContain("cement price");
    expect(reply).toContain("9200 naira");
    expect(reply).not.toContain("i-think");
  });
  it("forget that removes the last owner-taught fact", async () => {
    const e = await freshEngine();
    await ask(e, "remember that my truck is a hilux");
    const forget = await ask(e, "forget that");
    expect(forget).toContain("Forgotten");
    const after = await ask(e, "what is my truck");
    expect(after.toLowerCase()).not.toContain("hilux");
  });
  it("subject-scoped forget removes matching owner facts only", async () => {
    const e = await freshEngine();
    await ask(e, "remember that the cement price is 9200 naira");
    const forget = await ask(e, "forget the cement price");
    expect(forget).toContain("1 owner-taught fact");
    const noMatch = await ask(e, "forget my truck");
    expect(noMatch).toContain("Nothing you taught me matches");
  });
});

describe("batch 52 routing", () => {
  it("routes translation requests to the honest refusal", async () => {
    const e = await freshEngine();
    const reply = await ask(e, "translate hello to french");
    expect(reply).toContain("I do not translate");
    const yoruba = await ask(e, "how do i say good morning in yoruba");
    expect(yoruba).toContain("I do not translate");
  });
  it("routes language questions to the capability answer", () => {
    expect(
      understand("what language do you speak", [], { rules: [] }).intent,
    ).toBe("capability_query");
  });
  it("routes how-do-i convert/calculate to math_question", () => {
    expect(
      understand("how do i convert 5 miles to km", [], { rules: [] }).intent,
    ).toBe("math_question");
    expect(
      understand("how do i calculate 15% of 2400", [], { rules: [] }).intent,
    ).toBe("math_question");
  });
  it("keeps real how-to questions on howto_guidance", () => {
    expect(
      understand("how do i screed a floor properly", [], { rules: [] }).intent,
    ).toBe("howto_guidance");
  });
});
