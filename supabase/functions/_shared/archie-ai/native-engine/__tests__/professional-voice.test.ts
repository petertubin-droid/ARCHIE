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

/** Deterministic research double (batch 41): these tests assert
 * VOICE, not network endurance. A bare engine would run the
 * real multi-site research on question misses — 75s observed
 * on a slow network link, blowing the 20s test timeout even
 * though the voice properties under test never change. The
 * double returns an instant, honest zero so the miss-voice
 * compose path runs hermetically. */
const noResultsAdapter = {
  id: "test-zero-adapter",
  async search(_query: string) {
    return {
      hits: [],
      note: "no results found for the query",
    };
  },
};

function hermeticEngine(): ArchieNativeEngine {
  return new ArchieNativeEngine({
    researchAdapter: noResultsAdapter as never,
  });
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
    const engine = hermeticEngine();
    const answer = await engine.converse(
      "what is the blorptastic flux of znorv",
    );
    expect(answer.responseText).not.toContain("both are real options");
    expect(answer.responseText).not.toContain("on the open web");
  });

  it("no reply path ever emits an em dash", async () => {
    const engine = hermeticEngine();
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
    const engine = hermeticEngine();
    const answer = await engine.converse(
      "fact a says the sky is green, fact b says the sky is red",
    );
    expect(answer.responseText).not.toContain("My knowledge store contains");
    expect(answer.responseText).not.toContain("I will not average");
  });
});

describe("question-miss relevance gate (batch 42)", () => {
  it("irrelevant fuzzy hits are not presented as findings", async () => {
    // "flux" papers match a nonsense query for the word flux —
    // zero overlap with the actual salient tokens (blorptastic,
    // znorv). This garbage must NOT be dressed up as findings.
    const garbageAdapter = {
      id: "test-garbage-adapter",
      async search(_query: string) {
        return {
          hits: [
            {
              title: "Three-dimensional evolution of erupted flux ropes from the Sun",
              url: "https://arxiv.org/abs/example",
              snippet: "evolution of flux ropes at 2-20 Rs",
            },
          ],
          note: "search completed",
        };
      },
    };
    const engine = new ArchieNativeEngine({
      researchAdapter: garbageAdapter as never,
    });
    const answer = await engine.converse("what is the blorptastic flux of znorv");
    expect(answer.responseText).not.toContain("(public sources)");
    expect(answer.responseText).not.toContain("flux ropes");
  });

  it("genuinely relevant hits keep the professional findings format", async () => {
    const relevantAdapter = {
      id: "test-relevant-adapter",
      async search(_query: string) {
        return {
          hits: [
            {
              title: "Cross site scripting prevention overview",
              url: "https://owasp.org/xss",
              snippet: "cross site scripting prevention techniques",
            },
          ],
          note: "search completed",
        };
      },
    };
    const engine = new ArchieNativeEngine({
      researchAdapter: relevantAdapter as never,
    });
    const answer = await engine.converse(
      "how to prevent cross site scripting vulnerabilities",
    );
    expect(answer.responseText).toContain("(public sources)");
    expect(answer.responseText).toContain("owasp.org");
  });
});
