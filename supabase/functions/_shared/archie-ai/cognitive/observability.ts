// ============================================================
// ARCHIE OBSERVABILITY & ALERTING ENGINE
// (full-agent audit 2026-10-17, gap F-2)
//
// Before this engine the heartbeat ran blind: a failing
// consolidation, a regressing validation rate, a dead task
// loop — nothing surfaced anywhere unless the owner went
// looking. This engine aggregates the REAL operational
// signals into one deterministic observability pass:
//
//   * SIGNALS (all from real tables, all counted, none
//     invented): scheduler run history, critical security
//     events, reasoning run outcomes, task outcomes,
//     calibration keys, tuning decisions.
//   * ALERT RULES (deterministic, threshold-checked):
//     A1 heartbeat: >=3 consecutive failed scheduler runs
//     A2 security: any CRITICAL audit event in the window
//     A3 reasoning quality: validation failure rate > 50%
//     over the last 50 runs (needs >= 20 runs)
//     A4 tasks: failed task rate > 40% over the last 20
//     A5 calibration: any key with success < 0.3 over >= 5
//     outcomes
//   * ALERT LIFECYCLE: alerts are recomputed each pass and
//     upserted by code — present when the condition holds,
//     auto-resolved when it clears. No sticky false alarms.
//   * METRICS SNAPSHOT: one archie_metrics_daily row per day
//     — the honest longitudinal record (spec §36: never fake
//     dashboard numbers).
//
// No external AI. No sub-agents. Deterministic end to end.
// ============================================================

export interface ObservabilityClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const ALERTS_TABLE = "archie_alerts";
export const METRICS_TABLE = "archie_metrics_daily";

export type AlertSeverity = "CRITICAL" | "WARNING";

export interface Alert {
  code: string;
  severity: AlertSeverity;
  message: string;
}

export interface ObservabilitySignals {
  schedulerRunsTotal: number;
  schedulerRunsFailed: number;
  consecutiveSchedulerFailures: number;
  criticalSecurityEvents: number;
  reasoningRuns: number;
  reasoningValidationFailures: number;
  taskTotal: number;
  taskFailed: number;
  calibrationKeys: Array<{ key: string; successes: number; failures: number }>;
  tuningDecisions: number;
  /** F-6 secrets rotation: names past their rotation
   *  interval, from the owner-maintained registry. */
  secretRotationOverdue: Array<{ name: string; daysOverdue: number }>;
  secretsTracked: number;
}

export interface ObservabilityResult {
  metrics: Record<string, number>;
  alerts: Alert[];
  signalCount: number;
}

/** Deterministic alert rules over the REAL signals. Pure —
 *  same signals, same alerts, no clock, no randomness. */
export function evaluateAlerts(signals: ObservabilitySignals): Alert[] {
  const alerts: Alert[] = [];

  // A1 heartbeat
  if (signals.consecutiveSchedulerFailures >= 3) {
    alerts.push({
      code: "A1_HEARTBEAT_FAILING",
      severity: "CRITICAL",
      message: `scheduler heartbeat failing: ${signals.consecutiveSchedulerFailures} consecutive failed runs`,
    });
  }

  // A2 security
  if (signals.criticalSecurityEvents > 0) {
    alerts.push({
      code: "A2_CRITICAL_SECURITY_EVENTS",
      severity: "CRITICAL",
      message: `${signals.criticalSecurityEvents} critical security event(s) in the alert window`,
    });
  }

  // A3 reasoning quality (needs a meaningful sample)
  if (signals.reasoningRuns >= 20) {
    const rate = signals.reasoningValidationFailures / signals.reasoningRuns;
    if (rate > 0.5) {
      alerts.push({
        code: "A3_REASONING_QUALITY_REGRESSED",
        severity: "WARNING",
        message: `reasoning validation failure rate ${(rate * 100).toFixed(0)}% over the last ${signals.reasoningRuns} runs`,
      });
    }
  }

  // A4 task outcomes (needs a meaningful sample)
  if (signals.taskTotal >= 20) {
    const rate = signals.taskFailed / signals.taskTotal;
    if (rate > 0.4) {
      alerts.push({
        code: "A4_TASK_FAILURE_RATE_HIGH",
        severity: "WARNING",
        message: `task failure rate ${(rate * 100).toFixed(0)}% over the last ${signals.taskTotal} tasks`,
      });
    }
  }

  // A5 per-key calibration health
  for (const k of signals.calibrationKeys) {
    const n = k.successes + k.failures;
    if (n >= 5 && k.successes / n < 0.3) {
      alerts.push({
        code: `A5_CALIBRATION_DEGRADED:${k.key}`,
        severity: "WARNING",
        message: `calibration key ${k.key} success ${(100 * k.successes / n).toFixed(0)}% over ${n} outcomes`,
      });
    }
  }

  // A6 secrets rotation overdue (audit gap F-6): one alert per
  // registry secret past its rotation interval. The registry
  // is owner-maintained; the pass only reports truthfully.
  for (const secret of signals.secretRotationOverdue) {
    alerts.push({
      code: `A6_SECRET_ROTATION_OVERDUE:${secret.name}`,
      severity: "WARNING",
      message: `secret ${secret.name} is ${secret.daysOverdue} day(s) past its rotation interval — rotate it`,
    });
  }

  return alerts;
}

/** Read the REAL signals. Best-effort per source: a failed
 *  table read contributes zeros for that source only — the
 *  pass never fabricates, and never aborts. */
export async function readSignals(
  client: ObservabilityClient,
): Promise<ObservabilitySignals> {
  const signals: ObservabilitySignals = {
    schedulerRunsTotal: 0,
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
  };

  const safe = async <T>(op: () => Promise<T>): Promise<T | null> => {
    try {
      return await op();
    } catch {
      return null;
    }
  };

  // scheduler runs — last 50
  const runs = await safe(() =>
    client.from("archie_scheduler_runs").select("ok, created_at").order("created_at", { ascending: false }).limit(50)
  );
  const runRows = ((runs as { data?: Array<{ ok: boolean }> } | null)?.data ?? []) as Array<{ ok: boolean }>;
  signals.schedulerRunsTotal = runRows.length;
  signals.schedulerRunsFailed = runRows.filter((r) => r.ok !== true).length;
  for (const r of runRows) {
    if (r.ok !== true) signals.consecutiveSchedulerFailures += 1;
    else break; // newest-first: stop at the first success
  }

  // critical security events — audit table
  const sec = await safe(() =>
    client.from("frelux_archie_audit_events").select("id", { count: "exact", head: true }).eq("severity", "CRITICAL")
  );
  signals.criticalSecurityEvents = ((sec as { count?: number } | null)?.count ?? 0) as number;

  // reasoning runs — validation failures over last 50
  const reason = await safe(() =>
    client.from("archie_reasoning_runs").select("solution_validated").order("created_at", { ascending: false }).limit(50)
  );
  const reasonRows = ((reason as { data?: Array<{ solution_validated: boolean | null }> } | null)?.data ?? []) as Array<{ solution_validated: boolean | null }>;
  signals.reasoningRuns = reasonRows.length;
  signals.reasoningValidationFailures = reasonRows.filter(
    (r) => r.solution_validated === false,
  ).length;

  // tasks — last 20 statuses
  const tasks = await safe(() =>
    client.from("archie_task_states").select("status").order("updated_at", { ascending: false }).limit(20)
  );
  const taskRows = ((tasks as { data?: Array<{ status: string }> } | null)?.data ?? []) as Array<{ status: string }>;
  signals.taskTotal = taskRows.length;
  signals.taskFailed = taskRows.filter((t) => t.status === "failed").length;

  // calibration keys
  const cal = await safe(() =>
    client.from("archie_calibration").select("calibration_key, successes, failures")
  );
  signals.calibrationKeys = (((cal as { data?: Array<{ calibration_key: string; successes: number; failures: number }> } | null)?.data ?? [])).map(
    (r) => ({ key: r.calibration_key, successes: r.successes, failures: r.failures }),
  );

  // tuning decisions — events in the table
  const tune = await safe(() =>
    client.from("archie_tuning_events").select("id", { count: "exact", head: true })
  );
  signals.tuningDecisions = ((tune as { count?: number } | null)?.count ?? 0) as number;

  // secrets rotation registry (audit gap F-6): owner-maintained
  // rows in archie_secret_registry. A missing table
  // contributes an empty registry — the alert set stays
  // honest, never fabricated.
  const secrets = await safe(() =>
    client.from("archie_secret_registry").select("secret_name, last_rotated_at, rotation_interval_days")
  );
  const secretRows = (((secrets as { data?: Array<{ secret_name: string; last_rotated_at: string | null; rotation_interval_days: number | null }> } | null)?.data ?? [])).map(
    (r) => ({ name: r.secret_name, lastRotated: r.last_rotated_at ? Date.parse(r.last_rotated_at) : null, intervalDays: r.rotation_interval_days }),
  );
  signals.secretsTracked = secretRows.length;
  const nowMs = Date.now();
  for (const r of secretRows) {
    if (r.intervalDays == null || r.intervalDays <= 0) continue; // no interval set: not tracked
    if (r.lastRotated == null || Number.isNaN(r.lastRotated)) {
      // never rotated on record: treat as overdue from zero
      signals.secretRotationOverdue.push({ name: r.name, daysOverdue: -1 });
      continue;
    }
    const dueMs = r.lastRotated + r.intervalDays * 86_400_000;
    if (nowMs > dueMs) {
      signals.secretRotationOverdue.push({
        name: r.name,
        daysOverdue: Math.floor((nowMs - dueMs) / 86_400_000),
      });
    }
  }

  return signals;
}

/** One full observability pass: read real signals, evaluate
 *  alert rules, upsert the alert state (auto-resolve on
 *  clear), and snapshot the day's metrics. */
export async function runObservabilityPass(
  client: ObservabilityClient,
): Promise<ObservabilityResult> {
  const signals = await readSignals(client);
  const alerts = evaluateAlerts(signals);

  const metrics = {
    scheduler_runs_total: signals.schedulerRunsTotal,
    scheduler_runs_failed: signals.schedulerRunsFailed,
    consecutive_scheduler_failures: signals.consecutiveSchedulerFailures,
    critical_security_events: signals.criticalSecurityEvents,
    reasoning_runs_sampled: signals.reasoningRuns,
    reasoning_validation_failures: signals.reasoningValidationFailures,
    task_states_sampled: signals.taskTotal,
    task_failed: signals.taskFailed,
    calibration_keys: signals.calibrationKeys.length,
    tuning_decisions: signals.tuningDecisions,
    secrets_tracked: signals.secretsTracked,
    secrets_rotation_overdue: signals.secretRotationOverdue.length,
    alerts_active: alerts.length,
  };

  const today = new Date().toISOString().slice(0, 10);

  // best-effort persistence — the pass result is already
  // honest even when the DB write fails
  try {
    await client.from(METRICS_TABLE).upsert(
      { metric_date: today, metrics, generated_at: new Date().toISOString() },
      { onConflict: "metric_date" },
    );
  } catch {
    // snapshot not written; the caller still got real values
  }

  try {
    // upsert the active alert set by code; auto-resolve the
    // codes whose condition cleared this pass
    const seenCodes = new Set(alerts.map((a) => a.code));
    for (const alert of alerts) {
      await client.from(ALERTS_TABLE).upsert(
        {
          alert_code: alert.code,
          severity: alert.severity,
          message: alert.message.slice(0, 500),
          resolved: false,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "alert_code" },
      );
    }
    // resolve alerts whose condition no longer holds
    const existing = await client.from(ALERTS_TABLE).select("alert_code").eq("resolved", false);
    const rows = ((existing as { data?: Array<{ alert_code: string }> } | null)?.data ?? []) as Array<{ alert_code: string }>;
    for (const row of rows) {
      if (!seenCodes.has(row.alert_code)) {
        await client.from(ALERTS_TABLE).upsert(
          {
            alert_code: row.alert_code,
            resolved: true,
            resolved_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "alert_code" },
        );
      }
    }
  } catch {
    // alert persistence failed — the pass result still
    // reports truthfully in memory
  }

  return { metrics, alerts, signalCount: Object.keys(metrics).length };
}
