// =========================================================
// REMEDIATION BATCH 3 TESTS (2026-09-12)
//
// Recovery retry pacing: a TRANSIENT/TIMEOUT failure is never
// re-entered while the run is still hot — the deferral is
// ledgered, names the eligible time, and never touches the
// target. After the cooldown, the normal retry path runs.
// =========================================================

import { describe, it, expect } from "vitest";
import {
  recoverRun,
  RECOVERY_RETRY_COOLDOWN_SECONDS,
} from "@studio-shared/archie-ai/recovery/engine.ts";
import type { RecoveryDeps } from "@studio-shared/archie-ai/recovery/engine.ts";

function makeDeps(run: Record<string, unknown>) {
  const calls: string[] = [];
  const deps = {
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
  } as unknown as RecoveryDeps;
  return { deps, calls };
}

const owner = { userId: "owner", isAdmin: true } as never;

describe("Recovery retry pacing (remediation batch 3)", () => {
  it("defers a retry while the run is hot — target untouched, deferral ledgered", async () => {
    const run = {
      id: "run-1",
      target_key: "frelux.api.market-prices",
      status: "FAILED",
      input: { product: "cement" },
      error: "upstream 503",
      http_status: 503,
      attempts: 1,
      compensation_run_id: null,
      initiator_system: "archie",
      updated_date: new Date(Date.now() - 30_000).toISOString(),
    };
    const { deps, calls } = makeDeps(run);
    const report = await recoverRun(deps, { runId: "run-1", caller: owner });
    expect(calls).not.toContain("execute");
    expect(report.recovered).toBe(false);
    expect(report.rationale).toContain("cooldown");
    expect(report.rationale).toContain("retry eligible at");
    // The deferral is auditable — a ledger event was recorded.
    expect(calls).toContain("ledger:NOOP");
  });

  it("re-enters the target normally once the cooldown has passed", async () => {
    const run = {
      id: "run-2",
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
    const { deps, calls } = makeDeps(run);
    await recoverRun(deps, { runId: "run-2", caller: owner });
    expect(calls).toContain("execute");
  });

  it("legacy runs without updated_date still retry (backward compatible)", async () => {
    const run = {
      id: "run-3",
      target_key: "frelux.api.market-prices",
      status: "TIMEOUT",
      input: {},
      error: "timeout",
      http_status: null,
      attempts: 1,
      compensation_run_id: null,
      initiator_system: "archie",
    };
    const { deps, calls } = makeDeps(run);
    await recoverRun(deps, { runId: "run-3", caller: owner });
    expect(calls).toContain("execute");
  });
});
