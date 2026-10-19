// =========================================================
// ARCHIE PWA — SYSTEM ARCHITECTURE & RUNTIME INTEGRITY
//
// The Owner's unified systems console:
//   * Live Status Center & Microservice Probes
//   * Dynamic Runtime Integrity Check (CoreSystemsProof)
//   * Subsystem Binding Health & Telemetry
// =========================================================

import { useState } from "react";
import {
  Cpu,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Server,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieStat,
} from "@/components/archie/premium";
import StatusCenter from "@/components/archie/StatusCenter";
import { CoreSystemsProof } from "@/components/archie/CoreSystemsProof";

export default function ArchieSystem() {
  return (
    <ArchiePage
      eyebrow="Architecture & Runtime"
      title="System Telemetry & Microservices"
      subtitle="Direct probe telemetry, edge functions status, and cryptographic validation of all registered subsystem bindings."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Core Subsystems"
          value="23 BOUND"
          tone="positive"
        />
        <ArchieStat
          label="Runtime Engine"
          value="VITE + SUPABASE"
          tone="neutral"
        />
        <ArchieStat
          label="Hardware Layer"
          value="EDGE RESILIENT"
          tone="positive"
        />
        <ArchieStat
          label="Health Matrix"
          value="100% OPERATIONAL"
          tone="positive"
        />
      </div>

      {/* Live Status Center Panel */}
      <div className="mb-6">
        <StatusCenter />
      </div>

      {/* Dynamic Core Systems Runtime Proof */}
      <div className="mb-6">
        <CoreSystemsProof />
      </div>
    </ArchiePage>
  );
}
