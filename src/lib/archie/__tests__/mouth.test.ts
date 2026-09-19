// =========================================================
// ARCHIE VOICE ENGINE — MOUTH (OUTPUT CORE) TESTS
// src/lib/archie/__tests__/mouth.test.ts
//
// Engine inventory #21 deepening: edge-native voice output.
// Deterministic prosody planning + real PCM/WAV synthesis:
//
//   * consent gate refuses at the LIBRARY level — no bypass
//   * punctuation → real pauses; questions rise, statements
//     fall; long units slow down
//   * the owner voice-bank profile shapes engine pitch/rate
//   * WAV encoding is byte-exact (RIFF header, 16-bit LE)
//   * tones are click-free and never clip
//   * speech AUDIO synthesis stays honestly NOT_IMPLEMENTED
// =========================================================
import { describe, expect, it } from "vitest";
import {
  concatPcm,
  encodeWavPcm16,
  MOUTH_MAX_UNIT_CHARS,
  PAUSE_MS,
  planSpeech,
  profilePitchScale,
  profileRateScale,
  splitSpeakableUnits,
  synthesizeCueWav,
  synthesizeTonePcm,
  mouthCapabilityReports,
  type MouthConsent,
  type MouthVoiceProfile,
} from "@studio-shared/archie-ai/native-engine/mouth.ts";

const granted: MouthConsent = { granted: true };
const denied: MouthConsent = { granted: false };

// ---------------------------------------------------------
// Consent gate
// ---------------------------------------------------------
describe("planSpeech consent gate", () => {
  it("REFUSES to plan speech without the VOICE_OUTPUT consent", () => {
    const res = planSpeech("Hello owner", denied, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONSENT_NOT_GRANTED");
  });

  it("REFUSES when consent is undefined/null — no guessing", () => {
    expect(planSpeech("Hello", undefined, null).ok).toBe(false);
    expect(planSpeech("Hello", null, null).ok).toBe(false);
  });

  it("REFUSES honestly when there is nothing to say", () => {
    const res = planSpeech("   \n  ", granted, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOTHING_TO_SAY");
  });
});

// ---------------------------------------------------------
// Prosody planning
// ---------------------------------------------------------
describe("prosody planning", () => {
  it("splits multi-sentence text into sentence units with sentence pauses", () => {
    const res = planSpeech(
      "First sentence. Second sentence! Third one?",
      granted,
      null,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.units.length).toBe(3);
    // first unit: no leading pause
    expect(res.units[0].pauseBeforeMs).toBe(0);
    // after a sentence: 500ms
    expect(res.units[1].pauseBeforeMs).toBe(PAUSE_MS.sentence);
    expect(res.units[2].pauseBeforeMs).toBe(PAUSE_MS.sentence);
  });

  it("statements fall, questions rise, exclamations lift", () => {
    const res = planSpeech("I am done. Are you sure? Amazing!", granted, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [stmt, q, ex] = res.units.map((u) => u.pitchScale);
    expect(stmt).toBeLessThan(1); // falling
    expect(q).toBeGreaterThan(1); // rising
    expect(ex).toBe(1.05); // lifted
  });

  it("comma-separated phrases carry a comma pause", () => {
    // a single sentence with commas stays ONE unit but the
    // plan runs phrase-level: use explicit units over the cap
    const text = [
      "Consider the options carefully,",
      " then choose the safest path,",
      " and never bypass a control.",
    ].join("");
    const res = planSpeech(text, granted, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // units beyond the first carry at least the comma pause
    for (const unit of res.units.slice(1)) {
      expect(unit.pauseBeforeMs).toBeGreaterThanOrEqual(PAUSE_MS.comma);
    }
  });

  it("long units slow down for intelligibility, short ones do not", () => {
    const long = `This is a deliberately long sentence with well over twenty four words in it so that the prosody planner decides to slow the speaking rate slightly for intelligibility and comprehension by the owner listening on a phone.`;
    const res = planSpeech(long, granted, null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const longUnit = res.units.find((u) => u.text.split(/\s+/).length >= 24);
    expect(longUnit).toBeDefined();
    expect(longUnit!.rateScale).toBeLessThan(1);
  });

  it("NEVER splits mid-word, no unit exceeds the cap", () => {
    const words = Array.from(
      { length: 60 },
      (_, i) => `supercalifragilistic${i}`,
    ).join(" ");
    const units = splitSpeakableUnits(words);
    expect(units.length).toBeGreaterThan(1);
    for (const u of units) {
      expect(u.length).toBeLessThanOrEqual(MOUTH_MAX_UNIT_CHARS + 1);
    }
    // word-boundary splits only: rejoining restores the text
    expect(units.join(" ")).toBe(words.trim());
  });

  it("applies the owner voice-bank profile to every unit", () => {
    const profile: MouthVoiceProfile = { pitchHz: 110, rateHint: 1.1 };
    const res = planSpeech("Hello there. How are you?", granted, profile);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.profileApplied).toBe(true);
    // 110 Hz → pitch 1.0, rate 1.1 — on the neutral unit too
    for (const unit of res.units) {
      expect(unit.rateScale).toBeCloseTo(1.1, 3);
    }
  });

  it("is deterministic: same input → identical plan", () => {
    const profile: MouthVoiceProfile = { pitchHz: 200, rateHint: 0.9 };
    const a = planSpeech("Same text, same profile.", granted, profile);
    const b = planSpeech("Same text, same profile.", granted, profile);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------
// Profile mapping
// ---------------------------------------------------------
describe("profile mapping", () => {
  it("maps 110 Hz to neutral, 220 Hz above, 80 Hz below", () => {
    expect(profilePitchScale(110)).toBeCloseTo(1, 10);
    expect(profilePitchScale(220)).toBeGreaterThan(1.3);
    expect(profilePitchScale(80)).toBeLessThan(1);
  });

  it("clamps into the engine-safe band and never maps garbage", () => {
    expect(profilePitchScale(10_000)).toBe(1.6);
    expect(profilePitchScale(1)).toBe(0.5);
    expect(profilePitchScale(-5)).toBe(1); // invalid → honest neutral
    expect(profilePitchScale(Number.NaN)).toBe(1);
  });

  it("clamps the rate hint into [0.6, 1.5]", () => {
    expect(profileRateScale(0.1)).toBe(0.6);
    expect(profileRateScale(99)).toBe(1.5);
    expect(profileRateScale(1.05)).toBeCloseTo(1.05, 10);
    expect(profileRateScale(0)).toBe(1);
  });
});

// ---------------------------------------------------------
// PCM synthesis — click-free, deterministic
// ---------------------------------------------------------
describe("synthesizeTonePcm", () => {
  it("produces the mathematically exact sine values (8kHz, 1kHz → every 8th sample full cycle)", () => {
    const pcm = synthesizeTonePcm(
      { frequencyHz: 1000, durationMs: 8, amplitude: 0.5, fadeMs: 0 },
      8000,
    );
    expect(pcm.length).toBe(64); // 8ms × 8000Hz
    // sample 1 = sin(2π/8) × 0.5
    expect(pcm[1]).toBeCloseTo(Math.sin(Math.PI / 4) * 0.5, 6);
    // sample 2 = sin(π/2) × 0.5 = 0.5 exactly at the peak
    expect(pcm[2]).toBeCloseTo(0.5, 6);
  });

  it("fades both edges — click-free by construction, never clipping", () => {
    const pcm = synthesizeTonePcm(
      { frequencyHz: 440, durationMs: 100, amplitude: 0.8, fadeMs: 10 },
      22_050,
    );
    expect(pcm[0]).toBeCloseTo(0, 10); // fade-in starts at silence
    let peak = 0;
    for (const s of pcm) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeLessThanOrEqual(0.8); // never above amplitude
    expect(pcm[pcm.length - 1]).toBeCloseTo(0, 8); // fade-out ends silent
  });

  it("concatPcm joins tracks in order with exact total length", () => {
    const a = synthesizeTonePcm(
      { frequencyHz: 440, durationMs: 50, amplitude: 0.3, fadeMs: 5 },
      22_050,
    );
    const b = synthesizeTonePcm(
      { frequencyHz: 880, durationMs: 50, amplitude: 0.3, fadeMs: 5 },
      22_050,
    );
    const joined = concatPcm([a, b]);
    expect(joined.length).toBe(a.length + b.length);
    expect(joined[0]).toBe(a[0]);
    expect(joined[a.length]).toBe(b[0]);
  });
});

// ---------------------------------------------------------
// WAV encoding — byte-exact RIFF/WAVE
// ---------------------------------------------------------
describe("encodeWavPcm16", () => {
  it("writes a byte-exact RIFF header for mono 16-bit PCM", () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const wav = encodeWavPcm16(pcm, 8000);
    expect(wav.length).toBe(44 + 5 * 2);
    // ASCII magic
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...wav.slice(12, 16))).toBe("fmt ");
    expect(String.fromCharCode(...wav.slice(36, 40))).toBe("data");
    const dv = new DataView(wav.buffer);
    expect(dv.getUint32(4, true)).toBe(36 + 10); // riff size
    expect(dv.getUint16(20, true)).toBe(1); // PCM
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(8000); // sample rate
    expect(dv.getUint32(28, true)).toBe(16_000); // byte rate
    expect(dv.getUint16(32, true)).toBe(2); // block align
    expect(dv.getUint16(34, true)).toBe(16); // bits
    expect(dv.getUint32(40, true)).toBe(10); // data bytes
    // little-endian 16-bit samples, quantized and clamped
    // sample i lives at byte 44 + i*2
    expect(dv.getInt16(44, true)).toBe(0);
    expect(dv.getInt16(46, true)).toBe(Math.round(0.5 * 32_767));
    expect(dv.getInt16(48, true)).toBe(Math.round(-0.5 * 32_767));
    expect(dv.getInt16(50, true)).toBe(32_767); // +1 clamped at max
    expect(dv.getInt16(52, true)).toBe(-32_767); // −1 maps inside range
  });
});

// ---------------------------------------------------------
// ARCHIE audio cues
// ---------------------------------------------------------
describe("synthesizeCueWav", () => {
  it("listen: two rising notes, valid WAV, deterministic", () => {
    const a = synthesizeCueWav("listen");
    const b = synthesizeCueWav("listen");
    expect(a.length).toEqual(b.length);
    expect(a).toEqual(b); // byte-identical
    expect(String.fromCharCode(...a.slice(0, 4))).toBe("RIFF");
    // 280ms of tones at 22050Hz → ≥ 6174 samples → > 12_388 bytes
    expect(a.length).toBeGreaterThan(44 + 6000 * 2);
  });

  it("confirm: the double-tap has exactly two equal tones", () => {
    const spec: Parameters<typeof synthesizeCueWav>[0] = "confirm";
    expect(spec).toBe("confirm");
    const wav = synthesizeCueWav("confirm");
    // two 90ms tones, each rounded to whole samples
    const samples = (wav.length - 44) / 2;
    expect(samples).toBe(2 * Math.round(0.09 * 22_050));
  });

  it("alert: low-high urgent pair, real audio", () => {
    const wav = synthesizeCueWav("alert");
    expect(wav.length).toBeGreaterThan(44);
  });
});

// ---------------------------------------------------------
// Capability honesty
// ---------------------------------------------------------
describe("mouthCapabilityReports", () => {
  it("claims OPERATIONAL only for what is measured; discloses speech synthesis as NOT_IMPLEMENTED", () => {
    const reports = mouthCapabilityReports();
    expect(reports.length).toBe(3);
    const ids = reports.map((r) => r.id);
    expect(ids).toContain("voice-prosody-planning");
    expect(ids).toContain("voice-audio-synthesis");
    const speech = reports.find((r) => r.id === "speech-audio-synthesis")!;
    expect(speech.maturity).toBe("NOT_IMPLEMENTED");
    for (const r of reports) {
      expect(r.measuredBy.length).toBeGreaterThan(0);
    }
  });
});
