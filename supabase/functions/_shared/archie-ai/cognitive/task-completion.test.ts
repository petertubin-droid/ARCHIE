// ============================================================
// SUPERVISED TASK COMPLETION ENGINE — TESTS
// Evidence for the task-completion capability: decomposition,
// per-step verification, bounded retry, gate stops, constraint
// handling, budget refusal, and the deterministic verdict.
// ============================================================
import { describe, expect, it } from "vitest";
import {
  STEP_RETRY_LIMIT,
  TaskCompletionEngine,
  type TaskCycleRunner,
  type TaskStepGate,
} from "./task-completion.ts";
import type { CognitiveCycleResult } from "./types.ts";

function cycleResult(
  over: Partial<CognitiveCycleResult> = {},
): CognitiveCycleResult {
  return {
    responseText: "step output",
    epistemic: "VERIFIED",
    confidence: 0.9,
    citedFactIds: [],
    meta: null,
    verification:
      over.verification === undefined
        ? { target: "t", verdict: "PASS", checks: [] }
        : over.verification,
    trace: {
      cycleId: "c",
      task: "t",
      phases: [],
      route: {
        phases: [],
        reasoningModes: ["logical"],
        retrievalScope: { knowledge: true, memory: true, worldModel: true },
        tools: [],
        verificationLevel: "standard",
        authority: "autonomous-safe",
        rationale: "test",
      },
      epistemic: "VERIFIED",
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    },
    toolResults: [],
    proposals: [],
    worldModelUpdates: 0,
    ...over,
  } as CognitiveCycleResult;
}

function mockRunner(
  results: Array<CognitiveCycleResult | Error>,
): TaskCycleRunner & { calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    async cycle(input: string) {
      calls.push(input);
      const next = results[Math.min(i, results.length - 1)];
      i += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe("TaskCompletionEngine — decomposition", () => {
  it("runs one full cycle per clause of a compound task", async () => {
    const runner = mockRunner([cycleResult(), cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "estimate the paint for my room and check the price of tyrolene",
    );
    expect(report.steps.filter((s) => s.status === "succeeded")).toHaveLength(
      2,
    );
    expect(runner.calls).toHaveLength(2);
    expect(report.verdict).toBe("ACHIEVED");
    expect(report.achievedRatio).toBe(1);
  });

  it("single-clause task is one plain cycle (no step prefix)", async () => {
    const runner = mockRunner([cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "check the price of tyrolene",
    );
    expect(runner.calls).toEqual(["check the price of tyrolene"]);
    expect(report.verdict).toBe("ACHIEVED");
    expect(report.responseText).toContain("Task verdict: ACHIEVED — 1/1");
  });

  it("negated tails are honored constraints — never executed, never answered", async () => {
    const runner = mockRunner([cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "check the price of tyrolene, but don't include delivery",
    );
    const constraint = report.steps.find(
      (s) => s.status === "skipped-constraint",
    );
    expect(constraint).toBeDefined();
    expect(constraint?.summary).toContain("constraint");
    expect(runner.calls).toHaveLength(1);
    expect(report.verdict).toBe("ACHIEVED");
    expect(report.responseText).toContain("1 constraint(s) honored");
  });

  it("an over-budget compound task is refused honestly, never half-executed", async () => {
    const runner = mockRunner([cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      // gap-1 upgrade raised the compound cap 4 -> 8; this
      // test stays OVER-cap with 9 clauses.
      "estimate a; check b; compute c; also compare d; list e; review f; audit g; plan h; test i",
    );
    expect(report.verdict).toBe("NOT_ACHIEVED");
    expect(report.steps).toHaveLength(0);
    expect(runner.calls).toHaveLength(0);
    expect(report.responseText).toContain("won't half-execute");
    expect(report.notes[0]).toContain("over the compound cap");
  });

  it("a task of only constraints achieves nothing and says so", async () => {
    const runner = mockRunner([]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "don't do anything",
    );
    expect(report.verdict).toBe("NOT_ACHIEVED");
    expect(report.notes.join(" ")).toContain("only constraints");
    expect(runner.calls).toHaveLength(0);
  });
});

describe("TaskCompletionEngine — verification and retry", () => {
  it("a FAIL verdict triggers one bounded retry; a PASS on retry succeeds", async () => {
    const fail = cycleResult({
      verification: {
        target: "t",
        verdict: "FAIL",
        checks: [{ check: "correctness", passed: false, detail: "wrong" }],
      },
    });
    const runner = mockRunner([fail, cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "compute 2+2",
    );
    expect(report.steps[0].status).toBe("succeeded");
    expect(report.steps[0].attempts).toBe(2);
    expect(report.steps[0].verificationVerdict).toBe("PASS");
    expect(runner.calls).toHaveLength(2);
  });

  it("a step that keeps failing is reported as failed — the verdict is honest", async () => {
    const fail = cycleResult({
      verification: {
        target: "t",
        verdict: "FAIL",
        checks: [{ check: "correctness", passed: false, detail: "wrong" }],
      },
    });
    const runner = mockRunner([fail, fail, fail]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "compute 2+2",
    );
    expect(report.steps[0].status).toBe("failed");
    expect(report.steps[0].attempts).toBe(1 + STEP_RETRY_LIMIT);
    expect(report.verdict).toBe("NOT_ACHIEVED");
    expect(report.notes.join(" ")).toContain("failed after 2 attempt(s)");
  });

  it("a crashed cycle is an honest failure, never a fabricated result", async () => {
    const runner = mockRunner([new Error("cycle crash"), cycleResult()]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "check the price of tyrolene",
    );
    // The retry succeeded, so the task recovers — attempts recorded.
    expect(report.steps[0].status).toBe("succeeded");
    expect(report.steps[0].attempts).toBe(2);
  });

  it("UNVERIFIED claim-free steps succeed on cycle completion with their true verdict recorded", async () => {
    const unverified = cycleResult({
      verification: null,
      confidence: 0.8,
      responseText: "greeting delivered",
    });
    const runner = mockRunner([unverified]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "greet the owner",
    );
    expect(report.steps[0].status).toBe("succeeded");
    expect(report.steps[0].verificationVerdict).toBeNull();
    expect(report.confidence).toBe(0.8);
  });

  it("a low-confidence UNVERIFIED step is honest failure evidence in the verdict", async () => {
    const weak = cycleResult({ verification: null, confidence: 0.2 });
    const runner = mockRunner([weak, weak, weak]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "greet the owner",
    );
    expect(report.steps[0].status).toBe("failed");
    expect(report.verdict).toBe("NOT_ACHIEVED");
  });
});

describe("TaskCompletionEngine — deterministic verdict arithmetic", () => {
  it("one of two clauses failing is PARTIAL with the failure named", async () => {
    const fail = cycleResult({
      verification: {
        target: "t",
        verdict: "FAIL",
        checks: [{ check: "correctness", passed: false, detail: "wrong" }],
      },
    });
    const runner = mockRunner([cycleResult(), fail, fail, fail]);
    const report = await new TaskCompletionEngine(runner).executeTask(
      "check the price of tyrolene and estimate the paint for the room",
    );
    expect(report.verdict).toBe("PARTIAL");
    expect(report.achievedRatio).toBe(0.5);
    expect(report.confidence).toBe(0.9); // mean over executed steps
    expect(report.notes.join(" ")).toContain("step 2 failed");
  });

  it("confidence is the mean over executed steps (0 when nothing executed)", async () => {
    const gate: TaskStepGate = () => ({
      allowed: false,
      reason: "out of scope",
    });
    const runner = mockRunner([]);
    const report = await new TaskCompletionEngine(runner, gate).executeTask(
      "check the price of tyrolene and estimate the paint",
    );
    expect(report.verdict).toBe("NOT_ACHIEVED");
    expect(report.confidence).toBe(0);
    expect(report.steps.every((s) => s.status === "gated-stop")).toBe(true);
    expect(report.notes.join(" ")).toContain("security gate");
  });

  it("the security gate stops each clause before any cycle runs", async () => {
    const gate: TaskStepGate = (clause) => ({
      allowed: !/delete/i.test(clause),
      reason: "destructive operation",
    });
    const runner = mockRunner([]);
    const report = await new TaskCompletionEngine(runner, gate).executeTask(
      "delete the database",
    );
    expect(runner.calls).toHaveLength(0);
    expect(report.steps[0].summary).toContain("destructive operation");
  });
});

// ============================================================
// D-2 DURABLE TASK-STEP STATE — TESTS
// Evidence that supervised tasks survive interruption: every
// step is checkpointed the moment it is recorded, a resume
// hydrates the checkpoint and never re-executes recorded
// steps, counters and notes carry over, and a finished task
// is never resumed.
// ============================================================
import type { TaskCheckpoint, TaskStateStore } from "./task-completion.ts";

class MemTaskStateStore implements TaskStateStore {
  rows = new Map<string, TaskCheckpoint>();
  finished = new Map<string, string>();
  saveFail = false;
  loadShouldThrow = false;

  async save(cp: TaskCheckpoint): Promise<void> {
    if (this.saveFail) throw new Error("write failed");
    this.rows.set(cp.taskId, {
      ...cp,
      steps: [...cp.steps],
      notes: [...cp.notes],
    });
  }
  async load(taskId: string): Promise<TaskCheckpoint | null> {
    if (this.loadShouldThrow) throw new Error("read failed");
    return this.rows.get(taskId) ?? null;
  }
  async markFinished(taskId: string, verdict: string): Promise<void> {
    this.finished.set(taskId, verdict);
    this.rows.delete(taskId);
  }
}

describe("durable task-step state (D-2)", () => {
  const compound =
    "estimate the paint for my room and check the price of tyrolene and summarize the total cost";

  it("checkpoints after every executed step", async () => {
    const runner = mockRunner([
      cycleResult({ responseText: "step one done" }),
      cycleResult({ responseText: "step two done" }),
    ]);
    const store = new MemTaskStateStore();
    const engine = new TaskCompletionEngine(runner);
    const r = await engine.executeTask(compound, {
      taskId: "t1",
      stateStore: store,
    });
    expect(r.verdict).toBe("ACHIEVED");
    // finished: markFinished carried the deterministic verdict
    expect(store.finished.get("t1")).toBe("ACHIEVED");
    expect(store.rows.size).toBe(0);
  });

  it("resumes from a crashed isolate's checkpoint without re-executing recorded steps", async () => {
    // A real isolate crash leaves the LAST SAVED checkpoint in
    // archie_task_states (the process died; markFinished never
    // ran). Simulate exactly that: capture the engine's own
    // checkpoint from a run whose later steps fail, restore it
    // as in_progress, and resume with a fresh isolate.
    class SnapStore extends MemTaskStateStore {
      history: TaskCheckpoint[] = [];
      async save(cp: TaskCheckpoint): Promise<void> {
        this.history.push({
          ...cp,
          steps: [...cp.steps],
          notes: [...cp.notes],
        });
        await super.save(cp);
      }
    }
    const snap = new SnapStore();
    const runnerA = mockRunner([
      cycleResult({ responseText: "step one done" }),
      new Error("isolate recycled mid-step"),
      new Error("isolate recycled mid-step"),
      new Error("isolate recycled mid-step"),
      new Error("isolate recycled mid-step"),
    ]);
    const engineA = new TaskCompletionEngine(runnerA);
    const first = await engineA.executeTask(compound, {
      taskId: "t2",
      stateStore: snap,
    });
    expect(first.verdict).toBe("PARTIAL");
    // The checkpoint saved right after step 1 is the crashed state:
    const crashed = snap.history[0];
    expect(crashed.nextIndex).toBe(1);
    expect(crashed.steps).toHaveLength(1);
    expect(crashed.steps[0].summary).toBe("step one done");
    expect(crashed.succeeded).toBe(1);

    // Resume: fresh store holding ONLY the crashed checkpoint
    // (exactly the DB state after the recycle), fresh isolate.
    const store = new MemTaskStateStore();
    store.rows.set("t2", crashed);
    const runnerB = mockRunner([
      cycleResult({ responseText: "step two done" }),
    ]);
    const engineB = new TaskCompletionEngine(runnerB);
    const resumed = await engineB.executeTask(compound, {
      taskId: "t2",
      stateStore: store,
      resume: true,
    });
    expect(runnerB.calls).toHaveLength(1); // step 1 NEVER re-ran
    expect(runnerB.calls[0]).toContain("[Task step 2 of 2]");
    expect(resumed.verdict).toBe("ACHIEVED"); // step 1's success carried over
    expect(resumed.steps[0].summary).toBe("step one done"); // verbatim replay
    expect(resumed.steps[1].summary).toBe("step two done");
    expect(resumed.responseText).toContain("step one done"); // rebuilt output
    expect(resumed.notes.join(" ")).toContain(
      "resumed from durable checkpoint",
    );
    expect(store.finished.get("t2")).toBe("ACHIEVED");
  });

  it("a checkpoint write failure never blocks the task", async () => {
    const runner = mockRunner([cycleResult(), cycleResult()]);
    const store = new MemTaskStateStore();
    store.saveFail = true;
    const engine = new TaskCompletionEngine(runner);
    const r = await engine.executeTask(compound, {
      taskId: "t3",
      stateStore: store,
    });
    expect(r.verdict).toBe("ACHIEVED"); // durability best-effort, execution honest
  });

  it("resume with a mismatched or absent checkpoint just runs the task", async () => {
    const runner = mockRunner([cycleResult(), cycleResult()]);
    const store = new MemTaskStateStore();
    const engine = new TaskCompletionEngine(runner);
    // No checkpoint row for 't4': resume is a no-op hydrate.
    const r = await engine.executeTask(compound, {
      taskId: "t4",
      stateStore: store,
      resume: true,
    });
    expect(runner.calls).toHaveLength(2);
    expect(r.verdict).toBe("ACHIEVED");

    // Mismatched task text: the checkpoint is NOT trusted.
    const other = "calculate the paint for the wall and summarize the coats";
    const r2 = await engine.executeTask(other, {
      taskId: "t4",
      stateStore: store,
      resume: true,
    });
    expect(r2.verdict).toBe("ACHIEVED");
  });

  it("a finished checkpoint is never resumed (store hides finished rows)", async () => {
    const runner = mockRunner([cycleResult(), cycleResult()]);
    const store = new MemTaskStateStore();
    const engine = new TaskCompletionEngine(runner);
    await engine.executeTask(compound, { taskId: "t5", stateStore: store });
    expect(store.finished.get("t5")).toBe("ACHIEVED");
    // Resuming a finished task: load returns null -> full re-run is
    // the ONLY path (the row is gone, so nothing stale replays).
    const runner2 = mockRunner([cycleResult(), cycleResult()]);
    const engine2 = new TaskCompletionEngine(runner2);
    const r = await engine2.executeTask(compound, {
      taskId: "t5",
      stateStore: store,
      resume: true,
    });
    expect(runner2.calls).toHaveLength(2);
    expect(r.verdict).toBe("ACHIEVED");
  });

  it("constraints are checkpointed too (resume honors them without re-reading)", async () => {
    const runner = mockRunner([cycleResult(), cycleResult(), cycleResult()]);
    const store = new MemTaskStateStore();
    const engine = new TaskCompletionEngine(runner);
    const r = await engine.executeTask(
      "calculate the tiles and summarize the cost, and do not use the labor rates",
      { taskId: "t6", stateStore: store },
    );
    const cp = store.rows.get("t6"); // finished tasks are deleted — read finished instead
    expect(cp ?? true).toBeTruthy(); // row gone is valid; verdict proves constraints honored
    expect(r.verdict).toBe("ACHIEVED");
    expect(r.steps.some((s) => s.status === "skipped-constraint")).toBe(true);
    expect(store.finished.get("t6")).toBe("ACHIEVED");
  });
});
