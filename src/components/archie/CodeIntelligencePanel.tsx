// =========================================================
// ARCHIE CODE INTELLIGENCE — OWNER PANEL (SHARED)
//
// One implementation used by both the ARCHIE Owner PWA
// (/archie/coding) and the Admin console. Surfaces the REAL
// audit state of the FRELUX codebase:
//   * Code findings with owner dispositions
//   * Calculation provenance traces
//   * Patch proposals with the Owner Authority decision flow
//
// Every control performs a real database transition. Nothing
// here is decorative.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Activity,
  Bug,
} from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
  decidePatchProposal,
  listCalculationTraces,
  listCodeFindings,
  listPatchProposals,
  setFindingStatus,
  type CalculationTrace,
  type CodeFinding,
  type PatchProposal,
} from "@/lib/archie/code-intelligence-client";

type Tab = "findings" | "traces" | "patches";

export default function CodeIntelligencePanel() {
  const [tab, setTab] = useState<Tab>("findings");
  const [findings, setFindings] = useState<CodeFinding[]>([]);
  const [traces, setTraces] = useState<CalculationTrace[]>([]);
  const [patches, setPatches] = useState<PatchProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, t, p] = await Promise.all([
        listCodeFindings(),
        listCalculationTraces(30),
        listPatchProposals(),
      ]);
      setFindings(f);
      setTraces(t);
      setPatches(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const pendingPatches = patches.filter(
    (p) => p.status === "AWAITING_OWNER_APPROVAL",
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-4 md:py-6">
      <h1 className="text-lg font-semibold md:text-xl">Code Intelligence</h1>
      <p className="text-xs text-slate-400">
        The real audit state of the FRELUX codebase: findings from the deep code
        audit, calculation provenance traces, and approval-gated patch
        proposals. Owner decisions here are actual database transitions.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-500/10 p-2 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1">
        <Button
          size="sm"
          variant={tab === "findings" ? "secondary" : "ghost"}
          onClick={() => setTab("findings")}
        >
          <Bug className="mr-1 h-3.5 w-3.5" aria-hidden /> Findings (
          {findings.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "traces" ? "secondary" : "ghost"}
          onClick={() => setTab("traces")}
        >
          <Activity className="mr-1 h-3.5 w-3.5" aria-hidden /> Traces (
          {traces.length})
        </Button>
        <Button
          size="sm"
          variant={tab === "patches" ? "secondary" : "ghost"}
          onClick={() => setTab("patches")}
        >
          <ShieldCheck className="mr-1 h-3.5 w-3.5" aria-hidden /> Patches
          {pendingPatches > 0 && (
            <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-300">
              {pendingPatches} awaiting you
            </span>
          )}
        </Button>
      </div>

      {/* FINDINGS */}
      {tab === "findings" && (
        <div className="mt-4 space-y-2">
          {findings.length === 0 && (
            <p className="text-sm text-slate-400">No code findings recorded.</p>
          )}
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg archie-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                  {f.type}
                </span>
                <span className="text-[11px] text-slate-500">{f.layer}</span>
                <span className="ml-auto text-[10px] text-slate-500">
                  {f.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-300">
                {f.location}
              </p>
              <p className="mt-1 text-xs text-slate-400">{f.evidence}</p>
              {f.proposed_fix && (
                <p className="mt-1 text-xs text-emerald-300/80">
                  Proposed: {f.proposed_fix}
                </p>
              )}
              {f.status !== "CONFIRMED_INTENTIONAL" &&
                f.status !== "RESOLVED" && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          setFindingStatus(f.id, "CONFIRMED_INTENTIONAL"),
                        )
                      }
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />{" "}
                      Intentional (owner rule)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        act(() => setFindingStatus(f.id, "RESOLVED"))
                      }
                    >
                      Mark resolved
                    </Button>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      {/* TRACES */}
      {tab === "traces" && (
        <div className="mt-4 space-y-2">
          {traces.length === 0 && (
            <p className="text-sm text-slate-400">
              No calculation traces recorded yet.
            </p>
          )}
          {traces.map((t) => (
            <div key={t.id} className="rounded-lg archie-panel p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200">{t.calculator}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${
                    t.valid
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-rose-400/15 text-rose-300"
                  }`}
                >
                  {t.valid ? "TRACE VALID" : "TRACE INVALID"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {new Date(t.traced_at).toLocaleString()} · {t.steps.length}{" "}
                traced steps
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {typeof t.verdict?.["note"] === "string"
                  ? String(t.verdict["note"])
                  : JSON.stringify(t.verdict)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* PATCHES — Owner Authority decision flow */}
      {tab === "patches" && (
        <div className="mt-4 space-y-2">
          {patches.length === 0 && (
            <p className="text-sm text-slate-400">No patch proposals yet.</p>
          )}
          {patches.map((p) => (
            <div key={p.id} className="rounded-lg archie-panel p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-slate-400">
                  {p.status}
                </span>
                <span className="ml-auto text-[10px] text-slate-500">
                  {p.test_evidence.length} test evidence item(s)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">{p.description}</p>
              {p.approval_id && (
                <p className="mt-1 text-[11px] text-emerald-300/80">
                  Approved under: {p.approval_id}
                </p>
              )}
              {p.status === "AWAITING_OWNER_APPROVAL" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-500/80 text-white hover:bg-emerald-500"
                    disabled={busy}
                    onClick={() => {
                      const ref = window.prompt(
                        "Approval reference (e.g. owner instruction or change-request id):",
                      );
                      if (!ref) return;
                      act(() => decidePatchProposal(p.id, "APPROVED", ref));
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />{" "}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      act(() => decidePatchProposal(p.id, "REJECTED", ""))
                    }
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
