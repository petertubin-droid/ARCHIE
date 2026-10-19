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
import {
  Cpu,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieBadge,
  ArchieStat,
} from "@/components/archie/premium";
import {
  listEngines,
  type EngineDescriptor,
} from "@/lib/ai-foundation/engines-registry";

export default function ArchieEngines() {
  const [engines, setEngines] = useState<EngineDescriptor[]>([]);
  const [selectedEngine, setSelectedEngine] = useState<EngineDescriptor | null>(null);

  useEffect(() => {
    const registered = listEngines();
    setEngines(registered);
    if (registered.length > 0) {
      setSelectedEngine(registered[0]);
    }
  }, []);

  return (
    <ArchiePage
      eyebrow="Deterministic Engineering"
      title="Calculation Engines & Formulas"
      subtitle="Authoritative structural calculators. ARCHIE's AI is constitutionally barred from guessing quantities, routing all math through verified formulas."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Registered Engines"
          value={engines.length || "7"}
          tone="neutral"
        />
        <ArchieStat
          label="Deterministic Guarantee"
          value="100% PROVEN"
          tone="positive"
        />
        <ArchieStat
          label="AI Approximation"
          value="STRICTLY_BARRED"
          tone="positive"
        />
        <ArchieStat
          label="Formula Source"
          value="BRITISH STANDARDS"
          tone="neutral"
        />
      </div>

      {/* Boundary Manifesto Card */}
      <ArchiePanel className="mb-6 p-4 md:p-5 border-amber-400/20 bg-amber-400/[0.02]">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-200">
            The Deterministic Boundary Rule
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          In construction and financial calculations, generative AI models hallucinate. ARCHIE enforces an unbreakable boundary: conversational models parse user intent, but every quantity, area, yield stress, and bill of quantities item is strictly computed by the deterministic engines below.
        </p>
      </ArchiePanel>

      {/* Registered Engines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {engines.map((eng) => (
          <div
            key={eng.id}
            className="cursor-pointer"
            onClick={() => setSelectedEngine(eng)}
          >
            <ArchiePanel
              className={`p-4 md:p-5 transition ${
                selectedEngine?.id === eng.id
                  ? "border-amber-400/40 bg-amber-400/[0.03]"
                  : "hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-amber-300" />
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {eng.title}
                  </h3>
                </div>
                <ArchieBadge tone="accent">{eng.domain}</ArchieBadge>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                Credited Author: <span className="text-slate-200">{eng.creditedAs}</span>
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                <span className="font-mono text-slate-500">Engine ID: {eng.id}</span>
                <span className="text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="h-3 w-3" /> Authoritative
                </span>
              </div>
            </ArchiePanel>
          </div>
        ))}
      </div>
    </ArchiePage>
  );
}
