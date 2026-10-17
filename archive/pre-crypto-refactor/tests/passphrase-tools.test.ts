import { describe, expect, it } from "vitest";
// =========================================================
// PASSPHRASE TOOLS TESTS (Crypto & Blockchain Intelligence,
// 2026-09-11). BIP-39 checksum verification against official
// test vectors — and the custody boundary: valid words are
// never echoed, nothing is stored, no derivation exists.
// =========================================================

import {
  checkMnemonic,
  checkMnemonicFull,
  verifyChecksum,
} from "@studio-shared/archie-ai/native-engine/passphrase-tools.ts";
import { BIP39_ENGLISH } from "@studio-shared/archie-ai/native-engine/domains/bip39-english.data.ts";

// Official BIP-39 test-vector-derived mnemonic (12 words,
// entropy 00000000000000000000000000000000, checksum-valid):
const VALID_12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// Same word repeated 12x — all valid WORDS but the checksum
// FAILS (the last word must encode the SHA-256 checksum):
const BAD_CHECKSUM_12 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";
const UNKNOWN_WORD = "abandon abandon abandon zzzqx abandon abandon abandon abandon abandon abandon abandon about";
const VALID_24 = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

describe("passphrase tools — checksum verification without custody", () => {
  it("embeds the official 2048-word BIP-39 English wordlist verbatim", () => {
    expect(BIP39_ENGLISH.length).toBe(2048);
    expect(BIP39_ENGLISH[0]).toBe("abandon");
    expect(BIP39_ENGLISH[2047]).toBe("zoo");
    expect(new Set(BIP39_ENGLISH).size).toBe(2048);
  });

  it("the canonical 12-word vector PASSES the SHA-256 checksum", async () => {
    const words = VALID_12.split(" ");
    expect(await verifyChecksum(words)).toBe(true);
    const check = await checkMnemonicFull(VALID_12);
    expect(check.looksLikeMnemonic).toBe(true);
    expect(check.checksumValid).toBe(true);
    expect(check.entropyBits).toBe(128);
    expect(check.verdict).toContain("checksum PASSES");
  });

  it("the canonical 24-word vector PASSES too", async () => {
    const check = await checkMnemonicFull(VALID_24);
    expect(check.looksLikeMnemonic).toBe(true);
    expect(check.checksumValid).toBe(true);
    expect(check.entropyBits).toBe(256);
  });

  it("a wrong final word FAILS the checksum — the honest answer", async () => {
    const check = await checkMnemonicFull(BAD_CHECKSUM_12);
    expect(check.looksLikeMnemonic).toBe(true);
    expect(check.checksumValid).toBe(false);
    expect(check.verdict).toContain("CHECKSUM FAILS");
  });

  it("words outside the wordlist are named; valid words are NEVER echoed", async () => {
    const check = await checkMnemonicFull(UNKNOWN_WORD);
    expect(check.looksLikeMnemonic).toBe(false);
    expect(check.unknownWords).toContain("zzzqx");
    // valid words never appear anywhere in the result
    expect(JSON.stringify(check)).not.toContain("abandon");
    // and no stored state exists — a second check of a
    // DIFFERENT input starts clean
    const again = await checkMnemonicFull(VALID_12);
    expect(again.looksLikeMnemonic).toBe(true);
  });

  it("structural check alone claims NO checksum verdict", () => {
    const check = checkMnemonic(VALID_12);
    expect(check.looksLikeMnemonic).toBe(true);
    expect(check.checksumValid).toBeNull(); // honest: crypto not run yet
    expect(check.verdict).toContain("requires the full verification path");
  });

  it("invalid lengths and junk are classified honestly", async () => {
    const tooFew = await checkMnemonicFull("abandon ability able about");
    expect(tooFew.looksLikeMnemonic).toBe(false);
    expect(tooFew.verdict).toContain("not a valid mnemonic length");
    const junk = await checkMnemonicFull("the quick brown fox jumps over the lazy dog today sir");
    expect(junk.looksLikeMnemonic).toBe(false);
    // @ts-expect-error verifyChecksum rejects non-standard lengths outright
    expect(await verifyChecksum(["abandon", "ability"])).toBe(false);
  });

  it("checksum verify is case- and punctuation-normalizing", async () => {
    const noisy = "Abandon, abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ABOUT!";
    const check = await checkMnemonicFull(noisy);
    expect(check.checksumValid).toBe(true);
  });
});
