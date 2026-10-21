// ============================================================
// ARCHIE OBSERVABILITY & ALERTING ENGINE — TESTS
// Deterministic alert rules, honest signal reading, alert
// lifecycle (upsert active / auto-resolve cleared).
// ============================================================

import { describe, expect, it } from "vitest";
import {
  evaluateAlerts,
  readSignals,
  runObservabilityPass,
  type ObservabilityClient,
  type ObservabilitySignals,
} from "./observability.ts";

function baseSignals(over: Partial<ObservabilitySignals> = {}): ObservabilitySignals {
  return {
    schedulerRunsTotal: 10,
    schedulerRunsFailed: 0,
    consecutiveSchedulerFailures: 0,
    criticalSecurityEvents: 0,
    reasoningRuns: 0,
    reasoningValidationFailures: 0,
    taskTotal: 0,
    taskFailed: 0,
    calibrationKeys: [],
    tuningDecisions: 0,
    secretRotationOverdue: [],
    secretsTracked: 0,
    ...over,
  };
}

describe("deterministic alert rules", () => {
  it("no alerts from a healthy baseline", () => {
    expect(evaluateAlerts(baseSignals())).toEqual([]);
  });

  it("A1: >= 3 consecutive scheduler failures is CRITICAL", () => {
    const alerts = evaluateAlerts(baseSignals({ consecutiveSchedulerFailures: 3 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe("A1_HEARTBEAT_FAILING");
    expect(alerts[0].severity).toBe("CRITICAL");
    // 2 failures stays silent — threshold honesty
    expect(evaluateAlerts(baseSignals({ consecutiveSchedulerFailures: 2 }))).toEqual([]);
  });

  it("A2: critical security events are CRITICAL", () => {
    const alerts = evaluateAlerts(baseSignals({ criticalSecurityEvents: 2 }));
    expect(alerts[0].code).toBe("A2_CRITICAL_SECURITY_EVENTS");
    expect(alerts[0].severity).toBe("CRITICAL");
  });

  it("A3: reasoning quality alert needs a sample of 20+ and rate > 50%", () => {
    const small = evaluateAlerts(
      baseSignals({ reasoningRuns: 10, reasoningValidationFailures: 9 }),
    );
    expect(small).toEqual([]); // 10 runs is not enough evidence
    const big = evaluateAlerts(
      baseSignals({ reasoningRuns: 50, reasoningValidationFailures: 30 }),
    );
    expect(big[0].code).toBe("A3_REASONING_QUALITY_REGRESSED");
    expect(big[0].severity).toBe("WARNING");
    const fine = evaluateAlerts(
      baseSignals({ reasoningRuns: 50, reasoningValidationFailures: 10 }),
    );
    expect(fine).toEqual([]); // 20% is healthy
  });

  it("A4: task failure alert needs 20+ tasks and rate > 40%", () => {
    expect(
      evaluateAlerts(baseSignals({ taskTotal: 20, taskFailed: 11 }))[0]?.code,
    ).toBe("A4_TASK_FAILURE_RATE_HIGH");
    expect(evaluateAlerts(baseSignals({ taskTotal: 19, taskFailed: 19 }))).toEqual([]);
  });

  it("A5: degraded calibration keys get per-key alerts", () => {
    const alerts = evaluateAlerts(
      baseSignals({
        calibrationKeys: [
          { key: "reasoning:MATH", successes: 1, failures: 9 },
          { key: "reasoning:PLANNING", successes: 8, failures: 2 },
          { key: "reasoning:NEW", successes: 0, failures: 2 }, // not enough outcomes
        ],
      }),
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].code).toBe("A5_CALIBRATION_DEGRADED:reasoning:MATH");
  });

  it("deterministic: identical signals produce identical alerts", () => {
    const s = baseSignals({ consecutiveSchedulerFailures: 4, criticalSecurityEvents: 1 });
    expect(evaluateAlerts(s)).toEqual(evaluateAlerts(s));
  });
});

function mockClient(tables: Record<string, unknown[]>) {
  const upserts: Record<string, Record<string, unknown>[]> = {};
  const client: ObservabilityClient = {
    from: (table: string) => {
      // universal chainable query builder: works for direct
      // await, .eq(), .order().limit(), and head-counts
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
        if (table.endsWith("archie_alerts")) {
          return { data: tables[`${table}:eq`] ?? [], error: null };
        }
        return { data: tables[table] ?? [], error: null };
      };
      let captured: unknown[] = [];
      const builder: Record<string, unknown> = {};
      const self = {
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(result(captured)).then(res, rej),
        limit: () => Promise.resolve(result(captured)),
        eq: () => Promise.resolve(result(captured)),
        order: () => builder,
      };
      Object.assign(builder, self);
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

describe("readSignals — real counts, honest degradation", () => {
  it("counts consecutive failures newest-first and stops at the first success", async () => {
    const { client } = mockClient({
      archie_scheduler_runs: [
        { ok: false }, { ok: false }, { ok: true }, { ok: false },
      ],
      frelux_archie_audit_events: [],
      archie_reasoning_runs: [
        { solution_validated: true }, { solution_validated: false },
      ],
      archie_task_states: [{ status: "failed" }, { status: "completed" }],
      archie_calibration: [
        { calibration_key: "reasoning:MATH", successes: 3, failures: 1 },
      ],
      archie_tuning_events: [{ id: "e1" }, { id: "e2" }],
    });
    const signals = await readSignals(client);
    expect(signals.schedulerRunsTotal).toBe(4);
    expect(signals.consecutiveSchedulerFailures).toBe(2); // fail, fail, SUCCESS stops the count
    expect(signals.schedulerRunsFailed).toBe(3);
    expect(signals.reasoningRuns).toBe(2);
    expect(signals.reasoningValidationFailures).toBe(1);
    expect(signals.taskFailed).toBe(1);
    expect(signals.calibrationKeys).toEqual([
      { key: "reasoning:MATH", successes: 3, failures: 1 },
    ]);
    expect(signals.tuningDecisions).toBe(2);
  });

  it("a failed table read contributes zeros without aborting the pass", async () => {
    const client: ObservabilityClient = {
      from: () => {
        throw new Error("db down");
      },
    };
    const signals = await readSignals(client);
    expect(signals.schedulerRunsTotal).toBe(0);
    expect(signals.calibrationKeys).toEqual([]);
    expect(signals.consecutiveSchedulerFailures).toBe(0);
  });
});

describe("runObservabilityPass — lifecycle + snapshot", () => {
  it("upserts active alerts and auto-resolves cleared codes", async () => {
    const { client, upserts } = mockClient({
      archie_scheduler_runs: [{ ok: false }, { ok: false }, { ok: false }, { ok: false }],
      frelux_archie_audit_events: [],
      archie_reasoning_runs: [],
      archie_task_states: [],
      archie_calibration: [],
      archie_tuning_events: [],
      "archie_alerts:eq": [{ alert_code: "A5_CALIBRATION_DEGRADED:reasoning:MATH" }],
    });
    const result = await runObservabilityPass(client);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].code).toBe("A1_HEARTBEAT_FAILING");

    // metrics snapshot written for today
    const metricsUpserts = upserts["archie_metrics_daily"] ?? [];
    expect(metricsUpserts).toHaveLength(1);
    expect(metricsUpserts[0].metrics).toMatchObject({
      consecutive_scheduler_failures: 4,
    });

    // alert upserted as unresolved
    const alertUpserts = upserts["archie_alerts"] ?? [];
    const active = alertUpserts.find((u) => u.alert_code === "A1_HEARTBEAT_FAILING");
    expect(active?.resolved).toBe(false);
    expect(active?.severity).toBe("CRITICAL");

    // the cleared A5 code is auto-resolved
    const resolved = alertUpserts.find(
      (u) => u.alert_code === "A5_CALIBRATION_DEGRADED:reasoning:MATH",
    );
    expect(resolved?.resolved).toBe(true);
  });

  it("is deterministic given the same real inputs", async () => {
    const mk = () =>
      mockClient({
        archie_scheduler_runs: [{ ok: false }, { ok: false }, { ok: false }],
        frelux_archie_audit_events: [],
        archie_reasoning_runs: [],
        archie_task_states: [],
        archie_calibration: [],
        archie_tuning_events: [],
        "archie_alerts:eq": [],
      });
    const a = await runObservabilityPass(mk().client);
    const b = await runObservabilityPass(mk().client);
    expect(a.alerts).toEqual(b.alerts);
    expect(a.metrics).toEqual(b.metrics);
  });
});

describe("secrets rotation detection (audit gap F-6, batch 40)", () => {
  it("A6 alert fires per overdue secret with honest day counts", () => {
    const alerts = evaluateAlerts(
      baseSignals({
        secretRotationOverdue: [
          { name: "BINANCE_API_KEY", daysOverdue: 12 },
          { name: "GEMINI_API_KEY", daysOverdue: 3 },
        ],
        secretsTracked: 4,
      }),
    );
    const a6 = alerts.filter((a) => a.code.startsWith("A6_SECRET_ROTATION_OVERDUE"));
    expect(a6.map((a) => a.code).sort()).toEqual([
      "A6_SECRET_ROTATION_OVERDUE:BINANCE_API_KEY",
      "A6_SECRET_ROTATION_OVERDUE:GEMINI_API_KEY",
    ]);
    expect(a6.every((a) => a.severity === "WARNING")).toBe(true);
    expect(a6[0].message).toContain("12 day(s)");
  });

  it("no A6 alerts when every tracked secret is within interval", () => {
    const alerts = evaluateAlerts(
      baseSignals({ secretsTracked: 3, secretRotationOverdue: [] }),
    );
    expect(alerts.filter((a) => a.code.startsWith("A6")).length).toBe(0);
  });

  it("readSignals computes overdue from registry rows against the clock", async () => {
    const now = Date.now();
    const iso = (daysAgo: number) =>
      new Date(now - daysAgo * 86_400_000).toISOString();
    const { client } = mockClient({
      archie_secret_registry: [
        // rotated 120 days ago, 90-day interval -> 30 days overdue
        { secret_name: "OLD_KEY", last_rotated_at: iso(120), rotation_interval_days: 90 },
        // rotated 10 days ago, 90-day interval -> fine
        { secret_name: "FRESH_KEY", last_rotated_at: iso(10), rotation_interval_days: 90 },
        // interval null -> not tracked
        { secret_name: "NO_INTERVAL", last_rotated_at: iso(500), rotation_interval_days: null },
        // never rotated -> overdue from zero
        { secret_name: "NEVER_ROTATED", last_rotated_at: null, rotation_interval_days: 90 },
      ],
    });
    const signals = await readSignals(client);
    expect(signals.secretsTracked).toBe(4);
    const names = signals.secretRotationOverdue.map((r) => r.name).sort();
    expect(names).toEqual(["NEVER_ROTATED", "OLD_KEY"]);
    const oldKey = signals.secretRotationOverdue.find((r) => r.name === "OLD_KEY")!;
    expect(oldKey.daysOverdue).toBeGreaterThanOrEqual(29);
    expect(oldKey.daysOverdue).toBeLessThanOrEqual(31);
  });

  it("a missing registry table contributes an empty, honest registry", async () => {
    const { client } = mockClient({}); // no archie_secret_registry table rows
    const signals = await readSignals(client);
    expect(signals.secretsTracked).toBe(0);
    expect(signals.secretRotationOverdue).toEqual([]);
  });
});
