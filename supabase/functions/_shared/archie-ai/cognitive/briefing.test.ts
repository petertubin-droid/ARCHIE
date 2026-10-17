// ============================================================
// ARCHIE PROACTIVE BRIEFING ENGINE — TESTS
// Real-row composition, honest emptiness, daily idempotence,
// determinism.
// ============================================================

import { describe, expect, it } from "vitest";
import { composeBriefing, runBriefingPass } from "./briefing.ts";
import type { BriefingClient } from "./briefing.ts";

function mockClient(tables: Record<string, unknown[]>) {
  const upserts: Record<string, Record<string, unknown>[]> = {};
  const client: BriefingClient = {
    from: (table: string) => {
      const result = (cols?: unknown[]) => {
        const opts = (cols?.[1] ?? {}) as { head?: boolean };
        if (opts.head) {
          return {
            data: null,
            count: (tables[`count:${table}`] as unknown as number) ??
              (tables[table] ?? []).length,
            error: null,
          };
        }
        return { data: tables[table] ?? [], error: null };
      };
      let captured: unknown[] = [];
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(result(captured)).then(res, rej),
        limit: () => Promise.resolve(result(captured)),
        eq: () => builder,
        gte: () => builder,
        order: () => builder,
      });
      return {
        select: (...cols: unknown[]) => {
          captured = cols;
          return builder;
        },
        upsert: (row: Record<string, unknown>) => {
          (upserts[table] ??= []).push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { client, upserts };
}

describe("composeBriefing — real data, deterministic text", () => {
  it("reports each section from the real rows", async () => {
    const { client } = mockClient({
      archie_alerts: [
        { alert_code: "A1_HEARTBEAT_FAILING", severity: "CRITICAL", message: "scheduler heartbeat failing: 4 consecutive failed runs", last_seen_at: new Date().toISOString() },
      ],
      archie_tuning_events: [
        { param_key: "maxSteps", from_value: 24, to_value: 28, outcome: "applied", reason: "success 0.91 with 40 outcomes — stepped within the envelope" },
        { param_key: "maxDepth", from_value: 8, to_value: 6, outcome: "rolled_back", reason: "regression after last adjustment" },
      ],
      archie_reasoning_problems: [
        { status: "SOLVED" }, { status: "SOLVED" }, { status: "UNRESOLVED" },
      ],
      archie_task_states: [
        { status: "completed" }, { status: "failed" },
      ],
      frelux_archie_audit_events: [{ id: "a1" }, { id: "a2" }],
    });
    const b = await composeBriefing(client);
    expect(b.text).toContain("1 active alert(s)");
    expect(b.text).toContain("[CRITICAL] scheduler heartbeat failing");
    expect(b.text).toContain("1 adjustment(s) applied, 1 rolled back");
    expect(b.text).toContain("maxSteps: 24 → 28");
    expect(b.text).toContain("maxDepth: reverted to 6");
    expect(b.text).toContain("2 problem(s) solved, 1 unresolved, of 3 recorded");
    expect(b.text).toContain("1 completed, 1 failed, of 2 observed");
    expect(b.text).toContain("2 audit event(s) recorded");
    expect(b.sections).toMatchObject({ reasoning: { solved: 2, unresolved: 1, total: 3 } });
  });

  it("an empty day is reported honestly, never padded", async () => {
    const { client } = mockClient({});
    const b = await composeBriefing(client);
    expect(b.text).toContain("No active alerts");
    expect(b.text).toContain("no envelope changes were warranted");
    expect(b.text).toContain("no problems were recorded");
    expect(b.text).toContain("no supervised task activity");
    expect(b.text).toContain("no audit events");
  });

  it("is deterministic: same rows, same text", async () => {
    const tables = {
      archie_alerts: [{ alert_code: "A2_CRITICAL_SECURITY_EVENTS", severity: "CRITICAL", message: "2 critical security event(s)", last_seen_at: new Date().toISOString() }],
      archie_reasoning_problems: [{ status: "SOLVED" }],
    };
    const a = await composeBriefing(mockClient(tables).client);
    const c = await composeBriefing(mockClient(tables).client);
    expect(a.text).toBe(c.text);
  });

  it("degrades honestly when every read fails", async () => {
    const client: BriefingClient = {
      from: () => {
        throw new Error("db down");
      },
    };
    const b = await composeBriefing(client);
    expect(b.text).toContain("No active alerts");
    expect(b.sections.reasoning).toEqual({ solved: 0, unresolved: 0, total: 0 });
  });
});

describe("runBriefingPass — once per day, idempotent", () => {
  it("composes fresh on the first call of the day and stores it", async () => {
    const { client, upserts } = mockClient({
      archie_reasoning_problems: [{ status: "SOLVED" }],
    });
    const pass = await runBriefingPass(client);
    expect(pass.fresh).toBe(true);
    expect(pass.briefing.text).toContain("1 problem(s) solved");
    expect(upserts["archie_briefings"]).toHaveLength(1);
  });

  it("returns the stored briefing unchanged on a later call the same day", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const stored = {
      brief_date: today,
      text: `ARCHIE daily briefing for ${today}.\nStored earlier today.`,
      sections: {},
    };
    const { client, upserts } = mockClient({
      archie_briefings: [stored],
    });
    const pass = await runBriefingPass(client);
    expect(pass.fresh).toBe(false);
    expect(pass.briefing.text).toBe(stored.text);
    expect(pass.briefing.brief_date).toBe(stored.brief_date);
    expect(upserts["archie_briefings"]).toBeUndefined(); // no rewrite
  });
});
