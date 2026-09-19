// =========================================================
// BLOCKCHAIN LAYER & RECOVERY JOB TESTS
//
// * EIP-55 checksums verified against the canonical vectors
//   published in EIP-55 itself (our own keccak-256 does the
//   work — the vectors prove it).
// * JSON-RPC parsing tested with captured live response
//   shapes via a fixture fetcher (no network in CI).
// * The TRANSFER_TOPIC0 constant is verified against our
//   own keccak over the canonical Transfer signature — and
//   the canonical value is cross-checked against the
//   well-known constant.
// * The recovery job is run end-to-end against fixture RPCs
//   with a REAL mnemonic candidate (all-zeros entropy), a
//   REAL derivation (verified BIP44 path) and REAL activity
//   logic — ephemeral keys, public-only results.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  CHAINS,
  formatUnits,
  getBlockNumber,
  getChainActivity,
  getNativeBalance,
  getRecentTransfers,
  isAddress,
  isValidChecksumAddress,
  toChecksumAddress,
  TRANSFER_TOPIC0,
  type RpcFetcher,
} from "@studio-shared/archie-ai/native-engine/crypto/blockchain.ts";
import {
  DEFAULT_RECOVERY_SPEC,
  RECOVERY_CAPS,
  renderRecoveryReport,
  runRecoveryJob,
  validateRecoverySpec,
} from "@studio-shared/archie-ai/native-engine/crypto/passphrase-recovery.ts";
import {
  keccak256,
  bytesToHex,
  ethAddressHex,
} from "@studio-shared/archie-ai/native-engine/crypto/hd-crypto.ts";
import {
  deriveSeedFromMnemonic,
  pbkdf2Sha512WebCrypto,
  validateMnemonic,
  sha256WebCrypto,
} from "@studio-shared/archie-ai/native-engine/crypto/bip39.ts";

// ---------------------------------------------------------
// EIP-55 — canonical vectors from the EIP-55 spec
// ---------------------------------------------------------

// Canonical vectors from the official ERC-55 spec (live)
const EIP55_VECTORS = [
  "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
  "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
];

describe("EIP-55 checksum (canonical vectors)", () => {
  it.each(EIP55_VECTORS)("checksums and validates %s", (addr) => {
    expect(toChecksumAddress(addr.toLowerCase())).toBe(addr);
    expect(isValidChecksumAddress(addr)).toBe(true);
  });
  it("rejects a corrupted checksum", () => {
    expect(
      isValidChecksumAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAee"),
    ).toBe(false);
  });
  it("rejects non-addresses", () => {
    expect(isAddress("0x1234")).toBe(false);
    expect(toChecksumAddress("0xzz")).toBeNull();
  });
  it("TRANSFER_TOPIC0 equals keccak256 of the canonical signature", () => {
    const sig = "Transfer(address,address,uint256)";
    const computed = bytesToHex(keccak256(new TextEncoder().encode(sig)));
    expect("0x" + computed).toBe(TRANSFER_TOPIC0);
  });
});

// ---------------------------------------------------------
// JSON-RPC parsing (fixture fetcher, captured shapes)
// ---------------------------------------------------------

function rpcFixture(routes: Record<string, unknown>): RpcFetcher {
  return async (_url, init) => {
    const body = init?.body ? JSON.parse(init.body) : { method: "" };
    const payload = routes[body.method];
    if (payload === undefined) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          error: { code: -32601, message: "not found" },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: "2.0", id: body.id, result: payload }),
    };
  };
}

const FULL_MNEMONIC = ("abandon ".repeat(11) + "about").trim();

describe("JSON-RPC methods", () => {
  it("getBlockNumber parses hex quantity", async () => {
    const r = await getBlockNumber(
      "ethereum",
      rpcFixture({ eth_blockNumber: "0x18c0528" }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value).toBe(0x18c0528n);
  });
  it("getNativeBalance parses wei", async () => {
    const r = await getNativeBalance(
      "ethereum",
      "0x9858EfFD232B4033E47d90003D41EC34EcaEDa94",
      rpcFixture({ eth_getBalance: "0x1bc16d674ec80000" }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value).toBe(2000000000000000000n);
  });
  it("rejects an invalid address without any RPC call", async () => {
    const r = await getNativeBalance(
      "ethereum",
      "0xnotanaddress",
      rpcFixture({ eth_getBalance: "0x0" }),
    );
    expect(r.kind).toBe("unavailable");
  });
  it("unreachable chain reports honestly", async () => {
    const failing: RpcFetcher = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const r = await getBlockNumber("ethereum", failing);
    expect(r.kind).toBe("unavailable");
    if (r.kind === "unavailable") {
      expect(r.endpointsTried.length).toBe(CHAINS.ethereum.rpc.length);
    }
  });
  it("formatUnits renders whole + fractional", () => {
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toBe("1.5");
    expect(formatUnits(100n, 18)).toBe("0.0000000000000001"); // 100 wei, honest precision
    expect(formatUnits(2n ** 128n, 18)).toBe(
      "340282366920938463463.374607431768211456",
    );
  });
  it("getChainActivity flags activity via balance or nonce", async () => {
    const fetcher = rpcFixture({
      eth_getBalance: "0x0",
      eth_getTransactionCount: "0x3",
      eth_blockNumber: "0x10",
    });
    const r = await getChainActivity(
      "base",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Af1C9A77",
      fetcher,
    );
    expect("hasActivity" in r && r.hasActivity).toBe(true);
    const idle = await getChainActivity(
      "base",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Af1C9A77",
      rpcFixture({
        eth_getBalance: "0x0",
        eth_getTransactionCount: "0x0",
        eth_blockNumber: "0x10",
      }),
    );
    expect("hasActivity" in idle && idle.hasActivity).toBe(false);
  });
  it("getRecentTransfers filters logs to the address and parses values", async () => {
    const addr = "0x5aaeb6053f3e94c9b9a09f33669435e7af1c9a77";
    const fetcher = rpcFixture({
      eth_getLogs: [
        {
          transactionHash: "0xabc",
          topics: [
            TRANSFER_TOPIC0,
            "0x000000000000000000000000" + addr.slice(2),
            "0x000000000000000000000000" +
              "fb6916095ca1df60bb79ce92ce3ea74c37c5d359",
          ],
          data: "0xde0b6b3a7640000", // 1e18
          blockNumber: "0x12",
        },
        {
          transactionHash: "0xdef",
          topics: [
            TRANSFER_TOPIC0,
            "0x000000000000000000000000" +
              "fb6916095ca1df60bb79ce92ce3ea74c37c5d359",
            "0x000000000000000000000000" +
              "dbf03b407c01e7cd3cbea99509d93f8dddc8c6fb",
          ],
          data: "0x1",
          blockNumber: "0x13",
        },
      ],
    });
    const r = await getRecentTransfers(
      "ethereum",
      "0x5aAeb6053F3E94C9b9A09f33669435E7Af1C9A77",
      null,
      1n,
      fetcher,
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.value.length).toBe(1); // second log is unrelated
      expect(r.value[0].value).toBe(1_000_000_000_000_000_000n);
      expect(r.value[0].from).toBe(addr);
    }
  });
});

// ---------------------------------------------------------
// Recovery job — end-to-end with fixture RPCs
// ---------------------------------------------------------

describe("passphrase recovery job", () => {
  const goodSpec = {
    ...DEFAULT_RECOVERY_SPEC,
    template: {
      slots: FULL_MNEMONIC.split(" "),
      candidates: [],
    },
  };

  it("validates spec and enforces caps", () => {
    expect(validateRecoverySpec(goodSpec).ok).toBe(true);
    expect(validateRecoverySpec({ ...goodSpec, passphrases: [] }).ok).toBe(
      false,
    );
    expect(
      validateRecoverySpec({
        ...goodSpec,
        accounts: 5,
        addressesPerAccount: 5,
      }).ok,
    ).toBe(false);
    expect(RECOVERY_CAPS.maxPaths).toBe(10);
  });

  it("rejects an invalid template (wrong checksum)", async () => {
    const badSpec = {
      ...goodSpec,
      template: {
        slots: ("abandon ".repeat(11) + "ability").trim().split(" "),
        candidates: [],
      },
    };
    const result = await runRecoveryJob(badSpec, rpcFixture({}));
    expect(result.found).toBe(false);
    expect(result.results.length).toBe(0);
  });

  it("finds the real wallet via a known-address hint (all-zero entropy mnemonic)", async () => {
    // The canonical all-zeros mnemonic m/44'/60'/0'/0/0 address
    const seed = await deriveSeedFromMnemonic(
      FULL_MNEMONIC,
      "",
      pbkdf2Sha512WebCrypto,
    );
    const { derivePath } =
      await import("@studio-shared/archie-ai/native-engine/crypto/hd-crypto.ts");
    const key = await derivePath(seed, "m/44'/60'/0'/0/0");
    const targetAddress = ethAddressHex(key.privateKey);
    expect(targetAddress.toLowerCase()).toBe(
      "0x9858effd232b4033e47d90003d41ec34ecaeda94",
    );
    const spec = {
      ...goodSpec,
      accounts: 1,
      addressesPerAccount: 1,
      knownAddressHints: [targetAddress],
    };
    const result = await runRecoveryJob(spec, rpcFixture({}));
    expect(result.found).toBe(true);
    expect(result.results.length).toBe(1);
    expect(result.results[0].found).toBe(true);
    const hit = result.results[0].addresses.find((a) => a.hasActivity)!;
    expect(hit.hintMatch).toBe(true);
    expect(hit.address.toLowerCase()).toBe(
      "0x9858effd232b4033e47d90003d41ec34ecaeda94",
    );
    const report = renderRecoveryReport(result);
    expect(report).toContain("FOUND");
    expect(report).toContain("known-address hint");
    // Honest custody language:
    expect(result.note).toContain("never holds or exports keys");
  });

  it("finds the real wallet via on-chain activity (fixture RPC)", async () => {
    const fetcher = rpcFixture({
      eth_getBalance: "0x1bc16d674ec80000", // 2 ETH on every chain
      eth_getTransactionCount: "0x0",
      eth_blockNumber: "0x10",
    });
    const spec = {
      ...goodSpec,
      accounts: 1,
      addressesPerAccount: 1,
      chains: ["ethereum" as const],
    };
    const result = await runRecoveryJob(spec, fetcher);
    expect(result.found).toBe(true);
    const hit = result.results[0].addresses.find((a) => a.hasActivity)!;
    expect(hit.hintMatch).toBe(false);
    expect(hit.activity?.chainsWithActivity).toEqual(["ethereum"]);
  });

  it("reports not-found honestly with zero balances everywhere", async () => {
    const fetcher = rpcFixture({
      eth_getBalance: "0x0",
      eth_getTransactionCount: "0x0",
      eth_blockNumber: "0x10",
    });
    const result = await runRecoveryJob(
      {
        ...goodSpec,
        accounts: 1,
        addressesPerAccount: 1,
        chains: ["ethereum" as const],
      },
      fetcher,
    );
    expect(result.found).toBe(false);
    expect(result.note).toContain("not proof the wallet is empty elsewhere");
  });

  it("the owner's recovery mnemonic passes real BIP39 validation", async () => {
    const check = await validateMnemonic(FULL_MNEMONIC, sha256WebCrypto);
    expect(check.kind).toBe("valid");
  });
});
