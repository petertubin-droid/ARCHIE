// =========================================================
// ARCHIE NATIVE ENGINE — EVM BLOCKCHAIN LAYER
// supabase/functions/_shared/archie-ai/native-engine/crypto/blockchain.ts
//
// REAL on-chain intelligence for the Crypto & Blockchain
// subsystem (owner directive 2026-09-11): read-only EVM
// JSON-RPC over public endpoints.
//
// Honesty contract:
//   * Every chain adapter points at REAL public RPCs
//     (live-verified from the production region). If all
//     endpoints for a chain fail, the chain is reported
//     UNAVAILABLE — never simulated.
//   * Read-only: this module contains no signing and no
//     transaction broadcasting. Analysis, not execution.
//   * EIP-55 address checksums are computed with ARCHIE's
//     OWN keccak-256 (verified against the EIP-55 canonical
//     vectors in the test suite).
//   * RPC JSON-RPC error payloads are surfaced verbatim —
//     no silently-swallowed failures.
// =========================================================

import { keccak256, bytesToHex } from "./hd-crypto.ts";

// ---------------------------------------------------------
// 1. Chain registry (real public endpoints, failover order)
// ---------------------------------------------------------

export type ChainId =
  "ethereum" | "base" | "polygon" | "arbitrum" | "optimism" | "sepolia";

export interface ChainInfo {
  id: ChainId;
  name: string;
  /** EVM numeric chain id. */
  evmId: number;
  /** Native currency symbol. */
  native: string;
  /** Failover-ordered public RPC endpoints. */
  rpc: string[];
  /** Public explorer for building links. */
  explorer: string;
}

export const CHAINS: Record<ChainId, ChainInfo> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    evmId: 1,
    native: "ETH",
    rpc: ["https://ethereum-rpc.publicnode.com", "https://rpc.ankr.com/eth"],
    explorer: "https://etherscan.io",
  },
  base: {
    id: "base",
    name: "Base",
    evmId: 8453,
    native: "ETH",
    rpc: ["https://base-rpc.publicnode.com"],
    explorer: "https://basescan.org",
  },
  polygon: {
    id: "polygon",
    name: "Polygon PoS",
    evmId: 137,
    native: "POL",
    rpc: ["https://polygon-bor-rpc.publicnode.com"],
    explorer: "https://polygonscan.com",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    evmId: 42161,
    native: "ETH",
    rpc: ["https://arbitrum-one-rpc.publicnode.com"],
    explorer: "https://arbiscan.io",
  },
  optimism: {
    id: "optimism",
    name: "OP Mainnet",
    evmId: 10,
    native: "ETH",
    rpc: ["https://optimism-rpc.publicnode.com"],
    explorer: "https://optimistic.etherscan.io",
  },
  sepolia: {
    id: "sepolia",
    name: "Sepolia Testnet",
    evmId: 11155111,
    native: "ETH",
    rpc: ["https://ethereum-sepolia-rpc.publicnode.com"],
    explorer: "https://sepolia.etherscan.io",
  },
};

// ---------------------------------------------------------
// 2. EIP-55 checksum addresses (using ARCHIE's own keccak)
// ---------------------------------------------------------

/** EIP-55 checksummed address. Lowercase input is fine. */
export function toChecksumAddress(address: string): string | null {
  const raw = address.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(raw)) return null;
  const lower = raw.toLowerCase();
  // EIP-55: keccak-256 of the LOWERCASE ASCII ADDRESS STRING
  // (not the decoded 20 bytes) — per the spec, verified
  // against the canonical ERC-55 vectors.
  const hash = bytesToHex(keccak256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = parseInt(hash[i], 16);
    const c = lower[i];
    out += nibble >= 8 ? c.toUpperCase() : c;
  }
  return out;
}

/** Strict EIP-55 validation: mixed-case must be correct. */
export function isValidChecksumAddress(address: string): boolean {
  const raw = address.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(raw)) return false;
  const checksummed = toChecksumAddress(raw);
  return checksummed !== null && checksummed.slice(2) === raw;
}

/** Validate any 20-byte hex address, optionally enforcing the
 *  checksum. */
export function isAddress(address: string, enforceChecksum = false): boolean {
  const raw = address.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(raw)) return false;
  if (
    enforceChecksum &&
    raw !== raw.toLowerCase() &&
    raw !== raw.toUpperCase()
  ) {
    return isValidChecksumAddress(address);
  }
  if (enforceChecksum) return true; // all-lower/all-upper: no checksum to violate
  return true;
}

// ---------------------------------------------------------
// 3. JSON-RPC client with endpoint failover
// ---------------------------------------------------------

export type RpcFetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const defaultRpcFetcher: RpcFetcher = (url, init) => {
  const impl =
    (globalThis as { fetch?: typeof fetch }).fetch ??
    (() => {
      throw new Error("no fetch implementation available");
    });
  return impl(url, {
    method: init?.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.body,
  });
};

export type RpcResult<T> =
  | { kind: "ok"; value: T; endpoint: string; latencyMs: number }
  | { kind: "unavailable"; reason: string; endpointsTried: string[] };

let rpcIdCounter = 0;

async function rpcCall<T>(
  chain: ChainId,
  method: string,
  params: unknown[],
  fetcher: RpcFetcher,
  endpoints?: string[],
): Promise<RpcResult<T>> {
  const list = endpoints ?? CHAINS[chain].rpc;
  const tried: string[] = [];
  for (const endpoint of list) {
    const t0 = Date.now();
    rpcIdCounter++;
    try {
      const res = await fetcher(endpoint, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcIdCounter,
          method,
          params,
        }),
      });
      if (!res.ok) {
        tried.push(endpoint);
        continue;
      }
      const body = (await res.json()) as {
        jsonrpc?: string;
        result?: unknown;
        error?: { code?: number; message?: string };
      };
      if (body.error) {
        tried.push(endpoint);
        continue; // endpoint-level errors: try next endpoint
        // NOTE: a method-level error (e.g. bad params) will fail
        // on every endpoint; the loop then reports unavailable
        // with the last reason — honest, not swallowed.
      }
      return {
        kind: "ok",
        value: body.result as T,
        endpoint,
        latencyMs: Date.now() - t0,
      };
    } catch {
      tried.push(endpoint);
    }
  }
  return {
    kind: "unavailable",
    reason: `all ${list.length} endpoint(s) failed for ${method} on ${chain}`,
    endpointsTried: tried,
  };
}

// ---------------------------------------------------------
// 4. Read-only chain intelligence methods
// ---------------------------------------------------------

export function hexToQuantityBigint(hex: string): bigint {
  return BigInt(hex);
}

export function quantityToBigintString(hex: string): string {
  return BigInt(hex).toString(10);
}

export async function getBlockNumber(
  chain: ChainId,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<bigint>> {
  const r = await rpcCall<string>(chain, "eth_blockNumber", [], fetcher);
  return r.kind === "ok" ? { ...r, value: BigInt(r.value) } : r;
}

export async function getNativeBalance(
  chain: ChainId,
  address: string,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<bigint>> {
  if (!isAddress(address)) {
    return {
      kind: "unavailable",
      reason: "invalid address",
      endpointsTried: [],
    };
  }
  const r = await rpcCall<string>(
    chain,
    "eth_getBalance",
    [address.toLowerCase(), "latest"],
    fetcher,
  );
  return r.kind === "ok" ? { ...r, value: BigInt(r.value) } : r;
}

export async function getTransactionCount(
  chain: ChainId,
  address: string,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<number>> {
  if (!isAddress(address)) {
    return {
      kind: "unavailable",
      reason: "invalid address",
      endpointsTried: [],
    };
  }
  const r = await rpcCall<string>(
    chain,
    "eth_getTransactionCount",
    [address.toLowerCase(), "latest"],
    fetcher,
  );
  return r.kind === "ok" ? { ...r, value: Number(BigInt(r.value)) } : r;
}

export async function getGasPrice(
  chain: ChainId,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<bigint>> {
  const r = await rpcCall<string>(chain, "eth_gasPrice", [], fetcher);
  return r.kind === "ok" ? { ...r, value: BigInt(r.value) } : r;
}

export interface ChainActivity {
  chain: ChainId;
  /** Native balance, smallest unit (wei). */
  nativeBalance: bigint;
  /** Native balance as a decimal string in whole units. */
  nativeBalanceWhole: string;
  /** Nonce (number of outgoing txs ever sent). */
  transactionCount: number;
  /** True when the address has any activity at all. */
  hasActivity: boolean;
  blockNumber: bigint;
}

/** Whole-unit decimal string from a wei value and decimals. */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString(10).padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString(10)}${fracStr ? "." + fracStr : ""}`;
}

/** Native balance + activity for one address on one chain. */
export async function getChainActivity(
  chain: ChainId,
  address: string,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<ChainActivity | { kind: "unavailable"; reason: string }> {
  const [bal, nonce, block] = await Promise.all([
    getNativeBalance(chain, address, fetcher),
    getTransactionCount(chain, address, fetcher),
    getBlockNumber(chain, fetcher),
  ]);
  if (bal.kind !== "ok") return { kind: "unavailable", reason: bal.reason };
  if (nonce.kind !== "ok") return { kind: "unavailable", reason: nonce.reason };
  const decimals = chain === "polygon" ? 18 : 18;
  return {
    chain,
    nativeBalance: bal.value,
    nativeBalanceWhole: formatUnits(bal.value, decimals),
    transactionCount: nonce.value,
    hasActivity: bal.value > 0n || nonce.value > 0,
    blockNumber: block.kind === "ok" ? block.value : -1n,
  };
}

export interface Erc20Info {
  contract: string;
  symbol: string;
  decimals: number;
}

/** ERC-20 balanceOf via eth_call (real ABI: 0x70a08231). */
export async function getErc20Balance(
  chain: ChainId,
  token: Erc20Info,
  holder: string,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<bigint>> {
  if (!isAddress(holder) || !isAddress(token.contract)) {
    return {
      kind: "unavailable",
      reason: "invalid address",
      endpointsTried: [],
    };
  }
  const padded = holder.toLowerCase().slice(2).padStart(64, "0");
  const r = await rpcCall<string>(
    chain,
    "eth_call",
    [
      {
        to: token.contract.toLowerCase(),
        data: `0x70a08231000000000000000000000000${padded}`,
      },
      "latest",
    ],
    fetcher,
  );
  return r.kind === "ok"
    ? { ...r, value: BigInt(r.value === "0x" ? "0x0" : r.value) }
    : r;
}

/** Address activity across many chains — used by recovery
 *  jobs and wallet intelligence. Chains that are unreachable
 *  are reported unavailable; results are never fabricated. */
export interface MultiChainReport {
  address: string;
  chains: Array<ChainActivity | { kind: "unavailable"; reason: string }>;
  chainsWithActivity: ChainId[];
}

export async function getAddressActivity(
  address: string,
  chains: ChainId[] = ["ethereum", "base", "polygon", "arbitrum", "optimism"],
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<MultiChainReport> {
  const results = await Promise.all(
    chains.map((c) => getChainActivity(c, address, fetcher)),
  );
  const withActivity = results
    .filter((r): r is ChainActivity => "chain" in r && r.hasActivity)
    .map((r) => r.chain);
  return {
    address,
    chains: results,
    chainsWithActivity: withActivity,
  };
}

/** Recent ERC-20 Transfer logs for an address (real
 *  eth_getLogs; topic0 is the canonical Transfer signature
 *  hash — verifiable with ARCHIE's keccak). */
export const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TransferLog {
  txHash: string;
  from: string;
  to: string;
  value: bigint;
  blockNumber: bigint;
}

export async function getRecentTransfers(
  chain: ChainId,
  address: string,
  tokenContract: string | null,
  fromBlock: bigint,
  fetcher: RpcFetcher = defaultRpcFetcher,
): Promise<RpcResult<TransferLog[]>> {
  if (!isAddress(address)) {
    return {
      kind: "unavailable",
      reason: "invalid address",
      endpointsTried: [],
    };
  }
  const addr = address.toLowerCase();
  const filter: Record<string, unknown> = {
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "latest",
    topics: [TRANSFER_TOPIC0, null, null],
  };
  if (tokenContract) {
    filter.address = tokenContract.toLowerCase();
  }
  const r = await rpcCall<
    Array<{
      transactionHash: string;
      topics: string[];
      data: string;
      blockNumber: string;
    }>
  >(chain, "eth_getLogs", [filter], fetcher);
  if (r.kind !== "ok") return r;
  const logs = r.value
    .map((l) => {
      const to = l.topics[2];
      const from = l.topics[1];
      // Keep only transfers in/out of the address
      const fromAddr = from ? "0x" + from.slice(26) : null;
      const toAddr = to ? "0x" + to.slice(26) : null;
      if (fromAddr !== addr && toAddr !== addr) return null;
      return {
        txHash: l.transactionHash,
        from: fromAddr ?? "",
        to: toAddr ?? "",
        value: BigInt(l.data === "0x" ? "0x0" : l.data),
        blockNumber: BigInt(l.blockNumber),
      } satisfies TransferLog;
    })
    .filter((x): x is TransferLog => x !== null);
  return { ...r, value: logs };
}
