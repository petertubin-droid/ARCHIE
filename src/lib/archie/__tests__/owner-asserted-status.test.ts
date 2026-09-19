import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

function turns(text: string) {
  return [{ role: "owner" as const, parts: [{ text }] }];
}

// H-1 (audit fix 2026-09-11): the owner's voice is AUTHORITY,
// not independent verification. A taught fact is citable with
// an honest epistemic label and earns "validated" only through
// real verification events.
describe("owner-asserted epistemic status (audit fix H-1)", () => {
  it("teaching stores an owner-asserted fact — never validated on arrival", async () => {
    const engine = new ArchieNativeEngine();
    await engine.generate({
      turns: turns("remember that my batching plant operator is named Emeka"),
      tools: [],
      systemInstruction: "",
    });
    const fact = engine
      .rankKnowledge("batching plant operator")
      .find((f) => f.subject.includes("batching"));
    expect(fact).toBeDefined();
    expect(fact!.status).toBe("owner-asserted");
  });

  it("the teaching reply carries the honest owner-asserted label, not a validated claim", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.generate({
      turns: turns("remember that my site nurse is named Ada"),
      tools: [],
      systemInstruction: "",
    });
    const text = res.parts[0].text ?? "";
    expect(text).toMatch(/Retained as your assertion/i);
    expect(text).toMatch(/owner-asserted/i);
    expect(text).not.toMatch(/Retained as validated knowledge/);
  });

  it("an answer citing ONLY owner-asserted facts opens with the owner-asserted frame", async () => {
    const engine = new ArchieNativeEngine();
    await engine.generate({
      turns: turns("remember that my piling subcontractor is Solid Roots Ltd"),
      tools: [],
      systemInstruction: "",
    });
    const res = await engine.generate({
      turns: turns("who is my piling subcontractor"),
      tools: [],
      systemInstruction: "",
    });
    const text = res.parts[0].text ?? "";
    expect(text).toMatch(/owner-asserted/i);
    expect(text).toMatch(/not independently verified/i);
    expect(text).toContain("Solid Roots Ltd");
  });

  it("REPEATING an owner assertion never promotes it to validated (repetition ≠ validation)", async () => {
    const engine = new ArchieNativeEngine();
    const teach = "remember that my crane rental company is Titan Lifts";
    for (let i = 0; i < 4; i++) {
      await engine.generate({
        turns: turns(teach),
        tools: [],
        systemInstruction: "",
      });
    }
    const fact = engine
      .rankKnowledge("crane rental")
      .find((f) => f.subject.includes("crane"));
    expect(fact).toBeDefined();
    expect(fact!.status).toBe("owner-asserted");
  });

  it("explicit owner CONFIRMATION (success outcome) promotes an owner-asserted fact to validated", async () => {
    const engine = new ArchieNativeEngine();
    await engine.generate({
      turns: turns("remember that my cement depot is on Oshodi road"),
      tools: [],
      systemInstruction: "",
    });
    const factBefore = engine
      .rankKnowledge("cement depot")
      .find((f) => f.subject.includes("cement-depot"));
    expect(factBefore).toBeDefined();
    expect(factBefore!.status).toBe("owner-asserted");
    // The owner explicitly confirms the subject — each
    // confirmation is a REAL verification event (stamped
    // owner-confirm). The promotion gate requires
    // validatedCount >= 2, so the owner confirms twice.
    for (let i = 0; i < 2; i++) {
      const res = await engine.generate({
        turns: turns("you were right about the cement depot"),
        tools: [],
        systemInstruction: "",
      });
      // The confirm turn must have cited the fact for the
      // outcome to count toward it — a naked confirm with no
      // citation reinforces nothing (audit C3).
      const text =
        ((res as { parts?: Array<{ text?: string }> }).parts ?? [{}])[0].text ??
        "";
      expect(text.length).toBeGreaterThan(0);
    }
    const factAfter = engine
      .rankKnowledge("cement depot")
      .find((f) => f.subject.includes("cement-depot"));
    expect(factAfter!.status).toBe("validated");
    expect(
      (factAfter!.verifiedBy ?? []).filter((v) =>
        v.startsWith("owner-confirm:"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
