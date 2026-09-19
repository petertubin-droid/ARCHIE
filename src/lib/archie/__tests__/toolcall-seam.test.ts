import { describe, expect, it } from "vitest";
// =========================================================
// ToolCall seam bridge (audit C1, plan P1).
// The engine must EMIT toolCall parts when the caller declared
// the tool, refuse honestly when it did not, and compose the
// final answer from a real toolResult — the 11 previously
// dead chat tools become reachable through the existing loop.
// =========================================================

import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";
import type {
  ArchieInferenceRequest,
  ArchieInferenceTurn,
} from "@studio-shared/archie-ai/runtime.ts";
import { CognitiveKernel } from "@studio-shared/archie-ai/cognitive/kernel.ts";

const TOOLS = [
  { name: "market_intelligence", description: "prices", parameters: {} },
  { name: "frelux_status", description: "status", parameters: {} },
  { name: "sentry_diagnostics", description: "sentry duty", parameters: {} },
];

function req(
  message: string,
  extraTurns: ArchieInferenceTurn[] = [],
  tools = TOOLS,
): ArchieInferenceRequest {
  return {
    turns: [
      ...extraTurns,
      { role: "owner", parts: [{ text: message }] },
    ],
    tools,
    systemInstruction: "",
  };
}

describe("toolCall seam (C1 / plan P1)", () => {
  it("price query with the tool DECLARED emits a toolCall (no more dead tools)", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(req("what is the price of cement"));
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call).toBeDefined();
    expect(call?.name).toBe("market_intelligence");
    expect(call?.args).toMatchObject({ item: expect.stringContaining("cement") });
    expect(result.finishReason).toBe("TOOL_CALL");
  });

  it("the SAME question without declared tools keeps the honest refusal (visitors)", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(
      req("what is the price of cement", [], []),
    );
    expect(result.parts.find((p) => p.toolCall)).toBeUndefined();
    const text = result.parts.map((p) => p.text ?? "").join(" ");
    expect(text.toLowerCase()).toContain("do not guess");
    expect(result.finishReason).toBe("COMPLETE");
  });

  it("status query prefers the declared frelux_status tool", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(req("give me a system status report"));
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call?.name).toBe("frelux_status");
  });

  it("sentry duty with the tool DECLARED emits a toolCall even when conversational classification would misroute it", async () => {
    const engine = new ArchieNativeEngine();
    // Live incident (2026-09-16): this phrasing classified as
    // farewell and the registered sentry tool went dead. The
    // deterministic pre-intent path must reach the tool.
    const result = await engine.generate(
      req("run sentry duty: live boot/health checks of all five ARCHIE edge functions"),
    );
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call).toBeDefined();
    expect(call?.name).toBe("sentry_diagnostics");
    expect(call?.args).toMatchObject({});
    expect(result.finishReason).toBe("TOOL_CALL");
  });

  it("sentry mention WITHOUT the declared tool keeps the honest no-tool path (visitors)", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(
      req("run sentry duty", [], [
        { name: "market_intelligence", description: "prices", parameters: {} },
      ]),
    );
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call?.name ?? "none").not.toBe("sentry_diagnostics");
  });

  it("a NON-sentry message never fires the sentry tool", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate(req("give me a system status report"));
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call?.name ?? "none").not.toBe("sentry_diagnostics");
  });

  it("a trailing toolResult composes the final answer from REAL output, verbatim + provenance-labeled", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate({
      turns: [
        { role: "owner", parts: [{ text: "what is the price of cement" }] },
        {
          role: "archie",
          parts: [
            { text: "Consulting market intelligence…" },
            {
              toolCall: {
                name: "market_intelligence",
                args: { item: "cement" },
              },
            },
          ],
        },
        {
          role: "owner",
          parts: [
            {
              toolResult: {
                name: "market_intelligence",
                output: {
                  answer: "Cement (Lagos, Nigeria): 9,200 NGN per bag — observed 2026-09-08, source: approved price catalog.",
                },
              },
            },
          ],
        },
      ],
      tools: TOOLS,
      systemInstruction: "",
    });
    const text = result.parts.map((p) => p.text ?? "").join("\n");
    expect(result.parts.find((p) => p.toolCall)).toBeUndefined();
    expect(text).toContain("9,200 NGN per bag");
    expect(text).toContain("market_intelligence tool — real system output");
    expect(result.finishReason).toBe("COMPLETE");
  });

  it("a tool error output is relayed honestly, not dressed up", async () => {
    const engine = new ArchieNativeEngine();
    const result = await engine.generate({
      turns: [
        {
          role: "owner",
          parts: [
            {
              toolResult: {
                name: "market_intelligence",
                output: { error: "region is required" },
              },
            },
          ],
        },
      ],
      tools: TOOLS,
      systemInstruction: "",
    });
    const text = result.parts.map((p) => p.text ?? "").join("\n");
    expect(text).toContain("region is required");
  });

  it("the cognitive KERNEL relays the toolCall too — the seam is bridged end-to-end", async () => {
    const kernel = new CognitiveKernel();
    const result = await kernel.generate(req("what is the price of cement"));
    const call = result.parts.find((p) => p.toolCall)?.toolCall;
    expect(call?.name).toBe("market_intelligence");
    expect(result.finishReason).toBe("TOOL_CALL");
  });
});

describe("direct cycle() tool seam (plan P1 parity, 2026-09-16)", () => {
  // archie-chat's OWNER path drives kernel.cycle() directly —
  // generate()'s noteDeclaredTools is bypassed. Without
  // kernel.declareTools() the substrate's requestToolNames
  // stays empty and every declared tool is dead on that path
  // (live incident: 'run sentry duty' misrouted to farewell).

  it("declareTools + direct cycle() relays the sentry toolCall (owner path no longer dead)", async () => {
    const kernel = new CognitiveKernel();
    const conversationId = "seam-owner-path-1";
    kernel.declareTools(TOOLS.map((t) => t.name), conversationId);
    const cycle = await kernel.cycle(
      "run sentry duty: live boot/health checks of all five ARCHIE edge functions",
      [],
      undefined,
      { conversationId },
    );
    expect(cycle.toolCall).toBeDefined();
    expect(cycle.toolCall?.name).toBe("sentry_diagnostics");
  });

  it("WITHOUT declareTools the direct cycle() path stays honest — no phantom tools", async () => {
    const kernel = new CognitiveKernel();
    const cycle = await kernel.cycle(
      "run sentry duty: live boot/health checks of all five ARCHIE edge functions",
      [],
      undefined,
      { conversationId: "seam-owner-path-2" },
    );
    expect(cycle.toolCall).toBeUndefined();
  });

  it("the caller's tool loop resumes through kernel.generate: trailing toolResult composes the final answer", async () => {
    const kernel = new CognitiveKernel();
    const conversationId = "seam-owner-path-3";
    kernel.declareTools(TOOLS.map((t) => t.name), conversationId);
    const cycle = await kernel.cycle(
      "run sentry duty: live boot/health checks of all five ARCHIE edge functions",
      [],
      undefined,
      { conversationId },
    );
    expect(cycle.toolCall?.name).toBe("sentry_diagnostics");
    // the caller executed the tool and feeds the REAL output back
    const resumed = await kernel.generate({
      turns: [
        {
          role: "owner",
          parts: [
            {
              text: "run sentry duty: live boot/health checks of all five ARCHIE edge functions",
            },
          ],
        },
        {
          role: "archie",
          parts: [
            { text: "Standing sentry duty." },
            {
              toolCall: {
                name: "sentry_diagnostics",
                args: cycle.toolCall?.args ?? {},
              },
            },
          ],
        },
        {
          role: "owner",
          parts: [
            {
              toolResult: {
                name: "sentry_diagnostics",
                output: {
                  ok: true,
                  functions: {
                    "archie-chat": "up",
                    "archie-agents": "up",
                    "archie-crypto": "up",
                    "archie-extract": "up",
                    "archie-ingestion": "up",
                  },
                },
              },
            },
          ],
        },
      ],
      tools: TOOLS,
      systemInstruction: "",
      conversationId,
    });
    const text = resumed.parts.map((p) => p.text ?? "").join(" ");
    expect(text.length).toBeGreaterThan(0);
    expect(resumed.finishReason).toBe("COMPLETE");
    expect(text).toContain("up");
  });
});
