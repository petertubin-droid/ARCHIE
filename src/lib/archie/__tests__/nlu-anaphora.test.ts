import { describe, expect, it } from "vitest";
// =========================================================
// ANAPHORA RESOLUTION (audit Phase 2 item 3, 2026-09-11)
//
// "resolve it/its/that/they across decomposed clauses before
// routing each clause — carried subject detection + a refusal
// when a reference is genuinely ambiguous."
//
// Deterministic, no external AI: the resolver scans recent
// history for a candidate referent (statement subject, else
// longest content word), preferring the owner's own words.
// An unresolved pronoun reports referent:null — never guessed.
// =========================================================

import {
  resolveAnaphora,
  understand,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";

describe("resolveAnaphora — deterministic pronoun resolution", () => {
  it("resolves 'it' to the subject of a prior teaching statement", () => {
    const history = [
      {
        role: "owner" as const,
        text: "remember: floor screeding ratio is 1 part cement to 4 parts sand",
      },
    ];
    const found = resolveAnaphora("how do i apply it?", history);
    expect(found.length).toBe(1);
    expect(found[0].pronoun).toBe("it");
    expect(found[0].referent).toBe("floor screeding ratio");
  });

  it("prefers the owner's own words over ARCHIE's replies", () => {
    const history = [
      { role: "owner" as const, text: "what is a screed panel?" },
      {
        role: "archie" as const,
        text: "I do not have validated knowledge on that yet.",
      },
    ];
    const found = resolveAnaphora("tell me more about it", history);
    expect(found[0].referent).toBe("screed panel");
  });

  it("reports referent:null honestly when there is no history", () => {
    const found = resolveAnaphora("what about it?", []);
    expect(found.length).toBe(1);
    expect(found[0].referent).toBeNull();
  });

  it("finds nothing when the input has no pronoun", () => {
    const found = resolveAnaphora("what is the cement ratio?", [
      { role: "owner" as const, text: "remember: screeding ratio is 1:4" },
    ]);
    expect(found.length).toBe(0);
  });

  it("resolves multiple distinct pronouns without duplicate records", () => {
    const history = [
      { role: "owner" as const, text: "the compressor pump failed today" },
    ];
    const found = resolveAnaphora("did it break, or did they fix it?", history);
    const pronouns = found.map((f) => f.pronoun).sort();
    expect(pronouns).toEqual(["it", "they"]);
  });

  it("is wired into understand() and carried on the NluResult", () => {
    const result = understand("how do i apply it?", [
      {
        role: "owner",
        text: "remember: floor screeding ratio is 1 part cement to 4 parts sand",
      },
    ]);
    expect(result.anaphora.length).toBe(1);
    expect(result.anaphora[0].referent).toBe("floor screeding ratio");
  });

  it("understand() without history reports the pronoun unresolved, never guessed", () => {
    const result = understand("what do you think about it?");
    expect(result.anaphora[0].referent).toBeNull();
  });
});
