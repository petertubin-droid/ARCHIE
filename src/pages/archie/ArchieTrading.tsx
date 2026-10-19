// =========================================================
// ARCHIE PWA — TRADING & MARKET INTELLIGENCE TERMINAL
// src/pages/archie/ArchieTrading.tsx
//
// Dual-mode institutional console:
//   1. Execution Terminal: Exness-grade execution and order management.
//   2. Market Intelligence Radar: Evidence-grounded deterministic candle reading,
//      multi-timeframe confluence, ML ensembles, HMM regimes, and the 12 gates.
// =========================================================

import { useState } from "react";
import TradingConsole from "@/components/archie/TradingConsole";
import MarketIntelligenceRadar from "@/components/archie/MarketIntelligenceRadar";
import { Sliders, Cpu } from "lucide-react";

export default function ArchieTrading() {
  const [activeTab, setActiveTab] = useState<"terminal" | "intelligence">("terminal");

  return (
    <div className="mx-auto max-w-7xl px-3 py-3 md:px-6 md:py-5 space-y-4">
      {/* Subsystem Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "terminal"
                ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            Execution Terminal
          </button>
          <button
            onClick={() => setActiveTab("intelligence")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "intelligence"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Market Intelligence Radar
          </button>
        </div>

        <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
          ARCHIE Native Engine v1.3.0 • Gates A-L Monitored
        </div>
      </div>

      {/* Surface Render */}
      {activeTab === "terminal" ? <TradingConsole /> : <MarketIntelligenceRadar />}
    </div>
  );
}
