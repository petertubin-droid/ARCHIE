import { describe, expect, it, vi } from "vitest";
import { appendAgentEvent } from "./audit-events.ts";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function clientReturning(error: { message: string } | null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert };
}

describe("agent lifecycle event persistence", () => {
  it("writes a schema-valid event with UUID actor and agent", async () => {
    const { client, from, insert } = clientReturning(null);

    await expect(
      appendAgentEvent(client, {
        agentId: AGENT_ID,
        actorId: ACTOR_ID,
        event: "REPORT",
        detail: { report_id: "report-1" },
      }),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith("frelux_archie_agent_events");
    expect(insert).toHaveBeenCalledWith({
      agent_id: AGENT_ID,
      actor: ACTOR_ID,
      event: "REPORT",
      detail: { report_id: "report-1" },
    });
  });

  it("surfaces PostgREST errors returned without a rejected promise", async () => {
    const { client } = clientReturning({ message: "constraint violation" });

    await expect(
      appendAgentEvent(client, {
        agentId: AGENT_ID,
        actorId: ACTOR_ID,
        event: "FAIL",
        detail: {},
      }),
    ).rejects.toThrow(/constraint violation/);
  });

  it("rejects event names not allowed by the database constraint before writing", async () => {
    const { client, insert } = clientReturning(null);

    await expect(
      appendAgentEvent(client, {
        agentId: AGENT_ID,
        actorId: ACTOR_ID,
        event: "TASK_EXECUTED" as never,
        detail: {},
      }),
    ).rejects.toThrow(/not allowed/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID actor before writing", async () => {
    const { client, insert } = clientReturning(null);

    await expect(
      appendAgentEvent(client, {
        agentId: AGENT_ID,
        actorId: "archie-agent-worker",
        event: "REPORT",
        detail: {},
      }),
    ).rejects.toThrow(/valid actor UUID/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("propagates thrown storage errors", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const client = { from: vi.fn(() => ({ insert })) };

    await expect(
      appendAgentEvent(client, {
        agentId: AGENT_ID,
        actorId: ACTOR_ID,
        event: "REPORT",
        detail: {},
      }),
    ).rejects.toThrow(/network unavailable/);
  });
});
