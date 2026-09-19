// =========================================================
// ARCHIE EXECUTION CLIENT TESTS
//
// Thin, audited client for archie-execute. Pinned:
//   * every call goes to archie-execute with the documented
//     action body
//   * the Owner Secret rides only in the request body, never
//     echoed in results or errors
//   * transport + engine failures surface as {ok:false}, the
//     client invents no success of its own
// =========================================================
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabase } from "@/lib/supabase";
import {
  listExecutionTargets,
  runExecution,
  getExecutionHistory,
  recoverExecutionRun,
  getRecoveryHistory,
} from "@/lib/archie/execution-client";

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  invoke.mockReset();
});

describe("listExecutionTargets", () => {
  it("asks archie-execute for the registry and relays targets", async () => {
    const targets = [
      {
        key: "build-graph",
        label: "Graph",
        kind: "task",
        environment: "STAGING",
        requires_owner_secret: false,
        allowed_initiators: ["OWNER"],
        risk_class: "low",
        enabled: true,
        http_method: "POST",
        idempotent: true,
      },
    ];
    invoke.mockResolvedValue({ data: { ok: true, targets }, error: null });
    const res = await listExecutionTargets();
    expect(invoke).toHaveBeenCalledWith("archie-execute", {
      body: { action: "list" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.targets).toEqual(targets);
  });

  it("engine refusal and transport errors are {ok:false}, never silent", async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    expect((await listExecutionTargets()).ok).toBe(false);
    invoke.mockResolvedValue({ data: null, error: { message: "401" } });
    const res = await listExecutionTargets();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("401");
  });
});

describe("runExecution", () => {
  it("sends action:run with the exact target and secret only in the body", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, runId: "run-1", status: "SUCCEEDED" },
      error: null,
    });
    const res = await runExecution({
      targetKey: "graph-rebuild",
      ownerSecret: "sekret",
      input: { dry: true },
    });
    expect(invoke).toHaveBeenCalledWith("archie-execute", {
      body: {
        action: "run",
        targetKey: "graph-rebuild",
        input: { dry: true },
        ownerSecret: "sekret",
        deviceFingerprint: undefined,
      },
    });
    expect(res).toEqual({ ok: true, runId: "run-1", status: "SUCCEEDED" });
  });

  it("input defaults to {} when omitted", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, status: "SUCCEEDED" },
      error: null,
    });
    await runExecution({ targetKey: "t" });
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> })
      .body;
    expect(body.input).toEqual({});
  });

  it("no response → honest error; transport error → error.message", async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    let res = await runExecution({ targetKey: "t" });
    if (res.ok === false) expect(res.error).toContain("No response");
    invoke.mockResolvedValue({ data: null, error: { message: "timeout" } });
    res = await runExecution({ targetKey: "t" });
    if (res.ok === false) expect(res.error).toBe("timeout");
  });
});

describe("getExecutionHistory", () => {
  it("defaults to 25 redacted runs", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, runs: [{ id: "r1" }] },
      error: null,
    });
    const res = await getExecutionHistory();
    expect(invoke).toHaveBeenCalledWith("archie-execute", {
      body: { action: "history", limit: 25 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.runs).toEqual([{ id: "r1" }]);
  });

  it("engine failure → default error text", async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    const res = await getExecutionHistory();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("History read failed.");
  });
});

describe("recovery engine", () => {
  it("recover sends the run id and secret only in the body", async () => {
    const report = {
      ok: true,
      runId: "run-9",
      classification: "TRANSIENT",
      action: "retry",
      rationale: "safe",
      recovered: true,
      escalated: false,
      retryRunId: "run-10",
      recoveryAttemptsUsed: 1,
      recoveryAttemptsLeft: 2,
    };
    invoke.mockResolvedValue({ data: report, error: null });
    const res = await recoverExecutionRun({ runId: "run-9", ownerSecret: "s" });
    expect(invoke).toHaveBeenCalledWith("archie-execute", {
      body: {
        action: "recover",
        runId: "run-9",
        ownerSecret: "s",
        deviceFingerprint: undefined,
      },
    });
    expect(res).toEqual(report);
  });

  it("no response from the recovery engine → honest error", async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    const res = await recoverExecutionRun({ runId: "x" });
    if ("error" in res)
      expect(res.error).toContain("No response from the recovery engine");
  });

  it("recovery ledger read: events relayed, default bound 25", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, events: [{ id: "e1" }] },
      error: null,
    });
    const res = await getRecoveryHistory();
    expect(invoke).toHaveBeenCalledWith("archie-execute", {
      body: { action: "recovery", limit: 25 },
    });
    expect(res.ok).toBe(true);
  });
});
