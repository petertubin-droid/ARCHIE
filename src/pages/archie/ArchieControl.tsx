// =========================================================
// ARCHIE PWA — AUTHORITY & OPERATIONAL CONTROL
//
// The Owner's executive command and governance console:
//   * Real-time Authority Boundaries (ARCHIE_CAN / ARCHIE_DOES_NOT)
//   * Code Command Verification and Gate Analysis
//   * Capability Matrix & Permission Audit
//   * Interactive Action Authority Simulator
// =========================================================

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Cpu,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Terminal,
  Activity,
  Sliders,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieGhostButton,
  ArchieBadge,
  ArchieStat,
  ArchieSectionTitle,
  ArchieInput,
  ArchieField,
} from "@/components/archie/premium";
import AuthorityGovernance from "@/components/archie/AuthorityGovernance";
import { ARCHIE_CAN, ARCHIE_DOES_NOT } from "@/lib/archie/authority-boundary";
import { isAuthorization, NOT_AUTHORIZATION } from "@/lib/archie/code-command";

export default function ArchieControl() {
  const [testCommand, setTestCommand] = useState("");
  const [simulationResult, setSimulationResult] = useState<{
    authorized: boolean;
    reason: string;
    gate: string;
  } | null>(null);

  const runSimulation = () => {
    if (!testCommand.trim()) return;
    const lower = testCommand.toLowerCase();
    
    // Check life-safety and immutable boundary
    if (
      lower.includes("disable safety") ||
      lower.includes("bypass gate") ||
      lower.includes("rewrite constitution") ||
      lower.includes("deploy without owner")
    ) {
      setSimulationResult({
        authorized: false,
        reason: "Absolute constitutional refusal. Life-safety and owner authority gates cannot be bypassed by any command.",
        gate: "LIFE_SAFETY_HARD_GATE",
      });
      return;
    }

    if (isAuthorization(testCommand)) {
      setSimulationResult({
        authorized: true,
        reason: "Validated as genuine Owner authorization string conforming to server-side cryptographic audit format.",
        gate: "OWNER_AUTHORIZATION_VERIFIED",
      });
    } else {
      setSimulationResult({
        authorized: false,
        reason: "Evaluated as informational or conversational inquiry. Does not constitute explicit execution authority.",
        gate: "PROPOSE_ONLY_BOUNDARY",
      });
    }
  };

  return (
    <ArchiePage
      eyebrow="Command & Governance"
      title="Control & Authority Matrix"
      subtitle="Real-time operational authority boundaries, immutable safety gates, and command verification engine."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Authority Gates"
          value="ENFORCED"
          tone="positive"
        />
        <ArchieStat
          label="Life-Safety Gate"
          value="ACTIVE"
          tone="positive"
        />
        <ArchieStat
          label="Autonomous Deploy"
          value="LOCKED"
          tone="warning"
        />
        <ArchieStat
          label="Audit Immutability"
          value="APPEND_ONLY"
          tone="positive"
        />
      </div>

      {/* Embedded Canonical Authority & Governance Component */}
      <div className="mb-6">
        <AuthorityGovernance />
      </div>

      {/* Interactive Command & Authority Simulator */}
      <ArchiePanel className="mb-6 p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-200">
            Interactive Authority & Gate Simulator
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Test whether a hypothetical instruction or token permits autonomous execution or is stopped at the proposal boundary.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <ArchieInput
            value={testCommand}
            onChange={(e) => setTestCommand(e.target.value)}
            placeholder="e.g. I authorize the deployment to staging OR deploy immediately"
            className="flex-1"
          />
          <ArchieButton onClick={runSimulation}>
            Evaluate Gate
          </ArchieButton>
        </div>

        {simulationResult && (
          <div
            className={`mt-4 rounded-lg border p-3 text-xs leading-relaxed ${
              simulationResult.authorized
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {simulationResult.authorized ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-400" />
              )}
              <span>Gate Decision: {simulationResult.gate}</span>
            </div>
            <p className="mt-1">{simulationResult.reason}</p>
          </div>
        )}
      </ArchiePanel>

      {/* Authority Spectrum Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <ArchiePanel className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Authorized Autonomy ({ARCHIE_CAN.length} Domains)
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-400">
            {ARCHIE_CAN.slice(0, 6).map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-400 font-mono">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ArchiePanel>

        <ArchiePanel className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-4 w-4 text-rose-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Constitutional Prohibitions ({ARCHIE_DOES_NOT.length} Gates)
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-400">
            {ARCHIE_DOES_NOT.slice(0, 6).map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-rose-400 font-mono">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ArchiePanel>
      </div>
    </ArchiePage>
  );
}
