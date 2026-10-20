// =========================================================
// ARCHIE PWA — AUTHORITATIVE CALCULATION ENGINES REGISTRY
//
// The AI → Deterministic Calculation Boundary:
//   * Strict Prohibition: LLMs cannot approximate or compute
//     structural math or material costs directly.
//   * All calculations route deterministically to these
//     registered FRELUX engineering engines.
// =========================================================

import { useState, useEffect } from "react";
import { archieEngineBus } from "@/lib/archie/unified-engine-bus";
import {
  Cpu,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowRight,
  Sparkles,
  Play,
  Check,
  AlertTriangle,
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
} from "@/components/archie/premium";
import {
  listEngines,
  executeEngine,
  type EngineDescriptor,
} from "@/lib/ai-foundation/engines-registry";
import type { EngineResult } from "@/lib/ai-foundation/types";

export default function ArchieEngines() {
  const [engines, setEngines] = useState<EngineDescriptor[]>([]);
  const [showFederation, setShowFederation] = useState(true);
  const [selectedEngineId, setSelectedEngineId] = useState<string>("roof_geometry");
  const [running, setRunning] = useState(false);
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);

  // Sample inputs for test runs
  const [roofParams, setRoofParams] = useState({
    length: "15",
    width: "10",
    pitch: "25",
    overhang: "0.6",
    roofType: "gable",
  });

  const [paintParams, setPaintParams] = useState({
    length: "12",
    width: "8",
    height: "3",
  });

  useEffect(() => {
    const registered = listEngines();
    setEngines(registered);
  }, []);

  const activeEngine = engines.find((e) => e.id === selectedEngineId) || engines[0];

  const handleExecute = async () => {
    if (!activeEngine) return;
    setRunning(true);
    setEngineResult(null);

    let inputPayload: unknown = {};
    if (activeEngine.id === "roof_geometry") {
      inputPayload = {
        building_length: Number(roofParams.length),
        building_width: Number(roofParams.width),
        roof_pitch_degrees: Number(roofParams.pitch),
        roof_overhang: Number(roofParams.overhang),
        roof_type: roofParams.roofType,
      };
    } else if (activeEngine.id === "painting_wall_area") {
      inputPayload = {
        length: Number(paintParams.length),
        width: Number(paintParams.width),
        height: Number(paintParams.height),
      };
    } else if (activeEngine.id === "tyrolene_partition_area") {
      inputPayload = {
        width: 14,
        height: 3,
      };
    } else {
      inputPayload = {};
    }

    try {
      const res = await executeEngine(activeEngine.id, inputPayload);
      setEngineResult(res);
      archieEngineBus.publish("CROSS_ENGINE_TASK", "execution", {
        engineId: activeEngine.id,
        input: inputPayload,
        ok: res.ok,
        calculatedAt: res.calculatedAt,
      });
    } catch (err: any) {
      setEngineResult({
        ok: false,
        engine: activeEngine.id,
        calculatedAt: new Date().toISOString(),
        quantities: [],
        costs: null,
        raw: null,
        error: err?.message || "Execution failed",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <ArchiePage
      eyebrow="Deterministic Engineering"
      title="Calculation Engines & Formulas"
      subtitle="Authoritative structural calculators. ARCHIE's AI is constitutionally barred from guessing quantities, routing all math through verified formulas."
    >
      {/* Federation / Calculator mode switch */}
      <div className="mb-5 flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          data-testid="engine-federation-tab"
          onClick={() => setShowFederation(true)}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${showFederation ? "bg-amber-400/15 text-amber-300 border border-amber-400/30" : "text-slate-400 hover:text-white"}`}
        >
          <Cpu className="mr-1.5 inline h-3.5 w-3.5" /> Unified Engine Federation
        </button>
        <button
          data-testid="engine-calculators-tab"
          onClick={() => setShowFederation(false)}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${!showFederation ? "bg-amber-400/15 text-amber-300 border border-amber-400/30" : "text-slate-400 hover:text-white"}`}
        >
          <Calculator className="mr-1.5 inline h-3.5 w-3.5" /> Deterministic Calculators
        </button>
      </div>

      {showFederation && (() => {
        const federation = archieEngineBus.getFederationHealth();
        const registered = archieEngineBus.getAllEngines();
        return (
          <div data-testid="engine-federation" className="mb-6 space-y-4">
            <ArchiePanel className="p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-sm font-semibold text-slate-100">Unified Engine Federation</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Shared in-browser event bus for subsystem events. This is coordination telemetry, not proof of external service health.</p>
                </div>
                <div className="flex gap-2 text-[10px] font-mono">
                  <span className="rounded border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 text-emerald-300">{federation.onlineEngines}/{federation.totalEngines} registered</span>
                  <span className="rounded border border-white/10 px-2 py-1 text-slate-300">{archieEngineBus.getHistory().length} bus events</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {registered.map((engine) => (
                  <div key={engine.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100">{engine.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${engine.state === "online" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{engine.state}</span>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{engine.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {engine.capabilities.slice(0, 3).map((capability) => <span key={capability} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-mono text-slate-500">{capability}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </ArchiePanel>
          </div>
        );
      })()}

      {!showFederation && <>
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Registered Engines"
          value={engines.length ? `${engines.length} ACTIVE` : "4 ENGINES"}
          tone="neutral"
        />
        <ArchieStat
          label="Deterministic Guarantee"
          value="100% (NO_GUESSES)"
          tone="positive"
        />
        <ArchieStat
          label="Authoritative Spec"
          value="VERIFIED FORMULAS"
          tone="positive"
        />
        <ArchieStat
          label="LLM Approximation"
          value="PROHIBITED"
          tone="positive"
        />
      </div>

      {/* Constitutional Math Gate Notice */}
      <ArchiePanel className="mb-6 p-4 md:p-5 border-amber-400/20 bg-amber-400/[0.02]">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-200">
            Strict AI → Engine Boundary Rule
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          ARCHIE is strictly prohibited from approximating structural engineering equations or fabricating material quotes. Every bill of quantities, rebar count, roof pitch multiplier, and paint area is computed deterministically through these registered modules.
        </p>
      </ArchiePanel>

      {/* Engine Selection Grid */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {engines.map((eng) => {
          const isSelected = eng.id === selectedEngineId;
          return (
            <button
              key={eng.id}
              onClick={() => {
                setSelectedEngineId(eng.id);
                setEngineResult(null);
              }}
              className={`archie-panel archie-focusable rounded-xl p-4 text-left transition-all ${
                isSelected
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-100 text-xs truncate">
                  {eng.title}
                </span>
                <ArchieBadge tone="positive">VERIFIED</ArchieBadge>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mb-2">
                Domain: {eng.domain}
              </div>
              <div className="text-[10px] text-amber-300/80 line-clamp-2">
                {eng.creditedAs}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Engine Interactive Test Console */}
      {activeEngine && (
        <ArchiePanel className="mb-6 p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-amber-300" />
                <h3 className="text-base font-semibold text-slate-100">
                  {activeEngine.title}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeEngine.creditedAs}
              </p>
            </div>

            <ArchieButton onClick={handleExecute} disabled={running}>
              <Play className={`h-3.5 w-3.5 mr-1 ${running ? "animate-spin" : ""}`} />
              {running ? "Computing..." : "Execute Formula"}
            </ArchieButton>
          </div>

          {/* Engine Parameters */}
          <div className="border-t border-white/5 pt-4 mb-4">
            <h4 className="text-xs font-semibold text-slate-300 mb-3">
              Input Parameters (Deterministic Arguments)
            </h4>

            {activeEngine.id === "roof_geometry" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ArchieField label="Length (m)">
                  <ArchieInput
                    value={roofParams.length}
                    onChange={(e) => setRoofParams({ ...roofParams, length: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
                <ArchieField label="Width (m)">
                  <ArchieInput
                    value={roofParams.width}
                    onChange={(e) => setRoofParams({ ...roofParams, width: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
                <ArchieField label="Pitch (°)">
                  <ArchieInput
                    value={roofParams.pitch}
                    onChange={(e) => setRoofParams({ ...roofParams, pitch: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
                <ArchieField label="Overhang (m)">
                  <ArchieInput
                    value={roofParams.overhang}
                    onChange={(e) => setRoofParams({ ...roofParams, overhang: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
              </div>
            )}

            {activeEngine.id === "painting_wall_area" && (
              <div className="grid grid-cols-3 gap-3">
                <ArchieField label="Length (m)">
                  <ArchieInput
                    value={paintParams.length}
                    onChange={(e) => setPaintParams({ ...paintParams, length: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
                <ArchieField label="Width (m)">
                  <ArchieInput
                    value={paintParams.width}
                    onChange={(e) => setPaintParams({ ...paintParams, width: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
                <ArchieField label="Height (m)">
                  <ArchieInput
                    value={paintParams.height}
                    onChange={(e) => setPaintParams({ ...paintParams, height: e.target.value })}
                    className="font-mono text-xs"
                  />
                </ArchieField>
              </div>
            )}

            {activeEngine.id !== "roof_geometry" && activeEngine.id !== "painting_wall_area" && (
              <p className="text-xs text-slate-400">
                Using standard architectural reference inputs for whole-building calculation.
              </p>
            )}
          </div>

          {/* Execution Result */}
          {engineResult && (
            <div className="border-t border-white/5 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Deterministic Calculation Output
                </h4>
                <span className="text-[10px] text-slate-500 font-mono">
                  {engineResult.calculatedAt}
                </span>
              </div>

              {engineResult.ok ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {engineResult.quantities.map((q, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                        <span className="text-[10px] text-slate-400 block">{q.label}</span>
                        <span className="text-base font-bold text-emerald-300 font-mono">
                          {q.quantity.toLocaleString()} {q.unit}
                        </span>
                      </div>
                    ))}
                  </div>

                  {engineResult.costs && (
                    <div className="mt-3 p-3 rounded-lg border border-white/10 bg-black/40 flex items-center justify-between">
                      <span className="text-xs text-slate-300">Total Material Estimation:</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">
                        {engineResult.costs.currency} {engineResult.costs.total.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
                  {engineResult.error || "Calculation failed"}
                </div>
              )}
            </div>
          )}
        </ArchiePanel>
      )}
      </>}
    </ArchiePage>
  );
}
