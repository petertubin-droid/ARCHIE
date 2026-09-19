import { describe, expect, it } from "vitest";
// =========================================================
// Response composer (plan P6): deterministic phrasing
// variance with ZERO fabrication surface. Same evidence →
// same phrasing byte-stable; different evidence → natural
// variation; epistemic markers survive in every variant.
// =========================================================

import {
  composerSelfCheck,
  howtoFooter,
  knowledgeOpening,
  stableHash,
  unknownOpening,
  type Verbosity,
} from "@studio-shared/archie-ai/native-engine/composer.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("composer determinism and variance", () => {
  it("stableHash is deterministic and distributes", () => {
    expect(stableHash("seed-a")).toBe(stableHash("seed-a"));
    expect(stableHash("seed-a")).not.toBe(stableHash("seed-b"));
    // distribution: 100 distinct seeds hit >= 3 of 4 variants
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      seen.add(stableHash(`kb-open:fact-${i}`) % 4);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("same seed → byte-identical phrasing, every call", () => {
    for (let i = 0; i < 25; i++) {
      expect(knowledgeOpening("fact-1|fact-2")).toBe(
        knowledgeOpening("fact-1|fact-2"),
      );
    }
  });

  it("every variant keeps its epistemic marker (composer self-check)", () => {
    const check = composerSelfCheck();
    expect(check.ok).toBe(true);
    expect(check.failures).toHaveLength(0);
  });

  it("howto footer: detailed mode frames, concise mode omits", () => {
    const detailed = howtoFooter("seed", "detailed" as Verbosity);
    const concise = howtoFooter("seed", "concise" as Verbosity);
    expect(detailed.length).toBeGreaterThan(0);
    expect(detailed).toMatch(/plan|honest|capabilit/i);
    expect(concise).toBe("");
    // same seed → same detailed footer
    expect(howtoFooter("seed", "detailed" as Verbosity)).toBe(detailed);
  });

  it("unknown openings all keep the 'validated knowledge' marker", () => {
    // exhaustively: every variant reachable via distinct seeds
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const v = unknownOpening(`probe-${i}`);
      expect(v).toMatch(/validated knowledge/i);
      seen.add(v);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe("engine answers through the composer (P6 integration)", () => {
  it("same question → byte-identical answer (determinism preserved)", async () => {
    const engine = new ArchieNativeEngine();
    const a = await engine.converse("what is screeding");
    const b = await engine.converse("what is screeding");
    expect(a.responseText).toBe(b.responseText);
    // and the epistemic marker is present
    expect(a.responseText).toMatch(/validated knowledge/i);
  });

  it("different questions naturally read differently (variance is real)", async () => {
    const engine = new ArchieNativeEngine();
    const openings = new Set<string>();
    for (const q of [
      "what is screeding",
      "what is mortar",
      "what is cement",
      "what is formwork",
      "what is troweling",
      "what is curing",
    ]) {
      const res = await engine.converse(q);
      const opening = res.responseText.split("\n")[0];
      openings.add(opening);
    }
    // several distinct subjects → at least two distinct openings
    expect(openings.size).toBeGreaterThanOrEqual(2);
  });

  it("verbose footer omitted in concise mode; facts and confidence intact", async () => {
    const engine = new ArchieNativeEngine({ verbosity: "concise" });
    const res = await engine.converse("how do i level a floor");
    expect(res.responseText).toMatch(/validated knowledge/i);
    expect(res.responseText).toMatch(/confidence \d+%/);
    expect(res.citedFactIds.length).toBeGreaterThan(0);
    // concise mode: no howto footer line
    expect(res.responseText).not.toMatch(/deeper steps|step-by-step plan|take this deeper/i);
  });
});
