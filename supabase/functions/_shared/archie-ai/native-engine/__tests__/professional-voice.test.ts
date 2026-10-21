// ============================================================
// PROFESSIONAL REPLY STANDARD — TESTS
// Owner directive 2026-10-21: ARCHIE replies are professional,
// not AI-like: no em dashes, no unnecessary symbols, no
// first-person meta narration ("I researched on the open web",
// "[Source: ... I never fabricate ...]"). Provenance stays
// machine-readable in toolRuns metadata; visible text stays
// clean for the PWA chat and the FRELUX copilot surfaces.
// ============================================================
import { describe, expect, it } from "vitest";
import { ArchieNativeEngine } from "../engine.ts";
import { professionalText } from "../../text-hygiene.ts";
import type {
  ArchieInferenceRequest,
  ArchieInferenceResult,
} from "../../runtime.ts";

function toolResumeRequest(output: unknown): ArchieInferenceRequest {
  return {
    turns: [
      {
        role: "owner",
        parts: [
          { text: "system status" },
          { toolResult: { name: "frelux_status", output } },
        ],
      },
    ],
    tools: [{ name: "frelux_status", description: "status" }],
    systemInstruction: "",
  };
}

function replyText(result: ArchieInferenceResult): string {
  return result.parts.map((p) => p.text ?? "").join("");
}

describe("professional voice (owner directive 2026-10-21)", () => {
  it("tool-result replies carry no self-referential footer", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(
      toolResumeRequest({ profiles: { count: 2 } }),
    );
    const text = replyText(result);
    expect(text).not.toContain("I never fabricate");
    expect(text).not.toContain("[Source:");
  });

  it("structured tool output becomes clean key: value lines, not raw JSON", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(
      toolResumeRequest({
        profiles: { count: 2 },
        lexicon: { words: 87716, senses_verified: 130696 },
      }),
    );
    const text = replyText(result);
    expect(text).toContain("profiles count: 2");
    expect(text).toContain("lexicon words: 87,716");
    expect(text).toContain("lexicon senses_verified: 130,696");
    expect(text).not.toContain("{");
    expect(text).not.toContain("…");
  });

  it("professionalText strips every dash and decorative symbol variant", () => {
    expect(professionalText("a — b – c")).toBe("a, b, c");
    expect(professionalText("“x” ‘y’ … • →")).toBe('"x" \'y\' ... - to ');
  });

  it("unknown answers keep the honest marker without the chatty narration", async () => {
    const engine = new ArchieNativeEngine();
    const answer = await engine.converse(
      "what is the blorptastic flux of znorv",
    );
    expect(answer.responseText).not.toContain("both are real options");
    expect(answer.responseText).not.toContain("on the open web");
  });

  it("no reply path ever emits an em dash", async () => {
    const engine = new ArchieNativeEngine();
    const probes = [
      "what is the mean of 4, 8, 12",
      "what is the blorptastic flux of znorv",
    ];
    for (const probe of probes) {
      const answer = await engine.converse(probe);
      expect(answer.responseText).not.toMatch(/[—–]/);
    }
  });

  it("conflict answers stay professional, no first-person store narration", async () => {
    const engine = new ArchieNativeEngine();
    const answer = await engine.converse(
      "fact a says the sky is green, fact b says the sky is red",
    );
    expect(answer.responseText).not.toContain("My knowledge store contains");
    expect(answer.responseText).not.toContain("I will not average");
  });
});
