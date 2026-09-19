// =========================================================
// NATIVE BASELINE JPEG DECODER — ARCHIE's own eyes, gap 4
// (owner upgrade 2026-09-16). Zero external libraries, zero
// AI: pure deterministic byte→pixel math (marker parse,
// Huffman entropy decode, dequantization, 2D IDCT, YCbCr→
// RGB). Everything this decoder cannot do honestly it
// REFUSES with a reason — progressive JPEG, 12-bit
// precision, CMYK, missing tables, truncated entropy data.
//
// Supported (JFIF baseline):
//   SOF0 (baseline) and SOF1 (extended sequential)
//   precision 8, 1 component (grayscale) or 3 (YCbCr)
//   4:4:4 / 4:2:2 / 4:2:0 / 4:1:1 sampling (h/v ∈ 1..2)
//   restart intervals (DRI + RSTn), byte-stuffed entropy
//   8-bit and 16-bit DQT precision
//
// Refused honestly:
//   SOF2 progressive (needs a whole second algorithm)
//   12-bit precision, 4-component CMYK
//   chroma h/v > 2, precision ≠ 8, missing DQT/DHT
//   entropy truncation, corrupt Huffman stream
// =========================================================

export interface JpegImage {
  width: number;
  height: number;
  /** RGBA, row-major, width*height*4, alpha 255. */
  rgba: Uint8Array;
  notes: string[];
}

const ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63,
]);

/** Precomputed IDCT basis: COS[u][x] = cos((2x+1)uπ/16) scaled. */
const IDCT_COS = (() => {
  const t = new Float32Array(64);
  for (let u = 0; u < 8; u++) {
    for (let x = 0; x < 8; x++) {
      t[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    }
  }
  return t;
})();

// ---------- Huffman table ----------
interface HuffTable {
  /** mincode[len] — smallest code of that length (len 1..16). */
  mincode: Int32Array;
  maxcode: Int32Array;
  valptr: Int32Array;
  vals: Uint8Array;
}

function buildHuff(counts: Uint8Array, vals: Uint8Array): HuffTable {
  // canonical code assignment, MSB-first
  const mincode = new Int32Array(17),
    maxcode = new Int32Array(17),
    valptr = new Int32Array(17);
  let code = 0,
    k = 0;
  for (let len = 1; len <= 16; len++) {
    const n = counts[len - 1];
    if (n > 0) {
      mincode[len] = code;
      valptr[len] = k;
      for (let i = 0; i < n; i++) code++;
      k += n;
      maxcode[len] = code - 1;
    } else {
      mincode[len] = 0;
      maxcode[len] = -1;
      valptr[len] = 0;
    }
    code <<= 1;
  }
  return { mincode, maxcode, valptr, vals };
}

// ---------- entropy bit reader ----------
class BitReader {
  private i: number;
  private bitBuf = 0;
  private bitCount = 0;
  /** set when an RSTn marker was consumed at a byte boundary */
  public pendingRestart: number | false = false; // false or the pending RSTn marker
  constructor(private bytes: Uint8Array, start: number) {
    this.i = start;
  }
  private nextByte(): number {
    if (this.i >= this.bytes.length) {
      throw new Error("JPEG entropy data truncated — refused honestly");
    }
    let b = this.bytes[this.i++];
    if (b === 0xff) {
      const b2 = this.i < this.bytes.length ? this.bytes[this.i] : -1;
      if (b2 === 0x00) {
        this.i++; // stuffed literal FF
      } else if (b2 >= 0xd0 && b2 <= 0xd7) {
        this.i++;
        this.pendingRestart = b2;
        return 0; // caller handles via restart alignment
      } else {
        throw new Error(
          "JPEG entropy stream corrupt (unexpected marker) — refused honestly",
        );
      }
    }
    return b;
  }
  read1(): number {
    if (this.bitCount === 0) {
      this.bitBuf = this.nextByte();
      this.bitCount = 8;
    }
    this.bitCount--;
    return (this.bitBuf >> this.bitCount) & 1;
  }
  readN(n: number): number {
    let v = 0;
    for (let k = 0; k < n; k++) v = (v << 1) | this.read1();
    return v;
  }
  alignByte() {
    this.bitCount = 0;
  }
  /** true if the reader is sitting on (or past) an RSTn marker. */
  restartPending(): boolean {
    return this.pendingRestart !== false;
  }
  takeRestart(): number {
    const r = this.pendingRestart as number;
    this.pendingRestart = false;
    return r;
  }
  /** at a restart boundary: drop alignment bits, consume the marker. */
  expectRestart(expected: number): number {
    this.alignByte();
    // allow padding 1s before the marker; find the next FF Dn
    while (this.i + 1 < this.bytes.length) {
      if (this.bytes[this.i] === 0xff && this.bytes[this.i + 1] === expected) {
        this.i += 2;
        return expected;
      }
      if (this.bytes[this.i] === 0x7f) {
        this.i++;
        continue;
      }
      throw new Error(
        `JPEG restart marker ${expected.toString(16)} missing — refused honestly`,
      );
    }
    throw new Error("JPEG restart marker truncated — refused honestly");
  }
}

function huffDecode(reader: BitReader, table: HuffTable): number {
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.read1();
    if (table.maxcode[len] >= 0 && code <= table.maxcode[len]) {
      return table.vals[table.valptr[len] + code - table.mincode[len]];
    }
  }
  throw new Error("JPEG Huffman code longer than 16 bits — refused honestly");
}

/** JPEG "extend": receive s bits and sign-extend them. */
function extend(reader: BitReader, s: number): number {
  if (s === 0) return 0;
  const v = reader.readN(s);
  // v < 2^(s-1) → negative value: v - (2^s - 1). Otherwise
  // the magnitude is already correct (positive case).
  return v < (1 << (s - 1)) ? v - (1 << s) + 1 : v;
}

// ---------- 2D IDCT (separable, float) ----------
const tmpCol = new Float32Array(64);
function idct8x8(
  coefs: Float32Array,
  out: Float32Array,
  outStride: number,
  outOffset: number,
  rowStride: number,
): void {
  // fast path: entirely zero block → constant 128 after shift
  let allZero = true;
  for (let k = 1; k < 64; k++) {
    if (coefs[k] !== 0) {
      allZero = false;
      break;
    }
  }
  if (allZero) {
    const dc = coefs[0] / 8 + 128; // scaling: see below
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) out[outOffset + y * rowStride + x * outStride] = dc;
    }
    return;
  }
  // rows: 1D IDCT over u — f(x) = (1/2)·Σ C_u·F(u)·cos((2x+1)uπ/16),
  // C_0 = 1/√2, C_{u>0} = 1. The √2 must appear in BOTH passes.
  const C0 = 0.3535533905932738; // (1/2)·(1/√2)
  for (let y = 0; y < 8; y++) {
    const r = y * 8;
    for (let x = 0; x < 8; x++) {
      let s = C0 * coefs[r]; // u=0 term with the C_0 factor
      for (let u = 1; u < 8; u++) {
        s += 0.5 * coefs[r + u] * IDCT_COS[u * 8 + x];
      }
      tmpCol[y * 8 + x] = s;
    }
  }
  // cols: same 1D IDCT over v
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let s = C0 * tmpCol[x]; // v=0 term
      for (let v = 1; v < 8; v++) {
        s += 0.5 * tmpCol[v * 8 + x] * IDCT_COS[v * 8 + y];
      }
      out[outOffset + y * rowStride + x * outStride] = s + 128; // level shift
    }
  }
}

interface Component {
  id: number;
  h: number; // sampling factor 1..2
  v: number;
  tq: number; // DQT index
  dcTbl: number; // DHT index (0/1)
  acTbl: number;
  plane: Float32Array; // compW × compH
  w: number;
  hFull: number;
  pred: number;
}

/** Native baseline JPEG decode. Throws with an honest reason
 *  for everything it cannot decode. */
export function decodeJpeg(bytes: Uint8Array): JpegImage {
  const notes: string[] = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("not a JPEG (bad SOI)");
  }
  let i = 2;
  let width = 0,
    height = 0,
    precision = 0;
  let comps: Component[] = [];
  let restartInterval = 0;
  const qts: Array<Float32Array | null> = [null, null, null, null];
  const dcs: Array<HuffTable | null> = [null, null, null, null];
  const acs: Array<HuffTable | null> = [null, null, null, null];
  let sawSOF = false,
    sawSOS = false,
    progressive = false;

  // ---- marker pass ----
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break; // EOI
    if (i + 4 > bytes.length) {
      throw new Error("JPEG marker segment truncated — refused honestly");
    }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2 || i + 2 + segLen > bytes.length) {
      throw new Error("JPEG marker length out of bounds — refused honestly");
    }
    const seg = bytes.subarray(i + 4, i + 2 + segLen);

    if (marker === 0xdb) {
      // DQT
      let p = 0;
      while (p < seg.length) {
        const pq = seg[p] >> 4,
          tq = seg[p] & 15;
        const table = new Float32Array(64);
        for (let k = 0; k < 64; k++) {
          if (pq === 1) {
            table[k] = (seg[p + 1 + 2 * k] << 8) | seg[p + 2 + 2 * k];
          } else {
            table[k] = seg[p + 1 + k];
          }
        }
        qts[tq] = table;
        p += 1 + (pq === 1 ? 128 : 64);
      }
    } else if (marker === 0xc4) {
      // DHT
      let p = 0;
      while (p + 17 <= seg.length) {
        const tc = seg[p] >> 4,
          th = seg[p] & 15;
        if (th > 1) {
          throw new Error("JPEG DHT table id > 1 — refused honestly");
        }
        const counts = seg.subarray(p + 1, p + 17);
        let total = 0;
        for (let k = 0; k < 16; k++) total += counts[k];
        if (p + 17 + total > seg.length) {
          throw new Error("JPEG DHT symbols truncated — refused honestly");
        }
        const vals = seg.subarray(p + 17, p + 17 + total);
        const t = buildHuff(counts, vals);
        if (tc === 0) dcs[th] = t;
        else acs[th] = t;
        p += 17 + total;
      }
    } else if (marker === 0xdd) {
      // DRI
      restartInterval = (seg[0] << 8) | seg[1];
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // SOF
      if (sawSOF) {
        throw new Error("JPEG has multiple SOF markers — refused honestly");
      }
      if (marker === 0xc2) {
        progressive = true;
        throw new Error(
          "JPEG progressive (SOF2) — pixel decode NOT supported natively, honestly",
        );
      }
      if (marker !== 0xc0 && marker !== 0xc1) {
        throw new Error(
          `JPEG SOF type 0x${marker.toString(16)} not supported natively (lossless/hierarchical/arithmetic) — refused honestly`,
        );
      }
      precision = seg[0];
      height = (seg[1] << 8) | seg[2];
      width = (seg[3] << 8) | seg[4];
      const nc = seg[5];
      if (precision !== 8) {
        throw new Error(
          `JPEG precision ${precision} not supported natively (8 only) — refused honestly`,
        );
      }
      if (nc !== 1 && nc !== 3) {
        throw new Error(
          `JPEG with ${nc} components not supported natively (1 grayscale / 3 YCbCr only) — refused honestly`,
        );
      }
      if (height === 0 || width === 0) {
        throw new Error(`JPEG invalid dimensions ${width}x${height} — refused`);
      }
      comps = [];
      for (let c = 0; c < nc; c++) {
        const o = 6 + c * 3;
        comps.push({
          id: seg[o],
          h: seg[o + 1] >> 4,
          v: seg[o + 1] & 15,
          tq: seg[o + 2],
          dcTbl: 0,
          acTbl: 0,
          plane: new Float32Array(0),
          w: 0,
          hFull: 0,
          pred: 0,
        });
        if (comps[c].h < 1 || comps[c].h > 2 || comps[c].v < 1 || comps[c].v > 2) {
          throw new Error(
            `JPEG sampling factor ${comps[c].h}x${comps[c].v} not supported natively (max 2x2) — refused honestly`,
          );
        }
      }
      sawSOF = true;
    } else if (marker === 0xda) {
      // SOS
      if (!sawSOF) {
        throw new Error("JPEG SOS before SOF — refused honestly");
      }
      const ns = seg[0];
      if (ns !== comps.length) {
        throw new Error(
          "JPEG scan component count mismatch — refused honestly",
        );
      }
      for (let s = 0; s < ns; s++) {
        const o = 1 + s * 2;
        const cid = seg[o];
        const comp = comps.find((c) => c.id === cid);
        if (!comp) {
          throw new Error(
            `JPEG scan references unknown component ${cid} — refused honestly`,
          );
        }
        comp.dcTbl = seg[o + 1] >> 4;
        comp.acTbl = seg[o + 1] & 15;
      }
      // baseline Ss/Se/AhAl = 0,0,0
      sawSOS = true;
      i += 2 + segLen;
      break; // entropy data follows
    }
    i += 2 + segLen;
  }

  if (!sawSOF) throw new Error("JPEG SOF marker not found — refused honestly");
  if (!sawSOS) {
    throw new Error("JPEG scan (SOS) not found — refused honestly");
  }

  // size caps (same honesty as the PNG path)
  const hmax = Math.max(...comps.map((c) => c.h));
  const vmax = Math.max(...comps.map((c) => c.v));
  for (const c of comps) {
    if (qts[c.tq] === null) {
      throw new Error(`JPEG component ${c.id} missing its DQT table — refused honestly`);
    }
  }
  for (const c of comps) {
    if (dcs[c.dcTbl] === null || acs[c.acTbl] === null) {
      throw new Error(
        `JPEG component ${c.id} missing its DHT tables — refused honestly`,
      );
    }
  }

  // per-component plane sizes (blocks padded to MCU grid)
  const mcusX = Math.ceil(width / (8 * hmax));
  const mcusY = Math.ceil(height / (8 * vmax));
  for (const c of comps) {
    c.w = mcusX * 8 * c.h;
    c.hFull = mcusY * 8 * c.v;
    c.plane = new Float32Array(c.w * c.hFull);
  }

  // ---- entropy pass ----
  const reader = new BitReader(bytes, i);
  const coefs = new Float32Array(64);
  let mcuCount = 0;
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restartInterval > 0 && mcuCount > 0 && mcuCount % restartInterval === 0) {
        const expected = 0xd0 + ((mcuCount / restartInterval - 1) % 8);
        reader.expectRestart(expected);
        for (const c of comps) c.pred = 0;
      }
      for (const c of comps) {
        const q = qts[c.tq]!;
        const dcT = dcs[c.dcTbl]!,
          acT = acs[c.acTbl]!;
        const blocksW = c.h,
          blocksH = c.v; // blocks per MCU for this component
        for (let by = 0; by < blocksH; by++) {
          for (let bx = 0; bx < blocksW; bx++) {
            coefs.fill(0);
            // DC
            const s = huffDecode(reader, dcT);
            c.pred += extend(reader, s);
            coefs[0] = c.pred * q[0];
            // AC
            let k = 1;
            while (k <= 63) {
              const rs = huffDecode(reader, acT);
              const r = rs >> 4,
                ss = rs & 15;
              if (ss === 0) {
                if (r === 15) {
                  k += 16; // ZRL
                  continue;
                }
                break; // EOB
              }
              k += r;
              if (k > 63) {
                throw new Error(
                  "JPEG AC coefficient index overrun — refused honestly",
                );
              }
              coefs[ZIGZAG[k]] = extend(reader, ss) * q[ZIGZAG[k]];
              k++;
            }
            // place the block
            const px0 = mx * 8 * c.h + bx * 8;
            const py0 = my * 8 * c.v + by * 8;
            idct8x8(coefs, c.plane, 1, py0 * c.w + px0, c.w);
          }
        }
      }
      mcuCount++;
    }
  }

  // ---- upsample + color-convert ----
  const rgba = new Uint8Array(width * height * 4);
  const [cy, ccb, ccr] = comps;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const Y = cy.plane[Math.min(cy.hFull - 1, ((y * cy.v) / vmax) | 0) * cy.w +
        Math.min(cy.w - 1, ((x * cy.h) / hmax) | 0)];
      let r: number, g: number, b: number;
      if (comps.length === 1) {
        r = Y;
        g = Y;
        b = Y;
      } else {
        const Cb = ccb.plane[Math.min(ccb.hFull - 1, ((y * ccb.v) / vmax) | 0) * ccb.w +
          Math.min(ccb.w - 1, ((x * ccb.h) / hmax) | 0)];
        const Cr = ccr.plane[Math.min(ccr.hFull - 1, ((y * ccr.v) / vmax) | 0) * ccr.w +
          Math.min(ccr.w - 1, ((x * ccr.h) / hmax) | 0)];
        r = Y + 1.402 * (Cr - 128);
        g = Y - 0.344136286 * (Cb - 128) - 0.714136286 * (Cr - 128);
        b = Y + 1.772 * (Cb - 128);
      }
      const o = (y * width + x) * 4;
      rgba[o] = Math.max(0, Math.min(255, Math.round(r)));
      rgba[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      rgba[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      rgba[o + 3] = 255;
    }
  }
  if (progressive) notes.push("progressive");
  return { width, height, rgba, notes };
}
