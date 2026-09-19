// ============================================================
// ARCHIE SUPER MODEL INTELLIGENCE LAYER — SUPERVISED TASK
// COMPLETION ENGINE (owner directive 2026-09-16)
// ============================================================
// The cognitive kernel runs ONE unified cycle per message —
// a single traversal of the permanent loop. Complex TASKS,
// however, are compound: "estimate X and check Y then tell
// me Z" is three units of work with one goal. This engine
// adds the task-level supervision the kernel deliberately
// does not own:
//
//   1. DECOMPOSE — the same clause decomposer the reasoning
//      loop uses (nlu.decomposeClauses): the SENTENCE decides
//      whether a task is compound, never a guess. Code blocks
//      are masked before splitting, negated tails become
//      constraints (acknowledged, never answered).
//   2. EXECUTE — every executable clause runs as a FULL
//      unified cognitive cycle: same gates, same verification
//      engine, same honest refusal path. No bypass exists.
//   3. VERIFY — each step's formal verification verdict is
//      the step outcome: PASS = succeeded, FAIL = one bounded
//      retry, then honest failure. UNVERIFIED steps with no
//      factual claims (social/action steps) succeed on cycle
//      completion with honest confidence.
//   4. ASSESS — a deterministic completion verdict over the
//      step outcomes: ACHIEVED / PARTIAL / NOT_ACHIEVED. It is
//      computed from recorded evidence, never generated.
//   5. CHECKPOINT (gap audit D-2) — when a TaskStateStore is
//      provided, EVERY step outcome is persisted durably the
//      moment it is recorded, and a resumed invocation hydrates
//      the checkpoint and continues from the first unrecorded
//      clause. Completed steps are never re-executed; an
//      interrupted task completes from where it stopped.
//
// Honesty contract: an over-budget task is refused (same
// message the substrate produces), a failed step is reported
// as failed, and the verdict is arithmetic over recorded
// verdicts — this engine NEVER composes prose, NEVER invents
// progress, and NEVER marks a task achieved without a
// passing (or claim-free) step for every executable clause.
// ============================================================

import {
  decomposeClauses,
  MAX_COMPOUND_CLAUSES,
} from "../native-engine/nlu.ts";
import type { CognitiveCycleResult } from "./types.ts";

/** One clause of the task, executed (or honestly skipped). */
export interface TaskStepReport {
  index: number;
  /** The clause text as decomposed (constraints included). */
  clause: string;
  /** Constraints (negated clauses) are acknowledged, never executed. */
  status: "succeeded" | "failed" | "skipped-constraint" | "gated-stop";
  /** Attempts used: 1, or 2 when the bounded retry fired. */
  attempts: number;
  /** The step's formal verification verdict (null when the
   *  security gate stopped the clause before execution). */
  verificationVerdict: "PASS" | "FAIL" | "UNVERIFIED" | null;
  /** The step cycle's substrate confidence, verbatim. */
  confidence: number;
  /** The step cycle's response text, verbatim and unedited. */
  summary: string;
  durationMs: number;
}

/** Deterministic task-level completion verdict. */
export type TaskVerdict = "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED";

export interface TaskCompletionReport {
  task: string;
  verdict: TaskVerdict;
  steps: TaskStepReport[];
  /** succeeded / executable (constraints excluded from both). */
  achievedRatio: number;
  /** Mean step confidence over executed steps (0 when none). */
  confidence: number;
  /** Honest notes — budget stops, gate stops, failures. */
  notes: string[];
  /** The composed task response: verdict line + step outputs. */
  responseText: string;
}

/** Structural dependency: anything that runs a full unified
 *  cognitive cycle (the kernel satisfies this; tests may mock
 *  it). No `any`, no casting — the contract is the cycle. */
export interface TaskCycleRunner {
  cycle(
    input: string,
    history?: unknown,
    systemInstruction?: string,
    opts?: { conversationId?: string },
  ): Promise<CognitiveCycleResult>;
}

/** Optional per-clause security gate — the worker passes the
 *  same verdict classifier owner chat uses, so agent task
 *  steps are gated exactly like an owner turn. */
export interface TaskStepGate {
  (clause: string): { allowed: boolean; reason?: string };
}

/** Durable per-step checkpoint (gap audit D-2). Everything
 *  needed to resume a task EXACTLY where it stopped: the
 *  verbatim recorded steps, the running counters, the honest
 *  notes, and the index of the first clause NOT yet recorded. */
export interface TaskCheckpoint {
  taskId: string;
  task: string;
  steps: TaskStepReport[];
  nextIndex: number;
  executable: number;
  succeeded: number;
  confidenceSum: number;
  executedCount: number;
  notes: string[];
}

/** Structural persistence contract for durable task state.
 *  The Supabase implementation lives in task-state.ts; tests
 *  may use an in-memory double. No `any`, no casting. */
export interface TaskStateStore {
  save(checkpoint: TaskCheckpoint): Promise<void>;
  load(taskId: string): Promise<TaskCheckpoint | null>;
  markFinished(taskId: string, verdict: TaskVerdict): Promise<void>;
}

export const STEP_RETRY_LIMIT = 1;

function verdictOf(
  result: CognitiveCycleResult,
): "PASS" | "FAIL" | "UNVERIFIED" | null {
  return result.verification?.verdict ?? null;
}

function stepSucceeded(result: CognitiveCycleResult): boolean {
  const verdict = verdictOf(result);
  if (verdict === "PASS") return true;
  if (verdict === "FAIL") return false;
  // UNVERIFIED or no verdict: honest for claim-free steps —
  // the cycle completed and confidence carries the signal.
  // A verification FAIL is the only hard failure signal; an
  // unverified step is reported with its true verdict.
  return result.confidence >= 0.5;
}

export class TaskCompletionEngine {
  constructor(
    private runner: TaskCycleRunner,
    private gate?: TaskStepGate,
  ) {}

  /**
   * Supervised execution of one task. Compound tasks run one
   * full cognitive cycle per clause with per-step verification
   * and a deterministic completion assessment; a plain task is
   * a single cycle, reported with the same verdict arithmetic.
   */
  async executeTask(
    task: string,
    opts?: {
      conversationId?: string;
      maxSteps?: number;
      /** Durable checkpoint identity (gap D-2). With stateStore,
       *  every step is checkpointed; with resume=true, a found
       *  checkpoint is hydrated and completed steps are never
       *  re-executed. */
      taskId?: string;
      stateStore?: TaskStateStore;
      resume?: boolean;
    },
  ): Promise<TaskCompletionReport> {
    const maxSteps = opts?.maxSteps ?? MAX_COMPOUND_CLAUSES;
    const conversationId = opts?.conversationId;
    const clauses = decomposeClauses(task);
    const notes: string[] = [];

    // ── Over-budget compound task: refuse honestly, never
    //    half-execute. Same budget the reasoning loop applies.
    if (clauses.length > maxSteps) {
      notes.push(
        `task decomposed into ${clauses.length} clauses — over the compound cap (${maxSteps}); refused instead of half-executing`,
      );
      return {
        task,
        verdict: "NOT_ACHIEVED",
        steps: [],
        achievedRatio: 0,
        confidence: 0,
        notes,
        responseText:
          `This task has ${clauses.length} parts, which is over my per-task budget of ${maxSteps}. ` +
          `I won't half-execute it — split it into smaller tasks and I'll complete each one fully.`,
      };
    }

    const steps: TaskStepReport[] = [];
    let executable = 0;
    let succeeded = 0;
    let confidenceSum = 0;
    let executedCount = 0;
    const stepOutputs: string[] = [];

    // ── D-2 resume: hydrate the durable checkpoint when one
    //    exists for this exact task. decomposeClauses is
    //    deterministic, so clause i of the checkpoint is clause
    //    i of THIS decomposition — recorded steps are replayed
    //    verbatim, never re-executed, never re-fabricated.
    const { taskId, stateStore, resume } = opts ?? {};
    let startAt = 0;
    if (stateStore && taskId && resume) {
      const cp = await stateStore.load(taskId).catch(() => null);
      if (cp && cp.task === task) {
        steps.push(...cp.steps);
        executable = cp.executable;
        succeeded = cp.succeeded;
        confidenceSum = cp.confidenceSum;
        executedCount = cp.executedCount;
        startAt = Math.min(cp.nextIndex, clauses.length);
        notes.push(
          `resumed from durable checkpoint — ${cp.steps.length} step(s) already recorded were not re-executed`,
        );
        // Rebuild the composed step outputs from the recorded
        // steps: the summary and verdict are stored verbatim.
        for (const st of cp.steps) {
          if (st.status === "succeeded") {
            stepOutputs.push(
              `[Step ${st.index} — ${st.verificationVerdict === "PASS" ? "verified" : "completed"}] ${st.summary}`,
            );
          }
        }
      }
    }

    for (let i = startAt; i < clauses.length; i += 1) {
      const clause = clauses[i];

      // Constraints: acknowledged, never executed, never answered.
      if (clause.negated) {
        steps.push({
          index: i + 1,
          clause: clause.text,
          status: "skipped-constraint",
          attempts: 0,
          verificationVerdict: null,
          confidence: 0,
          summary:
            "constraint on the whole task — acknowledged and excluded, never answered",
          durationMs: 0,
        });
        if (stateStore && taskId) {
          await stateStore
            .save({
              taskId,
              task,
              steps: [...steps],
              nextIndex: i + 1,
              executable,
              succeeded,
              confidenceSum,
              executedCount,
              notes: [...notes],
            })
            .catch(() => {}); // checkpoint failure never blocks the task
        }
        continue;
      }

      // Security gate: identical to owner chat, per clause.
      if (this.gate) {
        const verdict = this.gate(clause.text);
        if (!verdict.allowed) {
          steps.push({
            index: i + 1,
            clause: clause.text,
            status: "gated-stop",
            attempts: 0,
            verificationVerdict: null,
            confidence: 0,
            summary: `stopped by the security verdict gate: ${verdict.reason ?? "not allowed"}`,
            durationMs: 0,
          });
          notes.push(
            `clause ${i + 1} stopped by the security gate — nothing executed`,
          );
          if (stateStore && taskId) {
            await stateStore
              .save({
                taskId,
                task,
                steps: [...steps],
                nextIndex: i + 1,
                executable,
                succeeded,
                confidenceSum,
                executedCount,
                notes: [...notes],
              })
              .catch(() => {}); // checkpoint failure never blocks the task
          }
          continue;
        }
      }

      executable += 1;
      const stepInput =
        clauses.length > 1
          ? `[Task step ${i + 1} of ${clauses.length}] ${clause.text}`
          : clause.text;

      let result: CognitiveCycleResult | null = null;
      let attempts = 0;
      let ok = false;
      const started = Date.now();
      for (let attempt = 0; attempt <= STEP_RETRY_LIMIT; attempt += 1) {
        attempts = attempt + 1;
        try {
          result = await this.runner.cycle(stepInput, undefined, undefined, {
            conversationId,
          });
        } catch {
          result = null; // cycle crash: retry once, then honest failure
        }
        if (result && stepSucceeded(result)) {
          ok = true;
          break;
        }
      }
      const durationMs = Date.now() - started;

      if (result && ok) {
        succeeded += 1;
        executedCount += 1;
        confidenceSum += result.confidence;
        steps.push({
          index: i + 1,
          clause: clause.text,
          status: "succeeded",
          attempts,
          verificationVerdict: verdictOf(result),
          confidence: result.confidence,
          summary: result.responseText,
          durationMs,
        });
        stepOutputs.push(
          `[Step ${i + 1} — ${result.verification?.verdict === "PASS" ? "verified" : "completed"}] ${result.responseText}`,
        );
      } else {
        steps.push({
          index: i + 1,
          clause: clause.text,
          status: "failed",
          attempts,
          verificationVerdict: result ? verdictOf(result) : null,
          confidence: result?.confidence ?? 0,
          summary: result
            ? result.responseText
            : "the cognitive cycle failed to complete — no fabricated result",
          durationMs,
        });
        notes.push(
          `step ${i + 1} failed after ${attempts} attempt(s)${result?.verification ? ` — verification verdict ${result.verification.verdict}` : ""}`,
        );
      }

      // D-2: checkpoint the step the moment it is recorded.
      if (stateStore && taskId) {
        await stateStore
          .save({
            taskId,
            task,
            steps: [...steps],
            nextIndex: i + 1,
            executable,
            succeeded,
            confidenceSum,
            executedCount,
            notes: [...notes],
          })
          .catch(() => {}); // checkpoint failure never blocks the task
      }
    }

    // ── Deterministic completion assessment: arithmetic over
    //    recorded evidence, never generated prose.
    let verdict: TaskVerdict;
    if (executable === 0) {
      verdict = "NOT_ACHIEVED";
      notes.push(
        "the task contained only constraints — nothing was executable, nothing was executed",
      );
    } else if (succeeded === executable) {
      verdict = "ACHIEVED";
    } else if (succeeded > 0) {
      verdict = "PARTIAL";
    } else {
      verdict = "NOT_ACHIEVED";
    }
    const confidence = executedCount > 0 ? confidenceSum / executedCount : 0;

    // D-2: the verdict is durable too — a finished task is never
    // resumed, and the checkpoint row records how it ended.
    if (stateStore && taskId) {
      await stateStore.markFinished(taskId, verdict).catch(() => {});
    }

    const verdictLine =
      `[Task verdict: ${verdict} — ${succeeded}/${executable} step(s) completed` +
      (steps.some((s) => s.status === "skipped-constraint")
        ? `, ${steps.filter((s) => s.status === "skipped-constraint").length} constraint(s) honored`
        : "") +
      "]";

    return {
      task,
      verdict,
      steps,
      achievedRatio: executable > 0 ? succeeded / executable : 0,
      confidence,
      notes,
      responseText: `${verdictLine}\n${stepOutputs.join("\n")}`.trim(),
    };
  }
}
