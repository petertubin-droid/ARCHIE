/** Durable lifecycle-event boundary for the internal agent worker. */
export const AGENT_EVENT_TYPES = [
  "CREATE",
  "AUTHORIZE",
  "ASSIGN",
  "EXECUTE",
  "MONITOR",
  "REPORT",
  "TERMINATE",
  "FAIL",
  "COST",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AgentEventClient {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{
      error: { message?: string } | null;
    }>;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Persist an event using the database's constrained event vocabulary and UUID actor.
 * Supabase reports PostgREST failures in `{ error }` without rejecting the promise,
 * so checking that result is part of the durability contract. */
export async function appendAgentEvent(
  client: AgentEventClient,
  input: {
    agentId: string;
    actorId: string;
    event: AgentEventType;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  if (!UUID_RE.test(input.agentId)) {
    throw new Error("Agent event requires a valid agent UUID.");
  }
  if (!UUID_RE.test(input.actorId)) {
    throw new Error("Agent event requires a valid actor UUID.");
  }
  if (!(AGENT_EVENT_TYPES as readonly string[]).includes(input.event)) {
    throw new Error("Agent event type is not allowed by the lifecycle schema.");
  }

  const { error } = await client.from("frelux_archie_agent_events").insert({
    agent_id: input.agentId,
    event: input.event,
    detail: input.detail,
    actor: input.actorId,
  });
  if (error) {
    throw new Error(`Agent lifecycle event could not be persisted: ${error.message ?? "database error"}`);
  }
}
