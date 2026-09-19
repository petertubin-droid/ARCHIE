// =========================================================
// ARCHIE VOICE INTELLIGENCE — CONVERSATIONAL VOICE SESSION
// src/lib/archie/voice-session.ts
//
// THE conversational voice interface to the ONE ARCHIE:
//
//   LISTEN → (HEAR →) UNDERSTAND → AUDIT → SPEAKER SIGNAL
//     → THINK (REAL archie-core cognitive turn) → SPEAK
//     → LISTEN AGAIN (continuous mode)
//
// Voice is an INTERFACE to ARCHIE's existing intelligence —
// never a second brain. Every spoken request runs through
// the real audited ears intake and the real cognitive engine
// (archie-core). No scripted voice answers exist here.
//
// STRUCTURAL RULES (cannot be bypassed by callers):
//   * VOICE_INPUT consent gates listening; VOICE_OUTPUT
//     consent gates speaking (checked in the ears/mouth
//     libraries themselves AND here — defense in depth).
//   * An empty/failed transcript NEVER becomes a request.
//     The engine is only ever called with real words.
//   * HIGH-RISK phrases ("authoriz…", "deploy…") NEVER
//     execute from voice: they route to the existing
//     owner-authorization workflow, and the transcript
//     buffer is purged the moment that happens. Voice may
//     INITIATE authorization but can never BE it.
//   * The speaker signal personalizes (greeting, confidence
//     notes) — it authorizes NOTHING.
//   * ONE session at a time: duplicate sessions are refused
//     (no overlapping recognitions, no double mic streams).
//   * Every failure is typed and honest (§24): unsupported
//     browser, permission denied, no mic, no speech, engine
//     unreachable, execution failure. No fabricated success.
// =========================================================

import {
  recognizeSpeech,
  startListening,
  detectEarSupport,
} from "@/lib/archie/ears";
import { reportTranscription } from "@/lib/archie/ears";
import { sendChatTurn } from "@/lib/archie/stage1-client";
import {
  speakArchie,
  stopArchieVoice,
  archieVoicePlaying,
} from "@/lib/archie/mobile/voice";
import { verifySpeakerSignal } from "@/lib/archie/mobile/voice-enrollment";
import {
  extractVoiceprint,
  type VoiceprintVector,
} from "@studio-shared/archie-ai/native-engine/voiceprint";
import type { ArchieConsent } from "@/lib/archie/mobile/types";

// ---------------------------------------------------------
// States (all real, all surfaced to the UI)
// ---------------------------------------------------------
export type VoiceSessionState =
  | "IDLE" // session not active
  | "LISTENING" // mic on, waiting for speech
  | "HEARING" // speech is being recognized right now
  | "PROCESSING" // transcript → audited intake + speaker check
  | "THINKING" // the REAL cognitive engine is working
  | "SPEAKING" // ARCHIE's reply is being spoken
  | "INTERRUPTED" // the owner barged in while ARCHIE spoke
  | "STOPPED"; // session ended (manual stop or timeout)

export type VoiceErrorKind =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "NO_MIC"
  | "NO_SPEECH"
  | "RECOGNITION_FAILED"
  | "ENGINE_UNREACHABLE"
  | "ENGINE_REJECTED"
  | "SPEAKER_CHECK_FAILED"
  | "AUDIT_UNAVAILABLE"
  | "SESSION_CONFLICT";

export interface SpeakerStatus {
  determinable: boolean;
  match: boolean;
  score: number;
  securityLabel: string;
}

export interface VoiceTurn {
  transcript: string;
  speaker: SpeakerStatus | null;
  reply: string | null;
  spoken: boolean;
}

export interface VoiceSessionConfig {
  /** VOICE_INPUT consent — listening refuses without it. */
  voiceInputConsent: ArchieConsent | undefined | null;
  /** VOICE_OUTPUT consent — speaking refuses without it. */
  voiceOutputConsent: ArchieConsent | undefined | null;
  /** Continuous mode: re-listen automatically after each
   *  reply. Barge-in is a natural consequence (the next
   *  recognition is already live while ARCHIE speaks). */
  continuous: boolean;
  /** Hard cap on one full conversational session. */
  sessionTimeoutMs: number;
  /** Silence limit per listening turn before an honest stop. */
  utteranceTimeoutMs: number;
  /** Session language (authoritative user selection flows
   *  through the existing language registry on the server). */
  languageCode: string;
  /** Owner voice-bank profile pitch (Hz) for the existing
   *  deterministic voice-print check. */
  bankPitchHz: number | null;
  /** Conversation routing into the REAL cognitive engine. */
  conversationId: string;
  history: () => Array<{ role: "owner" | "archie"; content: string }>;
}

export const DEFAULT_VOICE_SESSION_CONFIG: Omit<
  VoiceSessionConfig,
  "voiceInputConsent" | "voiceOutputConsent" | "conversationId" | "history"
> = {
  continuous: true,
  sessionTimeoutMs: 10 * 60_000,
  utteranceTimeoutMs: 15_000,
  languageCode: "en",
  bankPitchHz: null,
};

export interface VoiceSessionEvents {
  onState?(state: VoiceSessionState): void;
  /** Real interim recognition text (HEARING state). */
  onHearing?(text: string): void;
  /** The owner's final transcript, with the speaker signal. */
  onUserTranscript?(turn: Pick<VoiceTurn, "transcript" | "speaker">): void;
  /** ARCHIE's reply (always shown as text; spoken when the
   *  VOICE_OUTPUT consent allows). */
  onArchieReply?(reply: string, spoken: boolean, spokenError?: string): void;
  /** Typed honest failures (§24) — surfaced, never hidden. */
  onError?(kind: VoiceErrorKind, message: string): void;
  /** A high-risk spoken phrase routed to the existing
   *  owner-authorization workflow. Voice initiated it — it
   *  can never complete it. */
  onAuthorizationRequired?(transcript: string): void;
}

// ---------------------------------------------------------
// Injectable ports (real defaults; tests inject fakes — the
// pipeline itself is the SAME code path in both)
// ---------------------------------------------------------
export interface VoiceSessionPorts {
  recognize?: typeof recognizeSpeech;
  record?: typeof startListening;
  audit?: typeof reportTranscription;
  think?: typeof sendChatTurn;
  speak?: typeof speakArchie;
  silence?: typeof stopArchieVoice;
  speakerCheck?: typeof verifySpeakerSignal;
  extractVector?: (
    pcm: Float32Array,
    sampleRate: number,
  ) =>
    | { ok: true; vector: VoiceprintVector }
    | { ok: false; code: "SILENCE" | "TOO_SHORT" };
  decodeBlob?: (
    blob: Blob,
  ) => Promise<{ pcm: Float32Array; sampleRate: number } | null>;
  supported?: () => boolean;
  /** FIX 53: is ARCHIE's speech genuinely playing right now?
   *  Defaults to the REAL browser-synthesis state probe —
   *  INTERRUPTED may fire only on a genuine barge-in. */
  speechActive?: () => boolean;
}

/** Consecutive empty recognitions before the session ends
 *  honestly (never an unbounded silent retry loop). */
export const MAX_CONSECUTIVE_NO_SPEECH = 3;

/** Phrases that must NEVER execute from voice — they route
 *  to the owner-authorization workflow instead. */
export const HIGH_RISK_VOICE_PATTERNS =
  /authoriz|approve|deploy|production change|change.*credentials|delete.*database|drop table/i;

// ---------------------------------------------------------
// The session
// ---------------------------------------------------------
export interface VoiceSession {
  readonly config: VoiceSessionConfig;
  start(): Promise<void>;
  stop(reason?: "manual" | "timeout"): void;
  mute(): void;
  unmute(): void;
  /** The in-memory voice buffer (purged when authorization
   *  routing fires — sensitive speech never lingers). */
  readonly transcriptBuffer: string[];
}

let activeSession: VoiceSession | null = null;

/** Is a voice session already running? (duplicate guard) */
export function voiceSessionActive(): boolean {
  return activeSession !== null;
}

export async function createVoiceSession(
  config: VoiceSessionConfig,
  events: VoiceSessionEvents,
  ports: VoiceSessionPorts = {},
): Promise<
  | { ok: true; session: VoiceSession }
  | { ok: false; kind: VoiceErrorKind; message: string }
> {
  // ---- structural gates BEFORE anything touches the mic ----
  if (activeSession) {
    return {
      ok: false,
      kind: "SESSION_CONFLICT",
      message:
        "A voice session is already active. ARCHIE never runs two microphone sessions at once — stop the current one first.",
    };
  }
  if (!config.voiceInputConsent?.granted) {
    return {
      ok: false,
      kind: "PERMISSION_DENIED",
      message:
        "Voice input is switched off. Enable the VOICE_INPUT capability to talk to ARCHIE.",
    };
  }
  const supported = ports.supported ?? detectEarSupport;
  if (!supported()) {
    return {
      ok: false,
      kind: "UNSUPPORTED",
      message:
        "Voice recognition is not supported in this browser. ARCHIE's ears need a browser/OS speech engine — text input remains fully available.",
    };
  }

  const recognize = ports.recognize ?? recognizeSpeech;
  const record = ports.record ?? startListening;
  const audit = ports.audit ?? reportTranscription;
  const think = ports.think ?? sendChatTurn;
  const speakFn = ports.speak ?? speakArchie;
  const silenceFn = ports.silence ?? stopArchieVoice;
  const speakerCheck = ports.speakerCheck ?? verifySpeakerSignal;
  const speechActive = ports.speechActive ?? archieVoicePlaying;
  const extractVector =
    ports.extractVector ??
    ((pcm: Float32Array, sampleRate: number) =>
      extractVoiceprint(pcm, sampleRate));
  const decodeBlob =
    ports.decodeBlob ??
    (async (blob: Blob) => {
      if (typeof window === "undefined" || typeof AudioContext !== "function")
        return null;
      try {
        const buf = await blob.arrayBuffer();
        const ctx = new AudioContext();
        try {
          const audio = await ctx.decodeAudioData(buf);
          const n = audio.length;
          const pcm = new Float32Array(n);
          for (let c = 0; c < audio.numberOfChannels; c++) {
            const ch = audio.getChannelData(c);
            for (let i = 0; i < n; i++)
              pcm[i] += ch[i] / audio.numberOfChannels;
          }
          return { pcm, sampleRate: audio.sampleRate };
        } finally {
          void ctx.close().catch(() => undefined);
        }
      } catch {
        return null;
      }
    });

  let stopped = false;
  let muted = false;
  let wasSpeaking = false; // true while ARCHIE's speech plays
  let noSpeechStreak = 0; // consecutive empty recognitions
  const transcriptBuffer: string[] = [];
  const session: VoiceSession = {
    config,
    transcriptBuffer,
    start: async () => {
      if (stopped) return;
      await loop();
    },
    stop: (reason?: "manual" | "timeout") => {
      if (stopped) return;
      stopped = true;
      activeSession = null;
      silenceFn();
      events.onState?.("STOPPED");
      if (reason === "timeout") {
        events.onError?.(
          "NO_SPEECH",
          "Voice session ended after inactivity. Tap the microphone to talk again.",
        );
      }
    },
    mute: () => {
      muted = true;
      silenceFn();
    },
    unmute: () => {
      muted = false;
    },
  };
  activeSession = session;

  const sessionDeadline = Date.now() + config.sessionTimeoutMs;

  // -------------------------------------------------------
  // One conversational turn: LISTEN → HEAR → AUDIT →
  // SPEAKER → THINK → SPEAK. The loop recurses in continuous
  // mode; the RECOGNITION OVERLAP with speaking is what makes
  // barge-in real: the owner's interruption is captured while
  // ARCHIE is still talking, stopping the speech immediately.
  // -------------------------------------------------------
  async function loop(): Promise<void> {
    while (!stopped) {
      if (Date.now() > sessionDeadline) {
        session.stop("timeout");
        return;
      }
      events.onState?.("LISTENING");

      // Parallel audio capture for the speaker vector —
      // best-effort metadata: a failed capture is an honest
      // null, never a fabricated identity signal.
      let recorder: Awaited<ReturnType<typeof record>> | null = null;
      try {
        recorder = await record({
          maxDurationMs: config.utteranceTimeoutMs + 5_000,
        });
      } catch {
        recorder = null; // speaker check is optional metadata
      }

      let result;
      try {
        result = await recognize({
          languageHint: config.languageCode,
          maxDurationMs: config.utteranceTimeoutMs,
          bankPitchHz: config.bankPitchHz,
          onInterim: (text: string) => {
            // REAL partial speech from the native engine. While
            // ARCHIE is still SPEAKING this is BARGE-IN: the
            // owner's voice takes priority, always — speech is
            // silenced the instant real speech is heard.
            if (text.trim().length > 0) {
              silenceFn();
              // FIX 53: INTERRUPTED fires only on a GENUINE
              // barge-in — speech must actually still be
              // playing. A stale wasSpeaking flag from a reply
              // that already finished is cleared silently: the
              // owner simply speaking next is NOT an
              // interruption, and the state must stay honest.
              if (wasSpeaking) {
                wasSpeaking = false;
                if (speechActive()) {
                  events.onState?.("INTERRUPTED");
                }
              }
            }
            events.onHearing?.(text);
          },
        });
      } catch (e) {
        recorder?.cancel();
        const message =
          e instanceof Error ? e.message : "Speech recognition failed.";
        const kind: VoiceErrorKind = /support/i.test(message)
          ? "UNSUPPORTED"
          : /permission/i.test(message)
            ? "PERMISSION_DENIED"
            : /no microphone|no mic/i.test(message)
              ? "NO_MIC"
              : /no speech/i.test(message)
                ? "NO_SPEECH"
                : "RECOGNITION_FAILED";
        if (stopped) return;
        events.onError?.(kind, message);
        if (
          kind === "UNSUPPORTED" ||
          kind === "PERMISSION_DENIED" ||
          kind === "NO_MIC"
        ) {
          session.stop("manual");
          return;
        }
        // transient (no-speech / recognition hiccup): retry a
        // BOUNDED number of times, then stop honestly — the
        // loop never spins unbounded on silence
        noSpeechStreak += 1;
        if (noSpeechStreak >= MAX_CONSECUTIVE_NO_SPEECH) {
          session.stop("timeout");
          return;
        }
        continue;
      }

      // The utterance vector: stop the parallel recorder and
      // extract the voiceprint ON-DEVICE.
      let speaker: SpeakerStatus | null = null;
      try {
        const recording = recorder ? await recorder.stop() : null;
        recorder = null;
        if (recording) {
          const decoded = await decodeBlob(recording.blob);
          if (decoded) {
            const vector = extractVector(decoded.pcm, decoded.sampleRate);
            if (vector.ok) {
              const signal = await speakerCheck(vector.vector);
              if (signal) {
                speaker = {
                  determinable: signal.determinable,
                  match: signal.match,
                  score: signal.score,
                  securityLabel: signal.security_label,
                };
              }
            }
          }
        }
      } catch {
        recorder = null; // honest: no speaker signal this turn
      }

      if (stopped) return;
      const transcript = result.transcript.replace(/\s+/g, " ").trim();

      if (!result.speechDetected || transcript.length === 0) {
        events.onError?.(
          "NO_SPEECH",
          "I didn't hear a clear request. Tap the microphone and speak again.",
        );
        // bounded: the loop never spins unbounded on silence
        noSpeechStreak += 1;
        if (noSpeechStreak >= MAX_CONSECUTIVE_NO_SPEECH) {
          session.stop("timeout");
          return;
        }
        continue;
      }

      // ---- HIGH-RISK ROUTING: voice NEVER executes these ----
      if (HIGH_RISK_VOICE_PATTERNS.test(transcript)) {
        transcriptBuffer.length = 0; // purge: sensitive speech never lingers
        events.onAuthorizationRequired?.(transcript);
        // FIX 55: the loop ends here in EVERY mode. The old
        // continuous-mode path returned WITHOUT stopping, so
        // the session stayed registered-active while its loop
        // was dead — every later createVoiceSession got a
        // permanent SESSION_CONFLICT zombie. The workflow that
        // takes over ends this session cleanly; a new session
        // may start whenever the owner wants.
        session.stop("manual");
        return; // the workflow takes over — no engine turn
      }

      noSpeechStreak = 0;
      transcriptBuffer.push(transcript);
      events.onUserTranscript?.({ transcript, speaker });
      events.onState?.("PROCESSING");

      // Audited intake — a failure is reported honestly but
      // does not destroy the turn (the transcript was real;
      // the AUDIT being down must not fake a lost request).
      try {
        await audit({
          transcript,
          speechDetected: true,
          languageHint: config.languageCode,
          durationSec: result.durationSec,
          voicePrint: result.voicePrint,
        });
      } catch {
        events.onError?.(
          "AUDIT_UNAVAILABLE",
          "The transcript could not be recorded in ARCHIE's audit trail (the turn continues — the words were real).",
        );
      }
      if (stopped) return;

      // ---- THE REAL COGNITIVE ENGINE TURN ----
      events.onState?.("THINKING");
      const turn = await think({
        conversationId: config.conversationId,
        message: transcript,
        history: config.history(),
        language: {
          language_code: config.languageCode,
          source: "USER_SELECTION",
        },
      });
      if (stopped) return;
      if (!turn.ok || !turn.reply) {
        events.onError?.(
          turn.ok ? "ENGINE_REJECTED" : "ENGINE_UNREACHABLE",
          turn.error ?? "ARCHIE's core could not process the request.",
        );
        continue;
      }

      // ---- SPEAK THE REPLY (consent + mute honored) ----
      events.onArchieReply?.(
        turn.reply,
        !muted && Boolean(config.voiceOutputConsent?.granted),
      );
      if (muted || !config.voiceOutputConsent?.granted) {
        // FIX 54: the reply is shown as text; voice output is
        // off. In CONTINUOUS mode the session keeps listening
        // — the old code returned here, leaving the loop dead
        // while the session stayed registered-active (a
        // SESSION_CONFLICT zombie). Mute silences ARCHIE's
        // voice; it must never end the conversation.
        if (!config.continuous) {
          session.stop("manual");
          return;
        }
        continue;
      }
      events.onState?.("SPEAKING");
      const spoken = speakFn(turn.reply, config.voiceOutputConsent);
      // FIX 53: the barge-in flag arms only when the prosody
      // plan actually queued speakable units — a refused,
      // unsupported or empty synthesis never claims to be
      // playing.
      wasSpeaking = spoken.ok && spoken.chunks > 0;
      if (!spoken.ok && spoken.error) {
        events.onArchieReply?.(turn.reply, false, spoken.error);
      }

      // ---- BARGE-IN WINDOW: while ARCHIE speaks, the loop
      // continues and the next recognition is already live.
      // The owner's speech silences ARCHIE instantly (see
      // onInterim above) and becomes the new request. ----
      if (!config.continuous) {
        session.stop("manual");
        return;
      }
      // wasSpeaking stays armed until the next utterance
      // actually arrives (or the session stops).
    }
  }

  return { ok: true, session };
}
