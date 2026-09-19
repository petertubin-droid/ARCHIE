import { describe, expect, it } from "vitest";
// =========================================================
// COMPUTED DERIVATION → ANSWER (audit Phase 2 item 4,
// integration): teach the premises, ask the question —
// the engine must DERIVE the conclusion with its rules and
// answer from the derived fact, honestly labeled as derived
// (never as owner-validated knowledge). This is the full
// path the numeric unification unlock was built for.
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

describe("derived answers via computed rules (Phase 2.4)", () => {
  it("teach thickness + area, then ask for volume — the rule computes and the answer cites it", async () => {
    const engine = new ArchieNativeEngine();

    const t1 = await engine.converse(
      "remember: the screed thickness is 0.05 m",
    );
    expect(t1.responseText.toLowerCase()).toContain("retain");
    const t2 = await engine.converse("remember: the floor area is 20 m2");
    expect(t2.responseText.toLowerCase()).toContain("retain");

    const answer = await engine.converse("what is the screed volume?");
    const text = answer.responseText;

    // The computed volume: 0.05 m x 20 m2 = 1.0 m3.
    expect(text).toMatch(/1(\.0+)?/);
    // Derived labeling (P8): a rule-chain conclusion is never
    // presented as owner-validated knowledge.
    expect(text.toLowerCase()).toMatch(/deriv|inferred|rule/);
    expect(text.toLowerCase()).not.toContain("validated knowledge on this yet");
    // The derived fact is cited.
    expect(answer.citedFactIds.length).toBeGreaterThan(0);
  });

  it("still refuses honestly when a premise is missing", async () => {
    const engine = new ArchieNativeEngine();
    // Thickness taught, but NO floor area — the rule must
    // refuse to conclude (no guessed volume). The SPO probe
    // finds no screed/volume fact, the chain derives nothing,
    // and the answer does NOT claim a volume. It may still
    // honestly surface the related taught fact or the honest
    // unknown line — but never a fabricated number.
    await engine.converse("remember: the screed thickness is 0.05 m");
    const answer = await engine.converse("what is the screed volume?");
    const text = answer.responseText.toLowerCase();
    expect(text).not.toMatch(/volume\s*[:=]?\s*\d/);
    expect(text).not.toMatch(/derived|inferred/);
  });
});
