// =========================================================
// FRELUX ARCHIE — EARS / AUDIO INTELLIGENCE (CLIENT)
//
// The browser side of ARCHIE's audio perception — 100%
// native, provider-free (OpenAI Separation Rule):
//
//   MICROPHONE → NATIVE ON-DEVICE SPEECH RECOGNITION
//     → TRANSCRIPT → archie-ears (owner-gated audit)
//     → ARCHIE PERCEPTION → COGNITIVE ENGINE → RESPONSE
//
//   VOICE BANK (the owner's own recorded samples) →
//     deterministic pitch/pace profile → voice-print check
//     on every utterance + voice-shaped spoken replies.
//     Pure math, no cloud AI, no OpenAI, no API key.
//
// Honesty rules (spec §§3, 16, 19):
//   * Every failure is typed and surfaced — permission
//     denial, missing microphone, unsupported browser, no
//     speech detected, aborted capture. Nothing is faked.
//   * An empty transcript is reported as speechDetected:
//     false — the engine NEVER invents text.
//   * Listening is explicit: it starts when the owner asks
//     and stops when the owner stops it (or the hard duration
//     cap trips). ARCHIE never listens silently.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import {
  voicePrintMatch,
  type VoicePrint,
} from "@studio-shared/archie-ai/native-engine/ears";

export type EarsErrorCode =
  | "UNSUPPORTED" // browser has no native speech recognition
  | "PERMISSION_DENIED" // owner (or browser policy) denied the microphone
  | "NO_MIC" // no input device exists
  | "RECORD_FAILED" // capture failed mid-utterance
  | "NOT_RECORDED" // stop() called before anything was captured
  | "SERVICE_UNAVAILABLE" // audit intake unreachable
  | "RATE_LIMITED" // too many utterance reports
  | "FORBIDDEN" // non-owner attempted EARS
  | "NO_SPEECH" // recognition ran, nothing intelligible
  | "REJECTED"; // audit intake refused the payload

export class EarsError extends Error {
  code: EarsErrorCode;
  constructor(code: EarsErrorCode, message: string) {
    super(message);
    this.name = "EarsError";
    this.code = code;
  }
}

export const EARS_MAX_DURATION_MS = 30_000; // hard cap per utterance
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
];

// ---------------------------------------------------------
// Native speech recognition (browser/OS engine — no provider)
// ---------------------------------------------------------
type RecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    (w.SpeechRecognition as RecognitionConstructor | undefined) ??
    (w.webkitSpeechRecognition as RecognitionConstructor | undefined) ??
    null
  );
}

/** Can this browser understand speech natively? (No provider,
 *  no key — this is the browser/OS recognition engine.) */
export function detectEarSupport(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * Human-readable remediation when the microphone is blocked.
 * A denied permission is remembered by the browser and NEVER
 * re-prompted on its own — the owner must flip it back in the
 * site settings, so the error must say exactly how.
 */
export const MIC_PERMISSION_REMEDIATION =
  "Microphone access is blocked. To fix it: tap the lock or tune icon next to the address bar, open Site settings, set Microphone to Allow, then try ARCHIE's voice again. (On Android Chrome it may also be under Settings, Site settings for this site.)";

/** Best-effort read of the current mic permission state.
 *  Returns "unsupported" when the Permissions API is not
 *  available — honest, never guessed. */
export async function readMicPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unsupported"
> {
  try {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.permissions?.query !== "function"
    ) {
      return "unsupported";
    }
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state as "granted" | "denied" | "prompt";
  } catch {
    return "unsupported";
  }
}

/** Can this browser capture microphone audio? (Used for
 *  voice-note attachment and the voice-print check.) */
export function detectAudioCaptureSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof window.AudioContext === "function"
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

// ---------------------------------------------------------
// Voice capture (owner's voice bank — deterministic math)
// ---------------------------------------------------------

/**
 * Listen to the utterance and estimate its median voiced
 * pitch via autocorrelation — the same deterministic math
 * the voice bank profile is built from. Owner's own audio,
 * analyzed locally, never uploaded anywhere.
 */
export async function captureUtterancePitch(
  stream: MediaStream,
): Promise<{ stop: () => number | null }> {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const frame = new Float32Array(analyser.fftSize);
  const pitches: number[] = [];
  const sampleRate = ctx.sampleRate;
  let running = true;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(frame);
    const hz = framePitch(frame, sampleRate);
    if (hz > 0) pitches.push(hz);
  }, 100);

  return {
    stop: () => {
      if (!running) return null;
      running = false;
      clearInterval(timer);
      source.disconnect();
      void ctx.close().catch(() => undefined);
      if (pitches.length === 0) return null;
      pitches.sort((a, b) => a - b);
      return pitches[Math.floor(pitches.length / 2)];
    },
  };
}

/** Fundamental frequency of one frame via normalized
 *  autocorrelation (voice-bank math, client copy). */
function framePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 60);
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy < 1e-4 * frame.length) return 0; // silence, skip
  let bestCorr = 0;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag && lag < frame.length; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      corr += frame[i] * frame[i + lag];
      norm += frame[i + lag] * frame[i + lag];
    }
    const normalized = norm > 0 ? corr / Math.sqrt(norm) : 0;
    if (normalized > bestCorr) {
      bestCorr = normalized;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? sampleRate / bestLag : 0;
}

export interface EarsRecording {
  /** The recorded audio, with the negotiated mime type. */
  blob: Blob;
  /** Wall-clock recording duration in seconds. */
  durationSec: number;
  /** True when the hard duration cap tripped the stop. */
  capped: boolean;
}

export interface EarsRecorder {
  /** Owner-initiated stop. Resolves with the recording. */
  stop(): Promise<EarsRecording>;
  /** Release the mic without waiting for the recording. */
  cancel(): void;
}

/**
 * Start recording (voice-note capture). The microphone turns
 * on ONLY here, with the owner's explicit action behind the
 * call. Auto-stops honestly at maxDurationMs (the result is
 * reported with capped: true — the audio is real, just
 * length-limited).
 */
export async function startListening(opts?: {
  maxDurationMs?: number;
}): Promise<EarsRecorder> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.getUserMedia !== "function" ||
    typeof window.MediaRecorder !== "function"
  ) {
    throw new EarsError(
      "UNSUPPORTED",
      "This browser cannot record audio. ARCHIE's ears need microphone support.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e: unknown) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new EarsError("NO_MIC", "No microphone was found on this device.");
    }
    // NotAllowedError = the owner (or a browser policy) blocked
    // the mic. The browser will NOT re-prompt on its own once
    // denied — point to the exact setting to flip back.
    throw new EarsError(
      "PERMISSION_DENIED",
      name === "NotAllowedError" || name === "SecurityError"
        ? MIC_PERMISSION_REMEDIATION
        : "Microphone permission was not granted. ARCHIE cannot listen without it.",
    );
  }

  const mime = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new EarsError(
      "RECORD_FAILED",
      "This browser refused to start audio recording.",
    );
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let stopped = false;
  let capped = false;

  // Handlers are attached BEFORE any stop can fire so the
  // recording promise always settles, whichever side stops
  // first (owner tap or duration cap).
  const whenStopped = new Promise<EarsRecording>((resolve, reject) => {
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = recorder.mimeType || mime || "audio/webm";
      if (chunks.length === 0) {
        reject(new EarsError("NOT_RECORDED", "No audio was captured."));
        return;
      }
      resolve({
        blob: new Blob(chunks, { type }),
        durationSec: Math.round((Date.now() - startedAt) / 100) / 10,
        capped,
      });
    };
    recorder.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      reject(new EarsError("RECORD_FAILED", "Audio recording failed."));
    };
  });

  recorder.start(250); // timeslice keeps chunks flowing

  const capTimer = setTimeout(() => {
    capped = true;
    if (!stopped) {
      stopped = true;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  }, opts?.maxDurationMs ?? EARS_MAX_DURATION_MS);

  function release() {
    if (!stopped) {
      stopped = true;
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  return {
    stop: async () => {
      clearTimeout(capTimer);
      release();
      return whenStopped;
    },
    cancel: () => {
      clearTimeout(capTimer);
      release();
    },
  };
}

// ---------------------------------------------------------
// Native speech → text (on-device recognition engine)
// ---------------------------------------------------------
export interface TranscriptionResult {
  transcript: string;
  /** Language hint that was applied (native recognition
   *  does not auto-detect — we say so honestly). */
  language: string | null;
  durationSec: number | null;
  /** False means nothing intelligible was recognized.
   *  The transcript is then exactly "" — never invented. */
  speechDetected: boolean;
  /** Deterministic voice-print check against the owner's
   *  voice bank profile (null when it could not be computed). */
  voicePrint: VoicePrint | null;
}

/**
 * Listen and understand, natively. Speech recognition runs on
 * the device's own engine — no cloud provider, no API key,
 * no OpenAI. When a voice-bank profile pitch is provided,
 * the utterance's pitch is compared against it (pure math on
 * the owner's own samples).
 */
export async function recognizeSpeech(opts?: {
  languageHint?: string | null;
  maxDurationMs?: number;
  /** The owner's voice-bank profile pitch (Hz), for the
   *  deterministic voice-print check. */
  bankPitchHz?: number | null;
  onFinal?: (transcript: string) => void;
  /** Stream REAL partial (interim) results while the owner
   *  speaks — the conversational voice session uses these for
   *  the HEARING state and barge-in. Opt-in; the engine only
   *  reports what the native recognition actually produced. */
  onInterim?: (text: string) => void;
}): Promise<TranscriptionResult> {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    throw new EarsError(
      "UNSUPPORTED",
      "This browser has no native speech recognition. ARCHIE cannot understand speech here.",
    );
  }

  const recognition = new Ctor();
  recognition.lang = opts?.languageHint ?? navigator.language ?? "en";
  recognition.continuous = false;
  recognition.interimResults = opts?.onInterim != null;
  recognition.maxAlternatives = 1;

  // Optional parallel pitch capture for the voice print.
  let pitchStopper: { stop: () => number | null } | null = null;
  let pitchStream: MediaStream | null = null;
  if (
    opts?.bankPitchHz != null &&
    opts.bankPitchHz > 0 &&
    detectAudioCaptureSupport()
  ) {
    try {
      pitchStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pitchStopper = await captureUtterancePitch(pitchStream);
    } catch {
      // Voice print is best-effort METADATA, never a blocker:
      // an honest null when pitch could not be captured.
      pitchStopper = null;
    }
  }

  const startedAt = Date.now();
  let settled = false;
  let finalTranscript = "";

  const capTimer = setTimeout(() => {
    try {
      recognition.stop();
    } catch {
      /* already ended */
    }
  }, opts?.maxDurationMs ?? EARS_MAX_DURATION_MS);

  const cleanup = () => {
    clearTimeout(capTimer);
    pitchStopper?.stop();
    pitchStream?.getTracks().forEach((t) => t.stop());
  };

  return new Promise<TranscriptionResult>((resolve, reject) => {
    recognition.onerror = (ev) => {
      if (settled) return;
      settled = true;
      cleanup();
      const map: Record<string, EarsErrorCode> = {
        "not-allowed": "PERMISSION_DENIED",
        "service-not-allowed": "PERMISSION_DENIED",
        "audio-capture": "NO_MIC",
        "no-speech": "NO_SPEECH",
        network: "SERVICE_UNAVAILABLE",
        "language-not-supported": "UNSUPPORTED",
        aborted: "NO_SPEECH",
      };
      const code = map[ev.error] ?? "RECORD_FAILED";
      const messages: Record<EarsErrorCode, string> = {
        UNSUPPORTED: "This browser cannot recognize this language natively.",
        PERMISSION_DENIED: MIC_PERMISSION_REMEDIATION,
        NO_MIC: "No microphone was found on this device.",
        RECORD_FAILED: "Speech recognition failed.",
        NOT_RECORDED: "No audio was captured.",
        SERVICE_UNAVAILABLE:
          "The native speech engine is unavailable right now. No transcript was produced.",
        RATE_LIMITED: "",
        FORBIDDEN: "",
        NO_SPEECH: "No speech was detected — nothing was transcribed.",
        REJECTED: "",
      };
      reject(
        new EarsError(code, messages[code] || "Speech recognition failed."),
      );
    };

    recognition.onend = () => {
      if (settled) return;
      settled = true;
      const utterancePitchHz = pitchStopper ? pitchStopper.stop() : null;
      cleanup();
      const transcript = finalTranscript.replace(/\s+/g, " ").trim();
      const voicePrint = voicePrintMatch(
        utterancePitchHz,
        opts?.bankPitchHz ?? null,
      );
      opts?.onFinal?.(transcript);
      resolve({
        transcript,
        language: recognition.lang || null,
        durationSec: Math.round(((Date.now() - startedAt) / 100) * 10) / 10,
        speechDetected: transcript.length > 0,
        voicePrint,
      });
    };

    recognition.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript;
        } else if (opts?.onInterim) {
          // a REAL partial result from the native engine —
          // surfaced exactly as produced, never invented
          opts.onInterim(res[0].transcript);
        }
      }
    };

    try {
      recognition.start();
    } catch {
      cleanup();
      reject(
        new EarsError("RECORD_FAILED", "Speech recognition could not start."),
      );
    }
  });
}

// ---------------------------------------------------------
// Audited intake — the archie-ears edge function records
// every real transcription (owner-gated, rate-limited). It
// performs NO transcription itself and holds NO provider key.
// ---------------------------------------------------------
export async function reportTranscription(input: {
  transcript: string;
  speechDetected: boolean;
  languageHint?: string | null;
  durationSec?: number | null;
  voicePrint?: VoicePrint | null;
}): Promise<void> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("archie-ears", {
    body: {
      transcript: input.transcript,
      speech_detected: input.speechDetected,
      language_hint: input.languageHint ?? null,
      duration_sec: input.durationSec ?? null,
      voice_print: input.voicePrint
        ? {
            utterance_pitch_hz: input.voicePrint.utterancePitchHz,
            bank_pitch_hz: input.voicePrint.bankPitchHz,
            match: input.voicePrint.match,
          }
        : null,
    },
  });

  if (error) {
    throw new EarsError(
      "SERVICE_UNAVAILABLE",
      "ARCHIE's ears audit service could not be reached. The transcript was produced locally.",
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    (data as { ok?: unknown }).ok !== true
  ) {
    const body = (data ?? {}) as { code?: string; error?: string };
    const code =
      body.code === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : body.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : "REJECTED";
    throw new EarsError(
      code,
      body.error ??
        "The transcript could not be recorded in ARCHIE's audit trail.",
    );
  }
}
