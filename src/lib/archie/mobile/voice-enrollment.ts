// =========================================================
// ARCHIE VOICE INTELLIGENCE — OWNER VOICE ENROLLMENT (CLIENT)
// src/lib/archie/mobile/voice-enrollment.ts
//
// Deliberate owner voice enrollment for speaker recognition:
//
//   * The owner records samples EXPLICITLY in the enrollment
//     UI — nothing here ever auto-enrolls from chat audio.
//   * The voiceprint vector is extracted ON-DEVICE (real DSP
//     in native-engine/voiceprint.ts) — raw recordings are
//     NEVER uploaded; only the derived vector transits.
//   * The server (archie-voice-enroll) is the only writer of
//     the enrolled profile; RLS + owner gate protect it.
//   * Voice ≠ authority: the enrolled profile personalizes
//     interaction. Protected operations always require the
//     existing owner-authorization workflow.
// =========================================================

import { getSupabase } from "@/lib/supabase-lazy";
import { startListening, type EarsRecording } from "@/lib/archie/ears";
import {
  extractVoiceprint,
  type VoiceprintVector,
} from "@studio-shared/archie-ai/native-engine/voiceprint";

/** Minimum enrollment sample length (seconds of real audio). */
export const ENROLL_MIN_DURATION_SEC = 3;
/** Hard cap per enrollment sample. */
export const ENROLL_MAX_DURATION_MS = 15_000;

export interface EnrollmentStatus {
  enrollment_state: "NONE" | "ENROLLING" | "COMPLETE" | "DISABLED";
  sample_count: number;
  required_samples: number;
  threshold: number;
  security_label: string;
}

export interface SpeakerSignal {
  determinable: boolean;
  match: boolean;
  score: number;
  security_label: string;
}

type EnrollResponse = {
  ok: boolean;
  code?: string;
  error?: string;
  enrollment_state?: EnrollmentStatus["enrollment_state"];
  sample_count?: number;
  required_samples?: number;
  threshold?: number;
  security_label?: string;
  speaker?: SpeakerSignal;
};

async function callEnroll(
  payload: Record<string, unknown>,
): Promise<EnrollResponse> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke(
    "archie-voice-enroll",
    { body: payload },
  );
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "no response" }) as EnrollResponse;
}

/** Decode a recorded blob to mono PCM on-device (no upload). */
async function blobToPcm(
  blob: Blob,
): Promise<{ pcm: Float32Array; sampleRate: number } | null> {
  if (typeof window === "undefined" || typeof AudioContext !== "function") {
    return null;
  }
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const n = audio.length;
    const pcm = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < n; i++) pcm[i] += ch[i] / audio.numberOfChannels;
    }
    return { pcm, sampleRate: audio.sampleRate };
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/**
 * Record ONE deliberate enrollment sample and extract its
 * voiceprint vector ON-DEVICE. Raw audio never leaves the
 * device — only the derived vector is sent (enrollSample).
 */
export async function recordEnrollmentSample(): Promise<
  | { ok: true; vector: VoiceprintVector; durationSec: number }
  | { ok: false; error: string }
> {
  let recording: EarsRecording;
  try {
    const recorder = await startListening({
      maxDurationMs: ENROLL_MAX_DURATION_MS,
    });
    recording = await recorder.stop(); // waits for owner tap/cap
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Recording the enrollment sample failed.",
    };
  }
  if (recording.durationSec < ENROLL_MIN_DURATION_SEC) {
    return {
      ok: false,
      error: `That sample was too short (${recording.durationSec}s) — speak for at least ${ENROLL_MIN_DURATION_SEC} seconds.`,
    };
  }
  const decoded = await blobToPcm(recording.blob);
  if (!decoded) {
    return {
      ok: false,
      error: "The sample could not be analyzed on this device.",
    };
  }
  const extraction = extractVoiceprint(decoded.pcm, decoded.sampleRate);
  if (!extraction.ok) {
    return {
      ok: false,
      error:
        extraction.code === "SILENCE"
          ? "No clear speech was detected in that sample — nothing was enrolled."
          : "That sample was too short to analyze.",
    };
  }
  return {
    ok: true,
    vector: extraction.vector,
    durationSec: recording.durationSec,
  };
}

/** Send one deliberate sample to the enrollment server. */
export async function enrollSample(
  vector: VoiceprintVector,
): Promise<
  | { ok: true; sample_count: number; required_samples: number }
  | { ok: false; error: string }
> {
  const res = await callEnroll({ action: "enroll-sample", vector });
  if (!res.ok) return { ok: false, error: res.error ?? "Enrollment refused." };
  return {
    ok: true,
    sample_count: res.sample_count ?? 0,
    required_samples: res.required_samples ?? 3,
  };
}

/** Combine the recorded samples into the owner profile. */
export async function finalizeEnrollment(): Promise<
  | { ok: true; sample_count: number; threshold: number }
  | { ok: false; error: string }
> {
  const res = await callEnroll({ action: "finalize" });
  if (!res.ok)
    return { ok: false, error: res.error ?? "Finalization refused." };
  return {
    ok: true,
    sample_count: res.sample_count ?? 0,
    threshold: res.threshold ?? 0.72,
  };
}

/** Current enrollment status (no vector data ever returned). */
export async function fetchEnrollmentStatus(): Promise<EnrollmentStatus | null> {
  const res = await callEnroll({ action: "status" });
  if (!res.ok) return null;
  return {
    enrollment_state: (res.enrollment_state ??
      "NONE") as EnrollmentStatus["enrollment_state"],
    sample_count: res.sample_count ?? 0,
    required_samples: res.required_samples ?? 3,
    threshold: res.threshold ?? 0.72,
    security_label: res.security_label ?? "",
  };
}

/** Server-side speaker check for a chat utterance vector. */
export async function verifySpeakerSignal(
  vector: VoiceprintVector,
): Promise<SpeakerSignal | null> {
  const res = await callEnroll({ action: "verify", vector });
  if (!res.ok || !res.speaker) return null;
  return res.speaker;
}

export async function disableEnrollment(): Promise<boolean> {
  const res = await callEnroll({ action: "disable" });
  return res.ok;
}

export async function resetEnrollment(): Promise<boolean> {
  const res = await callEnroll({ action: "re-enroll" });
  return res.ok;
}

export async function deleteEnrollment(): Promise<boolean> {
  const res = await callEnroll({ action: "delete" });
  return res.ok;
}
