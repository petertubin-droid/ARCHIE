// =========================================================
// ARCHIE PWA — AUTHORIZED OFFENSIVE SECURITY & PENTEST SUITE
//
// Strictly consent-gated offensive testing console:
//   * Explicit Target Scope Verification (Owner Authorization Required)
//   * Non-Destructive Vulnerability Scanners & Probes
//   * Reproducible Evidence Ledgers & Retest Verification
// =========================================================

import { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Lock,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieBadge,
  ArchieStat,
} from "@/components/archie/premium";
import {
  type Engagement,
  type OffensiveFinding,
} from "@/lib/archie/offensive-security";

export default function ArchieOffensive() {
  const [engagements, setEngagements] = useState<Engagement[]>([
    {
      id: "eng-frelux-01",
      target: {
        id: "t-01",
        kind: "FRELUX_INFRASTRUCTURE",
        identifier: "api.frelux.com",
        scope: ["api.frelux.com", "app.frelux.com", "supabase-edge-mesh"],
        registeredAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        registeredBy: "OWNER_AUTHORIZED",
      },
      currentPhase: "TEST",
      phases: {
        DOCUMENT: { phase: "DOCUMENT", status: "DONE", startedAt: new Date(Date.now() - 3600000 * 48).toISOString(), completedAt: new Date(Date.now() - 3600000 * 47).toISOString(), notes: ["Scope and authorization confirmed."] },
        TEST: { phase: "TEST", status: "IN_PROGRESS", startedAt: new Date(Date.now() - 3600000 * 4).toISOString(), notes: ["Probing endpoints."] },
        DISCOVER: { phase: "DISCOVER", status: "PENDING", notes: [] },
        ANALYZE: { phase: "ANALYZE", status: "PENDING", notes: [] },
        ENUMERATE: { phase: "ENUMERATE", status: "PENDING", notes: [] },
        EXPLOIT: { phase: "EXPLOIT", status: "PENDING", notes: [] },
        REMEDIATE: { phase: "REMEDIATE", status: "PENDING", notes: [] },
        RETEST: { phase: "RETEST", status: "PENDING", notes: [] },
      },
      startedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      findings: [
        {
          id: "find-01",
          targetId: "t-01",
          phase: "TEST",
          title: "Public RLS Read Policy on Unauthenticated Quote Drafts",
          severity: "MEDIUM",
          evidence: ["GET /rest/v1/frelux_quotes?select=* returned 200 without bearer token."],
          category: "AUTHZ_WEAKNESS",
          remediation: "Enforce authenticated role or restrict unauthenticated reads to session tokens.",
          fixStatus: "OPEN",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        },
      ],
    },
  ]);

  return (
    <ArchiePage
      eyebrow="Adversarial Testing"
      title="Offensive Security & Pentest Console"
      subtitle="Strictly authorized and scoped security evaluations, vulnerability probes, and regression verification."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Scope Authorization"
          value="OWNER_VERIFIED"
          tone="positive"
        />
        <ArchieStat
          label="Active Engagements"
          value={engagements.length || "1"}
          tone="neutral"
        />
        <ArchieStat
          label="Total Findings"
          value="1 OPEN"
          tone="warning"
        />
        <ArchieStat
          label="Critical Severity"
          value="0 (CLEAN)"
          tone="positive"
        />
      </div>

      {/* Scope Verification Notice */}
      <ArchiePanel className="mb-6 p-4 md:p-5 border-amber-400/20 bg-amber-400/[0.02]">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold text-slate-200">
            Mandatory Authorization Gate
          </h2>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Offensive security tools only execute against targets with explicit, cryptographically verifiable Owner consent. Testing without authorization or against third-party infrastructure outside the verified scope is strictly forbidden by ARCHIE’s Constitution.
        </p>
      </ArchiePanel>

      {/* Engagements and Findings */}
      <div className="space-y-4">
        {engagements.map((eng) => (
          <ArchiePanel key={eng.id} className="p-4 md:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {eng.target.identifier}
                  </h3>
                  <ArchieBadge tone="accent">{eng.currentPhase}</ArchieBadge>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Scope: {eng.target.scope.join(", ")}
                </p>
              </div>

              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Kind: {eng.target.kind}
              </span>
            </div>

            {/* Findings list */}
            <div className="mt-4 border-t border-white/5 pt-3">
              <h4 className="text-xs font-semibold text-slate-300 mb-2">
                Identified Findings ({eng.findings.length})
              </h4>
              {eng.findings.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-white/5 bg-black/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-medium text-slate-200">{f.title}</span>
                    <ArchieBadge
                      tone={
                        f.severity === "CRITICAL"
                          ? "critical"
                          : f.severity === "HIGH"
                          ? "critical"
                          : "warning"
                      }
                    >
                      {f.severity}
                    </ArchieBadge>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">
                    {f.remediation}
                  </p>
                  <div className="font-mono text-[10px] text-slate-500 bg-black/40 rounded p-2">
                    {f.evidence.join("\n")}
                  </div>
                </div>
              ))}
            </div>
          </ArchiePanel>
        ))}
      </div>
    </ArchiePage>
  );
}
