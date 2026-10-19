// =========================================================
// ARCHIE ADMIN & OWNER GOVERNANCE DASHBOARD
//
// Separated administrative control center:
//   - System infrastructure health & Edge runtime monitors
//   - Security audit logs, device sessions, role-based access
//   - Model routing, budget caps, and database telemetry
//   - Protected behind Owner-only authorization boundary
// =========================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldAlert,
  Server,
  Users,
  Lock,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  AdminTabButton,
} from "@/components/admin/AdminUi";
import StatusCenter from "@/components/archie/StatusCenter";
import { CoreSystemsProof } from "@/components/archie/CoreSystemsProof";
import DevGovernance from "@/components/archie/DevGovernance";
import PrivacyControlsPanel from "@/components/archie/PrivacyControlsPanel";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"system" | "security" | "governance" | "privacy">("system");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <Link
              to="/archie"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Return to ARCHIE Frontend"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                  Restricted
                </span>
                <h1 className="text-xl font-bold tracking-tight text-white">ARCHIE Admin &amp; Governance Center</h1>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Isolated administrative oversight, engine telemetry, and security policy management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
              Refresh Telemetry
            </button>
            <Link
              to="/archie"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition"
            >
              Exit to Frontend
            </Link>
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 pb-2">
          <AdminTabButton
            variant="pill"
            active={activeTab === "system"}
            onClick={() => setActiveTab("system")}
          >
            <Server className="h-4 w-4" /> System &amp; Engines
          </AdminTabButton>
          <AdminTabButton
            variant="pill"
            active={activeTab === "security"}
            onClick={() => setActiveTab("security")}
          >
            <ShieldAlert className="h-4 w-4" /> Security &amp; Audit
          </AdminTabButton>
          <AdminTabButton
            variant="pill"
            active={activeTab === "governance"}
            onClick={() => setActiveTab("governance")}
          >
            <Lock className="h-4 w-4" /> Owner Governance
          </AdminTabButton>
          <AdminTabButton
            variant="pill"
            active={activeTab === "privacy"}
            onClick={() => setActiveTab("privacy")}
          >
            <Users className="h-4 w-4" /> Privacy &amp; Consent
          </AdminTabButton>
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === "system" && (
            <div className="space-y-6">
              <StatusCenter />
              <CoreSystemsProof />
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1">Audit Trail &amp; Device Policies</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Review real-time verification status and isolation barriers across runtime environments.
                </p>
                <DevGovernance />
              </div>
            </div>
          )}

          {activeTab === "governance" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold text-white mb-1">Privileged Owner Action Gates</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Consequential mutations, deployment triggers, and high-risk operational limits.
                </p>
                <DevGovernance />
              </div>
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="space-y-6">
              <PrivacyControlsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
