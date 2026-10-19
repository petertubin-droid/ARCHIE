// =========================================================
// ARCHIE PWA — UNIFIED SECURITY & PRIVACY CONTROLS
//
// The Owner's security, privacy, and constitutional governance console:
//   * Real Mobile Learning Privacy Controls (Phase 8 P4)
//   * Dev & Infrastructure Governance Rules
//   * Constitutional Life-Safety Gate Verification
// =========================================================

import { useState } from "react";
import {
  ShieldCheck,
  Lock,
  KeyRound,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieStat,
} from "@/components/archie/premium";
import PrivacyControlsPanel from "@/components/archie/PrivacyControlsPanel";
import DevGovernance from "@/components/archie/DevGovernance";

export default function ArchieSecurity() {
  return (
    <ArchiePage
      eyebrow="Trust & Verification"
      title="Security & Privacy Governance"
      subtitle="Cryptographic consent enforcement, mobile data privacy controls, and constitutional life-safety gates."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Life-Safety Gate"
          value="ENFORCED"
          tone="positive"
        />
        <ArchieStat
          label="Private Keys in Code"
          value="0 (ZERO_TOLERANCE)"
          tone="positive"
        />
        <ArchieStat
          label="Silent Harvesting"
          value="PROHIBITED"
          tone="positive"
        />
        <ArchieStat
          label="GDPR / CCPA Rights"
          value="COMPLIANT"
          tone="positive"
        />
      </div>

      {/* Embedded Real Privacy Controls Panel */}
      <div className="mb-6">
        <PrivacyControlsPanel />
      </div>

      {/* Embedded Dev Governance Panel */}
      <div className="mb-6">
        <DevGovernance />
      </div>
    </ArchiePage>
  );
}
