// =========================================================
// ARCHIE OCR (engine 9, audit B-1) — TESTS
// Renders synthetic images from the SAME embedded font the
// recognizer uses (so the pipeline is exercised end-to-end:
// binarize → lines → components → matching), plus honest
// refusals on non-text images and stylized shapes.
// =========================================================

import { describe, expect, it } from "vitest";
import { extractText, type OcrResult } from "./ocr.ts";
import { FONT } from "./ocr.ts";

/** Render a string into a luma image using the embedded
 *  5x7 font at the given scale, letter/word spacing. */
function render(
  text: string,
  opts: { scale?: number; letter?: number; word?: number } = {},
): { luma: Uint8Array; w: number; h: number } {
  const scale = opts.scale ?? 4;
  const letter = opts.letter ?? 6; // px between glyphs
  const word = opts.word ?? 14; // px between words
  const rows = 7 * scale;
  // measure
  let w = 8; // left padding
  for (const ch of text) {
    w += 5 * scale + (ch === " " ? word : letter);
  }
  // Right padding: the LAST glyph needs its full width plus
  // room — without this the final advance overflowed and
  // wrapped into the next row (found via component debug).
  w += 5 * scale + 8;
  w = Math.max(10, w);
  const h = rows + 20; // padding
  const luma = new Uint8Array(w * h).fill(240); // light bg
  let x = 8;
  for (const ch of text) {
    if (ch === " ") {
      x += word;
      continue;
    }
    const glyph = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (glyph[r][c] === "#")
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++)
              luma[(10 + r * scale + dy) * w + (x + c * scale + dx)] = 20;
    x += 5 * scale + letter;
  }
  return { luma, w, h };
}

describe("ocr — clean rendered text", () => {
  it("reads a simple uppercase line", () => {
    const img = render("HELLO");
    const r = extractText(img.luma, img.w, img.h);
    expect(r.ok).toBe(true);
    expect(r.lines[0].text).toBe("HELLO");
    expect(r.lines[0].confidence).toBeGreaterThan(0.8);
  });

  it("reads digits and punctuation, keeps word gaps", () => {
    const img = render("ORDER 42");
    const r = extractText(img.luma, img.w, img.h);
    expect(r.ok).toBe(true);
    expect(r.lines[0].text).toBe("ORDER 42");
  });

  it("reads multiple lines in order", () => {
    // Compose two rendered lines onto one canvas, keeping
    // each line's own row geometry (row-wise copy, no wrap).
    const a = render("TOP LINE");
    const b = render("LINE 2");
    const w = Math.max(a.w, b.w) + 4;
    const gap = 8;
    const h = a.h + gap + b.h;
    const luma = new Uint8Array(w * h).fill(240);
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++)
        luma[y * w + x] = a.luma[y * a.w + x];
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++)
        luma[(a.h + gap + y) * w + x] = b.luma[y * b.w + x];
    const r = extractText(luma, w, h);
    expect(r.ok).toBe(true);
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].text).toBe("TOP LINE");
    expect(r.lines[1].text).toBe("LINE 2");
  });

  it("works at a different scale (scale robustness)", () => {
    const img = render("BAG 7", { scale: 2, letter: 3, word: 7 });
    const r = extractText(img.luma, img.w, img.h);
    expect(r.ok).toBe(true);
    expect(r.lines[0].text).toBe("BAG 7");
  });
});

describe("ocr — honest refusals", () => {
  it("refuses a photo-like smooth gradient (no text structure)", () => {
    const w = 200,
      h = 100;
    const luma = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) luma[y * w + x] = Math.min(255, (x + y) / 2);
    const r = extractText(luma, w, h);
    expect(r.ok).toBe(false);
    expect(r.notTextLike).toBe(true);
  });

  it("refuses random noise instead of guessing", () => {
    const w = 300,
      h = 150;
    const luma = new Uint8Array(w * h);
    let seed = 12345;
    for (let i = 0; i < luma.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      luma[i] = (seed >> 16) & 0xff;
    }
    const r = extractText(luma, w, h);
    expect(r.ok).toBe(false);
    expect(r.lines).toHaveLength(0);
  });

  it("refuses ink blobs that match no template", () => {
    // A large filled rectangle row: real ink, line structure,
    // but nothing glyph-like — must refuse, not guess.
    const w = 160,
      h = 60;
    const luma = new Uint8Array(w * h).fill(240);
    for (let y = 20; y < 30; y++) for (let x = 20; x < 140; x++) luma[y * w + x] = 20;
    const r = extractText(luma, w, h);
    expect(r.ok).toBe(false);
    expect(r.notTextLike).toBe(true); // aspect cap: a 120x10 slab is not a glyph
    expect(r.note).toContain("refusing rather than guessing");
  });

  it("empty image refused", () => {
    const r = extractText(new Uint8Array(100 * 100).fill(250), 100, 100);
    expect(r.ok).toBe(false);
    expect(r.notTextLike).toBe(true);
  });
});

describe("ocr — determinism", () => {
  it("same input → identical result object", () => {
    const img = render("SAME 9");
    const a: OcrResult = extractText(img.luma, img.w, img.h);
    const b: OcrResult = extractText(img.luma.slice(), img.w, img.h);
    expect(a).toEqual(b);
  });
});
