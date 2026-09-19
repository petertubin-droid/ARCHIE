import { describe, expect, it } from "vitest";
// =========================================================
// FRELUX site assistant (2026-09-16) — ARCHIE grounded in the
// FRELUX site itself: seed-corpus facts outrank the injected
// knowledge base; the learn hub serves how-tos through
// strongly-titled KB sections; subject yes/no questions
// route as knowledge, not greetings.
// =========================================================
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import { understand } from "@studio-shared/archie-ai/native-engine/nlu.ts";

// Mirrors the archie-chat visitor prompt shape: topic-titled
// sections + a learn-hub article section.
const PROMPT = `You are ARCHIE, the AI assistant on the FRELUX website (frelux.tools) — a Nigerian building, painting and finishing platform.

## Role
Help site visitors with practical guidance on painting, POP ceilings, screeding, tiling, paint colours and surface preparation, and point them to the right FRELUX calculator or page for real numbers.

## How to screed a floor
Learn hub guide — read it in full at frelux.tools/learn/how-to-screed-a-floor (finishing).
A complete step-by-step guide to screeding a floor: mix the screed 1:4, apply in thin layers, level with a straightedge, and cure for 7 days keeping it moist.`;

describe("FRELUX site assistant", () => {
  it("subject yes/no questions route to knowledge, not greeting", () => {
    expect(understand("does frelux have a marketplace").intent).toBe(
      "knowledge_query",
    );
    // regression guards: the new rule must not steal these routes
    expect(understand("do not remember the gate code").intent).toBe(
      "memory_exclusion",
    );
    expect(understand("don't remember my gate code").intent).toBe(
      "memory_exclusion",
    );
    expect(understand("hello archie").intent).toBe("greeting");
    // "are you there" is availability in the current taxonomy
    // (availability_check owns it with its own honest
    // presence reply) — either way it must NOT be stolen as a
    // knowledge query.
    expect(["greeting", "availability_check"]).toContain(
      understand("are you there").intent,
    );
  });

  it("validated facts outrank the KB — pricing answers from the corpus", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    const result = await engine.converse(
      "how much is the frelux pro plan",
      undefined,
      PROMPT,
    );
    expect(result.responseText).toContain("5,000");
    expect(result.responseText).not.toContain("From the knowledge base");
  });

  it("calculator questions answer from the corpus, not prompt prose", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    const result = await engine.converse(
      "what calculators does frelux have for finishing",
      undefined,
      PROMPT,
    );
    expect(result.responseText.toLowerCase()).toContain("screeding");
    expect(result.responseText).not.toContain("From the knowledge base");
  });

  it("marketplace questions answer from the corpus", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    const result = await engine.converse(
      "does frelux have a marketplace",
      undefined,
      PROMPT,
    );
    expect(result.responseText.toLowerCase()).toContain("marketplace");
    expect(result.responseText).not.toContain("From the knowledge base");
  });

  it("how-to questions with a strongly-titled KB section answer from the curated guide", async () => {
    const engine = new ArchieNativeEngine();
    await engine.boot();
    const result = await engine.converse(
      "how do i screed a floor",
      undefined,
      PROMPT,
    );
    expect(result.responseText).toContain("From the knowledge base");
    expect(result.responseText).toContain("1:4");
  });
});
