/** Atomic, idempotent persistence boundary for agent work products and lifecycle events. */
export interface AgentReportPersistenceClient {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function persistAgentReport(
  client: AgentReportPersistenceClient,
  input: {
    runId: string;
    agentId: string;
    actorId: string;
    summary: string;
    detail: Record<string, unknown>;
    gates: Record<string, unknown>;
    engine: string;
    event: "REPORT" | "FAIL";
  },
): Promise<string> {
  if (!UUID_RE.test(input.runId)) throw new Error("Agent report requires a valid execution run UUID.");
  if (!UUID_RE.test(input.agentId)) throw new Error("Agent report requires a valid agent UUID.");
  if (!UUID_RE.test(input.actorId)) throw new Error("Agent report requires a valid actor UUID.");
  if (input.event !== "REPORT" && input.event !== "FAIL") {
    throw new Error("Agent report event must be REPORT or FAIL.");
  }

  const { data, error } = await client.rpc("archie_persist_agent_report_with_event", {
    p_run_id: input.runId,
    p_agent_id: input.agentId,
    p_actor_id: input.actorId,
    p_summary: input.summary,
    p_detail: input.detail,
    p_gates: input.gates,
    p_engine: input.engine,
    p_event: input.event,
  });
  if (error) throw new Error(`Agent report and lifecycle event were not persisted: ${error.message ?? "database error"}`);
  if (typeof data !== "string" || !UUID_RE.test(data)) {
    throw new Error("Agent report transaction returned no valid report UUID.");
  }
  return data;
}
