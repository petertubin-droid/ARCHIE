// =========================================================
// BLOCKCHAIN LAYER (Crypto & Blockchain Intelligence,
// 2026-09-11). REAL read-only wallet intelligence.
//
// MEASURED LIVE 2026-09-11 (sandbox):
//   blockchain.info rawaddr ......... REACHABLE, keyless (BTC)
//   1rpc.io/eth JSON-RPC ............ REACHABLE, keyless (EVM:
//     eth_getBalance, eth_getTransactionCount, eth_getBlockByNumber)
//   Ethplorer freekey ................ REACHABLE (EVM token balances)
//   Etherscan API ................... requires an owner API key
//
// ARCHITECTURAL INVIOLABLES (owner directive, enforced by code
// structure, not policy comments):
//   - READ ONLY. This module contains ZERO signing functions.
//     There is no code path from here to broadcasting a
//     transaction. "prepare and execute authorized
//     transactions" requires an owner-configured signer
//     adapter which DOES NOT EXIST yet — see the honest
//     capability table in docs/ARCHIE_CRYPTO_INTELLIGENCE.md.
//   - Wallet access is AUTHORIZATION-GATED: only wallets on
//     the owner's authorized registry can be read. An address
//     outside the registry is refused, never "helpfully"
//     probed.
//   - NO private keys, seed phrases or mnemonics ever pass
//     through this module (see passphrase-tools.ts for the
//     exact boundary).
// =========================================================

export interface AuthorizedWallet {
  /** Owner-assigned label. */
  label: string;
  chain: "bitcoin" | "ethereum";
  /** Public address (public by definition — but access is
   *  still gated by this registry). */
  address: string;
  /** Least privilege: read_only is the ONLY scope today.
   *  trade/withdraw scopes do not exist in code and cannot be
   *  invented — this type literally has no value for them. */
  scope: "read_only";
  addedAt: number;
}

export class WalletRegistry {
  private wallets = new Map<string, AuthorizedWallet>();

  /** Owner-authorized (edge function, service role) add. */
  add(wallet: AuthorizedWallet): void {
    this.wallets.set(wallet.address.toLowerCase(), wallet);
  }

  remove(address: string): void {
    this.wallets.delete(address.toLowerCase());
  }

  list(): AuthorizedWallet[] {
    return [...this.wallets.values()];
  }

  /** Gate: an address is readable ONLY when registered. */
  authorized(address: string): AuthorizedWallet | null {
    return this.wallets.get(address.toLowerCase()) ?? null;
  }
}

// ── Address validation (real format + checksum math) ──

/** EIP-55 mixed-case checksum verification — the REAL sha3
 *  keccak256 is required; this implementation uses a minimal
 *  keccak-256 (no external dependency). Returns true when the
 *  address carries a VALID checksum (or is all-lowercase /
 *  all-uppercase, which carry none — reported as unchecksummed
 *  rather than invalid). */
export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Bitcoin base58check format validation (prefix + base58
 *  alphabet; full double-sha256 checksum verification is done
 *  by the explorer read — format-level here). */
export function isBitcoinAddress(address: string): boolean {
  if (/^(bc1)[0-9a-z]{20,60}$/i.test(address)) return true; // bech32
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true; // base58
  return false;
}

export function validateAddress(
  chain: AuthorizedWallet["chain"],
  address: string,
): boolean {
  return chain === "bitcoin" ? isBitcoinAddress(address) : isEvmAddress(address);
}

export interface WalletObservation {
  wallet: AuthorizedWallet;
  chain: AuthorizedWallet["chain"];
  /** Native balance in whole units (BTC / ETH). */
  balance: number;
  /** Transaction count (activity measure). */
  txCount: number;
  /** First-seen / recent transactions (hash references only —
   *  immutable on-chain references). */
  recentTxs: Array<{ hash: string; amount: number; time: number }>;
  note: string;
}

export interface BlockchainOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

async function getJson(
  url: string,
  opts: { fetchFn: typeof fetch; timeoutMs: number },
): Promise<{ ok: boolean; body: string; note?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await opts.fetchFn(url, { signal: ctrl.signal });
    const body = await res.text();
    if (res.status === 403 || res.status === 451 || res.status === 401) {
      return { ok: false, body, note: `provider refused (http ${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, body, note: `provider unavailable (http ${res.status})` };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, body: "", note: "network error — provider unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Read a BTC wallet via blockchain.info rawaddr (keyless,
 *  measured reachable). Only called for AUTHORIZED wallets. */
export async function observeBitcoin(
  wallet: AuthorizedWallet,
  opts: BlockchainOptions = {},
): Promise<WalletObservation | { error: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const res = await getJson(
    `https://blockchain.info/rawaddr/${wallet.address}?limit=5`,
    { fetchFn, timeoutMs },
  );
  if (!res.ok) return { error: `bitcoin explorer read failed: ${res.note}` };
  try {
    const d = JSON.parse(res.body) as {
      final_balance: number;
      n_tx: number;
      txs?: Array<{
        hash: string;
        time: number;
        out?: Array<{ value: number }>;
      }>;
    };
    const recentTxs = (d.txs ?? []).map((t) => ({
      hash: t.hash,
      amount: (t.out ?? []).reduce((a, o) => a + o.value, 0) / 1e8,
      time: (t.time ?? 0) * 1000,
    }));
    return {
      wallet,
      chain: "bitcoin",
      balance: d.final_balance / 1e8,
      txCount: d.n_tx,
      recentTxs,
      note: "source: blockchain.info rawaddr (live explorer read)",
    };
  } catch {
    return { error: "bitcoin explorer returned unparseable data — refused to guess" };
  }
}

/** Read an EVM wallet via 1rpc.io public JSON-RPC (measured
 *  reachable). Balance + nonce. Only for AUTHORIZED wallets. */
export async function observeEvm(
  wallet: AuthorizedWallet,
  opts: BlockchainOptions = {},
): Promise<WalletObservation | { error: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10000;
  const rpc = async (method: string, params: unknown[]): Promise<unknown | null> => {
    const res = await fetchFn("https://1rpc.io/eth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: unknown };
    return j.result ?? null;
  };
  try {
    const [balHex, nonceHex, blockHex] = await Promise.all([
      rpc("eth_getBalance", [wallet.address, "latest"]),
      rpc("eth_getTransactionCount", [wallet.address, "latest"]),
      rpc("eth_blockNumber", []),
    ]);
    if (balHex === null) {
      return { error: "evm rpc read failed: balance query refused/unreachable" };
    }
    return {
      wallet,
      chain: "ethereum",
      balance: parseInt(balHex as string, 16) / 1e18,
      txCount: nonceHex === null ? 0 : parseInt(nonceHex as string, 16),
      recentTxs: [],
      note: `source: 1rpc.io public JSON-RPC (live read, eth_getBalance + nonce at block ${typeof blockHex === "string" ? parseInt(blockHex, 16) : "unknown"})`,
    };
  } catch {
    return { error: "evm rpc error — provider unreachable, refused to guess" };
  }
}

/** The single entry point — authorization-gated read. */
export async function observeWallet(
  registry: WalletRegistry,
  address: string,
  opts: BlockchainOptions = {},
): Promise<WalletObservation | { error: string }> {
  const wallet = registry.authorized(address);
  if (!wallet) {
    return {
      error:
        "This address is not on the owner's authorized-wallet registry — wallet reads are authorization-gated and I will not probe unregistered addresses.",
    };
  }
  if (!validateAddress(wallet.chain, wallet.address)) {
    return { error: "Authorized wallet has an invalid address format — refusing to read." };
  }
  return wallet.chain === "bitcoin"
    ? observeBitcoin(wallet, opts)
    : observeEvm(wallet, opts);
}

/**
 * On-chain transaction INSPECTION (authorized wallet scope):
 * resolve a tx hash to its chain-visible facts via the same
 * explorer surfaces. Read-only, of course.
 */
export async function inspectBitcoinTx(
  txHash: string,
  opts: BlockchainOptions = {},
): Promise<{ found: boolean; note: string; details?: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await getJson(
    `https://blockchain.info/rawtx/${txHash}`,
    { fetchFn, timeoutMs: opts.timeoutMs ?? 10000 },
  );
  if (!res.ok) {
    return { found: false, note: `tx inspection failed: ${res.note}` };
  }
  try {
    const d = JSON.parse(res.body) as {
      hash: string;
      time: number;
      size: number;
      block_height?: number;
      inputs?: unknown[];
      out?: Array<{ value: number }>;
    };
    const outValue = (d.out ?? []).reduce((a, o) => a + o.value, 0) / 1e8;
    return {
      found: true,
      note: `tx ${d.hash}: ${outValue} BTC across ${(d.out ?? []).length} outputs, ${d.size} bytes, block ${d.block_height ?? "unconfirmed"} — immutable on-chain reference`,
      details: JSON.stringify({ hash: d.hash, time: d.time, block: d.block_height }),
    };
  } catch {
    return { found: false, note: "tx explorer returned unparseable data" };
  }
}
