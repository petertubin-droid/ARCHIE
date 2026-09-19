// =========================================================
// ARCHIE RECOVERY ENGINE — unit + orchestration tests
// src/lib/archie/__tests__/recovery-engine.test.ts
//
// Covers the recovery engine (engine inventory #18):
//   * failure classification for every terminal state
//   * the deterministic planning policy table
//   * the full recoverRun orchestration with injected fakes
//     (no network, no DB): retry, compensation, escalation,
//     close, cap enforcement, ledger audit, authority.
//
// HARD RULES under test:
//   * recovery never bypasses authority — non-admin callers
//     are refused and audited
//   * retries re-enter the execution engine with the ORIGINAL
//     input + initiator (all gates re-run)
//   * authority/policy/schema failures escalate, never retry
//   * the recovery budget (3 steps/run) is enforced
//   * every decision lands in the append-only ledger
// =========================================================
import { describe, it, expect, vi } from "vitest";
import {
  RECOVERY_MAX_ATTEMPTS,
  classifyFailure,
  planRecovery,
  recoverRun,
  RecoveryDeps,
  RecoverableRun,
  RecoveryLedgerEvent,
} from "@studio-shared/archie-ai/recovery/engine.ts";
import type { ExecutionTarget } from "@studio-shared/archie-ai/execution/engine.ts";

// ---------------------------------------------------------
// Fakes
// ---------------------------------------------------------
function makeRun(overrides: Partial<RecoverableRun> = {}): RecoverableRun {
  return {
    id: "run-1",
    target_key: "test-target",
    status: "FAILED",
    input: { foo: "bar" },
    error: "HTTP 503 from target",
    http_status: 503,
    attempts: 3,
    compensation_run_id: null,
    initiator_system: "OWNER_PWA",
    ...overrides,
  };
}

function makeTarget(overrides: Partial<ExecutionTarget> = {}): ExecutionTarget {
  return {
    key: "test-target",
    label: "Test Target",
    description: null,
    kind: "EDGE_FUNCTION",
    function_name: "fake-fn",
    endpoint: null,
    http_method: "POST",
    secret_headers: {},
    environment: "SANDBOX",
    requires_owner_secret: false,
    allowed_initiators: ["OWNER_PWA"],
    input_schema: {},
    result_schema: null,
    timeout_ms: 5000,
    max_retries: 2,
    retry_backoff_ms: 100,
    idempotent: true,
    compensation_key: null,
    enabled: true,
    risk_class: "STANDARD",
    ...overrides,
  };
}

function makeDeps(
  overrides: {
    run?: RecoverableRun | null;
    target?: ExecutionTarget | null;
    priorAttempts?: number;
    execOutcome?: { ok: boolean; runId?: string; error?: string };
  } = {},
): {
  deps: RecoveryDeps;
  ledger: RecoveryLedgerEvent[];
  securityEvents: Array<[string, string, string, string]>;
  executeTarget: ReturnType<typeof vi.fn>;
} {
  const ledger: RecoveryLedgerEvent[] = [];
  const securityEvents: Array<[string, string, string, string]> = [];
  const executeTarget = vi.fn(async () =>
    overrides.execOutcome
      ? {
          ok: overrides.execOutcome.ok,
          runId: overrides.execOutcome.runId ?? "new-run",
          status: overrides.execOutcome.ok
            ? ("SUCCESS" as const)
            : ("FAILED" as const),
          error: overrides.execOutcome.error,
          attempts: 1,
          duration_ms: 10,
        }
      : {
          ok: true,
          runId: "new-run",
          status: "SUCCESS" as const,
          attempts: 1,
          duration_ms: 10,
        },
  );
  const deps: RecoveryDeps = {
    getRun: vi.fn(async () => overrides.run ?? null),
    getTarget: vi.fn(async () => overrides.target ?? null),
    executeTarget,
    countRecoveryAttempts: vi.fn(async () => overrides.priorAttempts ?? 0),
    recordRecoveryEvent: vi.fn(async (ev: RecoveryLedgerEvent) => {
      ledger.push(ev);
    }),
    recordSecurityEvent: vi.fn(
      async (
        userId: string,
        type: string,
        severity: string,
        message: string,
      ) => {
        securityEvents.push([userId, type, severity, message]);
      },
    ),
    log: () => {},
  };
  return { deps, ledger, securityEvents, executeTarget };
}

const OWNER = { userId: "owner-1", isAdmin: true };
const NON_ADMIN = { userId: "user-2", isAdmin: false };

// ---------------------------------------------------------
// 1. Failure classification (pure)
// ---------------------------------------------------------
describe("classifyFailure", () => {
  it("classifies network failures (no HTTP status) as TRANSIENT", () => {
    const r = classifyFailure(
      makeRun({ error: "fetch failed", http_status: null }),
    );
    expect(r.classification).toBe("TRANSIENT");
  });

  it("classifies 5xx and 429 as TRANSIENT", () => {
    expect(classifyFailure(makeRun({ http_status: 503 })).classification).toBe(
      "TRANSIENT",
    );
    expect(classifyFailure(makeRun({ http_status: 429 })).classification).toBe(
      "TRANSIENT",
    );
  });

  it("classifies terminal timeouts as TIMEOUT", () => {
    const r = classifyFailure(
      makeRun({
        status: "TIMEOUT",
        error: "timeout after 5000ms",
        http_status: null,
      }),
    );
    expect(r.classification).toBe("TIMEOUT");
  });

  it("classifies 4xx as LOGIC", () => {
    expect(
      classifyFailure(
        makeRun({ error: "HTTP 404 from target", http_status: 404 }),
      ).classification,
    ).toBe("LOGIC");
  });

  it("classifies result schema violations as SCHEMA", () => {
    const r = classifyFailure(
      makeRun({
        error: "Result failed schema validation: $.id required",
        http_status: 200,
      }),
    );
    expect(r.classification).toBe("SCHEMA");
  });

  it("classifies authority rejections as AUTH", () => {
    const r = classifyFailure(
      makeRun({
        status: "REJECTED",
        error: "This target requires the Owner Secret.",
        http_status: null,
      }),
    );
    expect(r.classification).toBe("AUTH");
  });

  it("classifies policy rejections as POLICY", () => {
    const r = classifyFailure(
      makeRun({
        status: "REJECTED",
        error: "Initiator OWNER_PWA not allowed by policy",
        http_status: null,
      }),
    );
    expect(r.classification).toBe("POLICY");
  });

  it("classifies input validation rejections as LOGIC", () => {
    const r = classifyFailure(
      makeRun({
        status: "REJECTED",
        error: "Input failed validation: $.x required",
        http_status: null,
      }),
    );
    expect(r.classification).toBe("LOGIC");
  });

  it("classifies rolled-back runs as COMPENSATED", () => {
    const r = classifyFailure(
      makeRun({ status: "ROLLED_BACK", compensation_run_id: "comp-1" }),
    );
    expect(r.classification).toBe("COMPENSATED");
  });

  it("refuses to classify non-terminal runs", () => {
    expect(classifyFailure(makeRun({ status: "RUNNING" })).classification).toBe(
      "NOT_RECOVERABLE",
    );
    expect(classifyFailure(makeRun({ status: "PENDING" })).classification).toBe(
      "NOT_RECOVERABLE",
    );
    expect(classifyFailure(makeRun({ status: "SUCCESS" })).classification).toBe(
      "NOT_RECOVERABLE",
    );
  });
});

// ---------------------------------------------------------
// 2. Planning policy (pure)
// ---------------------------------------------------------
describe("planRecovery", () => {
  it("plans RETRY for idempotent transient failures with budget", () => {
    const p = planRecovery("TRANSIENT", {
      idempotent: true,
      hasCompensation: false,
      compensationAttempted: false,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("RETRY");
  });

  it("plans RETRY for idempotent timeouts", () => {
    const p = planRecovery("TIMEOUT", {
      idempotent: true,
      hasCompensation: false,
      compensationAttempted: false,
      attemptsLeft: 1,
    });
    expect(p.action).toBe("RETRY");
  });

  it("plans COMPENSATE for non-idempotent failures with an unused compensation", () => {
    const p = planRecovery("TRANSIENT", {
      idempotent: false,
      hasCompensation: true,
      compensationAttempted: false,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("COMPENSATE");
  });

  it("plans ESCALATE for non-idempotent failures when compensation was already tried", () => {
    const p = planRecovery("TRANSIENT", {
      idempotent: false,
      hasCompensation: true,
      compensationAttempted: true,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("ESCALATE");
  });

  it("plans ESCALATE for non-idempotent failures without compensation", () => {
    const p = planRecovery("TIMEOUT", {
      idempotent: false,
      hasCompensation: false,
      compensationAttempted: false,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("ESCALATE");
  });

  it("never plans a retry for AUTH, POLICY, SCHEMA or LOGIC", () => {
    for (const c of ["AUTH", "POLICY", "SCHEMA", "LOGIC"] as const) {
      const p = planRecovery(c, {
        idempotent: true,
        hasCompensation: true,
        compensationAttempted: false,
        attemptsLeft: 3,
      });
      expect(p.action).toBe("ESCALATE");
    }
  });

  it("plans CLOSE for already-compensated runs", () => {
    const p = planRecovery("COMPENSATED", {
      idempotent: false,
      hasCompensation: true,
      compensationAttempted: true,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("CLOSE");
  });

  it("plans NOOP for non-recoverable runs", () => {
    const p = planRecovery("NOT_RECOVERABLE", {
      idempotent: true,
      hasCompensation: false,
      compensationAttempted: false,
      attemptsLeft: 3,
    });
    expect(p.action).toBe("NOOP");
  });

  it("escalates once the recovery budget is exhausted, whatever the class", () => {
    const p = planRecovery("TRANSIENT", {
      idempotent: true,
      hasCompensation: false,
      compensationAttempted: false,
      attemptsLeft: 0,
    });
    expect(p.action).toBe("ESCALATE");
  });

  it("caps the recovery budget at RECOVERY_MAX_ATTEMPTS", () => {
    expect(RECOVERY_MAX_ATTEMPTS).toBe(3);
  });
});

// ---------------------------------------------------------
// 3. recoverRun orchestration (fakes, no network/DB)
// ---------------------------------------------------------
describe("recoverRun", () => {
  it("refuses non-admin callers and audits them", async () => {
    const { deps, securityEvents, executeTarget, ledger } = makeDeps();
    const r = await recoverRun(deps, { runId: "run-1", caller: NON_ADMIN });
    expect(r.ok).toBe(false);
    expect(r.action).toBe("NOOP");
    expect(executeTarget).not.toHaveBeenCalled();
    expect(securityEvents[0]?.[1]).toBe("RECOVERY_NON_ADMIN_ATTEMPT");
    // refused callers do not consume the run's recovery budget
    expect(ledger.length).toBe(0);
  });

  it("reports NOT_FOUND honestly without inventing a run", async () => {
    const { deps } = makeDeps({ run: null });
    const r = await recoverRun(deps, { runId: "missing", caller: OWNER });
    expect(r.action).toBe("NOOP");
    expect(r.classification).toBe("NOT_RECOVERABLE");
    expect(r.rationale).toMatch(/not found/i);
  });

  it("never touches non-terminal runs", async () => {
    const { deps, executeTarget } = makeDeps({
      run: makeRun({ status: "RUNNING" }),
      target: makeTarget(),
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("NOOP");
    expect(r.recovered).toBe(false);
    expect(executeTarget).not.toHaveBeenCalled();
  });

  it("retries idempotent transient failures through the execution engine with the original input + initiator", async () => {
    const { deps, executeTarget, ledger } = makeDeps({
      run: makeRun({ input: { foo: "bar" }, initiator_system: "OWNER_PWA" }),
      target: makeTarget({ idempotent: true }),
      execOutcome: { ok: true, runId: "new-run-9" },
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("RETRY");
    expect(r.recovered).toBe(true);
    expect(r.retryRunId).toBe("new-run-9");
    // exact original input + initiator re-entered
    expect(executeTarget).toHaveBeenCalledWith({
      targetKey: "test-target",
      input: { foo: "bar" },
      initiatorSystem: "OWNER_PWA",
      caller: OWNER,
    });
    expect(ledger[0]).toMatchObject({
      run_id: "run-1",
      classification: "TRANSIENT",
      action: "RETRY",
      outcome: "RECOVERED",
    });
    expect(r.recoveryAttemptsLeft).toBe(RECOVERY_MAX_ATTEMPTS - 1);
  });

  it("records RETRY_FAILED (no escalation) when the retry itself fails", async () => {
    const { deps, ledger, securityEvents } = makeDeps({
      run: makeRun(),
      target: makeTarget({ idempotent: true }),
      execOutcome: { ok: false, error: "HTTP 500 from target" },
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.recovered).toBe(false);
    expect(r.action).toBe("RETRY");
    expect(ledger[0]?.outcome).toBe("RETRY_FAILED");
    expect(securityEvents.length).toBe(0);
  });

  it("compensates non-idempotent failures via EXECUTION_ROLLBACK (depth 1)", async () => {
    const { deps, executeTarget, ledger } = makeDeps({
      run: makeRun({ compensation_run_id: null }),
      target: makeTarget({
        idempotent: false,
        compensation_key: "test-compensate",
      }),
      execOutcome: { ok: true, runId: "comp-run" },
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("COMPENSATE");
    expect(r.recovered).toBe(true);
    expect(executeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKey: "test-compensate",
        initiatorSystem: "EXECUTION_ROLLBACK",
      }),
    );
    expect(ledger[0]?.outcome).toBe("COMPENSATED");
  });

  it("escalates when compensation fails", async () => {
    const { deps, securityEvents, ledger } = makeDeps({
      run: makeRun(),
      target: makeTarget({
        idempotent: false,
        compensation_key: "test-compensate",
      }),
      execOutcome: { ok: false, error: "HTTP 500 from target" },
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.escalated).toBe(true);
    expect(ledger[0]?.outcome).toBe("COMPENSATION_FAILED");
    expect(securityEvents[0]?.[1]).toBe("RECOVERY_ESCALATION_REQUIRED");
  });

  it("escalates authority rejections — never retries credentials", async () => {
    const { deps, executeTarget, securityEvents, ledger } = makeDeps({
      run: makeRun({
        status: "REJECTED",
        error: "This target requires the Owner Secret.",
        http_status: null,
      }),
      target: makeTarget({ requires_owner_secret: true, idempotent: true }),
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.classification).toBe("AUTH");
    expect(r.action).toBe("ESCALATE");
    expect(executeTarget).not.toHaveBeenCalled();
    expect(ledger[0]?.outcome).toBe("ESCALATED");
    expect(securityEvents[0]?.[2]).toBe("critical");
  });

  it("closes already-compensated (ROLLED_BACK) runs without re-executing", async () => {
    const { deps, executeTarget, ledger } = makeDeps({
      run: makeRun({ status: "ROLLED_BACK", compensation_run_id: "comp-1" }),
      target: makeTarget({
        idempotent: false,
        compensation_key: "test-compensate",
      }),
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("CLOSE");
    expect(r.recovered).toBe(true);
    expect(executeTarget).not.toHaveBeenCalled();
    expect(ledger[0]?.outcome).toBe("CLOSED");
  });

  it("escalates when the target vanished from the registry", async () => {
    const { deps, securityEvents } = makeDeps({
      run: makeRun(),
      target: null,
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("ESCALATE");
    expect(r.escalated).toBe(true);
    expect(securityEvents[0]?.[1]).toBe("RECOVERY_ESCALATION_REQUIRED");
  });

  it("enforces the recovery budget across requests", async () => {
    const { deps, executeTarget } = makeDeps({
      run: makeRun(),
      target: makeTarget({ idempotent: true }),
      priorAttempts: RECOVERY_MAX_ATTEMPTS,
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.action).toBe("ESCALATE");
    expect(r.escalated).toBe(true);
    expect(executeTarget).not.toHaveBeenCalled();
  });

  it("writes exactly one ledger event per recovery decision", async () => {
    const { deps, ledger } = makeDeps({
      run: makeRun(),
      target: makeTarget({ idempotent: true }),
    });
    await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(ledger.length).toBe(1);
    expect(ledger[0]?.created_by).toBe("owner-1");
  });

  it("always counts a consumed step against the budget on retry", async () => {
    const { deps } = makeDeps({
      run: makeRun(),
      target: makeTarget({ idempotent: true }),
      priorAttempts: 2,
    });
    const r = await recoverRun(deps, { runId: "run-1", caller: OWNER });
    expect(r.recoveryAttemptsUsed).toBe(3);
    expect(r.recoveryAttemptsLeft).toBe(0);
  });
});
