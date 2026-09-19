import { describe, expect, it } from "vitest";
// =========================================================
// Anaphora-aware follow-up routing (audit Phase 2 item 3).
// A taught fact, then a pronoun follow-up in the NEXT turn,
// must retrieve the SAME referent — this is how owners
// actually speak. The resolved referent widens retrieval;
// it is never asserted as a fact and never persisted.
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("anaphora-aware follow-up (Phase 2.3)", () => {
  it("a pronoun follow-up in history retrieves the taught referent's facts", async () => {
    const engine = new ArchieNativeEngine();
    const teach = await engine.converse(
      "remember: floor screeding ratio is 1 part cement to 4 parts sand",
    );
    expect(teach.responseText.toLowerCase()).toContain("retained");

    const followUp = await engine.converse("tell me more about it", [
      {
        role: "owner",
        parts: [
          {
            text: "remember: floor screeding ratio is 1 part cement to 4 parts sand",
          },
        ],
      },
      { role: "archie", parts: [{ text: teach.responseText }] },
    ]);
    // The follow-up must surface the screeding fact, not a
    // generic "I don't know" — anaphora resolution widened
    // the retrieval query to include "screeding".
    expect(followUp.responseText.toLowerCase()).toMatch(/screed|cement|sand/);
  });
});
