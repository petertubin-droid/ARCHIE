// =========================================================
// REMEDIATION BATCH 4 TESTS (2026-09-13)
//
// Target-level circuit breaker: when the same target has
// RECOVERY_TARGET_RECENT_FAILURES failures in the recent
// window, a retry escalates with one honest diagnosis
// instead of blindly re-entering a degraded target.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  recoverRun,
  RECOVERY_RETRY_COOLDOWN_SECONDS,
  RECOVERY_TARGET_RECENT_FAILURES,
} from "@studio-shared/archie-ai/recovery/engine.ts";
import type { RecoveryDeps } from "@studio-shared/archie-ai/recovery/engine.ts";

function makeDeps(
  run: Record<string, unknown>,
  recentTargetFailures: number | undefined,
) {
  const calls: string[] = [];
  const deps: Record<string, unknown> = {
    getRun: async () => run,
    getTarget: async () => ({
      target_key: "frelux.api.market-prices",
      idempotent: true,
      compensation_key: null,
    }),
    executeTarget: async () => {
      calls.push("execute");
      return { runId: "retry-run", ok: true };
    },
    countRecoveryAttempts: async () => 0,
    recordRecoveryEvent: async (ev: Record<string, unknown>) => {
      calls.push(`ledger:${ev.action}`);
    },
    recordSecurityEvent: async () => {
      calls.push("security");
    },
    log: () => {},
  };
  if (recentTargetFailures !== undefined) {
    deps.countRecentTargetFailures = async () => recentTargetFailures;
  }
  return { deps: deps as unknown as RecoveryDeps, calls };
}

const baseRun = {
  id: "run-cb",
  target_key: "frelux.api.market-prices",
  status: "FAILED",
  input: { product: "cement" },
  error: "upstream 503",
  http_status: 503,
  attempts: 1,
  compensation_run_id: null,
  initiator_system: "archie",
  updated_date: new Date(
    Date.now() - (RECOVERY_RETRY_COOLDOWN_SECONDS + 300) * 1000,
  ).toISOString(),
};

const owner = { userId: "owner", isAdmin: true } as never;

describe("Target-level circuit breaker (remediation batch 4)", () => {
  it("escalates when the target itself is degraded — no blind retry", async () => {
    const { deps, calls } = makeDeps(baseRun, RECOVERY_TARGET_RECENT_FAILURES);
    const report = await recoverRun(deps, {
      runId: "run-cb",
      caller: owner,
    });
    expect(calls).not.toContain("execute");
    expect(report.escalated).toBe(true);
    expect(report.rationale).toContain("circuit breaker");
    // Escalation reaches the owner feed.
    expect(calls).toContain("security");
  });

  it("isolated run failure still retries — breaker stays off", async () => {
    const { deps, calls } = makeDeps(baseRun, 1);
    await recoverRun(deps, { runId: "run-cb", caller: owner });
    expect(calls).toContain("execute");
  });

  it("callers without the counter keep the old retry behavior", async () => {
    const { deps, calls } = makeDeps(baseRun, undefined);
    await recoverRun(deps, { runId: "run-cb", caller: owner });
    expect(calls).toContain("execute");
  });
});
