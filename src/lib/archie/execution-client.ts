// =========================================================
// ARCHIE EXECUTION & RUNTIME ENGINE — PWA / STUDIO CLIENT
// src/lib/archie/execution-client.ts
//
// Client for the archie-execute edge function. Owner-only
// surface for the audited execution engine:
//   - listExecutionTargets()    — registry
//   - runExecution(...)         — full pipeline; PRODUCTION
//                                 targets require ownerSecret
//   - getExecutionHistory(...)  — audit trail
//
// SECURITY NOTES:
//   * The Owner Secret is sent ONLY over HTTPS in the request
//     body, verified server-side, never persisted client-side,
//     never logged, and never echoed in results.
//   * This client performs no execution logic itself — all
//     verification, authority, retries and audit happen in the
//     engine (server-side). It cannot execute anything that is
//     not registered and enabled.
// =========================================================

import { supabase } from "@/lib/supabase";

export interface ExecutionTargetView {
  key: string;
  label: string;
  description?: string | null;
  kind: string;
  environment: "SANDBOX" | "STAGING" | "PRODUCTION";
  requires_owner_secret: boolean;
  allowed_initiators: string[];
  risk_class: string;
  enabled: boolean;
  http_method: string;
  idempotent: boolean;
}

export interface ExecutionRunView {
  id: string;
  target_key: string;
  environment: string;
  status: string;
  error?: string | null;
  attempts: number;
  duration_ms?: number | null;
  initiator_system: string;
  authority_method: string;
  created_date: string;
}

export interface RunOutcomeView {
  ok: boolean;
  runId?: string;
  status: string;
  error?: string;
  result?: unknown;
  attempts?: number;
  duration_ms?: number;
}

/** List the execution-target registry (owner session required). */
export async function listExecutionTargets(): Promise<
  { ok: true; targets: ExecutionTargetView[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-execute", {
    body: { action: "list" },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Registry read failed." };
  return { ok: true, targets: data.targets ?? [] };
}

/**
 * Execute a registered target through the audited engine.
 * PRODUCTION targets require the Owner Secret; it is used only
 * for this request (server-side verification) and is never stored.
 */
export async function runExecution(params: {
  targetKey: string;
  input?: Record<string, unknown>;
  ownerSecret?: string;
  deviceFingerprint?: string;
}): Promise<RunOutcomeView | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("archie-execute", {
    body: {
      action: "run",
      targetKey: params.targetKey,
      input: params.input ?? {},
      ownerSecret: params.ownerSecret,
      deviceFingerprint: params.deviceFingerprint,
    },
  });
  if (error) return { ok: false, error: error.message };
  if (!data)
    return { ok: false, error: "No response from the execution engine." };
  return data as RunOutcomeView;
}

/** Recent audited runs (redacted). */
export async function getExecutionHistory(
  limit = 25,
): Promise<
  { ok: true; runs: ExecutionRunView[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-execute", {
    body: { action: "history", limit },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "History read failed." };
  return { ok: true, runs: data.runs ?? [] };
}

// ---------------------------------------------------------
// RECOVERY ENGINE — engine inventory #18 (anatomy "healing")
// Recovery of terminal runs: classify → plan → one audited
// step (retry | compensate | escalate | close). Authority is
// never bypassed — every retried execution re-verifies
// policy, admin JWT and (where required) the Owner Secret.
// ---------------------------------------------------------

export interface RecoveryReportView {
  ok: boolean;
  runId: string;
  classification: string;
  action: string;
  rationale: string;
  recovered: boolean;
  escalated: boolean;
  retryRunId?: string;
  recoveryAttemptsUsed: number;
  recoveryAttemptsLeft: number;
}

export interface RecoveryEventView {
  id: string;
  run_id: string;
  target_key: string;
  classification: string;
  action: string;
  outcome: string;
  detail: string;
  created_by?: string | null;
  created_date: string;
}

/**
 * Recover a terminal execution run (FAILED | TIMEOUT |
 * ROLLED_BACK | REJECTED) through the recovery engine. The
 * decision, its class and its outcome land in the
 * append-only recovery ledger.
 */
export async function recoverExecutionRun(params: {
  runId: string;
  ownerSecret?: string;
  deviceFingerprint?: string;
}): Promise<RecoveryReportView | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("archie-execute", {
    body: {
      action: "recover",
      runId: params.runId,
      ownerSecret: params.ownerSecret,
      deviceFingerprint: params.deviceFingerprint,
    },
  });
  if (error) return { ok: false, error: error.message };
  if (!data)
    return { ok: false, error: "No response from the recovery engine." };
  return data as RecoveryReportView;
}

/** Recovery ledger — append-only audit of every recovery decision. */
export async function getRecoveryHistory(
  limit = 25,
): Promise<
  { ok: true; events: RecoveryEventView[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-execute", {
    body: { action: "recovery", limit },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Recovery ledger read failed." };
  return { ok: true, events: data.events ?? [] };
}
