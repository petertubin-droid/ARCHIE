import { describe, it, expect, beforeEach, afterEach } from "vitest";
// jsdom has no speech synthesis, stub the utterance class.
class FakeUtterance {
  text: string;
  pitch = 1;
  rate = 1;
  constructor(t: string) {
    this.text = t;
  }
}
(globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance =
  FakeUtterance;

import {
  mixdown,
  framePitch,
  estimatePitchHz,
  estimateRateHint,
  profileFromAnalyses,
  applyProfileToUtterance,
  storeProfileLocally,
  loadProfileLocally,
} from "../voice-profile";

/** Sine wave generator, deterministic, no fixtures needed. */
function sine(freq: number, seconds: number, rate = 48000): Float32Array {
  const n = Math.floor(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] = Math.sin((2 * Math.PI * freq * i) / rate) * 0.5;
  return out;
}

const audioBufferLike = (pcm: Float32Array) =>
  ({
    length: pcm.length,
    numberOfChannels: 1,
    getChannelData: () => pcm,
  }) as unknown as AudioBuffer;

describe("voice profile analysis (deterministic)", () => {
  it("mixdown averages channels", () => {
    const left = Float32Array.from([0.5, 0.25]);
    const right = Float32Array.from([0.25, 0.25]);
    const stereo = {
      length: 2,
      numberOfChannels: 2,
      getChannelData: (c: number) => (c === 0 ? left : right),
    } as unknown as AudioBuffer;
    const mono = mixdown(stereo);
    expect(mono.length).toBe(2);
    expect(mono[0]).toBeCloseTo(0.375, 5);
  });

  it("framePitch detects a 120 Hz tone", () => {
    const rate = 48000;
    const frame = sine(120, 2048 / rate, rate);
    expect(framePitch(frame, rate)).toBeGreaterThan(110);
    expect(framePitch(frame, rate)).toBeLessThan(130);
  });

  it("framePitch returns 0 for silence", () => {
    expect(framePitch(new Float32Array(2048), 48000)).toBe(0);
  });

  it("estimatePitchHz medians voiced frames across a recording", () => {
    const rate = 48000;
    const voiced = sine(110, 1, rate); // ~1 s of 110 Hz
    expect(estimatePitchHz(voiced, rate)).toBeGreaterThan(100);
    expect(estimatePitchHz(voiced, rate)).toBeLessThan(120);
    expect(estimatePitchHz(new Float32Array(rate), rate)).toBe(0); // silence
  });

  it("estimateRateHint clamps into 0.7–1.4", () => {
    const rate = 48000;
    expect(estimateRateHint(sine(110, 1, rate), rate)).toBeGreaterThanOrEqual(
      0.7,
    );
    expect(estimateRateHint(sine(110, 1, rate), rate)).toBeLessThanOrEqual(1.4);
    expect(estimateRateHint(new Float32Array(0), rate)).toBe(1);
  });

  it("profileFromAnalyses takes the median pitch and mean rate", () => {
    const p = profileFromAnalyses([
      { pitchHz: 100, rateHint: 1.1 },
      { pitchHz: 120, rateHint: 0.9 },
      { pitchHz: 110, rateHint: 1.0 },
    ]);
    expect(p).not.toBeNull();
    expect(p!.pitchHz).toBe(110);
    expect(p!.rateHint).toBeCloseTo(1, 2);
    expect(p!.sampleCount).toBe(3);
    expect(p!.computedAt).toBeTruthy();
  });

  it("profileFromAnalyses refuses a bank with no voiced samples", () => {
    expect(profileFromAnalyses([{ pitchHz: 0, rateHint: 1 }])).toBeNull();
  });

  it("applyProfileToUtterance maps pitch ratio and clamps", () => {
    const u = new SpeechSynthesisUtterance("x");
    applyProfileToUtterance(u, {
      pitchHz: 165,
      rateHint: 1.2,
      sampleCount: 1,
      computedAt: "",
    });
    expect(u.pitch).toBeCloseTo(1, 5); // 165 Hz == reference
    expect(u.rate).toBeCloseTo(1.2, 5);
    applyProfileToUtterance(u, {
      pitchHz: 500,
      rateHint: 9,
      sampleCount: 1,
      computedAt: "",
    });
    expect(u.pitch).toBeLessThanOrEqual(2);
    expect(u.rate).toBeLessThanOrEqual(2);
    const plain = new SpeechSynthesisUtterance("y");
    applyProfileToUtterance(plain, null);
    expect(plain.pitch).toBe(1);
  });
});

describe("voice profile storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("round-trips the profile locally", () => {
    expect(loadProfileLocally()).toBeNull();
    storeProfileLocally({
      pitchHz: 132,
      rateHint: 0.95,
      sampleCount: 2,
      computedAt: "t",
    });
    const p = loadProfileLocally();
    expect(p?.pitchHz).toBe(132);
    expect(p?.rateHint).toBe(0.95);
  });

  it("rejects corrupted stored profiles", () => {
    localStorage.setItem("frelux.archie.voice-profile", "{not json");
    expect(loadProfileLocally()).toBeNull();
    localStorage.setItem(
      "frelux.archie.voice-profile",
      JSON.stringify({ pitchHz: 0 }),
    );
    expect(loadProfileLocally()).toBeNull();
  });
});

// mixdown used above with audioBufferLike smoke check
describe("mixdown", () => {
  it("handles mono buffers unchanged", () => {
    const mono = audioBufferLike(Float32Array.from([0.25, -0.25]));
    const out = mixdown(mono);
    expect(out[0]).toBeCloseTo(0.25, 6);
    expect(out[1]).toBeCloseTo(-0.25, 6);
  });
});
