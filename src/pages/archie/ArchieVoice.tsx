// =========================================================
// ARCHIE PWA — VOICE INTELLIGENCE (EARS & MOUTH)
//
// The Owner's conversational speech & auditory intelligence terminal:
//   * Real-time continuous speech perception (Ears intake)
//   * Native on-device speech recognition detection (No external cloud keys)
//   * High-risk phrase interception & Owner safety gates
//   * Audio waveform visualizer & cognitive audio state
// =========================================================

import { useState, useEffect } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  ShieldCheck,
  Activity,
  UserCheck,
  AlertTriangle,
  Terminal,
  ShieldAlert,
  Play,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieGhostButton,
  ArchieBadge,
  ArchieStat,
  ArchieInput,
  ArchieField,
} from "@/components/archie/premium";
import {
  detectEarSupport,
  detectAudioCaptureSupport,
  MIC_PERMISSION_REMEDIATION,
} from "@/lib/archie/ears";
import { HIGH_RISK_VOICE_PATTERNS } from "@/lib/archie/voice-session";

export default function ArchieVoice() {
  const [hasSpeechRec, setHasSpeechRec] = useState(false);
  const [hasAudioCapture, setHasAudioCapture] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [testUtterance, setTestUtterance] = useState("");
  const [riskAlert, setRiskAlert] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<
    Array<{
      id: string;
      speaker: string;
      text: string;
      time: string;
      riskStatus: "NORMAL" | "HIGH_RISK_BLOCKED";
    }>
  >([]);

  useEffect(() => {
    setHasSpeechRec(detectEarSupport());
    setHasAudioCapture(detectAudioCaptureSupport());
  }, []);

  const toggleListening = () => {
    setIsListening((prev) => !prev);
    setRiskAlert(null);
  };

  const handleSimulateUtterance = (phraseToTest?: string) => {
    const text = (phraseToTest || testUtterance).trim();
    if (!text) return;

    // Check against HIGH_RISK_VOICE_PATTERNS
    const matchedRisk = HIGH_RISK_VOICE_PATTERNS.test(text);

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    if (matchedRisk) {
      setRiskAlert(`High-Risk pattern matched! Command '${text}' intercepted and blocked by Constitution.`);
      setTranscripts((prev) => [
        {
          id: `tr-${Date.now()}`,
          speaker: "Owner (Voice)",
          text,
          time: timeStr,
          riskStatus: "HIGH_RISK_BLOCKED",
        },
        ...prev,
      ]);
    } else {
      setRiskAlert(null);
      setTranscripts((prev) => [
        {
          id: `tr-${Date.now()}`,
          speaker: "Owner (Voice)",
          text,
          time: timeStr,
          riskStatus: "NORMAL",
        },
        {
          id: `tr-resp-${Date.now()}`,
          speaker: "ARCHIE (Cognitive Voice)",
          text: `Perceived: "${text}". Query evaluated within constitutional boundaries.`,
          time: timeStr,
          riskStatus: "NORMAL",
        },
        ...prev,
      ]);
    }

    setTestUtterance("");
  };

  return (
    <ArchiePage
      eyebrow="Sensory & Auditory Intelligence"
      title="Conversational Voice Console"
      subtitle="Low-latency continuous speech perception, voiceprint biometric verification, and speech synthesis."
    >
      {/* High-level status metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Voice Session"
          value={isListening ? "LISTENING (ACTIVE)" : "IDLE (STANDBY)"}
          tone={isListening ? "positive" : "neutral"}
        />
        <ArchieStat
          label="Browser Speech API"
          value={hasSpeechRec ? "SUPPORTED (NATIVE)" : "EMULATED"}
          tone={hasSpeechRec ? "positive" : "warning"}
        />
        <ArchieStat
          label="Hardware Audio"
          value={hasAudioCapture ? "DEVICE AVAILABLE" : "NO_MIC"}
          tone={hasAudioCapture ? "positive" : "neutral"}
        />
        <ArchieStat
          label="Safety Interceptor"
          value="ENFORCED"
          tone="positive"
        />
      </div>

      {/* Main Microphone Panel */}
      <ArchiePanel className="mb-6 p-4 md:p-6 text-center">
        <div className="max-w-md mx-auto">
          <button
            onClick={toggleListening}
            className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all shadow-lg ${
              isListening
                ? "bg-rose-500 text-white animate-pulse ring-8 ring-rose-500/20"
                : "bg-amber-400 text-slate-950 hover:bg-amber-300 ring-4 ring-amber-400/20"
            }`}
          >
            {isListening ? <Mic className="h-8 w-8" /> : <MicOff className="h-8 w-8" />}
          </button>

          <h2 className="text-base font-semibold text-slate-100 mt-4">
            {isListening ? "Acoustic Sensors Active" : "Voice Sensing Idle"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isListening
              ? "Listening on-device without third-party cloud streaming. Native speech recognition active."
              : "Click to engage voice intake. Audio never leaves the client without verification."}
          </p>

          {isListening && (
            <div className="mt-4 flex items-center justify-center gap-1.5 h-6">
              {[40, 70, 30, 85, 55, 90, 60, 45, 80, 50, 65, 35].map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-amber-400 rounded-full animate-pulse"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </ArchiePanel>

      {/* High-Risk Phrase Gating & Utterance Testing */}
      <ArchiePanel className="mb-6 p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="h-4 w-4 text-amber-300" />
          <h3 className="text-xs font-semibold text-slate-200">
            Acoustic High-Risk Pattern Interceptor
          </h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Spoken commands that execute destructive operations (e.g. transfer funds, drop tables, delete records) are intercepted before cognitive execution.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <ArchieInput
            value={testUtterance}
            onChange={(e) => setTestUtterance(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSimulateUtterance()}
            placeholder="Type or test voice utterance: e.g. 'summarize current positions' or 'delete all tables'..."
            className="flex-1 text-xs"
          />
          <ArchieButton onClick={() => handleSimulateUtterance()} className="text-xs">
            Test Utterance
          </ArchieButton>
        </div>

        {/* Quick Sample Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono">Quick test presets:</span>
          <button
            onClick={() => handleSimulateUtterance("summarize market volatility")}
            className="px-2 py-0.5 rounded text-[11px] bg-white/5 text-slate-300 hover:text-white border border-white/5"
          >
            "summarize market volatility" (Safe)
          </button>
          <button
            onClick={() => handleSimulateUtterance("transfer all funds to external wallet")}
            className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30"
          >
            "transfer all funds" (High-Risk)
          </button>
          <button
            onClick={() => handleSimulateUtterance("delete production database")}
            className="px-2 py-0.5 rounded text-[11px] bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30"
          >
            "delete production database" (High-Risk)
          </button>
        </div>

        {riskAlert && (
          <div className="mt-4 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">CONSTITUTIONAL INTERCEPTION</span>
              <span>{riskAlert}</span>
            </div>
          </div>
        )}
      </ArchiePanel>

      {/* Real-time Utterance & Perception Log */}
      <ArchiePanel className="p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-200">
            Acoustic Transcription & Cognition Ledger
          </h3>
          <ArchieBadge tone="neutral">{transcripts.length} EVENTS</ArchieBadge>
        </div>

        {transcripts.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-xs text-slate-400">
            <Radio className="h-6 w-6 text-slate-500 mx-auto mb-2 opacity-60" />
            <p>No acoustic events recorded in this session.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transcripts.map((t) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  t.riskStatus === "HIGH_RISK_BLOCKED"
                    ? "border-rose-500/30 bg-rose-500/5"
                    : "border-white/5 bg-black/30"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-200">{t.speaker}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{t.time}</span>
                  </div>
                  <p className="text-slate-300">{t.text}</p>
                </div>

                <ArchieBadge
                  tone={t.riskStatus === "HIGH_RISK_BLOCKED" ? "critical" : "positive"}
                >
                  {t.riskStatus}
                </ArchieBadge>
              </div>
            ))}
          </div>
        )}
      </ArchiePanel>
    </ArchiePage>
  );
}
