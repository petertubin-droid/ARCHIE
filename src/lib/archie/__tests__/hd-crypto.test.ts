// =========================================================
// HD CRYPTO CORE TESTS — canonical vectors only.
//
// These tests prove the REAL math: keccak-256 official
// vectors, BIP39 official Trezor seed vectors (vectors.json),
// BIP32 official test-vector-1 raw private keys (decoded from
// the xprv serializations in bip-0032.mediawiki), and the
// canonical BIP44 Ethereum address for the all-zeros entropy
// mnemonic (the ubiquitous m/44'/60'/0'/0/0 example).
// =========================================================

import { describe, expect, it } from "vitest";
import {
  BIP39_WORDLIST,
  deriveSeedFromMnemonic,
  enumerateRecoveryCandidates,
  pbkdf2Sha512WebCrypto,
  sha256WebCrypto,
  validateMnemonic,
} from "@studio-shared/archie-ai/native-engine/crypto/bip39.ts";
import {
  BIP44_ETH_PATH,
  bigintToBytes32,
  bytesToHex,
  deriveChild,
  derivePath,
  ethAddressHex,
  hexToBytes,
  keccak256,
  masterKeyFromSeed,
} from "@studio-shared/archie-ai/native-engine/crypto/hd-crypto.ts";

const enc = (s: string) =>
  new Uint8Array(Array.from(new TextEncoder().encode(s)));

describe("keccak-256 (original Keccak padding)", () => {
  it("empty string vector", () => {
    expect(bytesToHex(keccak256(new Uint8Array(0)))).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });
  it("abc vector", () => {
    expect(bytesToHex(keccak256(enc("abc")))).toBe(
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });
  it("single full block (136 bytes) + padding block", () => {
    expect(bytesToHex(keccak256(new Uint8Array(136)))).toBe(
      "3a5912a7c5faa06ee4fe906253e339467a9ce87d533c65be3c15cb231cdb25f9",
    );
  });
  it("multi-block input (137 and 200 zero bytes)", () => {
    expect(bytesToHex(keccak256(new Uint8Array(137)))).toBe(
      "bee7fbb405cb0d91a8775e338c4a5e4b5d6b2d051f687fa942043cffdc73bd28",
    );
    expect(bytesToHex(keccak256(new Uint8Array(200)))).toBe(
      "e1bb54e1bc3af48d01e5dbfc81015c98152a574f6428c6948aa4837c9c0baad9",
    );
  });
});

describe("BIP39 wordlist + validation", () => {
  it("embeds the canonical English wordlist (2048, strictly sorted)", () => {
    expect(BIP39_WORDLIST.length).toBe(2048);
    expect(BIP39_WORDLIST[0]).toBe("abandon");
    expect(BIP39_WORDLIST[2047]).toBe("zoo");
    for (let i = 1; i < 2048; i++) {
      if (BIP39_WORDLIST[i - 1] >= BIP39_WORDLIST[i]) {
        throw new Error(`wordlist not sorted at ${i}`);
      }
    }
  });

  it("accepts the canonical all-zeros mnemonic (checksum-valid)", async () => {
    const m = "abandon ".repeat(11) + "about";
    const check = await validateMnemonic(m, sha256WebCrypto);
    expect(check.kind).toBe("valid");
    if (check.kind === "valid") {
      expect(check.entropyHex).toBe("0".repeat(32));
    }
  });

  it("rejects checksum-invalid, structure-invalid and wrong-length phrases", async () => {
    const bad = await validateMnemonic(
      "abandon ".repeat(11) + "ability",
      sha256WebCrypto,
    );
    expect(bad.kind).toBe("checksum_invalid");
    const struct = await validateMnemonic(
      "notaword " + "abandon ".repeat(10) + "about",
      sha256WebCrypto,
    );
    expect(struct.kind).toBe("structure_invalid");
    const len = await validateMnemonic("abandon abandon", sha256WebCrypto);
    expect(len.kind).toBe("invalid");
  });
});

describe("BIP39 seed derivation (official Trezor vectors, passphrase TREZOR)", () => {
  it("vector 0: all-zeros entropy, 12 words", async () => {
    const m = "abandon ".repeat(11) + "about";
    const seed = await deriveSeedFromMnemonic(
      m,
      "TREZOR",
      pbkdf2Sha512WebCrypto,
    );
    expect(bytesToHex(seed)).toBe(
      "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
    );
  });
  it("vector 0: all-zeros entropy, 24 words", async () => {
    const m = "abandon ".repeat(23) + "art";
    const seed = await deriveSeedFromMnemonic(
      m,
      "TREZOR",
      pbkdf2Sha512WebCrypto,
    );
    expect(bytesToHex(seed)).toBe(
      "bda85446c68413707090a52022edd26a1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8",
    );
  });
});

describe("BIP32 derivation (official test vector 1, raw keys decoded from xprv)", () => {
  const SEED = "000102030405060708090a0b0c0d0e0f";
  const VECTOR: Array<[string, string]> = [
    ["m", "e8f32e723decf4051aefac8e2c93c9c5b214313817cdb01a1494b917c8436b35"],
    [
      "m/0'",
      "edb2e14f9ee77d26dd93b4ecede8d16ed408ce149b6cd80b0715a2d911a0afea",
    ],
    [
      "m/0'/1",
      "3c6cb8d0f6a264c91ea8b5030fadaa8e538b020f0a387421a12de9319dc93368",
    ],
    [
      "m/0'/1/2'",
      "cbce0d719ecf7431d88e6a89fa1483e02e35092af60c042b1df2ff59fa424dca",
    ],
    [
      "m/0'/1/2'/2",
      "0f479245fb19a38a1954c5c7c0ebab2f9bdfd96a17563ef28a6a4b1a2a764ef4",
    ],
    [
      "m/0'/1/2'/2/1000000000",
      "471b76e389e528d6de6d816857e012c5455051cad6660850e58372a6c3e6e7c8",
    ],
  ];

  it.each(VECTOR)("derives %s correctly", async (path, expected) => {
    const seed = hexToBytes(SEED);
    const key = await derivePath(seed, path);
    expect(bytesToHex(bigintToBytes32(key.privateKey))).toBe(expected);
  });

  it("tracks depth and path labels", async () => {
    const m = await masterKeyFromSeed(hexToBytes(SEED));
    const c = await deriveChild(m, 0x80000000);
    expect(c.depth).toBe(1);
    expect(c.path).toBe("m/0'");
  });
});

describe("BIP44 Ethereum address (canonical vector)", () => {
  it("all-zeros entropy mnemonic → 0x9858EfFD232B4033E47d90003D41EC34Eca9aD77", async () => {
    const m = "abandon ".repeat(11) + "about";
    const seed = await deriveSeedFromMnemonic(m, "", pbkdf2Sha512WebCrypto);
    const key = await derivePath(seed, BIP44_ETH_PATH(0, 0));
    expect(ethAddressHex(key.privateKey).toLowerCase()).toBe(
      "0x9858effd232b4033e47d90003d41ec34ecaeda94",
    );
  });
});

describe("recovery candidate enumeration (checksum-filtered)", () => {
  it("validates a complete template without blanks", async () => {
    const cands = await enumerateRecoveryCandidates(
      {
        slots: ("abandon ".repeat(11) + "about").trim().split(" "),
        candidates: [],
      },
      5,
    );
    expect(cands.length).toBe(1);
    expect(cands[0].entropyHex).toBe("0".repeat(32));
  });

  it("finds the true fill among candidates and returns only checksum-valid results", async () => {
    // TRUE mnemonic: 'abandon'×11 + 'about' — blank slot 0,
    // candidate pool includes the true fill.
    const slots: (string | null)[] = ("abandon ".repeat(11) + "about")
      .trim()
      .split(" ");
    slots[0] = null;
    const cands = await enumerateRecoveryCandidates(
      {
        slots,
        candidates: [
          "ability",
          "able",
          "about",
          "absurd",
          "access",
          "accident",
          "account",
          "abandon",
        ],
      },
      4,
    );
    expect(cands.some((c) => c.mnemonic.startsWith("abandon"))).toBe(true);
    for (const c of cands) {
      const check = await validateMnemonic(c.mnemonic, sha256WebCrypto);
      expect(check.kind).toBe("valid");
    }
  });

  it("returns nothing when the pool cannot contain the true fill", async () => {
    const slots: (string | null)[] = ("abandon ".repeat(11) + "about")
      .trim()
      .split(" ");
    slots[0] = null;
    const cands = await enumerateRecoveryCandidates(
      {
        slots,
        candidates: ["ability", "able", "absurd"],
      },
      4,
    );
    expect(cands).toEqual([]);
  });
});
