import { describe, expect, it } from "vitest";
import {
  logKnowledgeGap,
  normalizeQuestion,
  type ServiceLike,
} from "./gap-log.ts";

function stubService(shouldFail = false): ServiceLike {
  return {
    rpc: async () => ({
      error: shouldFail ? { message: "db down" } : null,
      data: null,
    }),
  } as unknown as ServiceLike;
}

describe("knowledge gap logging (tree roots)", () => {
  it("normalizes whitespace and truncates to 300 chars", () => {
    expect(normalizeQuestion("  what   is this  ")).toBe("what is this");
    expect(normalizeQuestion("x".repeat(400)).length).toBe(300);
  });

  it("logs via the SECURITY DEFINER rpc with the normalized question", async () => {
    let calledWith: Record<string, unknown> | null = null;
    const svc: ServiceLike = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        if (fn === "archie_log_knowledge_gap") calledWith = args ?? null;
        return { error: null, data: null };
      },
    } as unknown as ServiceLike;
    const ok = await logKnowledgeGap(svc, "  book me a   FLIGHT to Kano ");
    expect(ok).toBe(true);
    expect(calledWith).toEqual({ pQuestion: "book me a FLIGHT to Kano" });
  });

  it("NEVER throws when the db fails — the answer comes first", async () => {
    const ok = await logKnowledgeGap(stubService(true), "unsupported question");
    expect(ok).toBe(false);
  });

  it("no service / empty question logs nothing, without throwing", async () => {
    expect(await logKnowledgeGap(null, "question")).toBe(false);
    expect(await logKnowledgeGap(stubService(), "   ")).toBe(false);
    expect(await logKnowledgeGap(stubService(), "")).toBe(false);
  });
});
