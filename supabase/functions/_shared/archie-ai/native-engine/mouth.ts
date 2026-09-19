// =========================================================
// ARCHIE NATIVE ENGINE — MOUTH (VOICE OUTPUT CORE)
// supabase/functions/_shared/archie-ai/native-engine/mouth.ts
//
// The native core of ARCHIE's voice OUTPUT — 100% provider-
// free (OpenAI Separation Rule, owner-directed 2026-09-10):
//
//   * PROSODY PLANNER: deterministic text → speech-plan
//     transformation. Punctuation becomes real pauses;
//     sentence type becomes intonation (statements fall,
//     questions rise); the owner's voice-bank profile shapes
//     engine pitch + rate. Pure functions, testable anywhere.
//   * PCM/WAV SYNTHESIS: real audio bytes generated natively —
//     tone synthesis with click-free envelopes, RIFF/WAVE
//     encoding, and ARCHIE's audio cues (listen/confirm/alert).
//     Speech AUDIO is not claimed here — the plan drives the
//     client's on-device speech engine; the synthesizer
//     produces non-speech audio deterministically.
//   * CONSENT GATE: planning speech output refuses when the
//     VOICE_OUTPUT consent is not granted — at the LIBRARY
//     level, so no caller can bypass it (mirrors mobile/voice).
//
// Node/Deno compatible: no runtime APIs at import time.
// =========================================================

// ---------------------------------------------------------
// Consent gate (library-level, callers cannot bypass)
// ---------------------------------------------------------
export interface MouthConsent {
  granted: boolean;
}

export type SpeechPlanResult =
  | {
      ok: true;
      units: SpeechUnit[];
      profileApplied: boolean;
    }
  | { ok: false; code: "CONSENT_NOT_GRANTED" | "NOTHING_TO_SAY" };

/** One speakable unit with deterministic prosody. */
export interface SpeechUnit {
  text: string;
  /** Pause BEFORE this unit, milliseconds. */
  pauseBeforeMs: number;
  /** Engine pitch multiplier for this unit (1 = default). */
  pitchScale: number;
  /** Engine rate multiplier for this unit (1 = default). */
  rateScale: number;
}

/** Owner voice-bank profile shape (from the Admin voice bank). */
export interface MouthVoiceProfile {
  /** Median voiced pitch of the owner's samples (Hz). */
  pitchHz: number;
  /** Speech-rate multiplier (1.0 = engine default). */
  rateHint: number;
}

// Deterministic pause table (milliseconds).
export const PAUSE_MS = {
  comma: 180,
  colon: 300,
  semicolon: 300,
  sentence: 500,
  paragraph: 800,
} as const;

/** Engine-friendly unit cap (mirrors client MAX_CHUNK). */
export const MOUTH_MAX_UNIT_CHARS = 220;

/** Long sentences slow slightly for intelligibility. */
const LONG_UNIT_RATE_SCALE = 0.94;
const LONG_UNIT_WORD_COUNT = 24;

const PITCH_DELTA = {
  statementFinal: 0.9, // falling intonation
  questionFinal: 1.1, // rising intonation
  exclaimFinal: 1.05,
  neutral: 1.0,
} as const;

/** Map the owner's median pitch (Hz) to the engine pitch
 *  multiplier [0.5, 1.6]. Deterministic, honest mapping —
 *  sqrt-scale: 110 Hz → 1.00, 220 Hz → ~1.41, 80 Hz → ~0.85. */
export function profilePitchScale(pitchHz: number): number {
  if (!Number.isFinite(pitchHz) || pitchHz <= 0) return 1;
  const scale = Math.sqrt(pitchHz / 110);
  return Math.min(1.6, Math.max(0.5, scale));
}

/** Clamp the owner's rate hint into the engine-safe band. */
export function profileRateScale(rateHint: number): number {
  if (!Number.isFinite(rateHint) || rateHint <= 0) return 1;
  return Math.min(1.5, Math.max(0.6, rateHint));
}

/** Classify a chunk's final punctuation into intonation. */
function intonationFor(text: string): number {
  const t = text.trimEnd();
  if (t.endsWith("?")) return PITCH_DELTA.questionFinal;
  if (t.endsWith("!")) return PITCH_DELTA.exclaimFinal;
  if (t.endsWith(".") || t.endsWith("…")) return PITCH_DELTA.statementFinal;
  return PITCH_DELTA.neutral;
}

/** Pause after a chunk, determined by its trailing punctuation
 *  and the NEXT chunk's casing (paragraph breaks). */
function pauseAfter(text: string): number {
  const t = text.trimEnd();
  if (t.endsWith("\n") || t.endsWith("\n\n")) return PAUSE_MS.paragraph;
  if (/[.!?…]["')\]]?$/.test(t)) return PAUSE_MS.sentence;
  if (/[:;]["')\]]?$/.test(t)) return PAUSE_MS.semicolon;
  if (/[,—-]["')\]]?$/.test(t)) return PAUSE_MS.comma;
  return 0;
}

/**
 * Split into speakable units. Sentence-first segmentation —
 * prosody is per-sentence (falling statements, rising
 * questions), so sentences are ALWAYS separate units; then
 * commas; then word boundaries. NEVER mid-word.
 */
export function splitSpeakableUnits(
  text: string,
  max = MOUTH_MAX_UNIT_CHARS,
): string[] {
  const clean = text
    // eslint-disable-next-line no-control-regex -- stripping control chars from speech input is the point
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];

  // 1 — sentences (terminal punctuation kept with its sentence)
  const sentences =
    clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*/g) ??
    (clean.length > 0 ? [clean] : []);

  const units: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= max) {
      units.push(trimmed);
      continue;
    }
    // 2 — overlong sentence: split at commas/semicolons first
    const pieces = trimmed.match(/[^,;]+[,;]*\s*/g) ?? [trimmed];
    let buffer = "";
    for (const piece of pieces) {
      if (buffer && (buffer + " " + piece.trim()).length > max) {
        units.push(buffer.trim());
        buffer = piece.trim();
      } else {
        buffer = buffer ? `${buffer} ${piece.trim()}` : piece.trim();
      }
    }
    if (buffer.trim()) units.push(buffer.trim());
  }

  // 3 — any remaining overlong unit splits at WORD boundaries only
  const final: string[] = [];
  for (const unit of units) {
    if (unit.length <= max) {
      final.push(unit);
      continue;
    }
    let rest = unit;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut <= 0) cut = max; // pathological no-space text: hard cut
      final.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) final.push(rest);
  }
  return final.filter((u) => u.length > 0);
}

/**
 * Plan spoken output. REFUSES without consent (library level).
 * The plan is deterministic: same text + profile → same plan.
 */
export function planSpeech(
  text: string,
  consent: MouthConsent | null | undefined,
  profile: MouthVoiceProfile | null | undefined,
): SpeechPlanResult {
  if (!consent?.granted) {
    return { ok: false, code: "CONSENT_NOT_GRANTED" };
  }
  const chunks = splitSpeakableUnits(text ?? "");
  if (chunks.length === 0) {
    return { ok: false, code: "NOTHING_TO_SAY" };
  }
  const basePitch = profile?.pitchHz ? profilePitchScale(profile.pitchHz) : 1;
  const baseRate = profile?.rateHint ? profileRateScale(profile.rateHint) : 1;
  const units: SpeechUnit[] = [];
  let pauseBeforeMs = 0;
  for (const chunk of chunks) {
    const intonation = intonationFor(chunk);
    const words = chunk.split(/\s+/).length;
    const rateScale =
      words >= LONG_UNIT_WORD_COUNT
        ? baseRate * LONG_UNIT_RATE_SCALE
        : baseRate;
    units.push({
      text: chunk,
      pauseBeforeMs,
      pitchScale: Math.round(basePitch * intonation * 1000) / 1000,
      rateScale: Math.round(rateScale * 1000) / 1000,
    });
    pauseBeforeMs = pauseAfter(chunk);
  }
  return { ok: true, units, profileApplied: Boolean(profile?.pitchHz) };
}

// ---------------------------------------------------------
// Native PCM/WAV synthesis (real audio bytes, no provider)
// ---------------------------------------------------------
export interface ToneSpec {
  /** Frequency in Hz. */
  frequencyHz: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Peak amplitude 0..1. */
  amplitude: number;
  /** Linear fade at each edge, milliseconds. */
  fadeMs: number;
}

/** Deterministic sine tone with linear edge fades —
 *  click-free by construction, never clipping above the
 *  requested amplitude. */
export function synthesizeTonePcm(
  spec: ToneSpec,
  sampleRate = 22_050,
): Float32Array {
  const totalSamples = Math.max(
    1,
    Math.round((spec.durationMs / 1000) * sampleRate),
  );
  const fadeSamples = Math.max(
    0,
    Math.min(
      Math.floor((spec.fadeMs / 1000) * sampleRate),
      Math.floor(totalSamples / 2),
    ),
  );
  const amp =
    Number.isFinite(spec.amplitude) && spec.amplitude > 0
      ? Math.min(1, spec.amplitude)
      : 0.5;
  const out = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let envelope = 1;
    if (fadeSamples > 0) {
      if (i < fadeSamples) envelope = i / fadeSamples;
      else if (i >= totalSamples - fadeSamples)
        envelope = (totalSamples - 1 - i) / fadeSamples;
    }
    out[i] = Math.sin(2 * Math.PI * spec.frequencyHz * t) * amp * envelope;
  }
  return out;
}

/** Concatenate tone tracks — for multi-tone cues. */
export function concatPcm(tracks: Float32Array[]): Float32Array {
  const total = tracks.reduce((a, t) => a + t.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const t of tracks) {
    out.set(t, offset);
    offset += t.length;
  }
  return out;
}

/** Encode mono 16-bit PCM into a RIFF/WAVE container.
 *  Byte-exact: header sizes and little-endian samples are
 *  asserted in tests. */
export function encodeWavPcm16(
  pcm: Float32Array,
  sampleRate = 22_050,
): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    // clamp then quantize — honest 16-bit range, never clipped
    const clamped = Math.min(1, Math.max(-1, pcm[i]));
    view.setInt16(offset, Math.round(clamped * 32_767), true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------
// ARCHIE audio cues — named, deterministic, real bytes
// ---------------------------------------------------------
export type MouthCue = "listen" | "confirm" | "alert";

const CUE_TONES: Record<MouthCue, ToneSpec[]> = {
  // gentle two-note rising pair — "I'm listening"
  listen: [
    { frequencyHz: 523.25, durationMs: 120, amplitude: 0.4, fadeMs: 15 },
    { frequencyHz: 659.25, durationMs: 160, amplitude: 0.4, fadeMs: 20 },
  ],
  // crisp double-tap — "confirmed"
  confirm: [
    { frequencyHz: 880, durationMs: 90, amplitude: 0.5, fadeMs: 10 },
    { frequencyHz: 880, durationMs: 90, amplitude: 0.5, fadeMs: 10 },
  ],
  // urgent low-high — "attention"
  alert: [
    { frequencyHz: 349.23, durationMs: 140, amplitude: 0.55, fadeMs: 12 },
    { frequencyHz: 698.46, durationMs: 200, amplitude: 0.55, fadeMs: 16 },
  ],
};

/** Synthesize a named ARCHIE audio cue as a WAV file — real
 *  native audio, no provider, no network. */
export function synthesizeCueWav(
  cue: MouthCue,
  sampleRate = 22_050,
): Uint8Array {
  const tones = CUE_TONES[cue];
  const pcm = concatPcm(tones.map((t) => synthesizeTonePcm(t, sampleRate)));
  return encodeWavPcm16(pcm, sampleRate);
}

/** Honest capability report for the voice output core. */
export function mouthCapabilityReports(): Array<{
  id: string;
  description: string;
  maturity: "OPERATIONAL" | "DEVELOPING" | "NOT_IMPLEMENTED";
  measuredBy: string;
}> {
  return [
    {
      id: "voice-prosody-planning",
      description:
        "Deterministic prosody planning: punctuation → pauses, sentence type → intonation, owner voice-bank profile → engine pitch/rate shaping; consent-gated at the library level",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine mouth: mouth.test.ts (prosody planning cases)",
    },
    {
      id: "voice-audio-synthesis",
      description:
        "Native PCM/WAV synthesis: click-free sine tones with envelopes, byte-exact RIFF/WAVE encoding, named ARCHIE audio cues (listen/confirm/alert) — real audio bytes, provider-free",
      maturity: "OPERATIONAL",
      measuredBy: "native-engine mouth: mouth.test.ts (WAV byte-vector cases)",
    },
    {
      id: "speech-audio-synthesis",
      description:
        "Synthesis of full SPEECH audio (neural or formant TTS) — NOT implemented. The prosody plan drives the client's on-device speech engine; speech audio itself is never claimed",
      maturity: "NOT_IMPLEMENTED",
      measuredBy: "honest disclosure — no test claims this capability",
    },
  ];
}
