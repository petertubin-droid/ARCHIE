// =========================================================
// ARCHIE PREMIUM PERSONALIZATION & OWNER PREFERENCES
//
// Client-side & profile-synced customization for ARCHIE:
//   - Theme accent selection (Amber Gold, Cyber Violet, Emerald Mint, Sapphire Blue)
//   - Voice personality tone & speed
//   - AI proactive assistance & context memory verbosity
//   - Default startup workspace (Chat, Coding Studio, Trading Terminal)
// =========================================================

import { useState, useEffect } from "react";
import { Sparkles, Sliders, Volume2, ShieldCheck, Palette, X, Check } from "lucide-react";
import { ArchieButton, ArchieGhostButton } from "./premium";

export interface PersonalizationConfig {
  accentColor: "gold" | "violet" | "emerald" | "sapphire";
  verbosity: "concise" | "balanced" | "detailed";
  voiceSpeed: number;
  proactiveSuggestions: boolean;
  defaultWorkspace: "chat" | "coding" | "trading";
}

const STORAGE_KEY = "archie_personalization_v1";

const DEFAULT_CONFIG: PersonalizationConfig = {
  accentColor: "gold",
  verbosity: "detailed",
  voiceSpeed: 1.0,
  proactiveSuggestions: true,
  defaultWorkspace: "chat",
};

export function loadPersonalization(): PersonalizationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* fallback to default */
  }
  return DEFAULT_CONFIG;
}

export function savePersonalization(cfg: PersonalizationConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    // Apply accent class or root variables if needed
    document.documentElement.dataset.archieAccent = cfg.accentColor;
  } catch {
    /* no-op */
  }
}

export default function PersonalizationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<PersonalizationConfig>(loadPersonalization);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCfg(loadPersonalization());
      setSavedMessage(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    savePersonalization(cfg);
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="archie-panel archie-panel-accent relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="archie-title-gradient text-base font-bold">ARCHIE Personalization</h2>
              <p className="text-xs text-slate-400">Tailor ARCHIE's intelligence, appearance & tone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Accent Color */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Palette className="h-3.5 w-3.5 text-amber-300" /> Accent Aura Theme
            </label>
            <div className="mt-2.5 grid grid-cols-4 gap-2.5">
              {[
                { id: "gold", label: "Amber Gold", border: "border-amber-400", bg: "bg-amber-400/20" },
                { id: "violet", label: "Cyber Violet", border: "border-violet-400", bg: "bg-violet-400/20" },
                { id: "emerald", label: "Emerald Mint", border: "border-emerald-400", bg: "bg-emerald-400/20" },
                { id: "sapphire", label: "Sapphire Blue", border: "border-sky-400", bg: "bg-sky-400/20" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCfg({ ...cfg, accentColor: c.id as any })}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-[11px] font-medium transition ${
                    cfg.accentColor === c.id
                      ? `${c.border} ${c.bg} text-white shadow-lg`
                      : "border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className={`h-4 w-4 rounded-full ${c.border} border-2`} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reasoning Verbosity */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <Sliders className="h-3.5 w-3.5 text-amber-300" /> Reasoning & Output Detail
            </label>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {(["concise", "balanced", "detailed"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCfg({ ...cfg, verbosity: mode })}
                  className={`rounded-xl border py-2 text-xs capitalize transition ${
                    cfg.verbosity === mode
                      ? "border-amber-400/40 bg-amber-400/10 font-semibold text-amber-200"
                      : "border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/20"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Default Workspace */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-amber-300" /> Default Startup View
            </label>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {[
                { id: "chat", label: "Assistant Chat" },
                { id: "coding", label: "Studio IDE" },
                { id: "trading", label: "Trading Terminal" },
              ].map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setCfg({ ...cfg, defaultWorkspace: w.id as any })}
                  className={`rounded-xl border py-2 text-xs transition ${
                    cfg.defaultWorkspace === w.id
                      ? "border-amber-400/40 bg-amber-400/10 font-semibold text-amber-200"
                      : "border-white/5 bg-white/[0.02] text-slate-400 hover:border-white/20"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Proactive Intelligence Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div>
              <p className="text-xs font-medium text-slate-200">Proactive Suggestions</p>
              <p className="text-[11px] text-slate-500">Enable contextual next-action recommendations</p>
            </div>
            <button
              type="button"
              onClick={() => setCfg({ ...cfg, proactiveSuggestions: !cfg.proactiveSuggestions })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                cfg.proactiveSuggestions ? "bg-amber-400" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-slate-900 transition-transform ${
                  cfg.proactiveSuggestions ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <ArchieGhostButton onClick={onClose}>Cancel</ArchieGhostButton>
          <ArchieButton onClick={handleSave} className="flex items-center gap-1.5">
            {savedMessage ? (
              <>
                <Check className="h-4 w-4" /> Applied!
              </>
            ) : (
              "Save Preferences"
            )}
          </ArchieButton>
        </div>
      </div>
    </div>
  );
}
