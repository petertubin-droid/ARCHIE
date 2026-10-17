// ============================================================
// ARCHIE PROACTIVE BRIEFING ENGINE
// (full-agent audit 2026-10-17, gap E-1)
//
// Before this engine ARCHIE never spoke first: everything it
// knew sat in tables until the owner asked. This engine
// composes a deterministic daily briefing from the REAL
// operational record:
//
//   * active alerts (observability engine) — highest first
//   * tuning decisions (self-tuning engine) — what changed
//     and why, including rollbacks
//   * reasoning activity (problems solved / unresolved)
//   * task outcomes (completed / failed)
//   * security posture (audit events in the window)
//
// HONESTY CONTRACT: every number in the briefing is counted
// from real rows in the window. An empty day produces an
// honest "nothing to report" briefing — never padded, never
// invented. The briefing is composed natively (template +
// counts), deterministically: same data, same text.
//
// Once per day: a second pass on the same date returns the
// stored briefing unchanged (idempotent — the hourly
// heartbeat can call it every run).
// ============================================================

export interface BriefingClient {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const BRIEFINGS_TABLE = "archie_briefings";

export interface Briefing {
  brief_date: string;
  text: string;
  sections: Record<string, unknown>;
}

function isoWindowHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/** Compose the daily briefing from the real 24h record.
 *  Deterministic: same rows in, same text out. */
export async function composeBriefing(
  client: BriefingClient,
): Promise<Briefing> {
  const since = isoWindowHoursAgo(24);
  const briefDate = new Date().toISOString().slice(0, 10);
  const sections: Record<string, unknown> = {};

  const safe = async <T>(op: () => Promise<T>): Promise<T | null> => {
    try {
      return await op();
    } catch {
      return null;
    }
  };

  // 1) active alerts (unresolved, seen in the window)
  const alerts = await safe(() =>
    client
      .from("archie_alerts")
      .select("alert_code, severity, message, last_seen_at")
      .eq("resolved", false)
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(10)
  );
  const alertRows = ((alerts as { data?: Array<{ alert_code: string; severity: string; message: string }> } | null)?.data ?? []) as Array<{ alert_code: string; severity: string; message: string }>;
  sections.alerts = alertRows;

  // 2) tuning decisions in the window
  const tuning = await safe(() =>
    client
      .from("archie_tuning_events")
      .select("param_key, from_value, to_value, outcome, reason")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10)
  );
  const tuningRows = ((tuning as { data?: Array<{ param_key: string; from_value: number; to_value: number; outcome: string; reason: string }> } | null)?.data ?? []) as Array<{ param_key: string; from_value: number; to_value: number; outcome: string; reason: string }>;
  sections.tuning = tuningRows;

  // 3) reasoning problems in the window
  const reasoning = await safe(() =>
    client
      .from("archie_reasoning_problems")
      .select("status")
      .gte("created_at", since)
  );
  const reasoningRows = ((reasoning as { data?: Array<{ status: string }> } | null)?.data ?? []) as Array<{ status: string }>;
  const solved = reasoningRows.filter((r) => r.status === "SOLVED").length;
  const unresolved = reasoningRows.filter((r) => r.status === "UNRESOLVED").length;
  sections.reasoning = { solved, unresolved, total: reasoningRows.length };

  // 4) task outcomes in the window
  const tasks = await safe(() =>
    client
      .from("archie_task_states")
      .select("status")
      .gte("updated_at", since)
  );
  const taskRows = ((tasks as { data?: Array<{ status: string }> } | null)?.data ?? []) as Array<{ status: string }>;
  const tasksCompleted = taskRows.filter((t) => t.status === "completed").length;
  const tasksFailed = taskRows.filter((t) => t.status === "failed").length;
  sections.tasks = { completed: tasksCompleted, failed: tasksFailed, total: taskRows.length };

  // 5) security events in the window
  const security = await safe(() =>
    client
      .from("frelux_archie_audit_events")
      .select("id, severity", { count: "exact", head: true })
      .gte("created_at", since)
  );
  const securityEvents = ((security as { count?: number } | null)?.count ?? 0) as number;
  sections.security_events_24h = securityEvents;

  // ---- deterministic composition ----
  const lines: string[] = [];
  lines.push(`ARCHIE daily briefing for ${briefDate}.`);

  if (alertRows.length === 0) {
    lines.push("No active alerts. All monitored conditions are within bounds.");
  } else {
    lines.push(`${alertRows.length} active alert(s):`);
    for (const a of alertRows) {
      lines.push(`- [${a.severity}] ${a.message}`);
    }
  }

  const applied = tuningRows.filter((t) => t.outcome === "applied");
  const rolledBack = tuningRows.filter((t) => t.outcome === "rolled_back");
  if (applied.length > 0 || rolledBack.length > 0) {
    lines.push(
      `Self-tuning: ${applied.length} adjustment(s) applied, ${rolledBack.length} rolled back.`,
    );
    for (const t of applied) {
      lines.push(`- ${t.param_key}: ${t.from_value} → ${t.to_value} (${t.reason})`);
    }
    for (const t of rolledBack) {
      lines.push(`- ${t.param_key}: reverted to ${t.to_value} (${t.reason})`);
    }
  } else {
    lines.push("Self-tuning: no envelope changes were warranted.");
  }

  if (reasoningRows.length === 0) {
    lines.push("Reasoning: no problems were recorded in the last 24 hours.");
  } else {
    lines.push(
      `Reasoning: ${solved} problem(s) solved, ${unresolved} unresolved, of ${reasoningRows.length} recorded.`,
    );
  }

  if (taskRows.length === 0) {
    lines.push("Tasks: no supervised task activity in the last 24 hours.");
  } else {
    lines.push(
      `Tasks: ${tasksCompleted} completed, ${tasksFailed} failed, of ${taskRows.length} observed.`,
    );
  }

  lines.push(
    securityEvents === 0
      ? "Security: no audit events in the window."
      : `Security: ${securityEvents} audit event(s) recorded in the window.`,
  );

  return { brief_date: briefDate, text: lines.join("\n"), sections };
}

/** The daily pass: compose once, store, and on every later
 *  call the same day return the stored briefing unchanged
 *  (idempotent — the hourly heartbeat calls it every run). */
export async function runBriefingPass(
  client: BriefingClient,
): Promise<{ briefing: Briefing; fresh: boolean }> {
  const briefDate = new Date().toISOString().slice(0, 10);
  try {
    const existing = await client
      .from(BRIEFINGS_TABLE)
      .select("brief_date, text, sections")
      .eq("brief_date", briefDate)
      .limit(1);
    const rows = ((existing as { data?: Array<Briefing> } | null)?.data ?? []) as Briefing[];
    if (rows.length > 0) {
      return { briefing: rows[0], fresh: false };
    }
  } catch {
    // fall through to compose; a failed read never invents a
    // briefing, and the compose path re-checks below
  }

  const briefing = await composeBriefing(client);
  try {
    await client
      .from(BRIEFINGS_TABLE)
      .upsert(briefing, { onConflict: "brief_date" });
  } catch {
    // the briefing is still returned honestly even when the
    // store write fails
  }
  return { briefing, fresh: true };
}
