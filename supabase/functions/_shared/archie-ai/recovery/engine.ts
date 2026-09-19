// =========================================================
// FRELUX ARCHIE — RECOVERY ENGINE (SHARED CORE)
// supabase/functions/_shared/archie-ai/recovery/engine.ts
//
// THE RECOVERY LAYER (engine inventory #18, anatomy "healing").
//
// Recovery existed only as states inside the execution engine
// (retries with backoff, ROLLED_BACK compensation). This module
// turns it into a real engine: deterministic failure
// classification, bounded recovery planning and an audited
// recovery ledger — always INSIDE the existing authority,
// security and life-safety layers.
//
// PIPELINE (per recovery request):
//   GET RUN → TERMINAL CHECK → CLASSIFY FAILURE
//   → PLAN (policy table) → EXECUTE ONE STEP
//     · RETRY        — re-enter the execution engine with the
//                      ORIGINAL input + initiator; every
//                      authority/policy gate re-runs. Idempotent
//                      targets only.
//     · COMPENSATE   — re-run the failed run's compensation
//                      target (depth 1, as in execution).
//     · ESCALATE     — record a security event for the owner +
//                      ledger entry. Recovery NEVER auto-retries
//                      authority/policy/schema failures and
//                      NEVER bypasses any gate.
//     · CLOSE        — already compensated (ROLLED_BACK): the
//                      lesson is recorded, nothing else runs.
//   → LEDGER (append-only frelux_archie_recovery_events)
//
// HARD RULES:
//   * Only terminal runs (FAILED | TIMEOUT | ROLLED_BACK |
//     REJECTED) can ever be recovered. Running or successful
//     runs are never touched.
//   * RETRY re-enters executeTarget — policy, admin JWT and
//     (where required) the Owner Secret are re-verified. There
//     is no recovery path around authority.
//   * Authority / policy / schema failures escalate. Recovery
//     never "fixes" inputs, never relaxes a gate, never edits
//     a registry row.
//   * Bounded: at most RECOVERY_MAX_ATTEMPTS recovery steps per
//     run; beyond the cap every request escalates. No loops.
//   * Life-safety: runs rejected before execution stay
//     rejected (ESCALATE); the life-safety gate and security
//     verdict run BEFORE every retried execution, exactly as
//     for any fresh request.
// =========================================================

import {
  type CallerAuthority,
  type ExecutionTarget,
  type RunOutcome,
} from "../execution/engine.ts";

// ---------------------------------------------------------
// 1. Types
// ---------------------------------------------------------

/** How a terminal run failed — the input to planning. */
export type FailureClass =
  | "TRANSIENT" // network error / 5xx / 429 — may succeed on retry
  | "TIMEOUT" // execution exceeded timeout — may succeed on retry
  | "LOGIC" // 4xx logic error or invalid input — needs a change, not a retry
  | "SCHEMA" // result violated the target result schema — contract mismatch
  | "AUTH" // rejected: owner authority (admin/secret) — never auto-retried
  | "POLICY" // rejected: initiator policy — never auto-retried
  | "COMPENSATED" // terminal failure already rolled back — state restored
  | "NOT_RECOVERABLE"; // not terminal / nothing to recover

export type RecoveryAction =
  "RETRY" | "COMPENSATE" | "ESCALATE" | "CLOSE" | "NOOP";

/** The minimal terminal run record recovery needs. */
export interface RecoverableRun {
  id: string;
  target_key: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "SUCCESS"
    | "FAILED"
    | "TIMEOUT"
    | "ROLLED_BACK"
    | "REJECTED";
  input: unknown;
  error: string | null;
  http_status: number | null;
  attempts: number;
  compensation_run_id: string | null;
  initiator_system: string;
  /** REMEDIATION batch 3 (2026-09-12): last state change of
   *  the run row (the DB's updated_date). Used for retry
   *  pacing; optional so existing callers stay compatible. */
  updated_date?: string | null;
}

export interface RecoveryLedgerEvent {
  run_id: string;
  target_key: string;
  classification: FailureClass;
  action: RecoveryAction;
  outcome:
    | "RECOVERED"
    | "RETRY_FAILED"
    | "COMPENSATED"
    | "COMPENSATION_FAILED"
    | "ESCALATED"
    | "CLOSED"
    | "NOOP";
  detail: string;
  created_by: string | null;
}

export interface RecoveryReport {
  ok: boolean;
  runId: string;
  classification: FailureClass;
  action: RecoveryAction;
  rationale: string;
  /** true only when a step genuinely restored/closed the run. */
  recovered: boolean;
  /** true when the owner's attention was requested (security event). */
  escalated: boolean;
  /** run id created by a successful retry, if any. */
  retryRunId?: string;
  recoveryAttemptsUsed: number;
  recoveryAttemptsLeft: number;
}

// ---------------------------------------------------------
// 2. Policy (code-enforced, tested)
// ---------------------------------------------------------

/** Recovery steps per run, across all requests. Hard cap. */
export const RECOVERY_MAX_ATTEMPTS = 3;

/** REMEDIATION batch 3 (2026-09-12): minimum seconds between a
 *  run's last state change and a recovery re-entry. A transient
 *  failure is never re-entered while the run is still hot — a
 *  retry storm cannot recover a degraded target, and each
 *  immediate re-entry only hammers it further. */
export const RECOVERY_RETRY_COOLDOWN_SECONDS = 300;

/** REMEDIATION batch 4 (2026-09-13): circuit-breaker threshold
 *  — this many same-target failures within the caller's recent
 *  window trips the breaker and escalates instead of retrying. */
export const RECOVERY_TARGET_RECENT_FAILURES = 3;

/** Recovery never invents initiators — it reuses the run's own. */
export const RECOVERY_NOTE =
  "Recovery re-enters the execution engine; every authority, policy and safety gate re-runs.";

// ---------------------------------------------------------
// 3. Failure classification (pure)
// ---------------------------------------------------------

export function classifyFailure(run: RecoverableRun): {
  classification: FailureClass;
  rationale: string;
} {
  const status = run.status;
  const error = (run.error ?? "").toLowerCase();
  const http = run.http_status;

  if (status === "SUCCESS" || status === "PENDING" || status === "RUNNING") {
    return {
      classification: "NOT_RECOVERABLE",
      rationale: `Run is ${status} — recovery only touches terminal runs.`,
    };
  }
  if (status === "ROLLED_BACK") {
    return {
      classification: "COMPENSATED",
      rationale:
        "Terminal failure was already rolled back — external state restored by the compensation target.",
    };
  }
  if (status === "REJECTED") {
    if (/owner secret|owner authority|non-admin/.test(error)) {
      return {
        classification: "AUTH",
        rationale:
          "Run rejected at the authority gate — retrying the same credentials cannot help.",
      };
    }
    if (/policy|initiator/.test(error)) {
      return {
        classification: "POLICY",
        rationale:
          "Run rejected by the initiator policy — the initiating system is not allowed for this target.",
      };
    }
    if (/input failed validation|input rejected/.test(error)) {
      return {
        classification: "LOGIC",
        rationale:
          "Input failed schema validation — the input must change, not the number of attempts.",
      };
    }
    return {
      classification: "POLICY",
      rationale: `Run rejected before execution: ${run.error ?? "no reason recorded"}`,
    };
  }
  if (status === "TIMEOUT") {
    return {
      classification: "TIMEOUT",
      rationale: `Execution timed out after ${run.attempts} attempt(s).`,
    };
  }
  // FAILED
  if (/schema validation/.test(error)) {
    return {
      classification: "SCHEMA",
      rationale:
        "The target responded but the result violated the registered result schema — a contract mismatch between target and registry.",
    };
  }
  if (http === null) {
    return {
      classification: "TRANSIENT",
      rationale: "No HTTP status recorded — network-level failure.",
    };
  }
  if (http >= 500 || http === 429) {
    return {
      classification: "TRANSIENT",
      rationale: `HTTP ${http} from target — server-side / rate-limit condition.`,
    };
  }
  return {
    classification: "LOGIC",
    rationale: `HTTP ${http} from target — a logic-level rejection, not a transient condition.`,
  };
}

// ---------------------------------------------------------
// 4. Recovery planning (pure policy table)
// ---------------------------------------------------------

export interface RecoveryFacts {
  /** target is idempotent → a retry is safe by definition */
  idempotent: boolean;
  /** target declares a compensation target */
  hasCompensation: boolean;
  /** compensation already attempted for this run */
  compensationAttempted: boolean;
  /** recovery steps still available for this run */
  attemptsLeft: number;
}

export function planRecovery(
  classification: FailureClass,
  facts: RecoveryFacts,
): { action: RecoveryAction; rationale: string } {
  // The cap overrides every plan: exhausted runs escalate.
  if (facts.attemptsLeft <= 0) {
    return {
      action: "ESCALATE",
      rationale: `Recovery budget exhausted (${RECOVERY_MAX_ATTEMPTS} steps per run) — owner attention required.`,
    };
  }
  switch (classification) {
    case "NOT_RECOVERABLE":
      return { action: "NOOP", rationale: "Nothing terminal to recover." };
    case "COMPENSATED":
      return {
        action: "CLOSE",
        rationale:
          "State was already restored by compensation — the run is closed as a recorded lesson.",
      };
    case "AUTH":
      return {
        action: "ESCALATE",
        rationale:
          "Authority rejection — recovery never re-tries credentials or relaxes authority.",
      };
    case "POLICY":
      return {
        action: "ESCALATE",
        rationale:
          "Policy rejection — only the owner can change the registry or the initiator list.",
      };
    case "SCHEMA":
      return {
        action: "ESCALATE",
        rationale:
          "Contract mismatch between target and registry — needs a registry/schema change, not a retry.",
      };
    case "LOGIC":
      return {
        action: "ESCALATE",
        rationale:
          "Logic-level failure — the input or the target must change; recovery does not modify inputs.",
      };
    case "TIMEOUT":
    case "TRANSIENT": {
      if (facts.idempotent) {
        return {
          action: "RETRY",
          rationale: `Idempotent target with a ${
            classification === "TIMEOUT" ? "timeout" : "transient failure"
          } — safe to re-enter the execution engine with the original input.`,
        };
      }
      if (facts.hasCompensation && !facts.compensationAttempted) {
        return {
          action: "COMPENSATE",
          rationale:
            "Non-idempotent target — a retry could double-apply effects; the declared compensation restores state instead.",
        };
      }
      if (facts.hasCompensation && facts.compensationAttempted) {
        return {
          action: "ESCALATE",
          rationale:
            "Non-idempotent target and compensation already attempted — owner must verify state manually.",
        };
      }
      return {
        action: "ESCALATE",
        rationale:
          "Non-idempotent target without a compensation target — no safe automated action exists.",
      };
    }
  }
}

// ---------------------------------------------------------
// 5. Injectable dependencies (Deno + vitest compatible)
// ---------------------------------------------------------

export interface RecoveryDeps {
  getRun(id: string): Promise<RecoverableRun | null>;
  getTarget(key: string): Promise<ExecutionTarget | null>;
  /** The execution engine entry — recovery re-enters it. */
  executeTarget(req: {
    targetKey: string;
    input: unknown;
    initiatorSystem: string;
    caller: CallerAuthority;
  }): Promise<RunOutcome>;
  /** Count of ledger events already recorded for this run. */
  countRecoveryAttempts(runId: string): Promise<number>;
  /** REMEDIATION batch 4 (2026-09-13): count of FAILED/
   *  TIMEOUT runs for the SAME target within the recent
   *  failure window. Optional — when a caller provides it,
   *  the target-level circuit breaker below is armed. */
  countRecentTargetFailures?(targetKey: string): Promise<number>;
  recordRecoveryEvent(ev: RecoveryLedgerEvent): Promise<void>;
  recordSecurityEvent(
    userId: string,
    type: string,
    severity: "info" | "warning" | "critical",
    message: string,
  ): Promise<void>;
  log(message: string): void;
}

// ---------------------------------------------------------
// 6. Recovery orchestration
// ---------------------------------------------------------

export async function recoverRun(
  deps: RecoveryDeps,
  req: { runId: string; caller: CallerAuthority },
): Promise<RecoveryReport> {
  // --- AUTHORITY: recovery is owner-initiated. The caller must
  //     be admin here too; any retried execution re-verifies
  //     everything inside the execution engine anyway.
  if (!req.caller.isAdmin) {
    await deps.recordSecurityEvent(
      req.caller.userId ?? "anonymous",
      "RECOVERY_NON_ADMIN_ATTEMPT",
      "critical",
      `Non-admin attempted to recover run '${req.runId}'.`,
    );
    return {
      ok: false,
      runId: req.runId,
      classification: "AUTH",
      action: "NOOP",
      rationale: "Recovery requires owner authority.",
      recovered: false,
      escalated: false,
      recoveryAttemptsUsed: 0,
      recoveryAttemptsLeft: RECOVERY_MAX_ATTEMPTS,
    };
  }

  const run = await deps.getRun(req.runId);
  if (!run) {
    return {
      ok: false,
      runId: req.runId,
      classification: "NOT_RECOVERABLE",
      action: "NOOP",
      rationale: "Run not found — nothing to recover.",
      recovered: false,
      escalated: false,
      recoveryAttemptsUsed: 0,
      recoveryAttemptsLeft: RECOVERY_MAX_ATTEMPTS,
    };
  }

  const prior = await deps.countRecoveryAttempts(run.id);
  const attemptsLeft = Math.max(0, RECOVERY_MAX_ATTEMPTS - prior);

  const { classification } = classifyFailure(run);

  // No target row (registry changed since the run) → escalate.
  const target = await deps.getTarget(run.target_key);
  if (!target) {
    return finish(deps, {
      run,
      classification,
      action: "ESCALATE",
      rationale:
        "Target no longer registered — registry changed since the run; owner must verify.",
      outcome: "ESCALATED",
      recovered: false,
      escalated: true,
      attemptsUsed: prior,
      attemptsLeft,
      caller: req.caller,
    });
  }

  const { action, rationale } = planRecovery(classification, {
    idempotent: target.idempotent,
    hasCompensation: Boolean(target.compensation_key),
    compensationAttempted: run.compensation_run_id !== null,
    attemptsLeft,
  });

  deps.log(
    `[recovery] run=${run.id} class=${classification} action=${action} attemptsLeft=${attemptsLeft}`,
  );

  switch (action) {
    case "NOOP": {
      return finish(deps, {
        run,
        classification,
        action,
        rationale,
        outcome: "NOOP",
        recovered: false,
        escalated: false,
        attemptsUsed: prior,
        attemptsLeft,
        caller: req.caller,
      });
    }
    case "CLOSE": {
      return finish(deps, {
        run,
        classification,
        action,
        rationale,
        outcome: "CLOSED",
        recovered: true,
        escalated: false,
        attemptsUsed: prior,
        attemptsLeft,
        caller: req.caller,
      });
    }
    case "ESCALATE": {
      return finish(deps, {
        run,
        classification,
        action,
        rationale,
        outcome: "ESCALATED",
        recovered: false,
        escalated: true,
        attemptsUsed: prior,
        attemptsLeft,
        caller: req.caller,
      });
    }
    case "RETRY": {
      // REMEDIATION batch 3 (2026-09-12): retry pacing. The
      // run must be quiet for RECOVERY_RETRY_COOLDOWN_SECONDS
      // before recovery re-enters the target. The deferral is
      // ledgered and says exactly when retry becomes eligible.
      if (run.updated_date) {
        const lastTouched = new Date(run.updated_date).getTime();
        if (
          Number.isFinite(lastTouched) &&
          Date.now() - lastTouched < RECOVERY_RETRY_COOLDOWN_SECONDS * 1000
        ) {
          const eligibleAt = new Date(
            lastTouched + RECOVERY_RETRY_COOLDOWN_SECONDS * 1000,
          );
          return finish(deps, {
            run,
            classification,
            action: "NOOP",
            rationale:
              `Retry cooldown active — the run last changed ${Math.round((Date.now() - lastTouched) / 1000)}s ago. ` +
              `Deferred without re-entering the target; retry eligible at ${eligibleAt.toISOString()}.`,
            outcome: "NOOP",
            recovered: false,
            escalated: false,
            attemptsUsed: prior,
            attemptsLeft,
            caller: req.caller,
          });
        }
      }
      // REMEDIATION batch 4 (2026-09-13): target-level circuit
      // breaker. If the SAME target has tripped RECENT_FAILURES
      // times in the recent window, individual-run retries are
      // blind — the target is degraded, not the run unlucky.
      // Escalate with a single honest diagnosis instead of
      // letting every failed run re-enter it.
      if (deps.countRecentTargetFailures) {
        const recentFailures = await deps.countRecentTargetFailures(
          run.target_key,
        );
        if (recentFailures >= RECOVERY_TARGET_RECENT_FAILURES) {
          return finish(deps, {
            run,
            classification,
            action: "ESCALATE",
            rationale:
              `Target-level circuit breaker: ${recentFailures} runs of target '${run.target_key}' ` +
              `have failed in the recent window — the target is degraded, and retrying this run ` +
              `would only hammer it further. Owner attention required (check the target service).`,
            outcome: "ESCALATED",
            recovered: false,
            escalated: true,
            attemptsUsed: prior,
            attemptsLeft,
            caller: req.caller,
          });
        }
      }
      // Re-enter the execution engine with the ORIGINAL input
      // and the run's ORIGINAL initiator — every gate
      // (policy, admin JWT, owner secret, timeout, retries,
      // compensation, audit) re-runs exactly as for a fresh
      // request. Recovery adds no authority of its own.
      const outcome = await deps.executeTarget({
        targetKey: run.target_key,
        input: run.input,
        initiatorSystem: run.initiator_system,
        caller: req.caller,
      });
      const recoveredNow = outcome.ok;
      return finish(deps, {
        run,
        classification,
        action,
        rationale,
        outcome: recoveredNow ? "RECOVERED" : "RETRY_FAILED",
        recovered: recoveredNow,
        escalated: false,
        attemptsUsed: prior,
        attemptsLeft,
        caller: req.caller,
        retryRunId: outcome.runId,
        detail: recoveredNow
          ? `Retry succeeded on new run ${outcome.runId}.`
          : `Retry failed: ${outcome.error ?? "no error recorded"}`,
      });
    }
    case "COMPENSATE": {
      // Depth-1 compensation, exactly like the execution
      // engine's rollback: the compensation target receives
      // the failed run's reference.
      const outcome = await deps.executeTarget({
        targetKey: target.compensation_key as string,
        input: {
          failed_run_id: run.id,
          target_key: run.target_key,
          original_input: run.input,
        },
        initiatorSystem: "EXECUTION_ROLLBACK",
        caller: req.caller,
      });
      const compensated = outcome.ok;
      return finish(deps, {
        run,
        classification,
        action,
        rationale,
        outcome: compensated ? "COMPENSATED" : "COMPENSATION_FAILED",
        recovered: compensated,
        escalated: !compensated,
        attemptsUsed: prior,
        attemptsLeft,
        caller: req.caller,
        detail: compensated
          ? `Compensation succeeded via ${target.compensation_key}.`
          : `Compensation failed: ${outcome.error ?? "no error recorded"}`,
      });
    }
  }
}

// ---------------------------------------------------------
// 7. Ledger + escalation writer
// ---------------------------------------------------------

interface FinishArgs {
  run: RecoverableRun;
  classification: FailureClass;
  action: RecoveryAction;
  rationale: string;
  outcome: RecoveryLedgerEvent["outcome"];
  recovered: boolean;
  escalated: boolean;
  attemptsUsed: number;
  attemptsLeft: number;
  caller: CallerAuthority;
  retryRunId?: string;
  detail?: string;
}

async function finish(
  deps: RecoveryDeps,
  args: FinishArgs,
): Promise<RecoveryReport> {
  const detail =
    args.detail ??
    (args.escalated
      ? `${args.rationale} (original: ${args.run.error ?? "unknown"})`
      : args.rationale);

  // Append-only ledger — every recovery decision is auditable.
  await deps.recordRecoveryEvent({
    run_id: args.run.id,
    target_key: args.run.target_key,
    classification: args.classification,
    action: args.action,
    outcome: args.outcome,
    detail,
    created_by: args.caller.userId ?? null,
  });

  // Escalations reach the owner through the security feed —
  // recovery never retries its way past a hard failure.
  if (args.escalated) {
    await deps.recordSecurityEvent(
      args.caller.userId ?? "recovery",
      "RECOVERY_ESCALATION_REQUIRED",
      args.classification === "AUTH" || args.classification === "POLICY"
        ? "critical"
        : "warning",
      `Recovery escalation for run ${args.run.id} (target '${args.run.target_key}', class ${args.classification}): ${args.rationale}`,
    );
  }

  return {
    ok: args.recovered,
    runId: args.run.id,
    classification: args.classification,
    action: args.action,
    rationale: args.rationale,
    recovered: args.recovered,
    escalated: args.escalated,
    retryRunId: args.retryRunId,
    recoveryAttemptsUsed: args.attemptsUsed + 1,
    recoveryAttemptsLeft: Math.max(0, args.attemptsLeft - 1),
  };
}
