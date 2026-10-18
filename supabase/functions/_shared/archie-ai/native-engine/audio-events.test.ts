// =========================================================
// ARCHIE AUDIO-EVENT ENGINE (roadmap 10, audit B-2) — TESTS
// Synthetic deterministic PCM: harmonic "speech" bursts, pure
// tones, seeded noise, silence. No external fixtures.
// =========================================================

import { describe, expect, it } from "vitest";
import { analyzeAudioEvents } from "./audio-events.ts";
import { extractVoiceprint } from "./voiceprint.ts";

const SR = 16000;

/** Seeded PRNG — deterministic noise. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  };
}

/** Harmonic vowel-like "speech": f0 + decaying harmonics with
 *  vibrato and an amplitude envelope — enough pitch and
 *  spectral structure for the feature extractors. */
function synthSpeech(f0: number, durSec: number): Float32Array {
  const n = Math.floor(durSec * SR);
  const out = new Float32Array(n);
  const rand = prng(f0);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    // vibrato +-3%
    const f = f0 * (1 + 0.03 * Math.sin(2 * Math.PI * 5 * tt));
    let v = 0;
    for (let h = 1; h <= 8; h++)
      v += (1 / (h * h)) * Math.sin(2 * Math.PI * f * h * tt);
    // envelope (attack/decay) + slight noise
    const env = Math.min(1, i / (SR * 0.01), (n - i) / (SR * 0.02));
    out[i] = 0.5 * env * v + 0.01 * env * rand();
  }
  return out;
}

function synthTone(freq: number, durSec: number): Float32Array {
  const n = Math.floor(durSec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const env = Math.min(1, i / (SR * 0.005), (n - i) / (SR * 0.005));
    out[i] = 0.6 * env * Math.sin(2 * Math.PI * freq * tt);
  }
  return out;
}

function synthNoise(durSec: number, seed: number): Float32Array {
  const rand = prng(seed);
  const n = Math.floor(durSec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.4 * rand();
  return out;
}

function silence(durSec: number): Float32Array {
  return new Float32Array(Math.floor(durSec * SR));
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("audio-events — VAD + ambient", () => {
  it("speech burst bounded by silence", () => {
    const pcm = concat(silence(0.5), synthSpeech(150, 1), silence(0.5));
    const r = analyzeAudioEvents(pcm, SR);
    expect(r.ok).toBe(true);
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toContain("speech");
    expect(kinds).toContain("silence");
    const speech = r.segments.find((s) => s.kind === "speech")!;
    expect(speech.speaker).toBe("S1");
    // speech roughly where injected (0.5s..1.5s)
    expect(speech.startSec).toBeGreaterThan(0.3);
    expect(speech.endSec).toBeLessThan(1.8);
  });

  it("a pure tone is classified tone, never a speaker", () => {
    const pcm = concat(silence(0.3), synthTone(440, 0.8), silence(0.3));
    const r = analyzeAudioEvents(pcm, SR);
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toContain("tone");
    expect(kinds).not.toContain("speech");
    const tone = r.segments.find((s) => s.kind === "tone")!;
    expect(tone.confidence).toBeGreaterThan(0.8);
  });

  it("broadband noise is classified noise, never a speaker", () => {
    const pcm = concat(silence(0.3), synthNoise(0.8, 77), silence(0.3));
    const r = analyzeAudioEvents(pcm, SR);
    const kinds = r.segments.map((s) => s.kind);
    expect(kinds).toContain("noise");
    expect(kinds).not.toContain("speech");
  });

  it("pure silence refused honestly", () => {
    const r = analyzeAudioEvents(silence(2), SR);
    expect(r.ok).toBe(false);
    expect(r.note).toContain("no speech-like activity");
  });

  it("too-short audio refused", () => {
    const r = analyzeAudioEvents(synthSpeech(150, 0.2), SR);
    expect(r.ok).toBe(false);
    expect(r.note).toContain("too short");
  });
});

describe("audio-events — bounded diarization", () => {
  it("two alternating speakers → two clusters, alternating labels", () => {
    const pcm = concat(
      silence(0.2),
      synthSpeech(120, 0.6), // speaker A (low pitch)
      silence(0.25),
      synthSpeech(220, 0.6), // speaker B
      silence(0.25),
      synthSpeech(120, 0.6),
      silence(0.25),
      synthSpeech(220, 0.6),
      silence(0.2),
    );
    const r = analyzeAudioEvents(pcm, SR);
    expect(r.ok).toBe(true);
    const speech = r.segments.filter((s) => s.kind === "speech");
    expect(speech.length).toBe(4);
    const labels = speech.map((s) => s.speaker);
    expect(new Set(labels).size).toBe(2);
    // alternation: A B A B (labels may be S1/S2 in any order)
    expect(labels[0]).toBe(labels[2]);
    expect(labels[1]).toBe(labels[3]);
    expect(labels[0]).not.toBe(labels[1]);
    expect(r.summary).toContain("2 speaker");
  });

  it("one continuous speaker → one cluster", () => {
    const pcm = concat(silence(0.2), synthSpeech(180, 2), silence(0.2));
    const r = analyzeAudioEvents(pcm, SR);
    const speech = r.segments.filter((s) => s.kind === "speech");
    expect(new Set(speech.map((s) => s.speaker)).size).toBe(1);
  });

  it("enrolled voiceprints identify the clusters", () => {
    // enroll from clean samples of each synthetic speaker
    const a = extractVoiceprint(synthSpeech(120, 1.5), SR);
    const b = extractVoiceprint(synthSpeech(220, 1.5), SR);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const pcm = concat(
      silence(0.2),
      synthSpeech(120, 0.7),
      silence(0.25),
      synthSpeech(220, 0.7),
      silence(0.2),
    );
    const r = analyzeAudioEvents(pcm, SR, {
      enrolled: [
        { name: "felix", vector: a.vector },
        { name: "partner", vector: b.vector },
      ],
    });
    expect(r.ok).toBe(true);
    const speech = r.segments.filter((s) => s.kind === "speech");
    const first = speech[0].speaker;
    const second = speech[1].speaker;
    expect([first, second]).toEqual(["felix", "partner"]);
    expect(r.summary).toContain("felix identified");
  });
});

describe("audio-events — determinism", () => {
  it("same input → identical result", () => {
    const pcm = concat(silence(0.2), synthSpeech(140, 0.6), silence(0.2), synthTone(600, 0.4));
    const a = analyzeAudioEvents(pcm, SR);
    const b = analyzeAudioEvents(pcm.slice(), SR);
    expect(a).toEqual(b);
  });
});
