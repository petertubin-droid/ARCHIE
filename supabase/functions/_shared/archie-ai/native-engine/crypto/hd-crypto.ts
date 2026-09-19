// =========================================================
// ARCHIE NATIVE ENGINE — HD WALLET CRYPTO CORE
// supabase/functions/_shared/archie-ai/native-engine/crypto/hd-crypto.ts
//
// REAL secp256k1 + keccak-256 + BIP32/BIP44 derivation, in
// pure TypeScript (BigInt) with no dependencies — for the
// owner's abandoned-wallet recovery capability ONLY.
//
// Verified against canonical test vectors in
// src/lib/archie/__tests__/hd-crypto.test.ts:
//   * keccak-256("" ) and keccak-256("abc")
//   * BIP39 official seed vectors (Trezor vectors.json)
//   * BIP32 official test vector 1 (raw private keys at
//     m, m/0', m/0'/1, m/0'/1/2')
//   * BIP44 ETH address for the all-zeros entropy mnemonic
//
// SECURITY CONTRACT (owner directive 2026-09-11):
//   * This module contains NO storage, NO logging, NO
//     network. It is pure math.
//   * ARCHIE must never learn or store the owner's seed
//     phrase or private keys. In recovery jobs, keys are
//     derived EPHEMERALLY in-memory to compute a public
//     address, then discarded; only the derived PUBLIC
//     address is ever persisted (audited, owner-visible).
//   * The private key of a RECOVERED wallet is NEVER printed,
//     persisted or exported by ARCHIE — recovery means
//     telling the owner WHICH candidate passphrase is
//     checksum-valid and holds assets. What the owner does
//     with their own passphrase (import into their own
//     wallet software) is entirely outside ARCHIE.
// =========================================================

// ---------------------------------------------------------
// 1. secp256k1 domain parameters
// ---------------------------------------------------------
const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function mod(a: bigint, m: bigint = P): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function powMod(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return result;
}

/** Modular inverse via Fermat (secp256k1 prime). */
function inv(a: bigint): bigint {
  return powMod(a, P - 2n, P);
}

/** Affine point; O = point at infinity. */
export interface Point {
  x: bigint;
  y: bigint;
}
export const POINT_INFINITY: Point | null = null;

/** Jacobian point ops for fast scalar mult. */
interface Jac {
  x: bigint;
  y: bigint;
  z: bigint;
}
const jacInf: Jac = { x: 1n, y: 1n, z: 0n };

function jacDouble(p: Jac): Jac {
  if (p.z === 0n) return p;
  // standard a=0 doubling
  const a = mod(p.x * p.x);
  const b = mod(p.y * p.y);
  const c = mod(b * b);
  const d = mod(2n * (mod((p.x + b) * (p.x + b)) - a - c));
  const e = mod(3n * a);
  const f = mod(e * e);
  const x3 = mod(f - 2n * d);
  const y3 = mod(e * (d - x3) - 8n * c);
  const z3 = mod(2n * p.y * p.z);
  return { x: x3, y: y3, z: z3 };
}

function jacAdd(p: Jac, q: Jac): Jac {
  if (p.z === 0n) return q;
  if (q.z === 0n) return p;
  const z1z1 = mod(p.z * p.z);
  const z2z2 = mod(q.z * q.z);
  const u1 = mod(p.x * z2z2);
  const u2 = mod(q.x * z1z1);
  const s1 = mod(p.y * z2z2 * q.z);
  const s2 = mod(q.y * z1z1 * p.z);
  if (u1 === u2) {
    if (s1 !== s2) return jacInf;
    return jacDouble(p);
  }
  const h = mod(u2 - u1);
  const i = mod(4n * h * h);
  const j = mod(h * i);
  const r = mod(2n * (s2 - s1));
  const v = mod(u1 * i);
  const x3 = mod(r * r - j - 2n * v);
  const y3 = mod(r * (v - x3) - 2n * mod(s1 * j));
  const zz = mod(mod(p.z + q.z) * mod(p.z + q.z) - z1z1 - z2z2);
  const z3 = mod(zz * h);
  return { x: x3, y: y3, z: z3 };
}

function jacFromAffine(p: Point): Jac {
  return { x: p.x, y: p.y, z: 1n };
}

function jacToAffine(p: Jac): Point | null {
  if (p.z === 0n) return null;
  const zInv = inv(p.z);
  const zInv2 = mod(zInv * zInv);
  return {
    x: mod(p.x * zInv2),
    y: mod(p.y * zInv2 * zInv),
  };
}

/** Scalar multiplication k·G (or k·point) — double-and-add. */
export function pointMul(k: bigint, p: Point = { x: Gx, y: Gy }): Point {
  let result: Jac = jacInf;
  let add: Jac = jacFromAffine(p);
  let e = mod(k, N);
  while (e > 0n) {
    if (e & 1n) result = jacAdd(result, add);
    add = jacDouble(add);
    e >>= 1n;
  }
  const out = jacToAffine(result);
  if (!out) throw new Error("scalar multiplication produced infinity");
  return out;
}

// ---------------------------------------------------------
// 2. Byte helpers
// ---------------------------------------------------------
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/i, "");
  if (h.length % 2 !== 0) throw new Error("odd hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bigintToBytes32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

// ---------------------------------------------------------
// 3. keccak-256 (original Keccak padding, NOT SHA3)
// ---------------------------------------------------------
const KECCAK_ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const RHO_OFFSETS: number[] = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

const MASK64 = (1n << 64n) - 1n;
const rotl64 = (v: bigint, n: number) =>
  n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK64;

/** keccak-f[1600] permutation on a 25-lane BigInt state. */
function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // theta
    const c: bigint[] = new Array(5);
    for (let x = 0; x < 5; x++) {
      c[x] =
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] ^= d;
      }
    }
    // rho + pi
    const next = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = x + 5 * y;
        const nx = y;
        const ny = (2 * x + 3 * y) % 5;
        next[nx + 5 * ny] = rotl64(state[idx], RHO_OFFSETS[idx]);
      }
    }
    for (let i = 0; i < 25; i++) state[i] = next[i];
    // chi
    for (let y = 0; y < 5; y++) {
      const row = [
        state[5 * y],
        state[5 * y + 1],
        state[5 * y + 2],
        state[5 * y + 3],
        state[5 * y + 4],
      ];
      for (let x = 0; x < 5; x++) {
        state[5 * y + x] =
          row[x] ^ (~row[(x + 1) % 5] & row[(x + 2) % 5] & MASK64);
      }
    }
    // iota
    state[0] ^= KECCAK_ROUND_CONSTANTS[round];
  }
}

/** keccak-256 of the input bytes (rate 136). */
export function keccak256(bytes: Uint8Array): Uint8Array {
  const rate = 136;
  const state = new Array<bigint>(25).fill(0n);
  // absorb with original Keccak padding 0x01 ... 0x80
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) {
        lane = (lane << 8n) | BigInt(padded[off + i * 8 + j]);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }
  // squeeze 32 bytes
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

// ---------------------------------------------------------
// 4. BIP32 HD derivation (private branch)
// ---------------------------------------------------------
async function hmacSha512(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const subtle = crypto.subtle;
  const ct = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const k = await subtle.importKey(
    "raw",
    ct(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", k, ct(data));
  return new Uint8Array(sig);
}

export interface HdKey {
  privateKey: bigint;
  chainCode: Uint8Array;
  depth: number;
  path: string;
}

export function masterKeyFromSeed(seed: Uint8Array): Promise<HdKey> {
  return hmacSha512(
    Uint8Array.from("Bitcoin seed".split("").map((c) => c.charCodeAt(0))),
    seed,
  ).then((I): HdKey => ({
    privateKey: bytesToBigInt(I.slice(0, 32)),
    chainCode: I.slice(32),
    depth: 0,
    path: "m",
  }));
}

function bytesToBigInt(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** CKDpriv — one BIP32 child derivation. */
export async function deriveChild(
  parent: HdKey,
  index: number,
): Promise<HdKey> {
  if (index < 0 || index > 0xffffffff) throw new Error("bad index");
  const hardened = index >= 0x80000000;
  const data = hardened
    ? concatBytes(
        new Uint8Array([0]),
        bigintToBytes32(parent.privateKey),
        indexToBytes(index),
      )
    : concatBytes(
        // BIP32 CKDpriv: serP is the SEC1 COMPRESSED form (33 bytes)
        publicKeyCompressed(parent.privateKey),
        indexToBytes(index),
      );
  const I = await hmacSha512(parent.chainCode, data);
  const tweak = bytesToBigInt(I.slice(0, 32));
  if (tweak >= N)
    throw new Error("invalid child (tweak >= n) — try next index");
  const childKey = mod(parent.privateKey + tweak, N);
  if (childKey === 0n) throw new Error("invalid child (zero) — try next index");
  return {
    privateKey: childKey,
    chainCode: I.slice(32),
    depth: parent.depth + 1,
    path: `${parent.path}/${hardened ? index - 0x80000000 + "'" : index}`,
  };
}

function indexToBytes(index: number): Uint8Array {
  return new Uint8Array([
    (index >>> 24) & 0xff,
    (index >>> 16) & 0xff,
    (index >>> 8) & 0xff,
    index & 0xff,
  ]);
}

/** Derive a BIP44-style path "m/44'/60'/0'/0/0" from a seed. */
export async function derivePath(
  seed: Uint8Array,
  path: string,
): Promise<HdKey> {
  const master = await masterKeyFromSeed(seed);
  if (path === "m" || path === "") return master;
  if (!path.startsWith("m/")) throw new Error(`bad path: ${path}`);
  let key = master;
  for (const seg of path.slice(2).split("/")) {
    const hardened = seg.endsWith("'");
    const num = parseInt(hardened ? seg.slice(0, -1) : seg, 10);
    if (Number.isNaN(num)) throw new Error(`bad path segment: ${seg}`);
    key = await deriveChild(key, hardened ? num + 0x80000000 : num);
  }
  return key;
}

// ---------------------------------------------------------
// 5. Public keys & Ethereum addresses
// ---------------------------------------------------------
/** Uncompressed pubkey (65 bytes, 0x04 || X || Y). */
export function publicKeyBytes(priv: bigint): Uint8Array {
  const pt = pointMul(priv);
  const out = new Uint8Array(65);
  out[0] = 4;
  out.set(bigintToBytes32(pt.x), 1);
  out.set(bigintToBytes32(pt.y), 33);
  return out;
}

/** SEC1 compressed pubkey (33 bytes, 0x02/0x03 || X) —
 *  the form BIP32 CKDpriv requires. */
export function publicKeyCompressed(priv: bigint): Uint8Array {
  const pt = pointMul(priv);
  const out = new Uint8Array(33);
  out[0] = pt.y & 1n ? 3 : 2;
  out.set(bigintToBytes32(pt.x), 1);
  return out;
}

/** Ethereum address (20 bytes) for a private key. */
export function ethAddress(priv: bigint): Uint8Array {
  const pub = publicKeyBytes(priv);
  const hash = keccak256(pub.slice(1));
  return hash.slice(12);
}

export function ethAddressHex(priv: bigint): string {
  return "0x" + bytesToHex(ethAddress(priv));
}

/** Standard BIP44 Ethereum path helper. */
export const BIP44_ETH_PATH = (account: number, index: number) =>
  `m/44'/60'/${account}'/0/${index}`;
