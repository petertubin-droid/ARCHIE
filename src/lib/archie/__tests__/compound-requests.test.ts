import { describe, expect, it } from "vitest";
// =========================================================
// Compound-request decomposition (plan P2, audit N2).
// Owners speak in multi-part requests — ARCHIE answers EACH
// part, caps runaway lists honestly, and treats negated
// clauses as respected exclusions, never as questions.
// =========================================================

import { decomposeClauses } from "@studio-shared/archie-ai/native-engine/nlu.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("clause decomposition (P2 / N2)", () => {
  it("splits on then/also/semicolon and on 'and' before an intent continuation", () => {
    expect(
      decomposeClauses("what is screeding and what is mortar"),
    ).toHaveLength(2);
    expect(
      decomposeClauses("estimate the screed then give me a status report"),
    ).toHaveLength(2);
    expect(decomposeClauses("what is cement; what is mortar")).toHaveLength(2);
  });

  it("does NOT split plain noun conjunctions — 'cement and sand' is one clause", () => {
    expect(decomposeClauses("cement and sand")).toHaveLength(1);
    expect(decomposeClauses("what is the screeding mix ratio")).toHaveLength(1);
  });

  it("recognizes a negated tail as a constraint, not a question", () => {
    const clauses = decomposeClauses(
      "tell me about screeding but don't mention prices",
    );
    expect(clauses).toHaveLength(2);
    expect(clauses[1].negated).toBe(true);
    expect(clauses[0].negated).toBe(false);
  });

  it("recovers subsequent REQUESTS from inside a negated tail (audit fix 2026-09-11)", () => {
    // The canonical audit sentence: the "but don't" tail carries
    // two further requests. The old whole-tail-as-exclusion
    // reading silently dropped them as exclusions.
    const clauses = decomposeClauses(
      "Estimate paint for a 12 by 12 room, but don't include the ceiling, compare emulsion with satin paint, then plan the purchase",
    );
    expect(clauses).toHaveLength(4);
    expect(clauses[0]).toEqual({
      text: "Estimate paint for a 12 by 12 room",
      negated: false,
    });
    expect(clauses[1]).toEqual({ text: "include the ceiling", negated: true });
    expect(clauses[2]).toEqual({
      text: "compare emulsion with satin paint",
      negated: false,
    });
    expect(clauses[3]).toEqual({
      text: "plan the purchase",
      negated: false,
    });
  });

  it("a tail fragment WITHOUT an intent-verb lead stays a constraint (conservative recovery)", () => {
    const clauses = decomposeClauses(
      "tell me about screeding but don't mention prices, discounts or fees",
    );
    // "discounts or fees" is a noun continuation, not a
    // request — it may be split off as its own fragment, but
    // it must NEVER be answered as its own clause: every tail
    // fragment stays negated.
    for (const c of clauses.slice(1)) expect(c.negated).toBe(true);
    expect(clauses.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT decompose code blocks — a ';' inside pasted source is data, not a clause marker", () => {
    const clauses = decomposeClauses(
      "analyze this file\n```ts\nexport function add(a: number, b: number) {\n  return a + b;\n}\n```\n",
    );
    expect(clauses).toHaveLength(1);
    expect(clauses[0].text).toContain("return a + b;");
    expect(clauses[0].text).toContain("```ts");
  });
});


describe("compound routing (P2 / N2)", () => {
  it("answers BOTH clauses of a compound request — nothing dropped", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse(
      "what is screeding and what is mortar",
    );
    expect(res.responseText).toMatch(/screeding/i);
    expect(res.responseText).toMatch(/mortar/i);
    expect(res.responseText).toMatch(/level|smooth|paste|masonry/i);
    // both definitions cited
    expect(res.citedFactIds.length).toBeGreaterThanOrEqual(2);
  });

  it("runs sequential compound requests and numbers the parts", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse(
      "what is mortar; what is portland cement",
    );
    expect(res.responseText).toMatch(/1\./);
    expect(res.responseText).toMatch(/2\./);
    expect(res.responseText).toMatch(/masonry/);
    expect(res.responseText).toMatch(/clinker|hydraulic/i);
  });

  it("honors an exclusion: the requested part is answered, the excluded part is named but NOT answered", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse(
      "tell me about screeding but don't mention prices",
    );
    // the positive part answered
    expect(res.responseText).toMatch(/level|smooth|slab/i);
    // the exclusion visibly honored
    expect(res.responseText).toContain("You also asked me NOT to");
    expect(res.responseText).toContain("prices");
    // and no price DATA was produced for the excluded clause
    expect(res.responseText).not.toMatch(/naira|NGN|₦/);
  });

  it("all-excluded requests get an honest redirect, not a fabricated answer", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("don't tell me about prices");
    expect(res.responseText).toContain("nothing left to answer");
  });

  it("caps runaway compound requests honestly (9 clauses, over the gap-1 cap of 8)", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse(
      "what is cement; what is mortar; what is screeding; what is concrete; what is portland-cement; what is curing; what is formwork; what is grout; what is aggregate",
    );
    expect(res.responseText).toMatch(
      /requests in one message|more than I can hold/i,
    );
  });

  it("a plain single-clause request routes exactly as before (regression guard)", async () => {
    const engine = new ArchieNativeEngine();
    const res = await engine.converse("what is screeding");
    expect(res.responseText).toMatch(/level|smooth/i);
    expect(res.responseText).not.toMatch(/^1\./);
  });
});
