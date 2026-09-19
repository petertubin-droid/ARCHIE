// =========================================================
// FRELUX PHASE 8d, ARCHIE VOICE BANK (owner's own voice)
//
// The owner records voice samples in the Admin panel. ARCHIE
// derives a deterministic pitch/pace profile from the samples
// (pure math, autocorrelation + energy nuclei, NO cloud AI,
// NO paid service, nothing uploaded to any provider) and
// applies it to every speechSynthesis reply, so ARCHIE speaks
// with the closest possible match to the owner's voice.
//
// Samples themselves are saved as encrypted-at-rest owner-only
// records (private bucket + RLS table), the voice bank.
// =========================================================

import { supabase } from "@/lib/supabase";

export const VOICE_SAMPLE_BUCKET = "archie-voice-samples";

export interface ArchieVoiceProfile {
  /** Median voiced pitch of the samples (Hz). */
  pitchHz: number;
  /** Speech-rate multiplier (1.0 = engine default). */
  rateHint: number;
  sampleCount: number;
  /** ISO date the profile was last recalculated. */
  computedAt: string;
}

// ---------------------------------------------------------
// Deterministic analysis (pure functions, testable)
// ---------------------------------------------------------

/** Mono mixdown of an AudioBuffer as Float32Array. */
export function mixdown(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i] / buffer.numberOfChannels;
  }
  return out;
}

/**
 * Estimate the fundamental frequency of one frame via
 * normalized autocorrelation. Returns 0 for unvoiced frames.
 */
export function framePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 400); // 400 Hz ceiling
  const maxLag = Math.floor(sampleRate / 60); // 60 Hz floor
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy < 1e-4 * frame.length) return 0; // silence, skip
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag && lag < frame.length; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      corr += frame[i] * frame[i + lag];
      norm += frame[i + lag] * frame[i + lag];
    }
    const normalized = corr / (Math.sqrt(energy * norm) || 1);
    if (normalized > bestCorr) {
      bestCorr = normalized;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorr < 0.35) return 0; // not periodic → unvoiced
  return sampleRate / bestLag;
}

/**
 * Median voiced pitch (Hz) of a full recording.
 * Deterministic: frame size 2048, hop 1024.
 */
export function estimatePitchHz(pcm: Float32Array, sampleRate: number): number {
  const FRAME = 2048;
  const HOP = 1024;
  const pitches: number[] = [];
  for (let i = 0; i + FRAME <= pcm.length; i += HOP) {
    const p = framePitch(pcm.subarray(i, i + FRAME), sampleRate);
    if (p > 0) pitches.push(p);
  }
  if (pitches.length === 0) return 0;
  pitches.sort((a, b) => a - b);
  return pitches[Math.floor(pitches.length / 2)];
}

/**
 * Speech-rate estimate: syllable-ish nuclei = peaks in a
 * 20 ms-smoothed energy envelope. rateHint = nuclei per second
 * / 4.0 (≈4 syllables/sec at engine default), clamped 0.7–1.4.
 */
export function estimateRateHint(
  pcm: Float32Array,
  sampleRate: number,
): number {
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const env: number[] = [];
  let acc = 0;
  for (let i = 0; i < pcm.length; i++) {
    acc += pcm[i] * pcm[i];
    if (i >= win) acc -= pcm[i - win] * pcm[i - win];
    if (i % win === win - 1) env.push(acc / win);
  }
  if (env.length < 3) return 1;
  let peaks = 0;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > 0.01) peaks++;
  }
  const seconds = pcm.length / sampleRate;
  const perSec = peaks / (seconds || 1);
  return Math.min(1.4, Math.max(0.7, perSec / 4));
}

/** Derive the profile from sample analyses. */
export function profileFromAnalyses(
  analyses: { pitchHz: number; rateHint: number }[],
): ArchieVoiceProfile | null {
  const voiced = analyses.filter((a) => a.pitchHz > 0);
  if (voiced.length === 0) return null;
  const sorted = [...voiced].sort((a, b) => a.pitchHz - b.pitchHz);
  const pitchHz = sorted[Math.floor(sorted.length / 2)].pitchHz;
  const rateHint =
    analyses.reduce((s, a) => s + (a.rateHint || 1), 0) / analyses.length;
  return {
    pitchHz: Math.round(pitchHz * 10) / 10,
    rateHint: Math.round(Math.min(1.4, Math.max(0.7, rateHint)) * 100) / 100,
    sampleCount: analyses.length,
    computedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------
// Applying the profile to ARCHIE's speech
// ---------------------------------------------------------

const PROFILE_KEY = "frelux.archie.voice-profile";
const REFERENCE_PITCH = 165; // ~typical default TTS voice (Hz)

/** Apply an owner profile to a TTS utterance. */
export function applyProfileToUtterance(
  utterance: SpeechSynthesisUtterance,
  profile: ArchieVoiceProfile | null | undefined,
): void {
  if (!profile) return;
  if (profile.pitchHz > 0) {
    const ratio = profile.pitchHz / REFERENCE_PITCH;
    utterance.pitch = Math.min(2, Math.max(0.5, ratio));
  }
  if (profile.rateHint) {
    utterance.rate = Math.min(2, Math.max(0.5, profile.rateHint));
  }
}

export function storeProfileLocally(profile: ArchieVoiceProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable, profile still lives in the DB */
  }
}

export function loadProfileLocally(): ArchieVoiceProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ArchieVoiceProfile;
    return p && p.pitchHz > 0 ? p : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------
// Voice bank persistence (owner-only, RLS enforced server-side)
// ---------------------------------------------------------

export interface VoiceSample {
  id: string;
  storage_path: string;
  mime_type: string;
  pitch_hz: number | null;
  rate_hint: number | null;
  duration_sec: number | null;
  is_active: boolean;
  created_date: string;
}

/** Upload a recorded sample (ciphertext at rest via bucket privacy) + row. */
export async function saveVoiceSample(
  userId: string,
  blob: Blob,
  analysis: { pitchHz: number; rateHint: number; durationSec: number },
): Promise<VoiceSample> {
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const path = `${userId}/sample-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(VOICE_SAMPLE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data, error } = await supabase
    .from("frelux_archie_voice_samples")
    .insert({
      user_id: userId,
      storage_path: path,
      mime_type: blob.type || "audio/webm",
      pitch_hz: analysis.pitchHz,
      rate_hint: analysis.rateHint,
      duration_sec: analysis.durationSec,
    })
    .select()
    .single();
  if (error) throw new Error(`Save failed: ${error.message}`);
  return data as VoiceSample;
}

export async function listVoiceSamples(userId: string): Promise<VoiceSample[]> {
  const { data, error } = await supabase
    .from("frelux_archie_voice_samples")
    .select("*")
    .eq("user_id", userId)
    .order("created_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VoiceSample[];
}

/** Signed URL for playback, private bucket, owner-only. */
export async function createSamplePlayUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(VOICE_SAMPLE_BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? "No signed URL");
  return data.signedUrl;
}

export async function deleteVoiceSample(
  userId: string,
  sample: VoiceSample,
): Promise<void> {
  await supabase.storage
    .from(VOICE_SAMPLE_BUCKET)
    .remove([sample.storage_path]);
  const { error } = await supabase
    .from("frelux_archie_voice_samples")
    .delete()
    .eq("id", sample.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Recompute + persist the active profile from the whole bank. */
export async function recomputeProfile(
  userId: string,
): Promise<ArchieVoiceProfile | null> {
  const samples = await listVoiceSamples(userId);
  const analyses = samples
    .filter((s) => s.is_active)
    .map((s) => ({
      pitchHz: Number(s.pitch_hz) || 0,
      rateHint: Number(s.rate_hint) || 1,
    }));
  const profile = profileFromAnalyses(analyses);
  if (profile) storeProfileLocally(profile);
  return profile;
}
