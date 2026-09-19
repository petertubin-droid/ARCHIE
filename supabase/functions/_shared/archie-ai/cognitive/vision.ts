// =========================================================
// ARCHIE COGNITIVE ENGINE — NATIVE VISION ("native eyes")
// supabase/functions/_shared/archie-ai/cognitive/vision.ts
//
// Real, native, bounded image perception — no external
// vision API, no AI pretending. What this module reports,
// it computed from the actual bytes; what it cannot do
// (OCR, object recognition) is reported in `note` / refused
// — never faked, never guessed.
//
// Capability bounds (honest, gap 4 upgrade 2026-09-16):
//   PNG  — full pixel decode (bit depth 8; gray / RGB /
//          palette / RGBA; no interlace), then deterministic
//          color/brightness/structure analysis.
//   JPEG — NATIVE baseline pixel decode (SOF0/SOF1, 8-bit,
//          1/3 components, 4:4:4–4:1:1, restart intervals):
//          the same deterministic statistics as PNG. What the
//          decoder refuses (progressive SOF2, 12-bit, CMYK)
//          falls back to structure-only with the reason.
//   GIF  — NATIVE first-frame pixel decode (GIF87a/89a,
//          global/local palettes, LZW, interlace): the same
//          deterministic statistics. Multi-frame GIFs analyze
//          frame 1 and say so; refused formats fall back to
//          structure-only with the reason.
//   else — refused honestly.
// =========================================================

// ---------- CRC32 (PNG chunk integrity — verified, not assumed) ----------

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

// ---------- inflate (zlib, via the platform's DecompressionStream) ----------

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// ---------- PNG decode ----------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes/pixel. */
  rgba: Uint8Array;
  /** Honest notes collected during decode. */
  notes: string[];
}

function readChunk(
  bytes: Uint8Array,
  offset: number,
): { type: string; data: Uint8Array; next: number } | null {
  if (offset + 8 > bytes.length) return null;
  const len =
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0;
  const type = String.fromCharCode(
    bytes[offset + 4],
    bytes[offset + 5],
    bytes[offset + 6],
    bytes[offset + 7],
  );
  const dataStart = offset + 8;
  if (dataStart + len + 4 > bytes.length) return null;
  const data = bytes.subarray(dataStart, dataStart + len);
  const crcExpected =
    ((bytes[dataStart + len] << 24) |
      (bytes[dataStart + len + 1] << 16) |
      (bytes[dataStart + len + 2] << 8) |
      bytes[dataStart + len + 3]) >>>
    0;
  const crcActual = crc32(bytes.subarray(offset + 4, dataStart + len));
  if (crcExpected !== crcActual) {
    throw new Error(
      `PNG chunk ${type} failed CRC check — corrupt data refused`,
    );
  }
  return { type, data, next: dataStart + len + 4 };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function bytesPerPixel(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1; // gray
    case 2:
      return 3; // RGB
    case 3:
      return 1; // palette index
    case 4:
      return 2; // gray+alpha
    case 6:
      return 4; // RGBA
    default:
      return 0;
  }
}

/** Native PNG decode — bit depth 8, color types 0/2/3/4/6, no
 *  interlace. Everything else is refused with an honest note. */
async function decodePng(bytes: Uint8Array): Promise<DecodedImage> {
  for (let i = 0; i < PNG_SIG.length; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("not a PNG (bad signature)");
  }
  let offset = 8;
  let info: PngInfo | null = null;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  const notes: string[] = [];

  while (offset < bytes.length) {
    const chunk = readChunk(bytes, offset);
    if (!chunk) break;
    const d = chunk.data;
    if (chunk.type === "IHDR") {
      info = {
        width: (d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3],
        height: (d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7],
        bitDepth: d[8],
        colorType: d[9],
        interlace: d[12],
      };
    } else if (chunk.type === "IDAT") {
      idat.push(d);
    } else if (chunk.type === "PLTE") {
      palette = d;
    } else if (chunk.type === "tRNS") {
      notes.push(
        "palette transparency (tRNS) noted — alpha ignored in analysis",
      );
    } else if (chunk.type === "IEND") {
      break;
    }
    offset = chunk.next;
  }
  if (!info) throw new Error("PNG missing IHDR — refused");
  // FIX 36 (batch 12): a zero width/height is invalid per
  // the PNG spec — it used to flow into analysis and produce
  // NaN mean-luma / NaN coverage statistics presented as
  // measurements. Refused honestly instead.
  if (info.width <= 0 || info.height <= 0) {
    throw new Error(
      `PNG has invalid dimensions ${info.width}x${info.height} — refused`,
    );
  }
  if (info.bitDepth !== 8) {
    throw new Error(
      `PNG bit depth ${info.bitDepth} not supported natively (depth 8 only) — refused honestly`,
    );
  }
  if (info.interlace !== 0) {
    throw new Error("interlaced PNG not supported natively — refused honestly");
  }
  const bpp = bytesPerPixel(info.colorType);
  if (bpp === 0) {
    throw new Error(
      `PNG color type ${info.colorType} not supported natively — refused honestly`,
    );
  }
  if (info.colorType === 3 && !palette) {
    throw new Error("palette PNG missing PLTE — refused");
  }
  if (idat.length === 0) throw new Error("PNG missing IDAT — refused");

  const raw = await inflateZlib(concat(idat));
  const { width, height } = info;
  const stride = width * bpp;
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new Error(
      `PNG pixel data truncated (${raw.length} < ${expected}) — refused`,
    );
  }

  // Unfilter, converting every supported filter type.
  const out = new Uint8Array(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos + x];
      const left = x >= bpp ? out[rowStart + x - bpp] : 0;
      const up = y > 0 ? out[prevStart + x] : 0;
      const ul = y > 0 && x >= bpp ? out[prevStart + x - bpp] : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = cur;
          break;
        case 1:
          v = cur + left;
          break;
        case 2:
          v = cur + up;
          break;
        case 3:
          v = cur + ((left + up) >> 1);
          break;
        case 4:
          v = cur + paeth(left, up, ul);
          break;
        default:
          throw new Error(`unknown PNG filter ${filter} — refused`);
      }
      out[rowStart + x] = v & 0xff;
    }
    pos += stride;
  }

  // Expand to RGBA.
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    switch (info.colorType) {
      case 0: {
        const g = out[p];
        rgba[i] = g;
        rgba[i + 1] = g;
        rgba[i + 2] = g;
        rgba[i + 3] = 255;
        break;
      }
      case 2: {
        const o = p * 3;
        rgba[i] = out[o];
        rgba[i + 1] = out[o + 1];
        rgba[i + 2] = out[o + 2];
        rgba[i + 3] = 255;
        break;
      }
      case 3: {
        const idx = out[p] * 3;
        rgba[i] = palette![idx];
        rgba[i + 1] = palette![idx + 1];
        rgba[i + 2] = palette![idx + 2];
        rgba[i + 3] = 255;
        break;
      }
      case 4: {
        const o = p * 2;
        rgba[i] = out[o];
        rgba[i + 1] = out[o];
        rgba[i + 2] = out[o];
        rgba[i + 3] = out[o + 1];
        break;
      }
      case 6: {
        const o = p * 4;
        rgba[i] = out[o];
        rgba[i + 1] = out[o + 1];
        rgba[i + 2] = out[o + 2];
        rgba[i + 3] = out[o + 3];
        break;
      }
    }
  }
  return { width, height, rgba, notes };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------- JPEG / GIF structural parsing ----------

interface JpegInfo {
  width: number;
  height: number;
  progressive: boolean;
}

function parseJpeg(bytes: Uint8Array): JpegInfo {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("not a JPEG");
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue; // standalone markers
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15 except DHT(C4) DAC(CC) RST restart markers
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      // FIX 35 (batch 12, Level 8 audit 2026-09-13): the SOF
      // payload needs 9 bytes from the marker position. A
      // TRUNCATED file used to read past the buffer — the
      // undefined bytes coerced to 0 and the analysis reported
      // fabricated 0xN dimensions as if parsed. Refused
      // honestly instead.
      if (i + 9 > bytes.length) {
        throw new Error("JPEG SOF marker truncated — refused");
      }
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        progressive: marker === 0xc2,
      };
    }
    i += 2 + len;
  }
  throw new Error("JPEG SOF marker not found — refused");
}

function parseGif(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 10)
    throw new Error("GIF truncated before the screen descriptor — refused");
  const head = new TextDecoder().decode(bytes.subarray(0, 6));
  if (head !== "GIF87a" && head !== "GIF89a") throw new Error("not a GIF");
  return {
    width: bytes[6] | (bytes[7] << 8),
    height: bytes[8] | (bytes[9] << 8),
  };
}

// ---------- native JPEG/GIF pixel decode (gap 4, 2026-09-16) ----------
import { decodeJpeg } from "./jpeg-decode.ts";
import { decodeGif } from "./gif-decode.ts";

// ---------- deterministic analysis ----------

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const COLOR_NAMES: Array<{
  name: string;
  test: (r: number, g: number, b: number) => boolean;
}> = [
  { name: "black", test: (r, g, b) => r + g + b < 90 },
  {
    name: "white",
    test: (r, g, b) =>
      r + g + b > 700 && Math.abs(r - g) < 32 && Math.abs(g - b) < 32,
  },
  {
    name: "gray",
    test: (r, g, b) =>
      Math.abs(r - g) < 24 && Math.abs(g - b) < 24 && r + g + b >= 90,
  },
  { name: "red", test: (r, g, b) => r - Math.max(g, b) > 40 },
  { name: "green", test: (r, g, b) => g - Math.max(r, b) > 40 },
  { name: "blue", test: (r, g, b) => b - Math.max(r, g) > 40 },
  {
    name: "yellow",
    test: (r, g, b) => r > 120 && g > 120 && b < 90 && r - b > 60,
  },
  { name: "cyan", test: (r, g, b) => g > 100 && b > 100 && r < 90 },
  { name: "magenta", test: (r, g, b) => r > 100 && b > 100 && g < 90 },
  {
    name: "orange",
    test: (r, g, b) => r > 150 && g > 60 && g < 140 && b < 80 && r - g > 60,
  },
];

function colorName(r: number, g: number, b: number): string {
  for (const c of COLOR_NAMES) if (c.test(r, g, b)) return c.name;
  return "mixed";
}

export interface ImageAnalysis {
  format: "png" | "jpeg" | "gif";
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  aspectRatio: number;
  /** "full-pixel": real pixel statistics computed.
   *  "structure-only": container metadata only — say so. */
  depth: "full-pixel" | "structure-only";
  meanLuma: number | null;
  brightnessHistogram: number[] | null;
  dominantColors: Array<{ hex: string; name: string; coverage: number }> | null;
  edgeDensity: number | null;
  contentClass: "flat" | "graphics-like" | "photo-like" | null;
  contentConfidence: number | null;
  notes: string[];
  analyzedAt: string;
}

const MAX_PIXELS = 4_000_000; // 4MP — refuse larger, honestly

/** Analyze image bytes natively. Refuses (ok:false) anything
 *  it cannot honestly process; never fabricates a value. */
export async function analyzeImage(
  bytes: Uint8Array,
): Promise<
  { ok: true; analysis: ImageAnalysis } | { ok: false; note: string }
> {
  if (bytes.length < 8) return { ok: false, note: "image too small to parse" };
  if (bytes.length > 20 * 1024 * 1024) {
    return { ok: false, note: "image over 20MB — refused without analysis" };
  }

  // PNG — full pixel path
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    let img: DecodedImage;
    try {
      img = await decodePng(bytes);
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    }
    if (img.width * img.height > MAX_PIXELS) {
      return {
        ok: false,
        note: `PNG is ${img.width}x${img.height} (${((img.width * img.height) / 1e6).toFixed(1)}MP) — over the 4MP native-analysis cap, refused honestly`,
      };
    }
    const analysis = analyzeRgba(img);
    return {
      ok: true,
      analysis: { ...analysis, format: "png", notes: img.notes },
    };
  }

  // JPEG — native baseline pixel decode (gap 4, 2026-09-16);
  // structure-only fallback for everything the decoder
  // refuses (progressive, 12-bit, CMYK…), with the reason.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let j: { width: number; height: number };
    try {
      j = parseJpeg(bytes);
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    }
    if (j.width * j.height > MAX_PIXELS) {
      return {
        ok: false,
        note: `JPEG is ${j.width}x${j.height} (${((j.width * j.height) / 1e6).toFixed(1)}MP) — over the 4MP native-analysis cap, refused honestly`,
      };
    }
    try {
      const img = decodeJpeg(bytes);
      const analysis = analyzeRgba({
        width: img.width,
        height: img.height,
        rgba: img.rgba,
        notes: img.notes,
      });
      return {
        ok: true,
        analysis: { ...analysis, format: "jpeg", notes: img.notes },
      };
    } catch (e) {
      // decode refused honestly → structure-only, with the reason
      return {
        ok: true,
        analysis: {
          format: "jpeg",
          width: j.width,
          height: j.height,
          orientation: orientationOf(j.width, j.height),
          aspectRatio: j.width / j.height,
          depth: "structure-only",
          meanLuma: null,
          brightnessHistogram: null,
          dominantColors: null,
          edgeDensity: null,
          contentClass: null,
          contentConfidence: null,
          notes: [
            `JPEG: dimensions parsed; pixel decode NOT performed — ${(e as Error).message}`,
          ],
          analyzedAt: new Date().toISOString(),
        },
      };
    }
  }

  // GIF — native first-frame pixel decode (gap 4 completion,
  // 2026-09-16); structure-only fallback with the reason for
  // everything the decoder refuses.
  if (bytes[0] === 0x47 && bytes[1] === 0x49) {
    let g: { width: number; height: number };
    try {
      g = parseGif(bytes);
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    }
    if (g.width * g.height > MAX_PIXELS) {
      return {
        ok: false,
        note: `GIF is ${g.width}x${g.height} (${((g.width * g.height) / 1e6).toFixed(1)}MP) — over the 4MP native-analysis cap, refused honestly`,
      };
    }
    try {
      const img = decodeGif(bytes);
      const analysis = analyzeRgba({
        width: img.width,
        height: img.height,
        rgba: img.rgba,
        notes: img.notes,
      });
      return {
        ok: true,
        analysis: { ...analysis, format: "gif", notes: img.notes },
      };
    } catch (e) {
      return {
        ok: true,
        analysis: {
          format: "gif",
          width: g.width,
          height: g.height,
          orientation: orientationOf(g.width, g.height),
          aspectRatio: g.width / g.height,
          depth: "structure-only",
          meanLuma: null,
          brightnessHistogram: null,
          dominantColors: null,
          edgeDensity: null,
          contentClass: null,
          contentConfidence: null,
          notes: [
            `GIF: dimensions parsed; pixel decode NOT performed — ${(e as Error).message}`,
          ],
          analyzedAt: new Date().toISOString(),
        },
      };
    }
  }

  return {
    ok: false,
    note: "unsupported image format — native perception handles PNG (pixels), JPEG/GIF (structure) only; refused honestly",
  };
}

function orientationOf(
  w: number,
  h: number,
): "landscape" | "portrait" | "square" {
  const r = w / h;
  if (r > 1.05) return "landscape";
  if (r < 0.95) return "portrait";
  return "square";
}

function analyzeRgba(
  img: DecodedImage,
): Omit<ImageAnalysis, "format" | "notes"> {
  const { width, height, rgba } = img;
  const n = width * height;

  // Luma stats + histogram (16 bins).
  let lumaSum = 0;
  const histogram = new Array(16).fill(0);
  // RGB binning 4x4x4 for dominant colors.
  const bins = new Map<
    number,
    { r: number; g: number; b: number; count: number }
  >();
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = rgba[i],
      g = rgba[i + 1],
      b = rgba[i + 2];
    const l = luma(r, g, b);
    lumaSum += l;
    histogram[Math.min(15, (l / 16) | 0)]++;
    const key = ((r >> 6) << 8) | ((g >> 6) << 4) | (b >> 6);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.count++;
    bins.set(key, bin);
  }
  const meanLuma = lumaSum / n;

  // Dominant colors: top bins averaged, merged by name.
  const topBins = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const byName = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  for (const bin of topBins) {
    const r = Math.round(bin.r / bin.count),
      g = Math.round(bin.g / bin.count),
      b = Math.round(bin.b / bin.count);
    const name = colorName(r, g, b);
    const acc = byName.get(name) ?? { r: 0, g: 0, b: 0, count: 0 };
    acc.r += bin.r;
    acc.g += bin.g;
    acc.b += bin.b;
    acc.count += bin.count;
    byName.set(name, acc);
  }
  const dominantColors = [...byName.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((c) => ({
      hex: hex(
        Math.round(c.r / c.count),
        Math.round(c.g / c.count),
        Math.round(c.b / c.count),
      ),
      name: colorName(
        Math.round(c.r / c.count),
        Math.round(c.g / c.count),
        Math.round(c.b / c.count),
      ),
      coverage: Math.round((c.count / n) * 1000) / 10,
    }));

  // Edge density on a downsampled grid (max 256x256), Sobel-lite.
  const gw = Math.min(width, 256),
    gh = Math.min(height, 256);
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const px = (((gy / gh) * height) | 0) * width + (((gx / gw) * width) | 0);
      grid[gy * gw + gx] = luma(
        rgba[px * 4],
        rgba[px * 4 + 1],
        rgba[px * 4 + 2],
      );
    }
  }
  let edgeSum = 0,
    edgeCount = 0;
  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const o = gy * gw + gx;
      const gxMag = Math.abs(grid[o + 1] - grid[o - 1]);
      const gyMag = Math.abs(grid[o + gw] - grid[o - gw]);
      edgeSum += Math.min(1, (gxMag + gyMag) / 255);
      edgeCount++;
    }
  }
  const edgeDensity = edgeCount
    ? Math.round((edgeSum / edgeCount) * 1000) / 1000
    : 0;

  // Content-class heuristic — labeled as heuristic, with confidence.
  const usedBins = bins.size;
  let contentClass: ImageAnalysis["contentClass"];
  let contentConfidence: number;
  if (usedBins <= 4 && edgeDensity < 0.05) {
    contentClass = "flat";
    contentConfidence = 0.9;
  } else if (usedBins <= 16 && edgeDensity < 0.25) {
    contentClass = "graphics-like";
    contentConfidence = 0.6;
  } else {
    contentClass = "photo-like";
    contentConfidence = Math.min(0.85, 0.4 + usedBins / 128 + edgeDensity);
  }

  return {
    width,
    height,
    orientation: orientationOf(width, height),
    aspectRatio: Math.round((width / height) * 1000) / 1000,
    depth: "full-pixel",
    meanLuma: Math.round(meanLuma * 10) / 10,
    brightnessHistogram: histogram,
    dominantColors,
    edgeDensity,
    contentClass,
    contentConfidence: Math.round(contentConfidence * 100) / 100,
    analyzedAt: new Date().toISOString(),
  };
}

/** Human-readable honest summary — the canonical way any
 *  channel reports what ARCHIE actually saw. */
export function summarizeAnalysis(a: ImageAnalysis): string {
  const base = `${a.width}x${a.height} ${a.orientation} ${a.format.toUpperCase()}`;
  if (a.depth === "structure-only") {
    return `${base}. ${a.notes.join(" ")}`;
  }
  const colors =
    a.dominantColors
      ?.map((c) => `${c.name} ${c.hex} ${c.coverage}%`)
      .join(", ") ?? "";
  const light =
    (a.meanLuma ?? 0) > 170
      ? "bright"
      : (a.meanLuma ?? 0) > 85
        ? "medium"
        : "dark";
  return (
    `${base}. Colors: ${colors}. Brightness: ${light} (mean luma ` +
    `${a.meanLuma}/255). Structure: ${a.contentClass} (heuristic, ` +
    `confidence ${a.contentConfidence}; edge density ${a.edgeDensity}). ` +
    `Bounds: composition/color statistics only — NO object recognition exists, natively or otherwise.`
  );
}
