// =========================================================
// ARCHIE VIDEO-PERCEPTION TESTS (B-3)
// MP4 fixtures built BYTE-BY-BYTE (a minimal real box tree),
// frame sequences synthesized deterministically.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  analyzeFrameSequence,
  inspectContainer,
  type FrameSample,
} from "./video-perception.ts";

// ---------- minimal MP4 builder (deterministic fixture) ----
function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  return out;
}
function u32b(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v);
  return b;
}
function concatU8(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Build the smallest honest MP4 metadata tree the parser
 *  actually walks: ftyp + moov(mvhd + trak(tkhd + mdia(mdhd +
 *  stbl(stsd + stts)))). */
function buildTestMp4(opts: {
  timescale: number;
  duration: number;
  width: number;
  height: number;
  codec: string;
  frameCount: number;
}): Uint8Array {
  const ftyp = box("ftyp", concatU8([
    new TextEncoder().encode("isom"),
    u32b(0),
    new TextEncoder().encode("isom"),
  ]));

  // mvhd v0: version+flags(4) + creation(4) + mod(4) +
  // timescale(4) + duration(4)
  const mvhdBody = concatU8([
    u32b(0), u32b(0), u32b(0),
    u32b(opts.timescale), u32b(opts.duration),
  ]);

  // tkhd v0: version+flags(4) + times(8) + trackid(4) +
  // reserved(4) + duration(4) + reserved(8) + layer(2) +
  // altgroup(2) + volume(2) + reserved(2) + matrix(36) +
  // width(4) + height(4)
  // tkhd v0 body: ver+flags(4) creation(4) mod(4) trackid(4)
  // reserved(4) duration(4) reserved(8) layer(2) alt(2)
  // volume(2) reserved(2) matrix(36) width16.16(4) height16.16(4)
  const tkhdBody = new Uint8Array(80);
  const tkdv = new DataView(tkhdBody.buffer);
  tkdv.setUint32(16, opts.duration); // duration at offset 16
  tkdv.setUint32(72, opts.width * 65536); // 16.16 fixed
  tkdv.setUint32(76, opts.height * 65536);

  // mdhd v0: version+flags(4) + times(8) + timescale(4) + duration(4)
  const mdhdBody = concatU8([
    u32b(0), u32b(0), u32b(0),
    u32b(opts.timescale), u32b(opts.duration),
  ]);

  // stsd: version+flags(4) + entry_count(4) + one sample
  // entry: size(4)+fourcc(4)+reserved(6)+data_ref(2)+pre-
  // defined(2)+reserved(12)+width(2)+height(2)...
  const codecBytes = new TextEncoder().encode(opts.codec);
  const sampleEntry = new Uint8Array(4 + 4 + 6 + 2 + 2 + 12 + 4 + 4 + 4 + 2 + 2);
  new DataView(sampleEntry.buffer).setUint32(0, sampleEntry.length);
  sampleEntry.set(codecBytes, 4);
  const stsdBody = concatU8([u32b(0), u32b(1), sampleEntry]);

  // stts: version+flags(4) + entry_count(4) + entries
  // (count(4), delta(4)) — one entry, N frames
  const sttsBody = concatU8([
    u32b(0), u32b(1),
    u32b(opts.frameCount), u32b(1),
  ]);

  const stbl = box("stbl", concatU8([
    box("stsd", stsdBody),
    box("stts", sttsBody),
  ]));
  const mdia = box("mdia", concatU8([box("mdhd", mdhdBody), stbl]));
  const trak = box("trak", concatU8([box("tkhd", tkhdBody), mdia]));
  const moov = box("moov", concatU8([box("mvhd", mvhdBody), trak]));
  return concatU8([ftyp, moov]);
}

describe("video-perception — container inspection (MP4)", () => {
  it("reads dimensions, duration, codec, frame count, fps", () => {
    const mp4 = buildTestMp4({
      timescale: 1000,
      duration: 5000, // 5s
      width: 1280,
      height: 720,
      codec: "avc1",
      frameCount: 150,
    });
    const info = inspectContainer(mp4);
    expect(info.ok).toBe(true);
    expect(info.container).toBe("mp4");
    expect(info.widthPx).toBe(1280);
    expect(info.heightPx).toBe(720);
    expect(info.durationSec).toBeCloseTo(5, 3);
    expect(info.codec).toBe("avc1");
    expect(info.sampleCount).toBe(150);
    expect(info.fpsEstimate).toBeCloseTo(30, 1);
  });

  it("moov-less MP4 refused honestly", () => {
    const ftypOnly = buildTestMp4({ timescale: 1, duration: 1, width: 2, height: 2, codec: "avc1", frameCount: 1 }).slice(0, 24); // the ftyp box only — no moov header at all
    const info = inspectContainer(ftypOnly);
    expect(info.ok).toBe(false);
    expect(info.note).toContain("moov");
  });

  it("garbage refused honestly", () => {
    expect(inspectContainer(new Uint8Array(4)).ok).toBe(false);
    expect(inspectContainer(new TextEncoder().encode("not a video at all")).ok).toBe(false);
  });

  it("WebM detected and honestly not parsed", () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    const info = inspectContainer(webm);
    expect(info.ok).toBe(false);
    expect(info.note).toContain("WebM");
    expect(info.note).toContain("refused honestly");
  });
});

// ---------- frame-sequence analysis ------------------------

/** Solid-color frame: deterministic luma. */
function solidFrame(tSec: number, luma: number): FrameSample {
  const w = 8,
    h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  const v = Math.round(luma * 255);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { tSec, width: w, height: h, data };
}

/** Noisy moving frame: seeded PRNG around a base luma. */
function noiseFrame(tSec: number, base: number, seed: number): FrameSample {
  const f = solidFrame(tSec, base);
  let s = seed;
  for (let i = 0; i < f.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const jitter = ((s / 0x7fffffff) - 0.5) * 120;
    f.data[i] = Math.max(0, Math.min(255, f.data[i] + jitter));
    f.data[i + 1] = f.data[i];
    f.data[i + 2] = f.data[i];
  }
  return f;
}

describe("video-perception — frame-sequence analysis", () => {
  it("static clip: all-static segments, near-zero motion", () => {
    const frames = [0, 0.5, 1, 1.5].map((t) => solidFrame(t, 0.6));
    const r = analyzeFrameSequence(frames);
    expect(r.ok).toBe(true);
    expect(r.segments.every((s) => s.kind === "static")).toBe(true);
    expect(r.motionScore).toBeLessThan(0.03);
    expect(r.cuts).toBe(0);
    expect(r.brightness).toBeGreaterThan(0.5);
  });

  it("moving clip: motion segments", () => {
    const frames = [0, 0.33, 0.66, 1, 1.33].map((t, i) => noiseFrame(t, 0.5, 1000 + i * 7));
    const r = analyzeFrameSequence(frames);
    expect(r.ok).toBe(true);
    expect(r.segments.some((s) => s.kind === "motion")).toBe(true);
    expect(r.motionScore).toBeGreaterThan(0.03);
  });

  it("hard scene cut detected as a cut segment", () => {
    const frames = [
      solidFrame(0, 0.2),
      solidFrame(0.5, 0.2),
      solidFrame(1, 0.2),
      // hard cut: bright beach scene
      solidFrame(1.5, 0.9),
      solidFrame(2, 0.9),
    ];
    const r = analyzeFrameSequence(frames);
    expect(r.cuts).toBe(1);
    const cut = r.segments.find((s) => s.kind === "cut");
    expect(cut).toBeDefined();
    expect(cut!.startSec).toBe(1);
    expect(cut!.brightness).toBeGreaterThan(0.8);
  });

  it("too few frames refused honestly", () => {
    expect(analyzeFrameSequence([]).ok).toBe(false);
    expect(analyzeFrameSequence([solidFrame(0, 0.5)]).ok).toBe(false);
  });

  it("honest note: statistics only, never content claims", () => {
    const r = analyzeFrameSequence([solidFrame(0, 0.5), solidFrame(1, 0.5)]);
    expect(r.note).toContain("content understanding is NOT implemented");
  });

  it("determinism: same frames → identical analysis", () => {
    const frames = [solidFrame(0, 0.3), noiseFrame(0.5, 0.5, 99), solidFrame(1, 0.8)];
    expect(analyzeFrameSequence(frames)).toEqual(analyzeFrameSequence(frames.map((f) => ({ ...f, data: f.data.slice() }))));
  });
});
