// =========================================================
// FRELUX PHASE 8c, ARCHIE VOICE (TEXT-TO-SPEECH)
//
// ARCHIE speaks ONLY when the user has explicitly granted the
// VOICE_OUTPUT capability (Consent → speak, never silent).
// Uses the browser's native speechSynthesis engine:
//   * no paid AI/cloud service, no API keys, no provider
//   * Android/browser security model complemented, never bypassed
//   * nothing is recorded, uploaded or transcribed, this is
//     OUTPUT only (VOICE_INPUT is the separate, consented input)
// The module refuses to speak without consent at the LIBRARY
// level, so no caller can bypass the consent gate.
// =========================================================

import type { ArchieConsent } from "./types";
import { loadProfileLocally } from "./voice-profile";
import { planSpeech } from "@studio-shared/archie-ai/native-engine/mouth.ts";

const MAX_CHUNK = 220;

/** Platform support check (safe outside the browser). */
export function archieVoiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.speechSynthesis.speak === "function"
  );
}

/**
 * Strip what should never be spoken: emoji, markdown syntax,
 * control characters and collapsing whitespace. Deterministic.
 */
export function speakableText(text: string): string {
  return (
    text
      .replace(
        // eslint-disable-next-line no-misleading-character-class -- \u{FE0F} is a standalone variation selector stripped on purpose
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu,
        " ",
      )
      .replace(/[*_`#>|~]/g, " ")
      .replace(/https?:\/\/\S+/g, "a link")
      // eslint-disable-next-line no-control-regex -- stripping control chars from TTS input is the point
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Split into engine-friendly chunks (some engines cut long text). */
export function chunkForSpeech(text: string, max = MAX_CHUNK): string[] {
  const clean = speakableText(text);
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    // Prefer breaking at sentence, then word boundary, never mid-word.
    let cut = rest.lastIndexOf(". ", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export interface VoiceResult {
  ok: boolean;
  error?: string;
  chunks: number;
}

/** Pause timers for in-flight speech — cleared on silence so a
 *  cancelled reply never utters a later unit. */
let pauseTimers: ReturnType<typeof setTimeout>[] = [];

function clearPendingPauses(): void {
  for (const t of pauseTimers) clearTimeout(t);
  pauseTimers = [];
}

/**
 * Speak text as ARCHIE. Requires the VOICE_OUTPUT consent to be
 * granted, checked here, not only by callers. The reply is
 * planned by the NATIVE prosody engine (mouth.ts): sentences
 * become units with real pauses, intonation, and the owner's
 * voice-bank profile shaping — provider-free, deterministic.
 */
export function speakArchie(
  text: string,
  consent: ArchieConsent | undefined | null,
): VoiceResult {
  if (!consent?.granted) {
    return {
      ok: false,
      error:
        "Voice output is switched off. Enable it in Capabilities to let ARCHIE speak.",
      chunks: 0,
    };
  }
  if (!archieVoiceSupported()) {
    return { ok: false, error: "This device has no speech engine.", chunks: 0 };
  }
  const clean = speakableText(text);
  if (!clean) return { ok: true, chunks: 0 };
  // The owner's saved voice profile (Admin → ARCHIE's voice bank)
  // shapes pitch + rate through the native prosody plan.
  const ownerProfile = loadProfileLocally();
  const plan = planSpeech(clean, { granted: true }, ownerProfile);
  if (!plan.ok || plan.units.length === 0) return { ok: true, chunks: 0 };

  clearPendingPauses();
  plan.units.forEach((unit, index) => {
    const speakUnit = () => {
      const u = new SpeechSynthesisUtterance(unit.text);
      // engine-safe clamps (speechSynthesis pitch/rate bands)
      u.pitch = Math.min(2, Math.max(0, unit.pitchScale));
      u.rate = Math.min(2, Math.max(0.1, unit.rateScale));
      window.speechSynthesis.speak(u);
    };
    if (index === 0 || unit.pauseBeforeMs <= 0) {
      speakUnit();
    } else {
      pauseTimers.push(setTimeout(speakUnit, unit.pauseBeforeMs));
    }
  });
  return { ok: true, chunks: plan.units.length };
}

/** Immediately silence ARCHIE (e.g. user starts typing a new message). */
export function stopArchieVoice(): void {
  clearPendingPauses();
  if (archieVoiceSupported()) window.speechSynthesis.cancel();
}

/** FIX 53 (batch 17, Level 13 audit 2026-09-15): is ARCHIE's
 *  speech genuinely playing right now? True only while the
 *  browser synthesis engine is speaking/pending OR prosody
 *  pause timers still hold queued units — the two real
 *  "speech is live" states. Voice sessions use this to fire
 *  INTERRUPTED only on a REAL barge-in, never a stale flag
 *  from a reply that already finished playing. */
export function archieVoicePlaying(): boolean {
  if (typeof window === "undefined" || !archieVoiceSupported()) return false;
  return (
    window.speechSynthesis.speaking ||
    window.speechSynthesis.pending ||
    pauseTimers.length > 0
  );
}
