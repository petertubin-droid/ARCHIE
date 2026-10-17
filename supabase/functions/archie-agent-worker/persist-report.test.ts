import { describe, expect, it, vi } from "vitest";
import { persistAgentReport } from "./persist-report.ts";

const RUN_ID = "33333333-3333-4333-8333-333333333333";
const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const REPORT_ID = "44444444-4444-4444-8444-444444444444";
const input = {
  runId: RUN_ID,
  agentId: AGENT_ID,
  actorId: ACTOR_ID,
  summary: "verified result",
  detail: { executed: true },
  gates: { safety: { checked: true } },
  engine: "archie-unified-cognitive",
  event: "REPORT" as const,
};

describe("atomic agent report persistence", () => {
  it("uses one database transaction for report and lifecycle event", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: REPORT_ID, error: null });
    await expect(persistAgentReport({ rpc }, input)).resolves.toBe(REPORT_ID);
    expect(rpc).toHaveBeenCalledWith("archie_persist_agent_report_with_event", {
      p_run_id: RUN_ID,
      p_agent_id: AGENT_ID,
      p_actor_id: ACTOR_ID,
      p_summary: "verified result",
      p_detail: { executed: true },
      p_gates: { safety: { checked: true } },
      p_engine: "archie-unified-cognitive",
      p_event: "REPORT",
    });
  });

  it("surfaces database failures and rejects missing/invalid result IDs", async () => {
    await expect(persistAgentReport({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "transaction rolled back" } }) }, input))
      .rejects.toThrow(/transaction rolled back/);
    await expect(persistAgentReport({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }, input))
      .rejects.toThrow(/valid report UUID/);
  });

  it("rejects malformed identifiers before calling the database", async () => {
    const rpc = vi.fn();
    await expect(persistAgentReport({ rpc }, { ...input, runId: "bad" })).rejects.toThrow(/execution run UUID/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
