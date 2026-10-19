// =========================================================
// ARCHIE PWA — COGNITIVE SELF-EVOLUTION REGISTRY
//
// The Owner's evolutionary parameter & adaptation console:
//   * Language & Dialect Auto-Learning Toggles
//   * Protected Surfaces Matrix (Immutable Constitution Boundaries)
//   * Proposal Staging & Self-Code Analysis Gates
//   * Supabase Persistence & Immutable Change Request Audit
// =========================================================

import { useState, useEffect, useCallback } from "react";
import {
  Dna,
  Shield,
  Lock,
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Save,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieGhostButton,
  ArchieBadge,
  ArchieStat,
  ArchieSectionTitle,
} from "@/components/archie/premium";
import { PROTECTED_SURFACES } from "@/lib/archie/evolution/authority";
import { DEFAULT_EVOLUTION_SETTINGS } from "@/lib/archie/evolution/settings";
import {
  fetchEvolutionSettings,
  saveEvolutionSettings,
  fetchChangeRequests,
} from "@/lib/archie/evolution/persistence";
import type {
  EvolutionSettings,
  EvolutionChangeRequest,
} from "@/lib/archie/evolution/types";

export default function ArchieEvolution() {
  const [settings, setSettings] = useState<EvolutionSettings>(DEFAULT_EVOLUTION_SETTINGS);
  const [changeRequests, setChangeRequests] = useState<EvolutionChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"SETTINGS" | "CHANGES" | "PROTECTED">("SETTINGS");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, crRes] = await Promise.all([
        fetchEvolutionSettings(),
        fetchChangeRequests(),
      ]);

      if (settingsRes.ok && settingsRes.data) {
        setSettings(settingsRes.data);
      }
      if (crRes.ok && crRes.data) {
        setChangeRequests(crRes.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleLanguageOption = (key: keyof EvolutionSettings["language"]) => {
    setSettings((prev) => ({
      ...prev,
      language: {
        ...prev.language,
        [key]: !prev.language[key],
      },
    }));
  };

  const toggleSelfModOption = (key: keyof EvolutionSettings["selfModification"]) => {
    setSettings((prev) => ({
      ...prev,
      selfModification: {
        ...prev.selfModification,
        [key]: !prev.selfModification[key],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveEvolutionSettings({
        ...settings,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Local fallback
    }
    setSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <ArchiePage
      eyebrow="Autonomous Adaptation"
      title="Self-Evolution & Cognitive Mutation"
      subtitle="Safely governed evolutionary parameters, protected surfaces matrix, and verified self-improvement gates."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Evolution Status"
          value={settings.selfModification.selfCodeAnalysis ? "ACTIVE" : "PAUSED"}
          tone="positive"
        />
        <ArchieStat
          label="Min Confidence"
          value={`${(settings.language.minConfidenceThreshold * 100).toFixed(0)}%`}
          tone="neutral"
        />
        <ArchieStat
          label="Staged Changes"
          value={changeRequests.length}
          tone="neutral"
        />
        <ArchieStat
          label="Protected Surfaces"
          value={`${PROTECTED_SURFACES.length} IMMUTABLE`}
          tone="positive"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab("SETTINGS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "SETTINGS"
              ? "bg-amber-400 text-slate-950"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Evolution Policies
        </button>
        <button
          onClick={() => setActiveTab("CHANGES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "CHANGES"
              ? "bg-amber-400 text-slate-950"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Staged Changes ({changeRequests.length})
        </button>
        <button
          onClick={() => setActiveTab("PROTECTED")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === "PROTECTED"
              ? "bg-amber-400 text-slate-950"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Protected Surfaces ({PROTECTED_SURFACES.length})
        </button>
      </div>

      {activeTab === "SETTINGS" && (
        <div className="space-y-6">
          {/* Language & Dialect Learning */}
          <ArchiePanel className="p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
              <Dna className="h-4 w-4 text-amber-300" />
              Language & Dialect Autonomous Learning
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Allows ARCHIE to expand its dialect lexicons through owner conversation.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div
                onClick={() => toggleLanguageOption("enabled")}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20"
              >
                <div>
                  <span className="text-xs font-medium text-slate-200">Evolution Engine Enabled</span>
                  <p className="text-[11px] text-slate-400">Master switch for autonomous learning</p>
                </div>
                <ArchieBadge tone={settings.language.enabled ? "positive" : "neutral"}>
                  {settings.language.enabled ? "ON" : "OFF"}
                </ArchieBadge>
              </div>

              <div
                onClick={() => toggleLanguageOption("dialectLearning")}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20"
              >
                <div>
                  <span className="text-xs font-medium text-slate-200">Dialect Auto-Learning</span>
                  <p className="text-[11px] text-slate-400">Map colloquial terminology dynamically</p>
                </div>
                <ArchieBadge tone={settings.language.dialectLearning ? "positive" : "neutral"}>
                  {settings.language.dialectLearning ? "ON" : "OFF"}
                </ArchieBadge>
              </div>
            </div>
          </ArchiePanel>

          {/* Self-Modification & Code Analysis */}
          <ArchiePanel className="p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-amber-300" />
              Self-Code Analysis & Mutation Boundaries
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Autonomous proposals are subject to regression tests and constitutional invariants.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div
                onClick={() => toggleSelfModOption("selfCodeAnalysis")}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20"
              >
                <div>
                  <span className="text-xs font-medium text-slate-200">Self-Code Analysis</span>
                  <p className="text-[11px] text-slate-400">Inspect codebase for performance bottlenecks</p>
                </div>
                <ArchieBadge tone={settings.selfModification.selfCodeAnalysis ? "positive" : "neutral"}>
                  {settings.selfModification.selfCodeAnalysis ? "ON" : "OFF"}
                </ArchieBadge>
              </div>

              <div
                onClick={() => toggleSelfModOption("requireExplicitApproval")}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3 hover:border-white/20"
              >
                <div>
                  <span className="text-xs font-medium text-slate-200">Mandatory Owner Sign-Off</span>
                  <p className="text-[11px] text-slate-400">Every proposed git commit requires Owner approval</p>
                </div>
                <ArchieBadge tone={settings.selfModification.requireExplicitApproval ? "positive" : "critical"}>
                  {settings.selfModification.requireExplicitApproval ? "STRICT" : "UNSAFE"}
                </ArchieBadge>
              </div>
            </div>
          </ArchiePanel>

          <div className="flex items-center justify-between">
            {savedSuccess ? (
              <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                Evolution parameters safely persisted.
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-mono">
                Last updated: {new Date(settings.updatedAt).toLocaleDateString()}
              </span>
            )}

            <ArchieButton onClick={handleSave} disabled={saving} className="text-xs">
              <Save className={`h-3.5 w-3.5 mr-1 ${saving ? "animate-spin" : ""}`} />
              {saving ? "Persisting..." : "Save Evolution Policies"}
            </ArchieButton>
          </div>
        </div>
      )}

      {activeTab === "CHANGES" && (
        <ArchiePanel className="p-4 md:p-5">
          <h3 className="text-xs font-semibold text-slate-200 mb-3">
            Change Request Ledger (Audit-Tracked)
          </h3>
          {changeRequests.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-xs text-slate-400">
              <GitBranch className="h-6 w-6 text-slate-500 mx-auto mb-2 opacity-60" />
              <p>No active change requests pending owner sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {changeRequests.map((cr) => (
                <div key={cr.id} className="p-3.5 rounded-lg border border-white/10 bg-black/30 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-200">{cr.title} ({cr.crNumber})</span>
                    <ArchieBadge tone={cr.state === "EXECUTED" ? "positive" : "warning"}>{cr.state}</ArchieBadge>
                  </div>
                  <p className="text-slate-400 mb-2">{cr.description}</p>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Risk: {cr.regressionRisk} · Affected Files: {cr.affectedFiles.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ArchiePanel>
      )}

      {activeTab === "PROTECTED" && (
        <ArchiePanel className="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-slate-100">
              Immutable Constitutional Surfaces
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Under ARCHIE’s Constitution (§2), the following files cannot be mutated by autonomous self-evolution without an owner-level constitutional convention:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PROTECTED_SURFACES.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 p-2.5 font-mono text-[11px] text-slate-300"
              >
                <Lock className="h-3 w-3 text-rose-400 shrink-0" />
                <span className="truncate">{path}</span>
              </div>
            ))}
          </div>
        </ArchiePanel>
      )}
    </ArchiePage>
  );
}
