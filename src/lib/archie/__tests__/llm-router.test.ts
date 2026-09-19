import { describe, expect, it } from "vitest";
// =========================================================
// LLM ROUTER (draft scaffold, owner directive 2026-09-16).
// Contract: ZERO external AI models are wired into ARCHIE.
// The default router declines every composition honestly;
// stub providers prove the seam, the labeling, the budget and
// the inertness of model output — without any real model.
// =========================================================

import {
  createDefaultModelRouter,
  LLMRouter,
  type ModelProvider,
} from "@studio-shared/archie-ai/native-engine/llm-router.ts";

function stubProvider(
  id: string,
  opts: {
    text?: string | null;
    available?: boolean;
    failGenerate?: boolean;
  } = {},
): ModelProvider {
  return {
    id,
    description: `test provider ${id}`,
    available: async () => opts.available ?? true,
    generate: async () => {
      if (opts.failGenerate) throw new Error("boom");
      return opts.text === undefined ? `draft from ${id}` : opts.text;
    },
  };
}

describe("LLMRouter — default (owner constraint)", () => {
  it("ships with ZERO providers and declines every composition honestly", async () => {
    const r = createDefaultModelRouter();
    expect(r.providerIds()).toEqual([]);
    const res = await r.compose({ task: "compose", input: "anything" });
    expect(res.used).toBe(false);
    expect(res.providerId).toBeNull();
    expect(res.text).toBe("");
    expect(res.note).toContain("no language model configured");
    expect(res.note).toContain("100% native");
  });
});

describe("LLMRouter — provider seam (stubs only, no real models)", () => {
  it("composes through the first working provider and LABELS the output", async () => {
    const r = new LLMRouter({ providers: [stubProvider("future-model")] });
    const res = await r.compose({ task: "summarize", input: "some text" });
    expect(res.used).toBe(true);
    expect(res.providerId).toBe("future-model");
    expect(res.text).toContain("draft from future-model");
    // LABELED + INERT: the note says draft content, never authority.
    expect(res.note).toContain("future-model");
    expect(res.note).toContain("never authority-bearing");
  });

  it("falls through an unavailable provider to the next honestly", async () => {
    const r = new LLMRouter({
      providers: [stubProvider("down", { available: false }), stubProvider("up")],
    });
    const res = await r.compose({ task: "compose", input: "x" });
    expect(res.used).toBe(true);
    expect(res.providerId).toBe("up");
  });

  it("falls through a provider whose generate throws", async () => {
    const r = new LLMRouter({
      providers: [stubProvider("broken", { failGenerate: true }), stubProvider("ok")],
    });
    const res = await r.compose({ task: "compose", input: "x" });
    expect(res.used).toBe(true);
    expect(res.providerId).toBe("ok");
  });

  it("reports an honest all-failed note when no provider produces text", async () => {
    const r = new LLMRouter({
      providers: [
        stubProvider("a", { available: false }),
        stubProvider("b", { text: null }),
      ],
    });
    const res = await r.compose({ task: "compose", input: "x" });
    expect(res.used).toBe(false);
    expect(res.note).toContain("a: not available");
    expect(res.note).toContain("b: returned no text");
  });

  it("enforces the hard composition budget and refuses honestly", async () => {
    const r = new LLMRouter({ providers: [stubProvider("m")], compositionLimit: 2 });
    const first = await r.compose({ task: "compose", input: "1" });
    const second = await r.compose({ task: "compose", input: "2" });
    const third = await r.compose({ task: "compose", input: "3" });
    expect(first.used).toBe(true);
    expect(second.used).toBe(true);
    expect(third.used).toBe(false);
    expect(third.note).toContain("budget exhausted");
    expect(third.compositionsUsed).toBe(2);
    expect(third.compositionLimit).toBe(2);
  });

  it("rejects empty model output — never returns blank text as a composition", async () => {
    const r = new LLMRouter({ providers: [stubProvider("blank", { text: "   " })] });
    const res = await r.compose({ task: "compose", input: "x" });
    expect(res.used).toBe(false);
    expect(res.note).toContain("returned no text");
  });
});
