// =========================================================
// ARCHIE NATIVE VIDEO-PERCEPTION ENGINE (B-3, audit 8)
// supabase/functions/_shared/archie-ai/native-engine/video-perception.ts
//
// Video perception, deterministic and honest, in two layers:
//
//  1. inspectContainer(bytes) — pure-TS MP4/WebM box parsing:
//     dimensions, duration, codec, frame statistics. Works
//     wherever the raw bytes live (edge or client).
//  2. analyzeFrameSequence(frames) — motion energy, scene-cut
//     segmentation, brightness labels on DECODED frames the
//     caller supplies (the PWA decodes via canvas — raw media
//     never leaves the device, same architecture as the
//     audio-event engine).
//
// Honest limits, stated by the engine itself: it measures
// SIGNAL statistics (motion, cuts, brightness) — it does NOT
// understand what is IN the video. No external AI, ever.
// =========================================================

// ---------------------------------------------------------
// Layer 1 — container inspection (MP4 + WebM)
// ---------------------------------------------------------

export interface VideoContainerInfo {
  ok: boolean;
  container: "mp4" | "webm" | "unknown";
  widthPx: number | null;
  heightPx: number | null;
  durationSec: number | null;
  /** FourCC for MP4 (avc1/vp09...), codec id for WebM (V_VP8...). */
  codec: string | null;
  /** Approximate sample/frame count from the stts table. */
  sampleCount: number | null;
  /** Estimated average frames per second. */
  fpsEstimate: number | null;
  note: string;
}

export function inspectContainer(bytes: Uint8Array): VideoContainerInfo {
  const fail = (note: string): VideoContainerInfo => ({
    ok: false,
    container: "unknown",
    widthPx: null,
    heightPx: null,
    durationSec: null,
    codec: null,
    sampleCount: null,
    fpsEstimate: null,
    note,
  });

  // WebM magic first — a truncated-but-recognizable WebM is
  // honestly "WebM detected, not parsed", not "too short".
  const isWebm =
    bytes.length >= 4 &&
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (bytes.length < 16 && !isWebm)
    return fail("too few bytes to be a video container");

  // ---- MP4: walk the box tree for moov→(mvhd, trak→(tkhd, mdia→(mdhd, stbl)))
  if (ascii(bytes, 4, 8) === "ftyp") {
    const moov = findBox(bytes, 0, bytes.length, "moov");
    if (!moov) return fail("MP4 with no moov box — metadata-only or corrupt; refused honestly");
    let durationSec: number | null = null;
    let timescale = 1000;
    const mvhd = findBox(bytes, moov.body, moov.end, "mvhd");
    if (mvhd) {
      const v = bytes[mvhd.body];
      if (v === 1) {
        timescale = u32(bytes, mvhd.body + 20);
        durationSec = u32(bytes, mvhd.body + 24) / (timescale || 1);
      } else {
        timescale = u32(bytes, mvhd.body + 12);
        durationSec = u32(bytes, mvhd.body + 16) / (timescale || 1);
      }
    }
    let widthPx: number | null = null;
    let heightPx: number | null = null;
    let codec: string | null = null;
    let sampleCount: number | null = null;
    let mediaTimescale = 0;
    let mediaDuration = 0;
    const trak = findBox(bytes, moov.body, moov.end, "trak");
    if (trak) {
      const tkhd = findBox(bytes, trak.body, trak.end, "tkhd");
      if (tkhd) {
        // tkhd v0: width/height are 16.16 FIXED at body
        // offsets 72/76 — the integer part is the top 16
        // bits, i.e. u16 at those offsets directly. (The
        // first cut read u16+74 and shifted, which returned
        // 0 for every real file — found by test.)
        widthPx = u16(bytes, tkhd.body + 72);
        heightPx = u16(bytes, tkhd.body + 76);
      }
      const mdia = findBox(bytes, trak.body, trak.end, "mdia");
      if (mdia) {
        const mdhd = findBox(bytes, mdia.body, mdia.end, "mdhd");
        if (mdhd) {
          mediaTimescale = u32(bytes, mdhd.body + 12);
          mediaDuration = u32(bytes, mdhd.body + 16);
        }
        const stbl = findBox(bytes, mdia.body, mdia.end, "stbl");
        if (stbl) {
          const stsd = findBox(bytes, stbl.body, stbl.end, "stsd");
          if (stsd) {
            // stsd body: version+flags(4) + entry_count(4),
            // then entries: size(4) + fourcc(4) + ...
            // fourcc of the first entry = body offset 12.
            const entry = stsd.body + 8;
            if (entry + 8 <= stsd.end) codec = ascii(bytes, entry + 4, entry + 8);
          }
          const stts = findBox(bytes, stbl.body, stbl.end, "stts");
          if (stts) {
            let n = 0;
            const entries = u32(bytes, stts.body + 4);
            for (let i = 0; i < Math.min(entries, 512); i++) {
              // stts entry i: sample_count at +8+i*8, delta
              // at +12+i*8 — the COUNT is what we sum.
              n += u32(bytes, stts.body + 8 + i * 8);
            }
            sampleCount = n;
          }
        }
      }
    }
    const fps = sampleCount && durationSec && durationSec > 0
      ? sampleCount / durationSec
      : null;
    if (durationSec === null || widthPx === null || heightPx === null) {
      return fail("MP4 box tree incomplete — no honest dimensions/duration could be read");
    }
    return {
      ok: true,
      container: "mp4",
      widthPx,
      heightPx,
      durationSec,
      codec,
      sampleCount,
      fpsEstimate: fps && isFinite(fps) ? Math.round(fps * 100) / 100 : null,
      note: "container-level inspection: signal statistics only — no content understanding",
    };
  }

  // ---- WebM (EBMF): id 0x1A45DFA3
  if (isWebm) {
    return fail("WebM detected — full EBML parsing not implemented; refused honestly rather than guessed");
  }

  return fail("not an MP4 or WebM container — refused honestly");
}

// ---- tiny binary readers (no DataView allocations over huge files)
function u32(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}
function u16(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}
function ascii(b: Uint8Array, i: number, j: number): string {
  let s = "";
  for (let k = i; k < j && k < b.length; k++) s += String.fromCharCode(b[k]);
  return s;
}
function findBox(
  b: Uint8Array,
  start: number,
  end: number,
  type: string,
): { start: number; end: number; body: number } | null {
  // `start` must be the position of the FIRST CHILD box
  // (parent.body), not the parent header — searching from
  // the parent header walks past the entire parent. Found
  // by test.
  let i = start;
  while (i + 8 <= end) {
    const size = u32(b, i);
    const t = ascii(b, i + 4, i + 8);
    const bodyStart = i + 8;
    if (t === type) {
      // size 1 → 64-bit largesize; size 0 → to end
      let boxEnd = size === 0 ? end : i + size;
      if (size === 1) {
        // 64-bit size — read high/low as safe 32-bit sum
        boxEnd = i + u32(b, i + 12); // low 32 approx (honest for <4GB)
      }
      return { start: i, end: Math.min(boxEnd, end), body: bodyStart };
    }
    if (size < 8) break; // malformed — stop walking honestly
    i += size;
  }
  return null;
}

// ---------------------------------------------------------
// Layer 2 — decoded frame-sequence analysis
// (the caller decodes; ARCHIE measures)
// ---------------------------------------------------------

export interface FrameSample {
  /** Timestamp of the frame within the video (seconds). */
  tSec: number;
  width: number;
  height: number;
  /** RGBA pixel data of the (possibly downscaled) frame. */
  data: Uint8ClampedArray;
}

export interface VideoSegment {
  kind: "static" | "motion" | "cut";
  startSec: number;
  endSec: number;
  /** Mean luminance 0..1 over the segment. */
  brightness: number;
}

export interface FrameAnalysis {
  ok: boolean;
  segments: VideoSegment[];
  cuts: number;
  motionScore: number; // mean inter-frame difference 0..1
  brightness: number; // overall mean luminance 0..1
  note: string;
}

/** Luma difference between consecutive frames (0..1). */
function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let diff = 0;
  // sample every 4th pixel (RGBA → 4 bytes): deterministic
  for (let i = 0; i < n; i += 16) {
    const la = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const lb = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    diff += Math.abs(la - lb);
  }
  return diff / ((n / 16) * 255);
}

const CUT_THRESHOLD = 0.18; // hard inter-frame break
const MOTION_THRESHOLD = 0.03; // perceptible motion

export function analyzeFrameSequence(frames: FrameSample[]): FrameAnalysis {
  if (!Array.isArray(frames) || frames.length < 2) {
    return {
      ok: false,
      segments: [],
      cuts: 0,
      motionScore: 0,
      brightness: 0,
      note: "fewer than 2 frames — nothing to analyze; refused honestly",
    };
  }

  // brightness per frame (sampled, deterministic)
  const lumas = frames.map((f) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i + 2 < f.data.length; i += 16) {
      sum += 0.299 * f.data[i] + 0.587 * f.data[i + 1] + 0.114 * f.data[i + 2];
      n += 1;
    }
    return n > 0 ? sum / (n * 255) : 0;
  });

  const diffs: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    diffs.push(frameDifference(frames[i - 1].data, frames[i].data));
  }
  const motionScore = diffs.reduce((a, d) => a + d, 0) / diffs.length;
  const brightness = lumas.reduce((a, l) => a + l, 0) / lumas.length;

  // ---- segmentation: cuts split; between cuts, static vs motion
  const segments: VideoSegment[] = [];
  let segStart = 0;
  const pushSeg = (endIdx: number) => {
    if (endIdx <= segStart) return;
    const segDiffs = diffs.slice(segStart, endIdx);
    const meanDiff = segDiffs.reduce((a, d) => a + d, 0) / (segDiffs.length || 1);
    const meanLum = lumas.slice(segStart, endIdx + 1).reduce((a, l) => a + l, 0) / (endIdx + 1 - segStart);
    const isCut = segDiffs.length === 1 && segDiffs[0] >= CUT_THRESHOLD;
    segments.push({
      kind: isCut ? "cut" : meanDiff >= MOTION_THRESHOLD ? "motion" : "static",
      startSec: frames[segStart].tSec,
      endSec: frames[endIdx].tSec,
      brightness: Math.round(meanLum * 1000) / 1000,
    });
  };

  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i] >= CUT_THRESHOLD) {
      // a cut ENDS the current segment at frame i; the cut
      // itself is recorded as its own single-step segment
      pushSeg(i);
      segments.push({
        kind: "cut",
        startSec: frames[i].tSec,
        endSec: frames[i + 1]?.tSec ?? frames[i].tSec,
        brightness: Math.round(lumas[i + 1] * 1000) / 1000,
      });
      segStart = i + 1;
    }
  }
  pushSeg(frames.length - 1);

  return {
    ok: true,
    segments,
    cuts: segments.filter((s) => s.kind === "cut").length,
    motionScore: Math.round(motionScore * 10000) / 10000,
    brightness: Math.round(brightness * 10000) / 10000,
    note: "signal statistics (motion, cuts, brightness) — content understanding is NOT implemented and never faked",
  };
}
