// =========================================================
// FRELUX PHASE 8b, CLIENT-SIDE ENCRYPTION (Web Crypto)
//
// Protected data is encrypted on the device with AES-256-GCM.
// The key is derived (PBKDF2-SHA256) from a passphrase the user
// enters, the passphrase is NEVER stored, logged, cached or
// sent anywhere. Only ciphertext leaves the device, and only
// for backup. A stolen phone holds ciphertext, not plaintext.
// =========================================================
import type { CipherEnvelope } from "./types";

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      "Web Crypto is not available on this device, protected data cannot be encrypted safely.",
    );
  }
  return c.subtle;
};

export const KDF_ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await subtle().importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function randomBytes(n: number): Promise<Uint8Array> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Encrypt → base64 envelope (safe JSON for storage upload). */
export async function encryptEnvelope(
  passphrase: string,
  plaintext: string,
  iterations: number = KDF_ITERATIONS,
): Promise<CipherEnvelope> {
  const salt = await randomBytes(16);
  const iv = await randomBytes(12);
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await subtle().encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: 1,
    cipher: "AES-256-GCM",
    kdf: {
      algo: "PBKDF2-SHA256",
      salt: toBase64(salt),
      iterations,
    },
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString(),
  };
}

/** Decrypt a stored envelope. Throws on wrong passphrase (GCM auth fails). */
export async function decryptEnvelope(
  passphrase: string,
  envelope: CipherEnvelope,
): Promise<string> {
  if (
    envelope.cipher !== "AES-256-GCM" ||
    envelope.kdf.algo !== "PBKDF2-SHA256"
  ) {
    throw new Error("Unsupported cipher envelope.");
  }
  const key = await deriveKey(
    passphrase,
    fromBase64(envelope.kdf.salt),
    envelope.kdf.iterations,
  );
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) as unknown as BufferSource },
    key,
    fromBase64(envelope.ciphertext) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/** Simple content checksum (integrity of stored ciphertext). */
export async function checksumEnvelope(
  envelope: CipherEnvelope,
): Promise<string> {
  const digest = await subtle().digest(
    "SHA-256",
    new TextEncoder().encode(envelope.ciphertext),
  );
  return toBase64(new Uint8Array(digest));
}

export async function hashPasswordForVerification(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  // Same derivation path as decrypt, used to prove the passphrase
  // matches BEFORE attempting an operation, so wrong-passphrase
  // attempts never touch data. Constant output length.
  const key = await deriveKey(passphrase, salt, iterations);
  const probe = await subtle().encrypt(
    { name: "AES-GCM", iv: new Uint8Array(12) as unknown as BufferSource },
    key,
    new TextEncoder().encode("frelux-integrity-probe"),
  );
  return toBase64(new Uint8Array(probe));
}
