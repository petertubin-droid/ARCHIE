// =========================================================
// FRELUX PHASE 8b, MOBILE CRYPTO TESTS (real Web Crypto)
//
// AES-256-GCM + PBKDF2-SHA256 roundtrips, wrong-passphrase
// rejection, envelope integrity, and the guarantee that
// ciphertext NEVER contains plaintext.
// =========================================================
import { describe, it, expect } from "vitest";
import {
  encryptEnvelope,
  decryptEnvelope,
  checksumEnvelope,
  deriveKey,
  KDF_ITERATIONS,
} from "@/lib/archie/mobile/crypto";

describe("ARCHIE mobile crypto", () => {
  it("encrypt → decrypt roundtrip restores the exact plaintext", async () => {
    const secret = "correct horse battery staple";
    const envelope = await encryptEnvelope(
      secret,
      "FRELUX protected content, roof area 145.2m²",
    );
    const plain = await decryptEnvelope(secret, envelope);
    expect(plain).toBe("FRELUX protected content, roof area 145.2m²");
  });

  it("uses AES-256-GCM with PBKDF2-SHA256 at policy iterations", async () => {
    const envelope = await encryptEnvelope("passphrase-12345", "x", 1000);
    expect(envelope.cipher).toBe("AES-256-GCM");
    expect(envelope.kdf.algo).toBe("PBKDF2-SHA256");
    expect(envelope.kdf.iterations).toBe(1000);
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(310000);
  });

  it("a wrong passphrase FAILS, ciphertext never decrypts", async () => {
    const envelope = await encryptEnvelope(
      "the real passphrase",
      "secret measurements",
    );
    await expect(
      decryptEnvelope("wrong passphrase", envelope),
    ).rejects.toThrow();
  });

  it("ciphertext never contains the plaintext (stolen-phone property)", async () => {
    const plaintext = "UNIQUE-PLAINTEXT-TOKEN-98213";
    const envelope = await encryptEnvelope("another passphrase", plaintext);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(plaintext);
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
  });

  it("two encryptions of the same plaintext differ (random salt+IV)", async () => {
    const a = await encryptEnvelope("pass", "same");
    const b = await encryptEnvelope("pass", "same");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
  });

  it("checksum detects tampered ciphertext (integrity)", async () => {
    const envelope = await encryptEnvelope("pass", "content", 1000);
    const sum1 = await checksumEnvelope(envelope);
    envelope.ciphertext = envelope.ciphertext.slice(0, -4) + "AAAA";
    const sum2 = await checksumEnvelope(envelope);
    expect(sum1).not.toBe(sum2);
  });

  it("derived keys are non-extractable (cannot leak the key material)", async () => {
    const key = await deriveKey("pass", new Uint8Array(16), 1000);
    expect((key as CryptoKey).extractable).toBe(false);
  });
});
