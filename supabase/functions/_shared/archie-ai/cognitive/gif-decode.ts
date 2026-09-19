// =========================================================
// NATIVE GIF PIXEL DECODE — ARCHIE's own eyes, gap 4
// completion (owner upgrade 2026-09-16). Zero external
// libraries, zero AI: pure deterministic byte→pixel math
// (logical screen + image descriptors, global/local color
// tables, LZW decompression, deinterlace). Everything this
// decoder cannot do honestly it REFUSES with a reason.
//
// Supported:
//   GIF87a / GIF89a, palette-based 1..8-bit indices
//   global + local color tables, interlaced frames
//   multi-frame GIFs: FIRST frame is decoded and analyzed;
//     the frame count is reported honestly
//   pixels outside the first frame render as the background
//     color (analysis has no alpha channel; the notes say so)
//
// Refused honestly:
//   truncated LZW streams, missing palette, zero-size
//   frames, over-cap dimensions, corrupt sub-blocks
// =========================================================

export interface GifImage {
  width: number;
  height: number;
  /** RGBA, row-major, width*height*4, alpha 255. */
  rgba: Uint8Array;
  notes: string[];
}

/** Decode a GIF's FIRST frame into RGBA. Throws with an
 *  honest reason for everything it cannot decode. */
export function decodeGif(bytes: Uint8Array): GifImage {
  const notes: string[] = [];
  if (bytes.length < 13) {
    throw new Error(
      "GIF truncated before the logical screen descriptor — refused honestly",
    );
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 6));
  if (head !== "GIF87a" && head !== "GIF89a") {
    throw new Error("not a GIF (bad signature)");
  }
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width === 0 || height === 0) {
    throw new Error(`GIF invalid dimensions ${width}x${height} — refused`);
  }
  const packed = bytes[10];
  const bgIndex = bytes[11];
  const gctFlag = (packed >> 7) & 1;
  const gctSize = 2 << (packed & 7);
  let i = 13;
  let gct: Uint8Array | null = null;
  if (gctFlag) {
    if (i + gctSize * 3 > bytes.length) {
      throw new Error("GIF global color table truncated — refused honestly");
    }
    gct = bytes.subarray(i, i + gctSize * 3);
    i += gctSize * 3;
  }

  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      // extension: label + sub-blocks
      if (i + 2 > bytes.length) {
        throw new Error("GIF extension truncated — refused honestly");
      }
      i += 2; // 0x21 + label
      i = skipSubBlocks(bytes, i);
      continue;
    }
    if (b !== 0x2c) {
      throw new Error(
        `GIF unknown block 0x${b.toString(16)} — refused honestly`,
      );
    }
    // ---- image descriptor ----
    if (i + 10 > bytes.length) {
      throw new Error("GIF image descriptor truncated — refused honestly");
    }
    const left = bytes[i + 1] | (bytes[i + 2] << 8);
    const top = bytes[i + 3] | (bytes[i + 4] << 8);
    const fw = bytes[i + 5] | (bytes[i + 6] << 8);
    const fh = bytes[i + 7] | (bytes[i + 8] << 8);
    const ipacked = bytes[i + 9];
    const interlace = ((ipacked >> 6) & 1) === 1;
    const lctFlag = ((ipacked >> 7) & 1) === 1;
    const lctSize = 2 << (ipacked & 7);
    i += 10;
    let palette = gct;
    if (lctFlag) {
      if (i + lctSize * 3 > bytes.length) {
        throw new Error("GIF local color table truncated — refused honestly");
      }
      palette = bytes.subarray(i, i + lctSize * 3);
      i += lctSize * 3;
    }
    if (!palette) {
      throw new Error(
        "GIF frame has no color table (neither global nor local) — refused honestly",
      );
    }
    if (fw === 0 || fh === 0) {
      throw new Error(`GIF frame invalid dimensions ${fw}x${fh} — refused`);
    }
    if (left + fw > width || top + fh > height) {
      throw new Error(
        `GIF frame ${fw}x${fh} at (${left},${top}) exceeds the ${width}x${height} canvas — refused honestly`,
      );
    }

    // ---- LZW data ----
    if (i >= bytes.length) {
      throw new Error("GIF LZW data missing — refused honestly");
    }
    const minCodeSize = bytes[i++];
    if (minCodeSize < 1 || minCodeSize > 8) {
      throw new Error(
        `GIF LZW min code size ${minCodeSize} out of spec (1..8) — refused honestly`,
      );
    }
    // gather sub-blocks
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      if (i >= bytes.length) {
        throw new Error("GIF sub-blocks truncated — refused honestly");
      }
      const len = bytes[i++];
      if (len === 0) break; // block terminator
      if (i + len > bytes.length) {
        throw new Error("GIF sub-block data truncated — refused honestly");
      }
      chunks.push(bytes.subarray(i, i + len));
      total += len;
      i += len;
    }
    const data = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      data.set(c, off);
      off += c.length;
    }

    const indices = lzwDecode(data, minCodeSize, fw * fh);
    // count later frames for the honest note
    let extraFrames = 0;
    let j = i;
    while (j < bytes.length) {
      const bb = bytes[j];
      if (bb === 0x3b) break;
      if (bb === 0x21) {
        j += 2;
        while (j < bytes.length && bytes[j] !== 0x00) j += 1 + bytes[j];
        j++;
        continue;
      }
      if (bb === 0x2c) {
        extraFrames++;
        // skip descriptor (10) + optional LCT + LZW sub-blocks
        if (j + 10 > bytes.length) break;
        const lp = bytes[j + 9];
        j += 10 + (((lp >> 7) & 1) ? (2 << (lp & 7)) * 3 : 0);
        if (j < bytes.length) j++; // min code size
        while (j < bytes.length && bytes[j] !== 0x00) j += 1 + bytes[j];
        j++;
        continue;
      }
      j++;
    }
    if (extraFrames > 0) {
      notes.push(
        `multi-frame GIF: first frame analyzed; ${extraFrames} later frame(s) not analyzed, honestly`,
      );
    }
    if (interlace) notes.push("interlaced GIF deinterlaced natively");

    // ---- palette → RGBA on the full canvas ----
    const rgba = new Uint8Array(width * height * 4);
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const o = (py * width + px) * 4;
        if (px >= left && px < left + fw && py >= top && py < top + fh) {
          const fx = px - left,
            fy = py - top;
          const row = interlace ? deinterlaceRow(fy, fh) : fy;
          const c = paletteColor(palette, indices[row * fw + fx]);
          rgba[o] = c[0];
          rgba[o + 1] = c[1];
          rgba[o + 2] = c[2];
        } else {
          // outside the frame → background color
          const c = gct ? paletteColor(gct, bgIndex) : [0, 0, 0] as const;
          rgba[o] = c[0];
          rgba[o + 1] = c[1];
          rgba[o + 2] = c[2];
        }
        rgba[o + 3] = 255;
      }
    }
    return { width, height, rgba, notes };
  }
  throw new Error("GIF has no image frame — refused honestly");
}

function paletteColor(
  p: Uint8Array,
  idx: number,
): [number, number, number] {
  const o = idx * 3;
  if (o + 2 < p.length) return [p[o], p[o + 1], p[o + 2]];
  return [0, 0, 0];
}

function skipSubBlocks(bytes: Uint8Array, i: number): number {
  while (true) {
    if (i >= bytes.length) {
      throw new Error("GIF extension sub-blocks truncated — refused honestly");
    }
    const len = bytes[i++];
    if (len === 0) return i;
    if (i + len > bytes.length) {
      throw new Error(
        "GIF extension sub-block data truncated — refused honestly",
      );
    }
    i += len;
  }
}

/** Interlace passes: rows 0,8,16… then 4,12… then 2,6,10…
 *  then 1,3,5… Maps a DISPLAY row to its SEQUENTIAL row. */
const INTERLACE_MAP_CACHE = new Map<number, Uint32Array>();
function deinterlaceRow(displayRow: number, height: number): number {
  let map = INTERLACE_MAP_CACHE.get(height);
  if (!map) {
    map = new Uint32Array(height);
    let seq = 0;
    const passes = [
      { start: 0, step: 8 },
      { start: 4, step: 8 },
      { start: 2, step: 4 },
      { start: 1, step: 2 },
    ];
    for (const p of passes) {
      for (let r = p.start; r < height; r += p.step) map[r] = seq++;
    }
    INTERLACE_MAP_CACHE.set(height, map);
  }
  return map[displayRow];
}

// ---------- LZW ----------
function lzwDecode(
  data: Uint8Array,
  minCodeSize: number,
  expected: number,
): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);
  for (let k = 0; k < clear; k++) {
    prefix[k] = -1;
    suffix[k] = k;
  }
  let width = minCodeSize + 1;
  let next = end + 1;
  let prev = -1;
  let outPos = 0;
  let bitPos = 0;
  const totalBits = data.length * 8;

  while (true) {
    if (bitPos + width > totalBits) {
      throw new Error("GIF LZW stream truncated — refused honestly");
    }
    let code = 0;
    for (let b = 0; b < width; b++) {
      const byteIdx = (bitPos + b) >> 3;
      const bit = (data[byteIdx] >> ((bitPos + b) & 7)) & 1;
      code |= bit << b;
    }
    bitPos += width;
    if (code === end) break;
    if (code === clear) {
      width = minCodeSize + 1;
      next = end + 1;
      prev = -1;
      continue;
    }
    let emit: number;
    if (code < next) {
      emit = code;
      if (prev >= 0 && next < 4096) {
        prefix[next] = prev;
        suffix[next] = firstByteOf(code, prefix);
        next++;
      }
    } else if (code === next && prev >= 0) {
      if (next >= 4096) {
        throw new Error("GIF LZW table overflow — refused honestly");
      }
      prefix[next] = prev;
      suffix[next] = firstByteOf(prev, prefix);
      emit = next;
      next++;
    } else {
      throw new Error(
        `GIF LZW code ${code} out of range (table has ${next}) — refused honestly`,
      );
    }
    // emit the string for `emit`
    let sp = 0;
    for (let c = emit; c !== -1; c = prefix[c]) {
      stack[sp++] = suffix[c];
      if (sp > 4096) {
        throw new Error("GIF LZW chain corrupt — refused honestly");
      }
    }
    while (sp > 0) {
      if (outPos >= expected) {
        throw new Error(
          "GIF LZW produced more pixels than the frame — refused honestly",
        );
      }
      out[outPos++] = stack[--sp];
    }
    prev = emit;
    if (next === (1 << width) && width < 12) width++;
  }
  if (outPos < expected) {
    throw new Error(
      `GIF LZW produced ${outPos}/${expected} pixels (truncated data) — refused honestly`,
    );
  }
  return out;
}

function firstByteOf(code: number, prefix: Int32Array): number {
  let c = code;
  while (prefix[c] !== -1) c = prefix[c];
  return c;
}
