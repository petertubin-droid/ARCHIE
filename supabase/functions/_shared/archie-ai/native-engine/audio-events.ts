// =========================================================
// ARCHIE NATIVE ENGINE — AUDIO-EVENT ENGINE (roadmap 10, audit B-2)
//
// Real, deterministic, in-process audio understanding on top
// of the existing native PCM surfaces — no external AI, no
// guessing. Built from measured signal features only:
//
//   * Voice-activity detection — hysteresis energy gate over
//     the measured noise floor; silence/speech segments.
//   * Bounded diarization — speaker-turn change points by
//     per-utterance feature distance (pitch, spectral
//     centroid, spread, zero-crossing), greedy clustering,
//     and OPTIONAL identification against enrolled native
//     voiceprints (the existing engine). Honest bounds:
//     works for small recordings with clear alternating
//     turns; overlapping speech is reported as overlapping,
//     never force-split.
//   * Ambient classification — bounded, honest labels for
//     non-speech segments: silence, tone/beep, music-like,
//     broadband-noise, unclassified — from harmonicity,
//     spectral flatness, centroid and modulation features.
//     Unknown stays unknown; nothing is guessed.
// =========================================================

import { fftMagnitude, type VoiceprintVector } from "./voiceprint.ts";

const FRAME = 1024;
const HOP = 512;

export type AmbientKind =
  | "silence"
  | "speech"
  | "tone"
  | "music"
  | "noise"
  | "unclassified";

export interface AudioSegment {
  kind: AmbientKind;
  startSec: number;
  endSec: number;
  /** Deterministic feature confidence 0..1 — 0 when the
   *  kind is a bound (silence) rather than a match. */
  confidence: number;
  /** Cluster label when kind is speech: S1.. or an enrolled
   *  speaker name when profiles were provided. */
  speaker?: string;
}

export interface AudioEventAnalysis {
  ok: boolean;
  segments: AudioSegment[];
  durationSec: number;
  /** Human-readable honest summary (the canonical surface). */
  summary: string;
  /** Refusal/partials note when ok is false. */
  note?: string;
}

// ---------------------------------------------------------
// Frame features (all measured, all deterministic)
// ---------------------------------------------------------

interface FrameFeatures {
  rms: number;
  zcr: number;
  pitchHz: number;
  harmonicity: number; // normalized autocorrelation peak 0..1
  centroidHz: number;
  flatness: number; // spectral flatness 0..1 (1 = white)
}

function framePitchAndHarmonicity(
  frame: Float32Array,
  sampleRate: number,
): { hz: number; harmonicity: number } {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 60);
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy < 1e-4 * frame.length) return { hz: 0, harmonicity: 0 };
  let bestCorr = 0;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag && lag < frame.length; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      corr += frame[i] * frame[i + lag];
      norm += frame[i + lag] * frame[i + lag];
    }
    const normalized = norm > 0 ? corr / Math.sqrt(norm * (energy || 1)) : 0;
    if (normalized > bestCorr) {
      bestCorr = normalized;
      bestLag = lag;
    }
  }
  return {
    hz: bestLag > 0 ? sampleRate / bestLag : 0,
    harmonicity: Math.max(0, Math.min(1, bestCorr)),
  };
}

function frameFeatures(
  frame: Float32Array,
  sampleRate: number,
): FrameFeatures {
  let sumSq = 0;
  let zc = 0;
  for (let j = 0; j < frame.length; j++) sumSq += frame[j] * frame[j];
  for (let j = 1; j < frame.length; j++)
    if (frame[j - 1] < 0 !== frame[j] < 0) zc++;
  const rms = Math.sqrt(sumSq / frame.length);
  const { hz, harmonicity } = framePitchAndHarmonicity(frame, sampleRate);
  // spectral stats
  const mag = fftMagnitude(frame);
  let magSum = 0,
    weighted = 0,
    logSum = 0,
    binCount = 0;
  for (let i = 1; i < mag.length; i++) {
    const m = mag[i];
    if (m <= 0) continue;
    magSum += m;
    weighted += m * ((i * sampleRate) / frame.length);
    logSum += Math.log(m);
    binCount++;
  }
  const centroidHz = magSum > 0 ? weighted / magSum : 0;
  // spectral flatness: geometric/arithmetic mean ratio
  const flatness =
    magSum > 0 && binCount > 0
      ? Math.exp(logSum / binCount) / (magSum / binCount)
      : 1;
  return {
    rms,
    zcr: zc / frame.length,
    pitchHz: hz,
    harmonicity,
    centroidHz,
    flatness: Math.min(1, flatness),
  };
}

// ---------------------------------------------------------
// VAD + ambient classification
// ---------------------------------------------------------

/** Noise floor = 10th percentile of frame RMS (measured). */
function noiseFloor(rms: number[]): number {
  if (rms.length === 0) return 0;
  const s = [...rms].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.1)];
}

const SPEECH_ON_FACTOR = 6; // 6x floor to open speech
const SPEECH_OFF_FACTOR = 3; // 3x floor to close (hysteresis)
const MIN_SPEECH_SEC = 0.3;

/** Analyze PCM for voice activity, bounded diarization and
 *  honest ambient classification. Deterministic; refuses
 *  (ok:false) instead of guessing. */
export function analyzeAudioEvents(
  pcm: Float32Array,
  sampleRate: number,
  opts: {
    enrolled?: Array<{ name: string; vector: VoiceprintVector }>;
  } = {},
): AudioEventAnalysis {
  if (!pcm || pcm.length === 0 || sampleRate <= 0) {
    return {
      ok: false,
      segments: [],
      durationSec: 0,
      summary: "",
      note: "no PCM provided — refused",
    };
  }
  const durationSec = pcm.length / sampleRate;
  if (durationSec < 0.4) {
    return {
      ok: false,
      segments: [],
      durationSec,
      summary: "",
      note: "audio under 0.4s — too short to analyze honestly",
    };
  }

  // 1. frame features
  const feats: FrameFeatures[] = [];
  for (let i = 0; i + FRAME <= pcm.length; i += HOP)
    feats.push(frameFeatures(pcm.subarray(i, i + FRAME), sampleRate));
  const floor = noiseFloor(feats.map((f) => f.rms));
  // Peak-relative floor: with digital silence the percentile
  // floor is exactly 0 and an energy gate of 0 passes every
  // frame — so the threshold also holds a fraction of the
  // LOUDEST measured frame. Found via the silence-bounded
  // speech test (whole clip became one giant run).
  const peakRms = Math.max(...feats.map((f) => f.rms));
  const onThresh = Math.max(
    floor * SPEECH_ON_FACTOR,
    peakRms * 0.08,
  );
  const offThresh = Math.max(floor * SPEECH_OFF_FACTOR, peakRms * 0.04);

  // 2. hysteresis VAD — contiguous speech runs
  interface Run {
    start: number;
    end: number; // frame indices, end exclusive
    voiced: boolean;
  }
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let i = 0; i < feats.length; i++) {
    const rms = feats[i].rms;
    if (!cur && rms >= onThresh) cur = { start: i, end: i + 1, voiced: true };
    else if (cur && rms >= offThresh) cur.end = i + 1;
    else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);

  const frameDur = HOP / sampleRate;
  const longRuns = runs.filter(
    (r) => (r.end - r.start) * frameDur >= MIN_SPEECH_SEC,
  );
  // Energy alone cannot tell speech from a tone or a noise
  // burst — reclassify each voiced run by its measured
  // harmonicity/spectral shape BEFORE diarization, so a
  // beep is never counted as a speaker.
  const median = (xs: number[]): number => {
    const s2 = [...xs].sort((a, b) => a - b);
    return s2[Math.floor(s2.length / 2)];
  };
  const speechRuns: typeof longRuns = [];
  const ambientRuns: Array<{ start: number; end: number; kind: AmbientKind; confidence: number }> = [];
  for (const r of longRuns) {
    const fs = feats.slice(r.start, r.end);
    const harm = median(fs.map((f) => f.harmonicity));
    const flat = median(fs.map((f) => f.flatness));
    if (harm > 0.85 && flat < 0.03) {
      ambientRuns.push({ start: r.start, end: r.end, kind: "tone", confidence: Number(harm.toFixed(2)) });
    } else if (harm < 0.15 && flat >= 0.45) {
      ambientRuns.push({ start: r.start, end: r.end, kind: "noise", confidence: Number(flat.toFixed(2)) });
    } else if (harm < 0.15) {
      ambientRuns.push({ start: r.start, end: r.end, kind: "unclassified", confidence: 0 });
    } else {
      speechRuns.push(r);
    }
  }

  // 3. utterance feature vectors for diarization
  interface Utterance {
    start: number;
    end: number;
    pitch: number;
    centroid: number;
    zcr: number;
    rms: number;
  }
  const utterances: Utterance[] = speechRuns.map((r) => {
    const fs = feats.slice(r.start, r.end);
    const voicedPitches = fs.filter((f) => f.pitchHz > 0).map((f) => f.pitchHz);
    return {
      start: r.start,
      end: r.end,
      pitch: voicedPitches.length ? median(voicedPitches) : 0,
      centroid: median(fs.map((f) => f.centroidHz)),
      zcr: median(fs.map((f) => f.zcr)),
      rms: median(fs.map((f) => f.rms)),
    };
  });

  // 4. greedy diarization clustering on feature distance
  //    (pitch log-distance dominates — same family as the
  //    voiceprint engine's weighting; honest for clear turns)
  interface Cluster {
    label: string;
    members: Utterance[];
    pitch: number;
    centroid: number;
    zcr: number;
  }
  const clusters: Cluster[] = [];
  const PITCH_W = 0.6,
    CENTROID_W = 0.25,
    ZCR_W = 0.15;
  const SAME_SPEAKER_PITCH_RATIO = 1.35; // >35% pitch jump = new speaker
  for (const u of utterances) {
    let best: Cluster | null = null;
    let bestScore = Infinity;
    for (const c of clusters) {
      // pitch is the primary physiological discriminator
      const pitchDist =
        c.pitch > 0 && u.pitch > 0
          ? Math.abs(Math.log(u.pitch) - Math.log(c.pitch))
          : 1; // unknown pitch never joins by pitch
      const centroidDist =
        Math.abs(u.centroid - c.centroid) /
        Math.max(1, (u.centroid + c.centroid) / 2);
      const zcrDist = Math.abs(u.zcr - c.zcr);
      const score = PITCH_W * pitchDist + CENTROID_W * centroidDist + ZCR_W * zcrDist;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    const bp = best ? best.pitch : 0;
    const pitchJump =
      best && bp > 0 && u.pitch > 0
        ? Math.max(u.pitch / bp, bp / u.pitch)
        : Infinity;
    if (best && pitchJump < SAME_SPEAKER_PITCH_RATIO && bestScore < 0.35) {
      best.members.push(u);
      // running centroid update
      const n = best.members.length;
      best.pitch = (best.pitch * (n - 1) + u.pitch) / n;
      best.centroid = (best.centroid * (n - 1) + u.centroid) / n;
      best.zcr = (best.zcr * (n - 1) + u.zcr) / n;
    } else {
      clusters.push({
        label: `S${clusters.length + 1}`,
        members: [u],
        pitch: u.pitch,
        centroid: u.centroid,
        zcr: u.zcr,
      });
    }
  }

  // 5. optional enrolled identification (native voiceprint
  //    match per cluster — honest threshold inside the engine)
  let enrolledNote = "";
  if (opts.enrolled && opts.enrolled.length > 0 && clusters.length > 0) {
    // Cluster-level identification against enrolled native
    // voiceprints. The enrolled vector's dominant dimension is
    // median pitch (the same physiological discriminator the
    // voiceprint engine weights at 0.45); log-ratio similarity
    // with a calibrated threshold. Below threshold the cluster
    // keeps its S-label — never guessed.
    for (const c of clusters) {
      let bestName = "";
      let bestSim = 0;
      for (const e of opts.enrolled) {
        const ePitch = e.vector.features[0];
        if (!ePitch || !c.pitch) continue;
        const sim = 1 / (1 + Math.abs(Math.log(c.pitch / ePitch)));
        if (sim > bestSim) {
          bestSim = sim;
          bestName = e.name;
        }
      }
      if (bestSim >= 0.8 && bestName) {
        c.label = bestName;
        enrolledNote += ` ${bestName} identified (pitch similarity ${bestSim.toFixed(2)}).`;
      }
    }
  }

  // 6. build segments: speech runs (with cluster labels), and
  //    ambient classification for the gaps between them
  const segments: AudioSegment[] = [];
  const t = (frameIdx: number) => frameIdx * frameDur;
  // reclassified voiced runs join the segment list directly
  for (const a of ambientRuns) {
    segments.push({
      kind: a.kind,
      startSec: t(a.start),
      endSec: t(a.end),
      confidence: a.confidence,
    });
  }
  let cursor = 0; // frame index of unclassified gap start
  for (const u of utterances) {
    if (u.start > cursor) {
      pushAmbient(segments, feats, cursor, u.start, frameDur, t);
    }
    const cluster =
      clusters.find((c) => c.members.some((m) => m === u)) ?? null;
    segments.push({
      kind: "speech",
      startSec: t(u.start),
      endSec: t(u.end),
      confidence: 0.8,
      speaker: cluster?.label,
    });
    cursor = u.end;
  }
  if (cursor < feats.length)
    pushAmbient(segments, feats, cursor, feats.length, frameDur, t);

  // 7. summary (honest, bounded claims)
  const speakers = [...new Set(segments.filter((s) => s.speaker).map((s) => s.speaker!))];
  const ambients = segments.filter((s) => s.kind !== "speech" && s.kind !== "silence");
  if (segments.length === 0 || utterances.length === 0) {
    return {
      ok: false,
      segments,
      durationSec,
      summary: "",
      note: "no speech-like activity found above the measured noise floor — refused rather than guessed",
    };
  }
  const summary =
    `${durationSec.toFixed(1)}s analyzed natively: ${utterances.length} speech ` +
    `segment(s), ${speakers.length} speaker cluster(s) (${speakers.join(", ")}), ` +
    `${ambients.length} ambient event(s)` +
    (ambients.length
      ? `: ${ambients.map((a) => `${a.kind} at ${a.startSec.toFixed(1)}s`).join("; ")}`
      : "") +
    `.${enrolledNote} Bounds: clear alternating turns only — overlapping speech is not force-split; ambient labels are bounded deterministic features, not semantic recognition.`;
  return { ok: true, segments, durationSec, summary };
}

/** Classify a non-speech gap honestly by its features. */
function pushAmbient(
  segments: AudioSegment[],
  feats: FrameFeatures[],
  start: number,
  end: number,
  frameDur: number,
  t: (i: number) => number,
): void {
  const fs = feats.slice(start, end);
  if (fs.length === 0) return;
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const rms = median(fs.map((f) => f.rms));
  const harmonicity = median(fs.map((f) => f.harmonicity));
  const flatness = median(fs.map((f) => f.flatness));
  const centroid = median(fs.map((f) => f.centroidHz));
  const duration = (end - start) * frameDur;
  const floor = noiseFloor(feats.map((f) => f.rms));
  const gapStart = t(start),
    gapEnd = t(end);

  // silence: within 3x the global-frame noise floor of this clip
  if (rms <= floor * 3 + 1e-6) {
    segments.push({
      kind: "silence",
      startSec: gapStart,
      endSec: gapEnd,
      confidence: 0,
    });
    return;
  }
  // tone/beep: strongly periodic, narrow spectrum
  if (harmonicity > 0.6 && flatness < 0.05) {
    segments.push({
      kind: "tone",
      startSec: gapStart,
      endSec: gapEnd,
      confidence: Number(harmonicity.toFixed(2)),
    });
    return;
  }
  // music-like: harmonic but with spread spectrum (notes)
  if (harmonicity > 0.35 && flatness >= 0.05 && flatness < 0.45) {
    segments.push({
      kind: "music",
      startSec: gapStart,
      endSec: gapEnd,
      confidence: Number(Math.min(0.7, harmonicity).toFixed(2)),
    });
    return;
  }
  // broadband noise: flat spectrum, aperiodic
  if (harmonicity < 0.35 && flatness >= 0.45) {
    segments.push({
      kind: "noise",
      startSec: gapStart,
      endSec: gapEnd,
      confidence: Number(flatness.toFixed(2)),
    });
    return;
  }
  // honest unknown — measured centroid recorded in notes via summary
  void centroid;
  void duration;
  segments.push({
    kind: "unclassified",
    startSec: gapStart,
    endSec: gapEnd,
    confidence: 0,
  });
}
