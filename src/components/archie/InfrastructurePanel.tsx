// =========================================================
// FRELUX ARCHIE OPS — LIVE INFRASTRUCTURE ASSESSMENT
//
// The real archie-infra assessment: dependency checks, the
// internal cost summary (NEVER customer credits) and budget
// states, with the append-only snapshot history. Owner-only
// surface on the Ops console.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  type InfrastructureAssessmentView,
  type InfrastructureSnapshotView,
  assessInfrastructure,
  getInfrastructureSnapshots,
} from "@/lib/archie/infrastructure-client";
import {
  AdminCard,
  AdminButton,
  StateMessage,
} from "@/components/admin/AdminUi";

function fmtCents(cents: number): string {
  return `₦${(cents / 100).toLocaleString("en-NG")}`;
}

function statusTone(s: string): string {
  if (s === "HEALTHY" || s === "OK") return "text-emerald-400";
  if (s === "DEGRADED" || s === "WARNING") return "text-amber-400";
  return "text-red-400";
}

export default function InfrastructurePanel() {
  const [assessment, setAssessment] =
    useState<InfrastructureAssessmentView | null>(null);
  const [snapshots, setSnapshots] = useState<InfrastructureSnapshotView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const [a, s] = await Promise.all([
      assessInfrastructure(),
      getInfrastructureSnapshots(5),
    ]);
    if (!("overall_status" in a)) setError(a.error);
    else setAssessment(a);
    if (!("snapshots" in s)) setError(s.error);
    else setSnapshots(s.snapshots);
    setBusy(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <AdminCard>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold">
            Live infrastructure assessment
          </h3>
          <AdminButton onClick={() => void load()} disabled={busy}>
            {busy ? "Assessing…" : "Re-assess now"}
          </AdminButton>
        </div>

        {error && (
          <StateMessage
            type="error"
            title="Assessment failed"
            message={error}
          />
        )}
        {assessment && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">Overall:</span>
              <span
                className={`font-semibold ${statusTone(assessment.overall_status)}`}
              >
                {assessment.overall_status}
              </span>
              {assessment.emergency && (
                <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                  EMERGENCY
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(assessment.assessed_at).toLocaleString("en-NG")}
              </span>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dependency checks
              </h4>
              <ul className="space-y-1 text-xs">
                {assessment.checks.map((c) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className={statusTone(c.ok ? "OK" : "CRITICAL")}>
                      {c.ok ? "●" : "▲"}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.detail}</span>
                    {c.latency_ms != null && (
                      <span className="text-muted-foreground">
                        ({c.latency_ms}ms)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Internal cost summary — never customer credits
              </h4>
              <p className="text-sm">
                {fmtCents(assessment.cost_summary.total_actual_cents)} actual ·{" "}
                {fmtCents(assessment.cost_summary.projected_month_actual_cents)}{" "}
                projected ({assessment.cost_summary.projection_basis})
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {assessment.cost_summary.by_provider.map((p) => (
                  <li key={p.provider}>
                    {p.provider}: {fmtCents(p.actual_cents)} /{" "}
                    {fmtCents(p.estimate_cents)} across {p.operations} ops
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Budget states
              </h4>
              <ul className="space-y-0.5 text-xs">
                {assessment.budget_states.map((b) => (
                  <li key={b.provider} className="flex items-center gap-2">
                    <span className="font-medium">
                      {b.provider === "*" ? "Global" : b.provider}
                    </span>
                    <span className={statusTone(b.status)}>{b.status}</span>
                    {b.budget_cents != null && (
                      <span className="text-muted-foreground">
                        {fmtCents(b.spend_cents)} / {fmtCents(b.budget_cents)} (
                        {b.pct_used}%)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {!assessment && !error && (
          <p className="text-sm text-muted-foreground">
            Running the live assessment…
          </p>
        )}
      </AdminCard>

      <AdminCard>
        <h3 className="mb-4 font-heading text-lg font-semibold">
          Assessment history — append-only snapshots
        </h3>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No snapshots recorded yet.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {snapshots.map((s) => (
              <li key={s.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${statusTone(s.overall_status)}`}
                  >
                    {s.overall_status}
                  </span>
                  {s.emergency && (
                    <span className="text-red-400">EMERGENCY</span>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(s.assessed_at).toLocaleString("en-NG")}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {s.checks.length} checks ·{" "}
                  {fmtCents(s.cost_summary.total_actual_cents)} internal ·{" "}
                  {s.budget_states.length} budgets
                </p>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </>
  );
}
