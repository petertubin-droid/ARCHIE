// =========================================================
// ARCHIE NATIVE ENGINE — EARS (SPEECH PERCEPTION CORE)
// supabase/functions/_shared/archie-ai/native-engine/ears.ts
//
// The REAL core of ARCHIE's ears subsystem — 100% native,
// provider-free (OpenAI Separation Rule, owner-directed
// 2026-09-10):
//
//   * Speech is understood through NATIVE on-device speech
//     recognition (the browser/OS recognition engine, no
//     cloud provider, no API key, no OpenAI).
//   * ARCHIE's voice machinery runs on the OWNER'S VOICE
//     BANK (frelux_archie_voice_samples): deterministic
//     pitch/pace math on the owner's own recorded samples —
//     never a paid AI service.
//   * The archie-ears edge function is the owner-gated,
//     rate-limited, audited intake for native transcripts —
//     it performs NO transcription and holds NO provider key.
//
// Honesty rules (spec §§3, 16, 19):
//   * An empty result is reported as speech_detected:false —
//     the transcript is then exactly "". Never invented.
//   * The voice-print check is honestly labeled: a lightweight
//     deterministic pitch comparison against the owner's voice
//     bank profile — real math, not a forensic biometric claim.
//
// Node/Deno compatible: pure functions, no runtime APIs at
// import time (so the anatomy health runner can load it in
// any JavaScript environment and prove the binding is real).
// =========================================================

/** Transcript hard cap — one spoken utterance, nothing more. */
export const EARS_MAX_TRANSCRIPT_CHARS = 2000;

/** Voice-print tolerance: the utterance's median voiced pitch
 *  must fall within ±30% of the voice-bank profile pitch to
 *  count as a match. Deliberately generous — it is a
 *  lightweight owner-voice check, not a forensic gate. */
export const VOICE_PRINT_TOLERANCE = 0.3;

export type TranscriptNormalization =
  | { ok: true; transcript: string; speechDetected: boolean }
  | { ok: false; code: "EMPTY_TRANSCRIPT" | "TRANSCRIPT_TOO_LONG" };

/** Normalize a raw native-recognition transcript: trim, strip
 *  control characters, collapse whitespace, cap length.
 *  An empty result stays empty — reported honestly as
 *  speech_detected:false, never invented. */
export function normalizeTranscript(raw: unknown): TranscriptNormalization {
  if (typeof raw !== "string") {
    return { ok: false, code: "EMPTY_TRANSCRIPT" };
  }
  const cleaned = raw
    // strip control characters (except common whitespace)
    // eslint-disable-next-line no-control-regex -- deliberate: sanitizing raw provider-free transcript bytes
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    // collapse runs of whitespace into single spaces
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EARS_MAX_TRANSCRIPT_CHARS);
  if (!cleaned) {
    return { ok: false, code: "EMPTY_TRANSCRIPT" };
  }
  if (
    cleaned.length >= EARS_MAX_TRANSCRIPT_CHARS &&
    raw.length > EARS_MAX_TRANSCRIPT_CHARS
  ) {
    return { ok: false, code: "TRANSCRIPT_TOO_LONG" };
  }
  return { ok: true, transcript: cleaned, speechDetected: true };
}

/** Optional ISO 639-1 (-variant) language hint from the live
 *  ARCHIE language registry. Anything malformed is dropped. */
export function sanitizeLanguageHint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return /^[a-z]{2}(-[A-Za-z0-9-]{2,8})?$/.test(v) ? v : null;
}

export interface VoicePrint {
  /** Median voiced pitch of the utterance (Hz), or null when
   *  no voiced audio was captured. */
  utterancePitchHz: number | null;
  /** The owner's voice-bank profile pitch (Hz), or null when
   *  no voice bank profile exists yet. */
  bankPitchHz: number | null;
  /** True when the utterance pitch falls within tolerance of
   *  the voice-bank profile. Null when either side is missing
   *  — an honest "could not verify", never a guess. */
  match: boolean | null;
}

/**
 * Deterministic voice-print comparison: is this utterance's
 * pitch consistent with the owner's voice bank profile? Pure
 * math on the owner's own data — no cloud AI, no provider.
 */
export function voicePrintMatch(
  utterancePitchHz: number | null,
  bankPitchHz: number | null,
): VoicePrint {
  if (utterancePitchHz == null || bankPitchHz == null || bankPitchHz <= 0) {
    return { utterancePitchHz, bankPitchHz, match: null };
  }
  const ratio = Math.abs(utterancePitchHz - bankPitchHz) / bankPitchHz;
  return {
    utterancePitchHz,
    bankPitchHz,
    match: ratio <= VOICE_PRINT_TOLERANCE,
  };
}

export interface EarsIntake {
  ok: boolean;
  transcript?: string;
  speechDetected: boolean;
  languageHint?: string | null;
  durationSec?: number | null;
  voicePrint?: VoicePrint | null;
  code?: string;
}

/** Validate the full native-transcription intake payload for
 *  the archie-ears audit function. Every failure is typed. */
export function validateEarsIntake(body: unknown): EarsIntake {
  if (typeof body !== "object" || body === null) {
    return { ok: false, speechDetected: false, code: "BAD_REQUEST" };
  }
  const b = body as Record<string, unknown>;

  const norm = normalizeTranscript(b.transcript);
  // An empty native result is INTAKE-VALID but honestly
  // speech_detected:false — the audit records it as such.
  const speechDetected = norm.ok === true;

  if (
    b.transcript !== undefined &&
    !norm.ok &&
    norm.code === "TRANSCRIPT_TOO_LONG"
  ) {
    return { ok: false, speechDetected: false, code: "TRANSCRIPT_TOO_LONG" };
  }

  const durationSec =
    typeof b.duration_sec === "number" &&
    b.duration_sec >= 0 &&
    b.duration_sec <= 120
      ? b.duration_sec
      : null;

  // The audited intake row stores the voice print with snake_case
  // keys — normalize into the camelCase VoicePrint math honestly.
  const vp = b.voice_print as {
    utterance_pitch_hz?: number | null;
    bank_pitch_hz?: number | null;
  } | null;
  const voicePrint: VoicePrint | null =
    vp && typeof vp === "object"
      ? voicePrintMatch(
          typeof vp.utterance_pitch_hz === "number"
            ? vp.utterance_pitch_hz
            : null,
          typeof vp.bank_pitch_hz === "number" ? vp.bank_pitch_hz : null,
        )
      : null;

  return {
    ok: true,
    transcript: norm.ok ? norm.transcript : "",
    speechDetected,
    languageHint: sanitizeLanguageHint(b.language_hint),
    durationSec,
    voicePrint,
  };
}
