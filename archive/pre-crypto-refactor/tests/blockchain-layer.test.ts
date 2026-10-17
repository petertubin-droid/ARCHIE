import { describe, expect, it } from "vitest";
// =========================================================
// BLOCKCHAIN LAYER TESTS (Crypto & Blockchain Intelligence,
// 2026-09-11). Authorization gating, address validation, and
// stubbed provider reads — honest classification, no network.
// =========================================================

import {
  WalletRegistry,
  observeWallet,
  isEvmAddress,
  isBitcoinAddress,
  validateAddress,
  type AuthorizedWallet,
} from "@studio-shared/archie-ai/native-engine/blockchain.ts";

const BTC_WALLET: AuthorizedWallet = {
  label: "genesis test wallet",
  chain: "bitcoin",
  address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  scope: "read_only",
  addedAt: Date.now(),
};

const ETH_WALLET: AuthorizedWallet = {
  label: "vitalik.eth public donation",
  chain: "ethereum",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  scope: "read_only",
  addedAt: Date.now(),
};

function stubFetch(body: unknown, status = 200): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response)) as typeof fetch;
}

function ethRpcFetch(): typeof fetch {
  // fetch(url, init) — the RPC body lives in init.body.
  return (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
    };
    const result =
      body.method === "eth_getBalance"
        ? "0x1bc16d674ec80000" // 2 ETH
        : body.method === "eth_getTransactionCount"
          ? "0x2a" // 42 nonces
          : "0x112a880"; // some block height
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
      json: async () => ({ jsonrpc: "2.0", id: 1, result }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("blockchain layer — read-only and authorization-gated", () => {
  it("validates address formats per chain (no guessing)", () => {
    expect(isEvmAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    expect(isEvmAddress("0x123")).toBe(false);
    expect(isEvmAddress("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false); // missing 0x
    expect(isBitcoinAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(true);
    expect(isBitcoinAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
    expect(isBitcoinAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
    expect(validateAddress("ethereum", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
    expect(validateAddress("bitcoin", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
  });

  it("REFUSES to read any address not on the owner's registry", () => {
    const registry = new WalletRegistry();
    const res = observeWallet(registry, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
    return res.then((r) => {
      expect("error" in r).toBe(true);
      if ("error" in r) {
        expect(r.error).toContain("not on the owner's authorized-wallet registry");
      }
    });
  });

  it("reads a registered BTC wallet via the explorer (stubbed) with exact satoshi math", async () => {
    const registry = new WalletRegistry();
    registry.add(BTC_WALLET);
    const res = await observeWallet(registry, BTC_WALLET.address, {
      fetchFn: stubFetch({
        address: BTC_WALLET.address,
        final_balance: 107_000_000_00, // 107 BTC in satoshis
        n_tx: 42,
        txs: [{ hash: "abc123", time: 1757000000, out: [{ value: 500_000_000 }] }],
      }),
    });
    expect("balance" in res).toBe(true);
    if ("balance" in res) {
      expect(res.balance).toBeCloseTo(107, 6);
      expect(res.txCount).toBe(42);
      expect(res.recentTxs[0].hash).toBe("abc123");
      expect(res.note).toContain("blockchain.info");
    }
  });

  it("reads a registered EVM wallet via JSON-RPC (stubbed) with exact wei math", async () => {
    const registry = new WalletRegistry();
    registry.add(ETH_WALLET);
    const res = await observeWallet(registry, ETH_WALLET.address, {
      fetchFn: ethRpcFetch(),
    });
    expect("balance" in res).toBe(true);
    if ("balance" in res) {
      expect(res.balance).toBeCloseTo(2, 6); // 0x1bc16d674ec80000 = 2 ETH
      expect(res.txCount).toBe(0x2a);
    }
  });

  it("classifies provider failures honestly instead of returning zeros", async () => {
    const registry = new WalletRegistry();
    registry.add(BTC_WALLET);
    const res = await observeWallet(registry, BTC_WALLET.address, {
      fetchFn: stubFetch({ error: "nope" }, 403),
    });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.error).toContain("refused");
    const res2 = await observeWallet(registry, BTC_WALLET.address, {
      fetchFn: stubFetch({}, 500),
    });
    expect("error" in res2).toBe(true);
    if ("error" in res2) expect(res2.error).toContain("unavailable");
  });

  it("read_only is the only scope the registry can hold", () => {
    // The AuthorizedWallet.scope type's ONLY literal is
    // "read_only" (compile-time enforcement); the runtime
    // survey asserts every stored wallet stays read-only —
    // withdrawal/transfer authority does not exist in code.
    const wallets = new WalletRegistry();
    wallets.add(BTC_WALLET);
    wallets.add(ETH_WALLET);
    for (const w of wallets.list()) {
      expect(w.scope).toBe("read_only");
    }
  });
});
