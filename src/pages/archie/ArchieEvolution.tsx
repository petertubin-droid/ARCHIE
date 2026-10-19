// =========================================================
// ARCHIE PWA — COGNITIVE SELF-EVOLUTION REGISTRY
//
// The Owner's evolutionary parameter & adaptation console:
//   * Language & Dialect Auto-Learning Toggles
//   * Protected Surfaces Matrix (Immutable Constitution Boundaries)
//   * Proposal Staging & Self-Code Analysis Gates
// =========================================================

import { useState } from "react";
import {
  Dna,
  Shield,
  Lock,
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
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
import type { EvolutionSettings } from "@/lib/archie/evolution/types";

export default function ArchieEvolution() {
  const [settings, setSettings] = useState<EvolutionSettings>(DEFAULT_EVOLUTION_SETTINGS);
  const [savedSuccess, setSavedSuccess] = useState(false);

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

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
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
          label="Protected Surfaces"
          value={PROTECTED_SURFACES.length}
          tone="positive"
        />
        <ArchieStat
          label="Autonomous Prod Deploy"
          value="FORBIDDEN (LOCKED)"
          tone="warning"
        />
      </div>

      {/* Evolution Settings Toggles */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ArchiePanel className="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-200">
              Language & Dialect Adaptation
            </h2>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Governs how ARCHIE integrates regional construction vernacular, slang, and multilingual terminology.
          </p>

          <div className="space-y-3">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Enable Language Evolution</span>
              <input
                type="checkbox"
                checked={settings.language.enabled}
                onChange={() => toggleLanguageOption("enabled")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Automatic Memory Retention</span>
              <input
                type="checkbox"
                checked={settings.language.autoMemory}
                onChange={() => toggleLanguageOption("autoMemory")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Regional Dialect Learning</span>
              <input
                type="checkbox"
                checked={settings.language.dialectLearning}
                onChange={() => toggleLanguageOption("dialectLearning")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Require Explicit Approval Before Permanent Memory</span>
              <input
                type="checkbox"
                checked={settings.language.requireApprovalBeforePermanentMemory}
                onChange={() => toggleLanguageOption("requireApprovalBeforePermanentMemory")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
          </div>
        </ArchiePanel>

        <ArchiePanel className="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-200">
              Self-Code Modification Gates
            </h2>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Autonomous patch proposal controls. Changes stop at proposal unless explicitly authorized by the Owner.
          </p>

          <div className="space-y-3">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Self-Code Auditing & Analysis</span>
              <input
                type="checkbox"
                checked={settings.selfModification.selfCodeAnalysis}
                onChange={() => toggleSelfModOption("selfCodeAnalysis")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Automatic Change Proposals</span>
              <input
                type="checkbox"
                checked={settings.selfModification.automaticChangeProposals}
                onChange={() => toggleSelfModOption("automaticChangeProposals")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Staging Sandbox Self-Patch</span>
              <input
                type="checkbox"
                checked={settings.selfModification.stagingPermission}
                onChange={() => toggleSelfModOption("stagingPermission")}
                className="h-4 w-4 rounded accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-rose-400" />
                Autonomous Production Modification (Hard Block)
              </span>
              <input
                type="checkbox"
                disabled
                checked={false}
                className="h-4 w-4 rounded opacity-40 cursor-not-allowed"
              />
            </label>
          </div>
        </ArchiePanel>
      </div>

      <div className="mb-6 flex justify-end">
        <ArchieButton onClick={handleSave}>
          {savedSuccess ? "Saved to Memory ✓" : "Save Evolution Configuration"}
        </ArchieButton>
      </div>

      {/* Protected Surfaces Table */}
      <ArchiePanel className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Immutable Protected Surfaces ({PROTECTED_SURFACES.length} Zones)
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Surfaces ARCHIE must NOT autonomously alter. Any proposed change targeting these surfaces halts immediately for Owner intervention.
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROTECTED_SURFACES.map((surf, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-white/5 bg-black/30 p-2.5 text-xs text-slate-300 flex items-center justify-between"
            >
              <code className="text-amber-300 font-mono text-[11px] truncate">
                {surf}
              </code>
              <ArchieBadge tone="positive">PROTECTED</ArchieBadge>
            </div>
          ))}
        </div>
      </ArchiePanel>
    </ArchiePage>
  );
}
