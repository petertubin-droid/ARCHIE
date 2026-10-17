// =========================================================
// PASSPHRASE TOOLS — BIP-39 mnemonic CHECKSUM VERIFICATION
// (Crypto & Blockchain Intelligence, 2026-09-11).
//
// OWNER DIRECTIVE BOUNDARY (verbatim): "ARCHIE must NEVER
// request, store, expose or learn the Owner's seed phrase or
// private keys." This module is engineered around that rule:
//
//   WHAT IT DOES (real, useful):
//     - DETECT: recognize whether a block of text is shaped
//       like a BIP-39 mnemonic (count of valid wordlist
//       words, 12/15/18/21/24 length).
//     - VERIFY CHECKSUM: real BIP-39 checksum math — entropy
//       bits from the first n words, SHA-256 (Web Crypto),
//       ENT/32 checksum bits compared against the final
//       word's remaining bits. This answers the owner's real
//       question ("is this passphrase intact / a valid
//       mnemonic?") WITHOUT deriving any key.
//     - STRUCTURE REPORT: word count, entropy bits, checksum
//       pass/fail, and which word breaks validity.
//
//   WHAT IT CANNOT DO (by structure, not policy):
//     - NO key derivation. No PBKDF2, no seed computation, no
//       address derivation. Those functions DO NOT EXIST here.
//     - NO STORAGE: the caller passes the mnemonic as a
//       transient argument; this module has no persistence
//       and its return value NEVER includes the words. The
//       edge-function wrapper (passphrase verify) treats the
//       input as secret-shaped: redactDeep strips it from
//       logs, traces and memory — the same guarantees as the
//       execution engine's secret redaction.
//     - NO CRACKING: brute-forcing a third party's passphrase
//       is not a capability here and would be refused under
//       the security directive (authorized systems only).
//
// "Decipher" per the owner directive is implemented as exactly
// this: telling the owner WHETHER a passphrase is a valid,
// intact BIP-39 mnemonic — nothing more.
// =========================================================

import { BIP39_ENGLISH } from "./domains/bip39-english.data.ts";

const WORD_INDEX = new Map<string, number>(
  BIP39_ENGLISH.map((w, i) => [w, i]),
);

export interface MnemonicCheck {
  looksLikeMnemonic: boolean;
  wordCount: number;
  unknownWords: string[];
  entropyBits: number | null;
  checksumValid: boolean | null;
  verdict: string;
}

/** Detect + validate mnemonic structure. The input words are
 *  echoed ONLY via `unknownWords` when they are NOT in the
 *  wordlist (an unknown word cannot be a secret by definition
 *  — it fails the wordlist) — valid words are never echoed. */
export function checkMnemonic(input: string): MnemonicCheck {
  const words = input
    .trim()
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
  const wordCount = words.length;
  if (wordCount === 0) {
    return {
      looksLikeMnemonic: false,
      wordCount: 0,
      unknownWords: [],
      entropyBits: null,
      checksumValid: null,
      verdict: "No wordlist-shaped content found.",
    };
  }
  const unknownWords = words.filter((w) => !WORD_INDEX.has(w));
  const validWords = words.filter((w) => WORD_INDEX.has(w));
  const validCounts = [12, 15, 18, 21, 24];
  const looksLikeMnemonic =
    unknownWords.length === 0 && validCounts.includes(wordCount);
  if (unknownWords.length > 0) {
    return {
      looksLikeMnemonic: false,
      wordCount,
      unknownWords: unknownWords.slice(0, 5),
      entropyBits: null,
      checksumValid: null,
      verdict:
        wordCount >= 12 && unknownWords.length <= wordCount
          ? `This looks like it may be a BIP-39-style mnemonic, but ${unknownWords.length} word(s) are NOT in the official English wordlist (typos?) — a checksum cannot be computed.`
          : "Not a BIP-39 mnemonic — many words are outside the official wordlist.",
    };
  }
  if (!validCounts.includes(wordCount)) {
    return {
      looksLikeMnemonic: false,
      wordCount,
      unknownWords: [],
      entropyBits: null,
      checksumValid: null,
      verdict: `All ${wordCount} words are valid BIP-39 words, but ${wordCount} is not a valid mnemonic length (12/15/18/21/24) — possibly words are missing.`,
    };
  }
  const entropyBits = (wordCount * 11) - (wordCount / 3);
  return {
    looksLikeMnemonic: true,
    wordCount,
    unknownWords: [],
    entropyBits,
    checksumValid: null,
    verdict: `Structure is a valid BIP-39 mnemonic shape: ${wordCount} words, all in the official English wordlist, ${entropyBits} bits of entropy. The cryptographic CHECKSUM (SHA-256) requires the full verification path — call checkMnemonicFull for the checksum verdict. Structure alone is not proof of validity.`,
  };
}

/** REAL BIP-39 checksum verification (Web Crypto SHA-256).
 *  Computes entropy bits from the first n−1/3 words and
 *  compares ENT/32 checksum bits from SHA-256(entropy) against
 *  the last word's low bits. Pure math over transient input. */
export async function verifyChecksum(words: string[]): Promise<boolean> {
  const n = words.length;
  if (![12, 15, 18, 21, 24].includes(n)) return false;
  const bits: number[] = [];
  for (const w of words) {
    const idx = WORD_INDEX.get(w);
    if (idx === undefined) return false;
    for (let b = 10; b >= 0; b--) bits.push((idx >> b) & 1);
  }
  const entBits = (n * 11 * 32) / 33;
  const csBits = n * 11 - entBits;
  const entropy = new Uint8Array(entBits / 8);
  for (let i = 0; i < entBits; i++) {
    if (bits[i] === 1) entropy[i >> 3] |= 1 << (7 - (i & 7));
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", entropy),
  );
  for (let i = 0; i < csBits; i++) {
    const expected = (digest[i >> 3] >> (7 - (i & 7))) & 1;
    if (bits[entBits + i] !== expected) return false;
  }
  return true;
}

/** The owner-facing entry: transient check with full
 *  cryptographic verification. Words are never returned. */
export async function checkMnemonicFull(input: string): Promise<MnemonicCheck> {
  const base = checkMnemonic(input);
  if (!base.looksLikeMnemonic || base.wordCount === 0) return base;
  const words = input
    .trim()
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
  const ok = await verifyChecksum(words);
  return {
    ...base,
    checksumValid: ok,
    verdict: ok
      ? `VALID BIP-39 mnemonic: ${base.wordCount} words, ${base.entropyBits} bits of entropy, SHA-256 checksum PASSES. This is a structural verdict only — I derived nothing from these words and have not stored them; key derivation is outside my authority by the owner's own rule.`
      : `The ${base.wordCount} words are all valid BIP-39 words, but the SHA-256 CHECKSUM FAILS — at least one word is wrong or out of order. This mnemonic would NOT restore a wallet as written.`,
  };
}
