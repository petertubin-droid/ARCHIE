// =========================================================
// ARCHIE WALLET RECOVERY CLIENT (batch 21, fix 71)
// =========================================================
// Browser calls for the owner-only abandoned-wallet
// passphrase recovery surface (archie-wallet-recovery). The
// browser NEVER receives private keys from the server, and
// the durable ledger never stores mnemonics/passphrases.
// The full job result is the owner's own data, delivered over
// authenticated HTTPS only.
// =========================================================

import { supabase } from "@/lib/supabase";

export interface RecoveryMeta {
  caps: { maxCandidates: number; maxPassphrases: number; maxPaths: number };
  chains: Array<{ id: string; name: string }>;
  contract: string[];
}

export interface RecoveryAddressCheck {
  path: string;
  address: string;
  hintMatch: boolean;
  activity: Record<string, unknown> | null;
  hasActivity: boolean;
}

export interface RecoveryCandidateResult {
  mnemonic: string;
  entropyHex: string;
  passphrase: string;
  addresses: RecoveryAddressCheck[];
  found: boolean;
}

export interface RecoveryJobResultView {
  specSummary: {
    slots: number;
    blanks: number;
    candidatePool: number;
    passphrases: number;
    pathsPerCandidate: number;
    chains: string[];
  };
  attempts: {
    mnemonicsEnumerated: number;
    checksumValid: number;
    candidatePassphrasePairs: number;
    addressesDerived: number;
    chainQueries: number;
  };
  results: RecoveryCandidateResult[];
  found: boolean;
  completedAt: string;
  note: string;
}

export interface RecoverResponse {
  result: RecoveryJobResultView;
  report: string;
  ledger_warning: string | null;
}

export interface RecoveryJobLedgerRow {
  id: string;
  slots: number;
  blanks: number;
  candidate_pool: number;
  passphrase_count: number;
  accounts: number;
  addresses_per_account: number;
  chains: string[];
  attempts: Record<string, number>;
  found: boolean;
  matched_addresses: string[];
  note: string;
  opened_at: string;
  completed_at: string;
}

async function invokeRecovery<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "archie-wallet-recovery",
    { body },
  );
  if (error) {
    // FIX 63 pattern: surface the real edge error context.
    const ctx = (error as { context?: { message?: string } }).context;
    throw new Error(`archie-wallet-recovery: ${ctx?.message ?? error.message}`);
  }
  return data as T;
}

export async function fetchRecoveryMeta(): Promise<RecoveryMeta> {
  return invokeRecovery<RecoveryMeta>({ action: "meta" });
}

export async function runRecovery(spec: {
  template: { slots: Array<string | null>; candidates: string[] };
  passphrases: string[];
  accounts?: number;
  addressesPerAccount?: number;
  chains?: string[];
  knownAddressHints?: string[];
}): Promise<RecoverResponse> {
  return invokeRecovery<RecoverResponse>({ action: "recover", spec });
}

export async function fetchRecoveryJobs(): Promise<{
  jobs: RecoveryJobLedgerRow[];
}> {
  return invokeRecovery<{ jobs: RecoveryJobLedgerRow[] }>({ action: "jobs" });
}
