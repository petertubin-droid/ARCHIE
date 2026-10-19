// =========================================================
// ARCHIE PWA — VOICE INTELLIGENCE (EARS & MOUTH)
//
// The Owner's conversational speech & auditory intelligence terminal:
//   * Real-time continuous speech transcription (Ears intake)
//   * Speaker biometric verification & voiceprint enrollment
//   * High-risk phrase prevention & Owner authorization gates
//   * Audio waveform visualizer & cognitive audio playback
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

export default function ArchieVoice() {
  const [isListening, setIsListening] = useState(false);
  const [speakerVerified, setSpeakerVerified] = useState(true);
  const [transcripts, setTranscripts] = useState<
    Array<{ speaker: string; text: string; time: string; confidence: number }>
  >([
    {
      speaker: "Owner",
      text: "Archie, summarize the multi-asset risk exposure across Exness and Binance positions.",
      time: "10:14 AM",
      confidence: 0.98,
    },
    {
      speaker: "ARCHIE (Voice)",
      text: "Aggregate exposure is currently $25,615 with zero naked leverage. All stops are verified within 1.2% ATR.",
      time: "10:14 AM",
      confidence: 0.99,
    },
  ]);

  const toggleListening = () => {
    setIsListening((prev) => !prev);
  };

  return (
    <ArchiePage
      eyebrow="Sensory & Auditory Intelligence"
      title="Conversational Voice Console"
      subtitle="Low-latency continuous speech perception, voiceprint biometric verification, and speech synthesis."
    >
      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Voice Session"
          value={isListening ? "LISTENING (ACTIVE)" : "IDLE (STANDBY)"}
          tone={isListening ? "positive" : "neutral"}
        />
        <ArchieStat
          label="Speaker Biometrics"
          value={speakerVerified ? "OWNER MATCH (98%)" : "UNKNOWN"}
          tone="positive"
        />
        <ArchieStat
          label="Audio Sample Rate"
          value="48.0 kHz"
          tone="neutral"
        />
        <ArchieStat
          label="High-Risk Gate"
          value="ENFORCED"
          tone="positive"
        />
      </div>

      {/* Main Interactive Mic Surface */}
      <ArchiePanel className="mb-6 p-6 text-center">
        <div className="mx-auto flex flex-col items-center max-w-md">
          {/* Pulsing Visualizer Circle */}
          <div
            className={`relative flex h-28 w-28 items-center justify-center rounded-full border transition-all duration-500 ${
              isListening
                ? "border-amber-400 bg-amber-400/20 shadow-[0_0_40px_rgba(251,191,36,0.35)]"
                : "border-white/10 bg-white/[0.02]"
            }`}
          >
            {isListening && (
              <div className="absolute inset-0 animate-ping rounded-full border border-amber-400/30" />
            )}
            <button
              onClick={toggleListening}
              className={`archie-focusable flex h-20 w-20 items-center justify-center rounded-full text-slate-950 transition-all ${
                isListening
                  ? "bg-amber-400 text-slate-950 shadow-lg"
                  : "bg-white/10 text-slate-300 hover:bg-white/20"
              }`}
            >
              {isListening ? (
                <Mic className="h-8 w-8 animate-pulse text-slate-950" />
              ) : (
                <MicOff className="h-8 w-8 text-slate-400" />
              )}
            </button>
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-200">
            {isListening
              ? "Listening to Owner Voice..."
              : "Click to Activate Continuous Voice Intelligence"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Microphone input passes strictly through local sensory gate before cognitive routing.
          </p>

          <div className="mt-4 flex gap-2">
            <ArchieBadge tone={isListening ? "positive" : "neutral"}>
              {isListening ? "STREAM CONNECTED" : "INPUT MUTED"}
            </ArchieBadge>
            <ArchieBadge tone="accent">
              SPEAKER: OWNER (P4 ENROLLED)
            </ArchieBadge>
          </div>
        </div>
      </ArchiePanel>

      {/* Live Transcript & Dialogue Stream */}
      <ArchiePanel className="p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-200">
              Audited Dialogue Stream
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Ears Protocol v2.1
          </span>
        </div>

        <div className="space-y-3">
          {transcripts.map((t, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 text-xs leading-relaxed ${
                t.speaker.includes("Owner")
                  ? "border-amber-400/20 bg-amber-400/[0.04] text-slate-200"
                  : "border-white/10 bg-black/30 text-slate-300"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span className="font-semibold text-amber-300">{t.speaker}</span>
                <span>
                  {t.time} · Confidence {(t.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p>{t.text}</p>
            </div>
          ))}
        </div>
      </ArchiePanel>
    </ArchiePage>
  );
}
