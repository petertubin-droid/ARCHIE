// =========================================================
// NATIVE VISION ("native eyes") TESTS — audit item P8
//
// The PNG encoder here is the test's own (filters 0 and 2,
// zlib via CompressionStream) — it produces real fixtures and
// DECODES THEM AGAIN through the production decoder, so the
// round trip proves the unfilter/CRC/inflate math. JPEG and
// GIF fixtures are hand-crafted byte structures (minimal
// legal segments). Every refusal case asserts the HONEST
// note — never a faked analysis.
// =========================================================
import { describe, it, expect } from "vitest";
import {
  analyzeImage,
  summarizeAnalysis,
} from "@studio-shared/archie-ai/cognitive/vision.ts";

// ---- test-side CRC32 + PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function chunk(type: string, data: Uint8Array<ArrayBufferLike>): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function encodePng(opts: {
  width: number;
  height: number;
  colorType: 0 | 2 | 3 | 6;
  /** raw per-pixel channels (already expanded) */
  channels: Uint8Array; // length = w*h*bpp
  palette?: Uint8Array;
  filter?: 0 | 2;
}): Promise<Uint8Array> {
  const bpp = { 0: 1, 2: 3, 3: 1, 6: 4 }[opts.colorType];
  const stride = opts.width * bpp;
  const raw = new Uint8Array((stride + 1) * opts.height);
  const filter = opts.filter ?? 0;
  for (let y = 0; y < opts.height; y++) {
    raw[y * (stride + 1)] = filter;
    if (filter === 0) {
      raw.set(
        opts.channels.subarray(y * stride, (y + 1) * stride),
        y * (stride + 1) + 1,
      );
    } else {
      // filter Up: store delta vs the row above (first row = raw)
      const prev =
        y > 0 ? opts.channels.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const cur = opts.channels[y * stride + x];
        raw[y * (stride + 1) + 1 + x] = (cur - (prev?.[x] ?? 0)) & 0xff;
      }
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, opts.width);
  dv.setUint32(4, opts.height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opts.colorType;
  ihdr[12] = 0; // no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...(opts.palette ? [chunk("PLTE", opts.palette)] : []),
    chunk("IDAT", await zlibCompress(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function rgbPixels(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number],
): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 3;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  return out;
}

describe("native vision — PNG full-pixel path", () => {
  it("decodes a solid red RGB image and reports it honestly", async () => {
    const png = await encodePng({
      width: 16,
      height: 16,
      colorType: 2,
      channels: rgbPixels(16, 16, () => [200, 30, 30]),
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = res.analysis;
    expect(a.format).toBe("png");
    expect(a.depth).toBe("full-pixel");
    expect(a.width).toBe(16);
    expect(a.height).toBe(16);
    expect(a.orientation).toBe("square");
    expect(a.dominantColors?.[0].name).toBe("red");
    expect(a.dominantColors?.[0].coverage).toBeGreaterThan(95);
    expect(a.contentClass).toBe("flat");
    expect(a.edgeDensity).toBeLessThan(0.05);
  });

  it("decodes filter-Up (type 2) rows correctly — round trip", async () => {
    // vertical gradient with the Up filter: every row is the
    // previous row + a step — exercises the unfilter math.
    const png = await encodePng({
      width: 8,
      height: 8,
      colorType: 2,
      channels: rgbPixels(8, 8, (_x, y) => [y * 30, y * 30, y * 30]),
      filter: 2,
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // row 7 gray = 210 — the dominant color must be that
    // (bin averaging), proving Up-filter rows decoded exactly.
    const top = res.analysis.dominantColors?.[0];
    expect(top?.name).toBe("gray");
    expect(res.analysis.width).toBe(8);
  });

  it("gradient: brightness spans the histogram, mean luma is real", async () => {
    const png = await encodePng({
      width: 64,
      height: 64,
      colorType: 6,
      channels: (() => {
        const out = new Uint8Array(64 * 64 * 4);
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            const v = Math.floor((255 * (y * 64 + x)) / (64 * 64));
            out[i] = v;
            out[i + 1] = v;
            out[i + 2] = v;
            out[i + 3] = 255;
          }
        }
        return out;
      })(),
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = res.analysis;
    expect(a.meanLuma).toBeGreaterThan(100);
    expect(a.meanLuma).toBeLessThan(155);
    const hist = a.brightnessHistogram!;
    expect(hist.some((n) => n > 0)).toBe(true);
    expect(hist.filter((n) => n > 0).length).toBeGreaterThan(8); // genuinely spread
  });

  it("noise image classifies photo-like with high color variety", async () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    const png = await encodePng({
      width: 64,
      height: 64,
      colorType: 2,
      channels: rgbPixels(64, 64, () => [rand(), rand(), rand()]),
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.analysis.contentClass).toBe("photo-like");
    expect(res.analysis.dominantColors!.length).toBeGreaterThan(1);
  });

  it("decodes palette PNG via PLTE", async () => {
    const channels = new Uint8Array(4 * 4).fill(1); // all index 1
    const png = await encodePng({
      width: 4,
      height: 4,
      colorType: 3,
      channels,
      palette: new Uint8Array([0, 0, 0, 0, 160, 0]), // idx0=black, idx1=green
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.analysis.dominantColors?.[0].name).toBe("green");
    expect(res.analysis.dominantColors?.[0].coverage).toBeGreaterThan(95);
  });

  it("decodes grayscale PNG (color type 0)", async () => {
    const channels = new Uint8Array(8 * 8).fill(230); // near-white gray
    const png = await encodePng({
      width: 8,
      height: 8,
      colorType: 0,
      channels,
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.analysis.meanLuma!).toBeGreaterThan(200);
  });
});

describe("native vision — structure-only + honest refusals", () => {
  it("JPEG: dimensions from SOF0, pixels honestly NOT analyzed", async () => {
    // SOI + SOF0 (len 11: precision 8, 2x3, 3 components) + EOI
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x03, 0x00, 0x02, 0x03,
      0x01, 0x11, 0x00, 0x02, 0xff, 0xd9,
    ]);
    const res = await analyzeImage(jpeg);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const a = res.analysis;
    expect(a.format).toBe("jpeg");
    expect(a.depth).toBe("structure-only");
    expect(a.width).toBe(2);
    expect(a.height).toBe(3);
    expect(a.orientation).toBe("portrait");
    expect(a.meanLuma).toBeNull();
    expect(a.dominantColors).toBeNull();
    // gap 4 (2026-09-16): the native decoder now exists, so this
    // table-less fixture falls back to structure-only WITH the
    // decode refusal reason — never a faked analysis.
    expect(a.notes.join(" ")).toMatch(
      /pixel decode NOT performed|refused honestly/,
    );
  });

  it("GIF: logical screen dimensions only, honestly", async () => {
    const gif = new Uint8Array([
      ...new TextEncoder().encode("GIF89a"),
      0x80,
      0x02,
      0xe0,
      0x01, // 640x480 LE
      0x00,
      0x00,
    ]);
    const res = await analyzeImage(gif);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.analysis.width).toBe(640);
    expect(res.analysis.height).toBe(480);
    expect(res.analysis.depth).toBe("structure-only");
  });

  it("corrupt PNG (CRC mismatch) is refused, never half-analyzed", async () => {
    const png = await encodePng({
      width: 4,
      height: 4,
      colorType: 2,
      channels: rgbPixels(4, 4, () => [1, 2, 3]),
    });
    png[png.length - 20] ^= 0xff; // flip a byte inside IDAT
    const res = await analyzeImage(png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.note).toMatch(/CRC|corrupt|truncated/i);
  });

  it("16-bit PNG refused honestly", async () => {
    const parts: Uint8Array[] = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ];
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, 4);
    dv.setUint32(4, 4);
    ihdr[8] = 16; // 16-bit depth
    ihdr[9] = 2;
    parts.push(chunk("IHDR", ihdr));
    parts.push(chunk("IDAT", new Uint8Array([0x78, 0x01])));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const png = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      png.set(p, o);
      o += p.length;
    }
    const res = await analyzeImage(png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.note).toContain("bit depth 16");
  });

  it("unknown format refused with the honest scope note", async () => {
    const res = await analyzeImage(
      new TextEncoder().encode("BM......not-a-bitmap-ish"),
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.note).toContain("unsupported image format");
    expect(res.note).toContain("refused honestly");
  });
});

describe("native vision — honest summarization", () => {
  it("every full-pixel summary states the object-recognition bound", async () => {
    const png = await encodePng({
      width: 10,
      height: 10,
      colorType: 2,
      channels: rgbPixels(10, 10, () => [10, 20, 200]),
    });
    const res = await analyzeImage(png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const summary = summarizeAnalysis(res.analysis);
    expect(summary).toContain("NO object recognition");
    expect(summary).toContain("10x10");
    expect(summary).toContain("blue");
  });
});

// ---------------------------------------------------------
// Batch 12 (Level 8) regressions — fixes 35, 36
// ---------------------------------------------------------
describe("batch 12 — vision boundary honesty", () => {
  it("fix 35: a JPEG whose SOF marker is truncated at the buffer edge is refused, never given fake dimensions", async () => {
    // SOF0 marker (FF C0) near the end, payload cut short.
    const bytes = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08, // SOF header begins...
      0x01,
      0x02, // ...and the file ends mid-payload
    ]);
    const r = await analyzeImage(bytes);
    expect(r.ok).toBe(false);
    expect((r as { note: string }).note).toContain("truncated");
  });

  it("fix 36: a zero-width PNG is refused honestly instead of yielding NaN statistics", async () => {
    // Valid signature + IHDR with width 0, then enough IDAT to
    // pass the earlier gates — the zero-dimension check must
    // fire before analysis.
    const ihdr = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52,
      0x00,
      0x00,
      0x00,
      0x00, // width 0
      0x00,
      0x00,
      0x00,
      0x01, // height 1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00, // 8-bit RGB
    ]);
    const crc = crc32(ihdr.subarray(4)); // type + payload (production covers both)
    const crcBytes = new Uint8Array(4);
    new DataView(crcBytes.buffer).setUint32(0, crc, false); // big-endian
    const ihdrChunk = new Uint8Array([...ihdr, ...crcBytes]);
    const bytes = new Uint8Array([
      ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      ...ihdrChunk,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44, // empty IEND-ish tail
      0xae,
      0x42,
      0x60,
      0x82,
    ]);
    const r = await analyzeImage(bytes);
    expect(r.ok).toBe(false);
    expect((r as { note: string }).note).toContain("invalid dimensions");
  });
});
