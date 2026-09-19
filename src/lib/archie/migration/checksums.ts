// =========================================================
// FRELUX ARCHIE MIGRATION — CHECKSUMS
//
// SHA-256 integrity for every file in a migration package
// (spec §7). Uses the platform Web Crypto API — available in
// every browser the PWA supports and in the test runtime.
// =========================================================

import type { ChecksumRecord, PackageComponent, PackageFile } from "./types";

function subtle(): SubtleCrypto {
  // Browser: window.crypto.subtle; Node test runtime: globalThis.crypto
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      "Web Crypto (crypto.subtle) unavailable — cannot compute checksums.",
    );
  }
  return c.subtle;
}

/** Hash arbitrary UTF-8 text with SHA-256 → hex. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await subtle().digest("SHA-256", data);
  return bufferToHex(digest);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Byte length of a file's serialized content. */
export function fileByteLength(file: PackageFile): number {
  if (file.encoding === "base64") {
    // base64 → 4/3 ratio, minus padding
    const pad = file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0;
    return Math.floor((file.content.length * 3) / 4) - pad;
  }
  return new TextEncoder().encode(file.content).length;
}

/** Build checksum records for every file in every component. */
export async function checksumComponents(
  components: PackageComponent[],
): Promise<ChecksumRecord[]> {
  const records: ChecksumRecord[] = [];
  for (const component of components) {
    for (const file of component.files) {
      records.push({
        path: file.path,
        algorithm: "sha256",
        hash: await sha256Hex(file.content),
        bytes: fileByteLength(file),
      });
    }
  }
  return records;
}

/** Verify one file against its recorded checksum. */
export async function verifyFile(
  file: PackageFile,
  record: ChecksumRecord,
): Promise<{ ok: boolean; reason?: string }> {
  const actual = await sha256Hex(file.content);
  if (actual !== record.hash) {
    return {
      ok: false,
      reason: `Checksum mismatch for ${file.path}: expected ${record.hash}, got ${actual} — the file was modified or corrupted.`,
    };
  }
  const bytes = fileByteLength(file);
  if (bytes !== record.bytes) {
    return {
      ok: false,
      reason: `Size mismatch for ${file.path}: expected ${record.bytes} bytes, got ${bytes}.`,
    };
  }
  return { ok: true };
}
