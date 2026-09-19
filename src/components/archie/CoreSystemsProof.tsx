// =========================================================
// ARCHIE CORE SYSTEMS & RUNTIME PROOF (PWA)
//
// © 2026 FRENZY. All rights reserved.
//
// REAL activation of ARCHIE's connectivity layer:
//   * coreHealthCheck() dynamically imports every registered
//     FRELUX core module in the live browser runtime and
//     verifies every bound export exists — LIVE/DISCONNECTED
//     is a measured fact, never asserted.
//   * The provider-independence runtime registry and model
//     lifecycle report render from the real contract modules
//     (ai-abstraction, model-lifecycle) — honest statuses
//     included (NOT_YET_AVAILABLE stays NOT_YET_AVAILABLE).
// =========================================================

import { useCallback, useEffect, useState } from "react";
import {
  coreHealthCheck,
  type CoreHealthResult,
} from "@/lib/archie/core-orchestrator";
import {
  RUNTIME_REGISTRY,
  PROVIDER_INDEPENDENCE,
  runtimeIdentityLabel,
} from "@/lib/archie/ai-abstraction";
import { modelLifecycleReport } from "@/lib/archie/model-lifecycle";
import { ArchieSectionTitle, ArchieBadge } from "@/components/archie/premium";

export function CoreSystemsProof() {
  const [systems, setSystems] = useState<CoreHealthResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await coreHealthCheck();
      setSystems(result.systems);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const liveCount = systems?.filter((s) => s.status === "LIVE").length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <ArchieSectionTitle>Core systems connectivity</ArchieSectionTitle>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-lg px-3 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
        >
          {running ? "Verifying…" : "Re-verify"}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        Every binding below is a real dynamic import in this browser — the
        connectivity proof ARCHIE runs on itself. A DISCONNECTED entry is a
        wiring failure that must be fixed, never hidden.
      </p>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {running && !systems && (
        <p className="text-xs text-slate-500">
          Loading every registered core module…
        </p>
      )}
      {systems && (
        <p className="mb-2 text-xs text-slate-400">
          {liveCount}/{systems.length} bindings live — measured, not claimed.
        </p>
      )}
      <ul className="space-y-1.5">
        {(systems ?? []).map((s) => (
          <li
            key={s.key}
            className="flex items-center justify-between gap-2 rounded-lg archie-panel px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">{s.label}</p>
              {s.status === "DISCONNECTED" && (
                <p className="truncate text-[11px] text-red-400">
                  {s.error ??
                    `missing exports: ${s.missing_exports.join(", ") || "unknown"}`}
                </p>
              )}
            </div>
            <ArchieBadge tone={s.status === "LIVE" ? "positive" : "critical"}>
              {s.status}
            </ArchieBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RuntimeRegistryPanel() {
  const capabilities = modelLifecycleReport();
  const readyCount = capabilities.filter(
    (c) => c.status !== "NOT_YET_AVAILABLE",
  ).length;

  return (
    <div>
      <ArchieSectionTitle>Runtime & model lifecycle</ArchieSectionTitle>
      <p className="mb-3 text-[11px] text-slate-500">
        ARCHIE's provider-independence contract, rendered live from the runtime
        registry. Gemini and any external provider exist only as fallback
        adapters — never inside ARCHIE.
      </p>
      <ul className="space-y-1.5">
        {RUNTIME_REGISTRY.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-lg archie-panel px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">{r.label}</p>
              <p className="truncate text-[11px] text-slate-500">
                {runtimeIdentityLabel(r.id)}
              </p>
            </div>
            <ArchieBadge tone={r.status === "ACTIVE" ? "positive" : "neutral"}>
              {r.status === "ACTIVE" ? "active" : "not yet available"}
            </ArchieBadge>
          </li>
        ))}
      </ul>

      <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        Model lifecycle ({readyCount}/{capabilities.length} capabilities ready)
      </p>
      <ul className="space-y-1.5">
        {capabilities.map((c) => (
          <li
            key={c.capability}
            className="flex items-center justify-between gap-2 rounded-lg archie-panel px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">{c.capability}</p>
              {c.note && (
                <p className="truncate text-[11px] text-slate-500">{c.note}</p>
              )}
            </div>
            <ArchieBadge
              tone={c.status !== "NOT_YET_AVAILABLE" ? "positive" : "neutral"}
            >
              {c.status.toLowerCase()}
            </ArchieBadge>
          </li>
        ))}
      </ul>

      <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        Provider-independence invariants
      </p>
      <ul className="space-y-1">
        {PROVIDER_INDEPENDENCE.map((inv) => (
          <li
            key={inv.invariant}
            className="rounded-lg archie-panel px-3 py-2 text-[11px] text-slate-400"
          >
            <span className="font-semibold text-slate-300">
              {inv.invariant}
            </span>{" "}
            — {inv.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
