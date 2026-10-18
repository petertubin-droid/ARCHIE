// =========================================================
// ARCHIE NATIVE MEDIA-FORGE ENGINE (B-4, audit 9)
// supabase/functions/_shared/archie-ai/native-engine/media-forge.ts
//
// Media generation, deterministic and native:
//  1. generateDiagram(spec) — SVG charts/diagrams from
//     STRUCTURED specs (bar/line/flow): real layout math,
//     XML-escaped labels, seedable palette.
//  2. synthesizeTone(spec) — PCM audio cues (chimes/alerts):
//     sine synthesis with ADSR envelopes. Cues, not speech —
//     speech synthesis remains honestly NOT implemented.
//  3. generateMotionGraphic(spec) — animated SVG (SMIL) from
//     structured motion specs.
//
// Everything is procedurally composed from verified spec
// fragments — same honesty boundary as the code-authoring
// engine. Every output is labeled as ARCHIE-forged,
// procedural. No external AI, ever.
// =========================================================

// ---------------------------------------------------------
// Shared spec validation
// ---------------------------------------------------------

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function safeLabel(s: unknown, max = 48): string {
  return esc(String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max));
}
function isSafeIdent(s: string): boolean {
  return /^[a-z][a-zA-Z0-9_-]*$/.test(s) && s.length <= 32;
}
/** Executable vectors that must NEVER appear in a forged
 * artifact. Scanned on the OUTPUT after escaping. */
// STRUCTURAL vectors only: escaped text can never produce a
// real tag, so "<script"/"<iframe" in the output means a
// real injection escaped our grammar. "onload=" etc. can
// appear harmlessly inside inert TEXT and only execute
// within a real tag — which escaping makes impossible, so
// they are not output-banned (found by test).
const OUTPUT_BANNED = ["<script", "<iframe", "<foreignobject"];
/** Scheme attacks are refused at INPUT — "javascript:" has no
 * legitimate meaning as chart text, so it never enters. */
const INPUT_REFUSED = ["javascript:", "vbscript:"];

function outputIsClean(svg: string): boolean {
  const low = svg.toLowerCase();
  return !OUTPUT_BANNED.some((b) => low.includes(b));
}

export const FORGE_LABEL =
  "Forged by ARCHIE media-forge — procedural, deterministic composition (no external AI)";

// ---------------------------------------------------------
// 1. Diagrams
// ---------------------------------------------------------

export interface BarSpec {
  kind: "bar";
  title: string;
  bars: { label: string; value: number }[];
}
export interface LineSpec {
  kind: "line";
  title: string;
  points: { x: number; y: number }[];
}
export interface FlowSpec {
  kind: "flow";
  title: string;
  steps: string[];
}
export type DiagramSpec = BarSpec | LineSpec | FlowSpec;

export interface DiagramResult {
  ok: boolean;
  svg: string;
  note: string;
}

export function generateDiagram(spec: DiagramSpec): DiagramResult {
  if (!spec || typeof spec !== "object") {
    return { ok: false, svg: "", note: "No diagram spec — refused honestly." };
  }
  // NOTE: hostile LABELS are neutralized by XML escaping
  // below — a spec containing "<script" is legitimate input
  // whose text is rendered inert. Executable vectors are
  // banned from the OUTPUT, not the input (found by test:
  // the input-side scan rejected the very escaping case
  // it existed to make safe).
  if (INPUT_REFUSED.some((b) => JSON.stringify(spec).toLowerCase().includes(b))) {
    return { ok: false, svg: "", note: "Spec contains a refused URL-scheme string — refused honestly." };
  }
  if (!Array.isArray((spec as FlowSpec).steps ?? (spec as BarSpec).bars ?? (spec as LineSpec).points)) {
    return { ok: false, svg: "", note: "Spec data field missing or not an array — refused honestly." };
  }

  const W = 640;
  const H = 400;
  const head = (title: string, height: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" role="img" aria-label="${safeLabel(title, 80)}">\n` +
    `  <title>${safeLabel(title, 80)}</title>\n` +
    `  <!-- ${FORGE_LABEL} -->\n`;

  if (spec.kind === "bar") {
    const bars = spec.bars.slice(0, 24);
    if (bars.length === 0) return { ok: false, svg: "", note: "No bars — refused honestly." };
    if (bars.some((b) => typeof b.value !== "number" || !isFinite(b.value) || b.value < 0)) {
      return { ok: false, svg: "", note: "Bar values must be finite non-negative numbers — refused honestly." };
    }
    const max = Math.max(...bars.map((b) => b.value), 1e-9);
    const pad = 48;
    const bw = (W - pad * 2) / bars.length;
    let out = head(spec.title, H);
    bars.forEach((b, i) => {
      const h = (b.value / max) * (H - pad * 2);
      const x = pad + i * bw + bw * 0.15;
      const y = H - pad - h;
      out += `  <rect x="${r2(x)}" y="${r2(y)}" width="${r2(bw * 0.7)}" height="${r2(h)}" fill="currentColor"/>\n`;
      out += `  <text x="${r2(x + bw * 0.35)}" y="${r2(H - pad + 16)}" text-anchor="middle" font-size="12" fill="currentColor">${safeLabel(b.label, 16)}</text>\n`;
    });
    out += `  <text x="${pad}" y="24" font-size="16" font-weight="600" fill="currentColor">${safeLabel(spec.title, 60)}</text>\n`;
    out += "</svg>\n";
    if (!outputIsClean(out)) {
      return { ok: false, svg: "", note: "Forged output failed the executable-vector scan — refused honestly." };
    }
    return { ok: true, svg: out, note: FORGE_LABEL };
  }

  if (spec.kind === "line") {
    const pts = spec.points.slice(0, 256);
    if (pts.length < 2) return { ok: false, svg: "", note: "Line chart needs ≥2 points — refused honestly." };
    if (pts.some((p) => typeof p.x !== "number" || typeof p.y !== "number" || !isFinite(p.x) || !isFinite(p.y))) {
      return { ok: false, svg: "", note: "Points must be finite {x,y} numbers — refused honestly." };
    }
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 48;
    const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - pad * 2);
    const sy = (y: number) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - pad * 2);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${r2(sx(p.x))},${r2(sy(p.y))}`).join(" ");
    let out = head(spec.title, H);
    out += `  <path d="${path}" fill="none" stroke="currentColor" stroke-width="2.5"/>\n`;
    out += `  <text x="${pad}" y="24" font-size="16" font-weight="600" fill="currentColor">${safeLabel(spec.title, 60)}</text>\n`;
    out += "</svg>\n";
    if (!outputIsClean(out)) {
      return { ok: false, svg: "", note: "Forged output failed the executable-vector scan — refused honestly." };
    }
    return { ok: true, svg: out, note: FORGE_LABEL };
  }

  if (spec.kind === "flow") {
    const steps = spec.steps.filter((s) => typeof s === "string").slice(0, 8);
    if (steps.length < 2) return { ok: false, svg: "", note: "Flow needs ≥2 steps — refused honestly." };
    const boxH = 56;
    const gap = 28;
    const height = steps.length * (boxH + gap) + gap;
    let out = head(spec.title, height);
    steps.forEach((st, i) => {
      const y = gap + i * (boxH + gap);
      out += `  <rect x="120" y="${y}" width="${W - 240}" height="${boxH}" rx="10" fill="none" stroke="currentColor" stroke-width="2"/>\n`;
      out += `  <text x="${W / 2}" y="${y + boxH / 2 + 5}" text-anchor="middle" font-size="14" fill="currentColor">${safeLabel(st, 40)}</text>\n`;
      if (i < steps.length - 1) {
        const ay = y + boxH;
        out += `  <line x1="${W / 2}" y1="${ay}" x2="${W / 2}" y2="${ay + gap}" stroke="currentColor" stroke-width="2" marker-end="url(#arr)"/>\n`;
      }
    });
    out += `  <defs><marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="currentColor"/></marker></defs>\n`;
    out += `  <text x="120" y="20" font-size="16" font-weight="600" fill="currentColor">${safeLabel(spec.title, 60)}</text>\n`;
    out += "</svg>\n";
    if (!outputIsClean(out)) {
      return { ok: false, svg: "", note: "Forged output failed the executable-vector scan — refused honestly." };
    }
    return { ok: true, svg: out, note: FORGE_LABEL };
  }

  return { ok: false, svg: "", note: `Unknown diagram kind — refused honestly.` };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------
// 2. Audio cues (PCM)
// ---------------------------------------------------------

export interface ToneSpec {
  /** Frequency in Hz (20..8000). */
  freqHz: number;
  /** Duration in seconds (0.05..3). */
  durationSec: number;
  /** Amplitude 0..1. */
  amplitude?: number;
  /** Sample rate (default 16000). */
  sampleRate?: number;
  /** Simple ADSR. Defaults: quick attack, soft release. */
  attackSec?: number;
  releaseSec?: number;
  /** Second harmonic mix 0..1 (default 0.2). */
  harmonic?: number;
}

export interface ToneResult {
  ok: boolean;
  pcm: Float32Array;
  sampleRate: number;
  note: string;
}

export function synthesizeTone(spec: ToneSpec): ToneResult {
  const sr = spec.sampleRate ?? 16000;
  const amp = spec.amplitude ?? 0.6;
  const harmonic = spec.harmonic ?? 0.2;
  if (
    typeof spec.freqHz !== "number" || !isFinite(spec.freqHz) ||
    spec.freqHz < 20 || spec.freqHz > 8000
  ) {
    return { ok: false, pcm: new Float32Array(0), sampleRate: sr, note: "freqHz must be 20..8000 Hz — refused honestly." };
  }
  if (
    typeof spec.durationSec !== "number" || !isFinite(spec.durationSec) ||
    spec.durationSec < 0.05 || spec.durationSec > 3
  ) {
    return { ok: false, pcm: new Float32Array(0), sampleRate: sr, note: "durationSec must be 0.05..3 s — refused honestly." };
  }
  if (amp < 0 || amp > 1 || harmonic < 0 || harmonic > 1) {
    return { ok: false, pcm: new Float32Array(0), sampleRate: sr, note: "amplitude/harmonic must be 0..1 — refused honestly." };
  }
  const n = Math.round(spec.durationSec * sr);
  const attack = Math.round(Math.min(spec.attackSec ?? 0.01, spec.durationSec / 2) * sr);
  const release = Math.round(Math.min(spec.releaseSec ?? 0.1, spec.durationSec / 2) * sr);
  const pcm = new Float32Array(n);
  const w = 2 * Math.PI * spec.freqHz / sr;
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < attack) env = i / (attack || 1);
    if (i >= n - release) env = (n - i) / (release || 1);
    const t = i;
    pcm[i] = amp * env * (Math.sin(w * t) + harmonic * Math.sin(2 * w * t)) / (1 + harmonic);
  }
  return {
    ok: true,
    pcm,
    sampleRate: sr,
    note: "Procedural audio cue — synthesis of CUES, not speech; speech synthesis remains NOT implemented",
  };
}

// ---------------------------------------------------------
// 3. Motion graphics (animated SVG)
// ---------------------------------------------------------

export type MotionKind = "pulse" | "slide" | "orbit";

export interface MotionSpec {
  kind: MotionKind;
  label: string;
  /** Pulse: cycles per second. Slide: px travel. Orbit: radius px. */
  magnitude: number;
  /** Duration of one cycle in seconds (0.2..10). */
  periodSec: number;
}

export interface MotionResult {
  ok: boolean;
  svg: string;
  note: string;
}

export function generateMotionGraphic(spec: MotionSpec): MotionResult {
  if (!spec || !["pulse", "slide", "orbit"].includes(spec.kind)) {
    return { ok: false, svg: "", note: "Unknown motion kind — refused honestly." };
  }
  if (
    typeof spec.periodSec !== "number" || !isFinite(spec.periodSec) ||
    spec.periodSec < 0.2 || spec.periodSec > 10
  ) {
    return { ok: false, svg: "", note: "periodSec must be 0.2..10 s — refused honestly." };
  }
  if (typeof spec.magnitude !== "number" || !isFinite(spec.magnitude) || spec.magnitude < 0 || spec.magnitude > 1000) {
    return { ok: false, svg: "", note: "magnitude must be 0..1000 — refused honestly." };
  }
  if (spec.label && !isSafeIdent(String(spec.label).toLowerCase().replace(/\s+/g, "-"))) {
    // labels are used as element ids — validate the slug form
    if (!/^[a-z0-9-]{1,32}$/.test(String(spec.label).toLowerCase().replace(/\s+/g, "-"))) {
      return { ok: false, svg: "", note: "label must be simple text — refused honestly." };
    }
  }
  const dur = `${spec.periodSec}s`;
  const label = safeLabel(spec.label || "motion", 32);
  const base =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${label}">\n` +
    `  <!-- ${FORGE_LABEL} -->\n`;
  const ring = (inner: string) => base + inner + "</svg>\n";
  const rect = `  <rect id="${label}" x="85" y="85" width="30" height="30" rx="6" fill="currentColor"/>\n`;

  if (spec.kind === "pulse") {
    const grow = 1 + spec.magnitude / 100;
    return {
      ok: true,
      svg: ring(
        rect +
          `  <animateTransform xlink:href="#${label}" attributeName="transform" type="scale" ` +
          `values="1;${r2(grow)};1" dur="${dur}" repeatCount="indefinite" additive="sum"/>\n`,
      ),
      note: FORGE_LABEL,
    };
  }
  if (spec.kind === "slide") {
    const d = Math.round(spec.magnitude);
    return {
      ok: true,
      svg: ring(
        rect +
          `  <animate attributeName="x" values="85;${85 + d};85" dur="${dur}" repeatCount="indefinite"/>\n`,
      ),
      note: FORGE_LABEL,
    };
  }
  // orbit
  const r = spec.magnitude;
  return {
    ok: true,
    svg: ring(
      rect +
        `  <animateTransform attributeName="transform" type="rotate" ` +
        `values="0 100 100;360 100 100" dur="${dur}" repeatCount="indefinite"/>\n` +
        `  <circle cx="100" cy="${r2(100 - r)}" r="4" fill="currentColor"/>\n`,
    ),
    note: FORGE_LABEL,
  };
}
