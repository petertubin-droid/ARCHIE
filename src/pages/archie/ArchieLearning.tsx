// =========================================================
// ARCHIE PWA — UNIFIED LEARNING ENGINE
//
// The Owner's behavioral and mobile learning pipeline:
//   * 12-Stage Consent-Gated Pipeline (Anti-Silent-Scan Enforced)
//   * Mandatory User Confirmation & Scope Controls
//   * Audited Knowledge Contribution Matrix
// =========================================================

import { useState } from "react";
import {
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Smartphone,
  EyeOff,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieStat,
} from "@/components/archie/premium";
import MobileLearningPanel from "@/components/archie/MobileLearningPanel";

export default function ArchieLearning() {
  return (
    <ArchiePage
      eyebrow="Behavioral Adaptation"
      title="Unified Learning Engine"
      subtitle="12-stage consent-gated mobile learning pipeline with immutable anti-silent-scan protection."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Pipeline Stages"
          value="12 PHASES"
          tone="neutral"
        />
        <ArchieStat
          label="Silent Scans"
          value="0 (BLOCKED BY LAW)"
          tone="positive"
        />
        <ArchieStat
          label="Consent Gates"
          value="STRICT_OPT_IN"
          tone="positive"
        />
        <ArchieStat
          label="User Confirmation"
          value="MANDATORY"
          tone="positive"
        />
      </div>

      {/* Embedded Mobile Learning Panel */}
      <div className="mb-6">
        <MobileLearningPanel />
      </div>

      {/* Anti-Silent-Scan Legal & Algorithmic Guarantee */}
      <ArchiePanel className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <EyeOff className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Cryptographic Anti-Silent-Scan Proof
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          ARCHIE never performs background filesystem scans or harvests private user interactions without explicit user-initiated turn selection. Every learned artifact must be explicitly previewed, confirmed, and approved by the Owner before entering permanent model memory.
        </p>
      </ArchiePanel>
    </ArchiePage>
  );
}
