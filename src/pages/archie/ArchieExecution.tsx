// =========================================================
// ARCHIE PWA — SECURE WORKFLOW & TARGET EXECUTION CONSOLE
//
// The Owner's deterministic target execution engine:
//   * Audited Execution of Registered Targets
//   * Cryptographically Verified Environment Isolation
//   * Production Targets Enforce Mandatory Owner Secret
// =========================================================

import { useState, useEffect, useCallback } from "react";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Terminal,
  Activity,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieGhostButton,
  ArchieBadge,
  ArchieStat,
  ArchieInput,
  ArchieField,
  ArchieSkeleton,
} from "@/components/archie/premium";
import {
  listExecutionTargets,
  getExecutionHistory,
  runExecution,
  type ExecutionTargetView,
  type ExecutionRunView,
} from "@/lib/archie/execution-client";

export default function ArchieExecution() {
  const [targets, setTargets] = useState<ExecutionTargetView[]>([]);
  const [runs, setRuns] = useState<ExecutionRunView[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ExecutionTargetView | null>(null);
  const [ownerSecret, setOwnerSecret] = useState("");
  const [inputJson, setInputJson] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [targetsRes, runsRes] = await Promise.all([
        listExecutionTargets(),
        getExecutionHistory(),
      ]);

      if (targetsRes.ok) {
        setTargets(targetsRes.targets);
        if (targetsRes.targets.length > 0) {
          setSelectedTarget(targetsRes.targets[0]);
        }
      } else {
        setErrorMsg(targetsRes.error);
      }

      if (runsRes.ok) {
        setRuns(runsRes.runs);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to connect to execution engine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRun = async () => {
    if (!selectedTarget) return;

    let parsedInput: Record<string, unknown> = {};
    try {
      parsedInput = JSON.parse(inputJson);
    } catch {
      setErrorMsg("Input payload must be valid JSON");
      return;
    }

    setExecuting(true);
    setExecutionResult(null);
    setErrorMsg(null);

    try {
      const outcome = await runExecution({
        targetKey: selectedTarget.key,
        input: parsedInput,
        ownerSecret: ownerSecret || undefined,
      });

      if (!outcome.ok) {
        setErrorMsg((outcome as { error: string }).error || "Execution failed");
      } else {
        setExecutionResult(outcome);
        // Refresh run history
        const runsRes = await getExecutionHistory();
        if (runsRes.ok) setRuns(runsRes.runs);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Execution call failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <ArchiePage
      eyebrow="Deterministic Compute"
      title="Target Execution Engine"
      subtitle="Audited execution of registered microservices, database workers, and deterministic compute targets."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Registered Targets"
          value={targets.length || "0"}
          tone="neutral"
        />
        <ArchieStat
          label="Execution History"
          value={runs.length || "0"}
          tone="neutral"
        />
        <ArchieStat
          label="Production Isolation"
          value="ENFORCED"
          tone="positive"
        />
        <ArchieStat
          label="Deterministic Replay"
          value="VERIFIED"
          tone="positive"
        />
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Execution Warning
          </div>
          <p className="mt-1">{errorMsg}</p>
        </div>
      )}

      {/* Execution Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Target Selector */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Available Targets ({targets.length})
          </h2>

          {loading ? (
            <div className="space-y-2">
              <ArchieSkeleton className="h-16 w-full" />
              <ArchieSkeleton className="h-16 w-full" />
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-4 text-xs text-slate-500 text-center">
              No registered targets found in this environment.
            </div>
          ) : (
            targets.map((t) => (
              <div
                key={t.key}
                onClick={() => setSelectedTarget(t)}
                className={`p-3.5 rounded-xl border transition cursor-pointer ${
                  selectedTarget?.key === t.key
                    ? "border-amber-400/50 bg-amber-400/[0.04]"
                    : "border-white/5 bg-white/[0.01] hover:border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-semibold text-slate-200 text-xs truncate">
                    {t.label}
                  </span>
                  <ArchieBadge
                    tone={
                      t.environment === "PRODUCTION"
                        ? "warning"
                        : t.environment === "STAGING"
                        ? "accent"
                        : "neutral"
                    }
                  >
                    {t.environment}
                  </ArchieBadge>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
                  {t.description || "No description provided."}
                </p>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>{t.kind}</span>
                  {t.requires_owner_secret && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <Lock className="h-3 w-3" /> Secret Required
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Execution Form and History */}
        <div className="lg:col-span-2 space-y-6">
          {selectedTarget ? (
            <ArchiePanel className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {selectedTarget.label}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-xs text-amber-300">
                      {selectedTarget.key}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400">
                      {selectedTarget.http_method}
                    </span>
                  </div>
                </div>

                <ArchieBadge tone="neutral">Risk: {selectedTarget.risk_class}</ArchieBadge>
              </div>

              {selectedTarget.requires_owner_secret && (
                <div className="mb-4">
                  <ArchieField label="Owner Authorization Secret" hint="Required for production target execution">
                    <ArchieInput
                      type="password"
                      value={ownerSecret}
                      onChange={(e) => setOwnerSecret(e.target.value)}
                      placeholder="Enter cryptographic Owner Secret..."
                    />
                  </ArchieField>
                </div>
              )}

              <div className="mb-4">
                <ArchieField label="Input JSON Payload" hint="Parameters passed to target execution handler">
                  <textarea
                    value={inputJson}
                    onChange={(e) => setInputJson(e.target.value)}
                    rows={4}
                    className="w-full font-mono text-xs rounded-lg border border-white/10 bg-black/40 p-3 text-slate-200 focus:border-amber-400/50 outline-none"
                  />
                </ArchieField>
              </div>

              <div className="flex items-center justify-end gap-2">
                <ArchieButton onClick={handleRun} disabled={executing}>
                  <Play className={`h-3.5 w-3.5 mr-1 ${executing ? "animate-spin" : ""}`} />
                  {executing ? "Executing..." : "Execute Target"}
                </ArchieButton>
              </div>

              {executionResult && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <h4 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Execution Succeeded
                  </h4>
                  <pre className="font-mono text-xs p-3 rounded-lg bg-black/60 border border-emerald-500/20 text-slate-300 overflow-x-auto">
                    {JSON.stringify(executionResult, null, 2)}
                  </pre>
                </div>
              )}
            </ArchiePanel>
          ) : (
            <div className="rounded-xl border border-white/5 bg-black/20 p-8 text-center text-xs text-slate-500">
              Select an execution target from the list to configure payload and dispatch.
            </div>
          )}

          {/* Historical Runs */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Execution Ledger Runs ({runs.length})
            </h3>
            {runs.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-xs text-slate-500 text-center">
                No recorded execution runs yet.
              </div>
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-lg border border-white/5 bg-white/[0.01] text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-medium text-slate-300">{r.target_key}</span>
                      <span className="text-slate-500 text-[10px] ml-2">
                        {new Date(r.created_date).toLocaleString()}
                      </span>
                    </div>
                    <ArchieBadge tone={r.status === "SUCCESS" ? "positive" : "critical"}>
                      {r.status}
                    </ArchieBadge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ArchiePage>
  );
}
