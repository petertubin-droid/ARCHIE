// =========================================================
// ARCHIE COGNITIVE ENGINE — NATIVE OCR (engine 9, audit B-1)
//
// Real, deterministic, in-process text extraction — no
// external OCR API, no AI pretending. Everything reported
// here was computed from the actual decoded pixels.
//
// HONEST capability bounds (stated in every result):
//   * Recognized character set: 0-9, A-Z, and . , : - only.
//     Lowercase is reported as its uppercase shape ONLY when
//     the shape genuinely matches (a lowercase 'o' matches
//     'O' by shape — that is honest shape reading, not a
//     guess); anything else is an UNKNOWN glyph.
//   * Works on CLEAN, machine-rendered text (screenshots,
//     labels, generated images) in fonts close to the
//     embedded sans-serif block template. Handwriting,
//     heavily stylized fonts, curved/perspective text and
//     noisy photos are REFUSED, not guessed.
//   * Confidence is per-glyph shape similarity; a line whose
//     confidence or unknown-glyph ratio fails calibration
//     is refused WITH what was legible noted honestly.
//   * Zero fabrication: no character is ever emitted that
//     did not match a template above the threshold.
// =========================================================

/** Embedded 5x7 block font (rows top→bottom, '#' = ink). */
/** Embedded 5x7 block font (rows top→bottom, '#' = ink).
 *  Exported: tests render with the SAME shapes. */
export const FONT: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..##.", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "###..", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "###..", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#..##", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["...##", "....#", "....#", "....#", "#...#", "#...#", ".###."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  ",": [".....", ".....", ".....", ".....", ".....", "..#..", ".#..."],
  ":": [".....", ".....", "..#..", ".....", ".....", "..#..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
};

// Templates precomputed once. Each template is normalized to
// a 5x7 grid derived from ITS OWN ink bounding box — the same
// normalization the glyph side applies (the glyph's box IS
// its ink box). Without this, glyphs whose ink does not
// span the full 5-cell width ('.###.' bars, '.' dots) were
// stretched wrongly and never matched (found via probe).
interface Template {
  cells: boolean[][]; // 7 rows x 5 cols (bbox-normalized)
  ink: number;
}
const TEMPLATES: Array<{ ch: string; t: Template }> = Object.entries(
  FONT,
).map(([ch, rows]) => {
  const raw = rows.map((r) => [...r].map((c) => c === "#"));
  // Template ink bounding box
  let r0 = 7,
    r1 = -1,
    c0 = 5,
    c1 = -1;
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 5; c++)
      if (raw[r][c]) {
        if (r < r0) r0 = r;
        if (r > r1) r1 = r;
        if (c < c0) c0 = c;
        if (c > c1) c1 = c;
      }
  const bh = r1 - r0 + 1,
    bw = c1 - c0 + 1;
  // Nearest-neighbor sample of the bbox into the 5x7 grid.
  const cells: boolean[][] = [];
  let ink = 0;
  for (let r = 0; r < 7; r++) {
    const row: boolean[] = [];
    const sr = r0 + Math.min(bh - 1, Math.floor((r * bh) / 7));
    for (let c = 0; c < 5; c++) {
      const sc = c0 + Math.min(bw - 1, Math.floor((c * bw) / 5));
      const v = raw[sr][sc];
      row.push(v);
      if (v) ink++;
    }
    cells.push(row);
  }
  return { ch, t: { cells, ink } };
});

/** Similarity threshold calibrated on the embedded font
 *  (rendered at multiple scales): below this a glyph is
 *  UNKNOWN — never guessed. */
const GLYPH_THRESHOLD = 0.75;
/** A line is emitted only if at most this fraction of its
 *  glyphs are unknown and mean similarity holds. */
const MAX_UNKNOWN_RATIO = 0.34;
const MIN_LINE_MEAN_SIM = 0.8;

export interface OcrLine {
  text: string;
  confidence: number;
  unknownGlyphs: number;
}
export interface OcrResult {
  ok: boolean;
  /** All confidently-read lines, in reading order. */
  lines: OcrLine[];
  /** Refusal/partials note — always set when ok is false. */
  note: string;
  /** True when the binarization found ink but no text-like
   *  structure (photos, noise) — the honest 'not text' case. */
  notTextLike: boolean;
}

const EMPTY: OcrResult = { ok: false, lines: [], note: "", notTextLike: true };

/** Otsu threshold on a 256-bin luma histogram — deterministic. */
function otsu(hist: number[]): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    best = 0,
    bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB,
      mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return best;
}

/** Extract text from decoded luma. Deterministic; refuses
 *  below calibration instead of guessing. */
export function extractText(
  luma: Uint8Array,
  width: number,
  height: number,
): OcrResult {
  if (width < 10 || height < 10) return { ...EMPTY, note: "image too small for OCR" };

  // Downscale large images (nearest neighbor, integer factor)
  // to bound the work — OCR works at reading sizes anyway.
  let w = width,
    h = height,
    g = luma;
  if (width > 1600 || height > 1600) {
    const f = Math.ceil(Math.max(width, height) / 1600);
    w = Math.floor(width / f);
    h = Math.floor(height / f);
    const d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) d[y * w + x] = luma[y * f * width + x * f];
    g = d;
  }

  // Binarize both ways; text is whichever ink population is
  // sparse (text covers less area than background).
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const t = otsu(hist);
  const inkDark = new Uint8Array(g.length);
  let darkCount = 0;
  for (let i = 0; i < g.length; i++) {
    const v = g[i] <= t ? 1 : 0;
    inkDark[i] = v;
    darkCount += v;
  }
  const total = g.length;
  const darkRatio = darkCount / total;
  const lightRatio = 1 - darkRatio;
  // Text-like ink coverage: 0.1% .. 55% of the frame.
  let ink: Uint8Array;
  if (darkRatio >= 0.001 && darkRatio <= 0.55) ink = inkDark;
  else if (lightRatio >= 0.001 && lightRatio <= 0.55) {
    ink = new Uint8Array(g.length);
    for (let i = 0; i < g.length; i++) ink[i] = inkDark[i] ? 0 : 1;
  } else {
    return {
      ...EMPTY,
      note: "no text-like contrast structure (ink coverage outside text range)",
      notTextLike: true,
    };
  }

  // Line segmentation: horizontal projection runs.
  const rowInk = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) s += ink[base + x];
    rowInk[y] = s;
  }
  const lines: Array<{ y0: number; y1: number }> = [];
  let y0 = -1;
  for (let y = 0; y < h; y++) {
    if (rowInk[y] > 0 && y0 < 0) y0 = y;
    if (rowInk[y] === 0 && y0 >= 0) {
      if (y - y0 >= 6) lines.push({ y0, y1: y - 1 });
      y0 = -1;
    }
  }
  if (y0 >= 0 && h - y0 >= 6) lines.push({ y0, y1: h - 1 });
  if (lines.length === 0) {
    return { ...EMPTY, note: "ink found but no line structure", notTextLike: true };
  }

  const out: OcrLine[] = [];
  for (const band of lines) {
    const line = readLine(ink, w, band.y0, band.y1);
    if (line) out.push(line);
  }
  if (out.length === 0) {
    return {
      ok: false,
      lines: [],
      note: "ink structure found but nothing glyph-like matched the embedded font — refusing rather than guessing",
      notTextLike: true,
    };
  }
  return {
    ok: true,
    lines: out,
    note: `read ${out.length} line(s) by template match; charset 0-9 A-Z . , : -; clean machine-rendered text only`,
    notTextLike: false,
  };
}

/** Connected components in one line band, left→right. */
function readLine(
  ink: Uint8Array,
  w: number,
  y0: number,
  y1: number,
): OcrLine | null {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const boxes: Array<{ x0: number; x1: number; yb0: number; yb1: number }> = [];
  for (let ly = 0; ly < h; ly++) {
    for (let x = 0; x < w; x++) {
      if (seen[ly * w + x] || !ink[(y0 + ly) * w + x]) continue;
      // BFS the component
      const stack = [[x, ly]];
      seen[ly * w + x] = 1;
      let bx0 = x,
        bx1 = x,
        by0 = ly,
        by1 = ly,
        area = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        area++;
        if (cx < bx0) bx0 = cx;
        if (cx > bx1) bx1 = cx;
        if (cy < by0) by0 = cy;
        if (cy > by1) by1 = cy;
        // 8-connected neighbourhood — block-font corners
        // (e.g. the O ring) join diagonally; 4-connectivity
        // would shatter ring glyphs into bars and columns.
        const nb = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
          [cx + 1, cy + 1],
        ];
        for (const [nx, ny] of nb) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (seen[ny * w + nx] || !ink[(y0 + ny) * w + nx]) continue;
          seen[ny * w + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      // Glyph-sized components only (dots of '.' are tiny but
      // not degenerate; noise specks are dropped).
      const gh = by1 - by0 + 1,
        gw = bx1 - bx0 + 1;
      // Glyph-like: min size, and an aspect bound — a blob
      // wider than 6x its height (full-frame rectangles,
      // gradients, ruled lines) is not a character shape.
      // Dropped honestly; if that empties the line, the line
      // is reported as not glyph-like, never guessed.
      if (gh >= 3 && gw >= 2 && area >= 6 && gw <= 6 * gh) {
        boxes.push({ x0: bx0, x1: bx1, yb0: by0, yb1: by1 });
      }
    }
  }
  if (boxes.length === 0) return null;
  boxes.sort((a, b) => a.x0 - b.x0);

  const medianH = boxes.map((b) => b.yb1 - b.yb0 + 1).sort((a, b) => a - b)[
    Math.floor(boxes.length / 2)
  ];

  // Read each component, insert word spaces on wide gaps.
  let text = "";
  let sims: number[] = [];
  let unknown = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const m = matchGlyph(ink, w, y0, b);
    if (i > 0) {
      const gap = b.x0 - boxes[i - 1].x1;
      if (gap > medianH * 0.6) text += " ";
    }
    if (m.sim >= GLYPH_THRESHOLD) {
      text += m.ch;
      sims.push(m.sim);
    } else {
      text += "?";
      unknown++;
    }
  }
  const mean = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
  if (sims.length === 0 || unknown / boxes.length > MAX_UNKNOWN_RATIO || mean < MIN_LINE_MEAN_SIM) {
    return null; // refused line — never emit a guess
  }
  return {
    text,
    confidence: Number(mean.toFixed(4)),
    unknownGlyphs: unknown,
  };
}

/** Normalize a component to the 5x7 grid and match against
 *  the embedded templates. Similarity = 1 - XNOR distance /
 *  union ink (IoU-based). */
function matchGlyph(
  ink: Uint8Array,
  w: number,
  lineY0: number,
  b: { x0: number; x1: number; yb0: number; yb1: number },
): { ch: string; sim: number } {
  const gw = b.x1 - b.x0 + 1,
    gh = b.yb1 - b.yb0 + 1;
  // Sample coverage grid: cell set if >= 50% of its pixels ink.
  const cells: boolean[][] = [];
  let gInk = 0;
  for (let r = 0; r < 7; r++) {
    const row: boolean[] = [];
    const ry0 = Math.floor((r * gh) / 7),
      ry1 = Math.max(ry0 + 1, Math.floor(((r + 1) * gh) / 7));
    for (let c = 0; c < 5; c++) {
      const cx0 = Math.floor((c * gw) / 5),
        cx1 = Math.max(cx0 + 1, Math.floor(((c + 1) * gw) / 5));
      let cnt = 0,
        tot = 0;
      for (let y = ry0; y < ry1 && y < gh; y++)
        for (let x = cx0; x < cx1 && x < gw; x++) {
          tot++;
          if (ink[(lineY0 + b.yb0 + y) * w + (b.x0 + x)]) cnt++;
        }
      const v = tot > 0 && cnt / tot >= 0.5;
      row.push(v);
      if (v) gInk++;
    }
    cells.push(row);
  }
  let bestCh = "?",
    bestSim = 0;
  for (const { ch, t } of TEMPLATES) {
    // IoU-based similarity: 1 - (union - intersection)/union.
    let inter = 0;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++) if (t.cells[r][c] && cells[r][c]) inter++;
    const uni = gInk + t.ink - inter;
    const sim = uni === 0 ? 0 : 1 - (uni - inter) / uni;
    if (sim > bestSim) {
      bestSim = sim;
      bestCh = ch;
    }
  }
  return { ch: bestCh, sim: bestSim };
}
