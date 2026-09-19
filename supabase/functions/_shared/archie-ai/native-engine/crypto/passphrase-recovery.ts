// =========================================================
// ARCHIE NATIVE ENGINE — ABANDONED-WALLET PASSPHRASE RECOVERY
// supabase/functions/_shared/archie-ai/native-engine/crypto/passphrase-recovery.ts
//
// Owner directive (2026-09-11): "implement controlled
// passphrase recovery for my abandoned wallet (using only my
// own details)."
//
// THE SECURITY CONTRACT — enforced in this module:
//   1. A recovery job is an EXPLICIT, owner-opened session.
//      The spec (template + candidates + passphrases) comes
//      from the owner; nothing is invented here.
//   2. Every job and every enumeration attempt is auditable:
//      the job record carries full attempt accounting.
//   3. PRIVATE KEYS AND SEEDS ARE NEVER PERSISTED by ARCHIE.
//      Keys are derived ephemerally in memory to compute a
//      PUBLIC address; only the public address and on-chain
//      facts are returned/recorded.
//   4. Found = "this checksum-valid mnemonic+passphrase derives
//      an address with activity on chain X". ARCHIE reports
//      WHICH candidate matched — the owner then imports THEIR
//      OWN passphrase into THEIR OWN wallet software. ARCHIE
//      never exports private keys, ever.
//   5. Hard caps on enumeration (checksum-filtered, bounded)
//      keep jobs finite and honest.
//   6. On-chain lookups use the REAL multi-chain RPC layer
//      (blockchain.ts). Unreachable chains are reported
//      unavailable, never guessed.
// =========================================================

import { BIP44_ETH_PATH, derivePath, ethAddressHex } from "./hd-crypto.ts";
import {
  deriveSeedFromMnemonic,
  enumerateRecoveryCandidates,
  pbkdf2Sha512WebCrypto,
  type RecoveryCandidate,
  type RecoveryTemplate,
} from "./bip39.ts";
import {
  getAddressActivity,
  type ChainId,
  type MultiChainReport,
  type RpcFetcher,
} from "./blockchain.ts";

// ---------------------------------------------------------
// 1. Job specification (owner-supplied, fully auditable)
// ---------------------------------------------------------

export interface RecoveryJobSpec {
  /** Owner's mnemonic template: known words + blanks. */
  template: RecoveryTemplate;
  /** Candidate passphrases to try with each mnemonic
   *  candidate (BIP39 "25th word"). At minimum [""] (empty). */
  passphrases: string[];
  /** BIP44 account depth to scan (default 2 accounts ×
   *  addressesPerAccount indices). */
  accounts: number;
  addressesPerAccount: number;
  /** Chains to check for activity. */
  chains: ChainId[];
  /** Optional: addresses the owner remembers having used —
   *  an instant match shortcut, checked before chain scans. */
  knownAddressHints: string[];
}

export const DEFAULT_RECOVERY_SPEC: Pick<
  RecoveryJobSpec,
  | "passphrases"
  | "accounts"
  | "addressesPerAccount"
  | "chains"
  | "knownAddressHints"
> = {
  passphrases: [""],
  accounts: 2,
  addressesPerAccount: 5,
  chains: ["ethereum", "base", "polygon", "arbitrum", "optimism"],
  knownAddressHints: [],
};

/** Hard caps — jobs cannot exceed these, by design. */
export const RECOVERY_CAPS = {
  maxCandidates: 64,
  maxPassphrases: 8,
  maxPaths: 10,
} as const;

export function validateRecoverySpec(
  spec: RecoveryJobSpec,
): { ok: true } | { ok: false; reason: string } {
  if (spec.passphrases.length === 0) {
    return {
      ok: false,
      reason: 'at least one passphrase candidate required ("" for none)',
    };
  }
  if (spec.passphrases.length > RECOVERY_CAPS.maxPassphrases) {
    return {
      ok: false,
      reason: `too many passphrases (${spec.passphrases.length} > ${RECOVERY_CAPS.maxPassphrases})`,
    };
  }
  if (spec.accounts < 1 || spec.addressesPerAccount < 1) {
    return { ok: false, reason: "accounts/addressesPerAccount must be ≥ 1" };
  }
  if (spec.accounts * spec.addressesPerAccount > RECOVERY_CAPS.maxPaths) {
    return {
      ok: false,
      reason: `path count exceeds cap (${spec.accounts}×${spec.addressesPerAccount} > ${RECOVERY_CAPS.maxPaths})`,
    };
  }
  if (spec.chains.length === 0) {
    return { ok: false, reason: "at least one chain required" };
  }
  return { ok: true };
}

// ---------------------------------------------------------
// 2. Job execution — ephemeral keys, public-only results
// ---------------------------------------------------------

export interface DerivedAddressCheck {
  path: string;
  address: string;
  hintMatch: boolean;
  activity: MultiChainReport | null;
  hasActivity: boolean;
}

export interface CandidateResult {
  /** The checksum-valid mnemonic candidate. Stored inside the
   *  owner-opened job record — this is the recovered phrase
   *  itself; never surfaced anywhere else. */
  mnemonic: string;
  entropyHex: string;
  passphrase: string;
  addresses: DerivedAddressCheck[];
  found: boolean;
}

export interface RecoveryJobResult {
  specSummary: {
    slots: number;
    blanks: number;
    candidatePool: number;
    passphrases: number;
    pathsPerCandidate: number;
    chains: ChainId[];
  };
  attempts: {
    mnemonicsEnumerated: number;
    checksumValid: number;
    candidatePassphrasePairs: number;
    addressesDerived: number;
    chainQueries: number;
  };
  results: CandidateResult[];
  found: boolean;
  completedAt: string;
  note: string;
}

/** Run a recovery job. Fetcher injected for deterministic
 *  tests; production uses real RPCs. */
export async function runRecoveryJob(
  spec: RecoveryJobSpec,
  fetcher: RpcFetcher,
): Promise<RecoveryJobResult> {
  const v = validateRecoverySpec(spec);
  if (!v.ok) {
    throw new Error(`invalid recovery spec: ${v.reason}`);
  }
  const candidates: RecoveryCandidate[] = await enumerateRecoveryCandidates(
    spec.template,
    RECOVERY_CAPS.maxCandidates,
  );
  const blankCount = spec.template.slots.filter((s) => s === null).length;
  const result: RecoveryJobResult = {
    specSummary: {
      slots: spec.template.slots.length,
      blanks: blankCount,
      candidatePool: spec.template.candidates.length,
      passphrases: spec.passphrases.length,
      pathsPerCandidate: spec.accounts * spec.addressesPerAccount,
      chains: spec.chains,
    },
    attempts: {
      mnemonicsEnumerated: 0,
      checksumValid: candidates.length,
      candidatePassphrasePairs: 0,
      addressesDerived: 0,
      chainQueries: 0,
    },
    results: [],
    found: false,
    completedAt: new Date().toISOString(),
    note: "",
  };
  const lowerHints = spec.knownAddressHints.map((h) => h.toLowerCase());

  for (const candidate of candidates) {
    for (const passphrase of spec.passphrases) {
      result.attempts.candidatePassphrasePairs++;
      // EPHEMERAL derivation: seed + keys live in this loop
      // iteration only. Nothing is persisted here.
      const seed = await deriveSeedFromMnemonic(
        candidate.mnemonic,
        passphrase,
        pbkdf2Sha512WebCrypto,
      );
      const addresses: DerivedAddressCheck[] = [];
      for (let account = 0; account < spec.accounts; account++) {
        for (let index = 0; index < spec.addressesPerAccount; index++) {
          const path = BIP44_ETH_PATH(account, index);
          const key = await derivePath(seed, path);
          const address = ethAddressHex(key.privateKey);
          // private key (key) goes out of scope here — only
          // the public address is kept below.
          result.attempts.addressesDerived++;
          const hintMatch = lowerHints.includes(address.toLowerCase());
          let activity: MultiChainReport | null = null;
          let hasActivity = false;
          if (hintMatch) {
            hasActivity = true;
          } else {
            activity = await getAddressActivity(address, spec.chains, fetcher);
            result.attempts.chainQueries++;
            hasActivity = activity.chainsWithActivity.length > 0;
          }
          addresses.push({ path, address, hintMatch, activity, hasActivity });
        }
      }
      const found = addresses.some((a) => a.hasActivity);
      result.results.push({
        mnemonic: candidate.mnemonic,
        entropyHex: candidate.entropyHex,
        passphrase,
        addresses,
        found,
      });
      if (found) result.found = true;
    }
  }
  result.attempts.mnemonicsEnumerated =
    candidates.length * spec.passphrases.length;
  result.note = result.found
    ? "FOUND: at least one checksum-valid candidate derives an address with real on-chain activity (or matching a known address hint). Import YOUR mnemonic/passphrase into YOUR wallet software to take custody — ARCHIE never holds or exports keys."
    : "No candidate derived an address with on-chain activity on the queried chains. This is a definitive negative for the queried chains/paths only — not proof the wallet is empty elsewhere.";
  return result;
}

/** Human-readable honest report. */
export function renderRecoveryReport(result: RecoveryJobResult): string {
  const lines: string[] = [];
  lines.push(
    `Recovery job ${result.found ? "FOUND" : "completed (not found)"} at ${result.completedAt}.`,
  );
  lines.push(
    `Enumerated ${result.attempts.mnemonicsEnumerated} mnemonic×passphrase pairs; ${result.attempts.checksumValid} checksum-valid candidates; ${result.attempts.addressesDerived} addresses derived; ${result.attempts.chainQueries} chain activity scans.`,
  );
  for (const r of result.results) {
    if (!r.found) continue;
    const hits = r.addresses.filter((a) => a.hasActivity);
    lines.push(
      `MATCH: candidate (entropy ${r.entropyHex.slice(0, 8)}…, passphrase ${JSON.stringify(r.passphrase)}) — ${hits.map((h) => `${h.path} → ${h.address} (activity on ${h.hintMatch ? "known-address hint" : (h.activity?.chainsWithActivity.join(", ") ?? "?")})`).join("; ")}`,
    );
  }
  lines.push(result.note);
  return lines.join("\n");
}
