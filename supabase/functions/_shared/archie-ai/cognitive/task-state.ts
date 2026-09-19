// ============================================================
// ARCHIE SUPER MODEL INTELLIGENCE LAYER — DURABLE TASK STATE
// (gap audit D-2, owner directive 2026-09-16)
// ============================================================
// The Supabase-backed TaskStateStore. One row per supervised
// task in archie_task_states: the engine checkpoints after
// every recorded step, and a resumed invocation hydrates the
// row and continues from the first unrecorded clause.
//
// Honesty contract: the store writes EXACTLY what the engine
// recorded — steps verbatim, counters verbatim, notes
// verbatim. It never invents, prunes, or rewrites state, and
// a failed checkpoint write never blocks the task (the engine
// treats persistence as best-effort durability, matching the
// established persistence.ts pattern). Access is
// service-role-only: the table has RLS enabled with NO
// policies (lockdown pattern 20260918130000).
// ============================================================

import type { SupabaseLike } from "../native-engine/persistence.ts";
import type {
  TaskCheckpoint,
  TaskStateStore,
  TaskStepReport,
  TaskVerdict,
} from "./task-completion.ts";

interface TaskStateRow {
  task_id: string;
  task: string;
  completed_steps: TaskStepReport[];
  next_index: number;
  counters: {
    executable: number;
    succeeded: number;
    confidence_sum: number;
    executed_count: number;
    notes: string[];
  };
  status: "in_progress" | "completed" | "failed";
  verdict: string | null;
}

export class SupabaseTaskStateStore implements TaskStateStore {
  constructor(private db: SupabaseLike) {}

  /** Persist the checkpoint atomically: steps, counters, notes,
   *  and the first clause index NOT yet recorded. */
  async save(checkpoint: TaskCheckpoint): Promise<void> {
    const row = {
      task_id: checkpoint.taskId,
      task: checkpoint.task,
      completed_steps: checkpoint.steps,
      next_index: checkpoint.nextIndex,
      counters: {
        executable: checkpoint.executable,
        succeeded: checkpoint.succeeded,
        confidence_sum: checkpoint.confidenceSum,
        executed_count: checkpoint.executedCount,
        notes: checkpoint.notes,
      },
      status: "in_progress",
      verdict: null,
      updated_date: new Date().toISOString(),
    };
    const res = await this.db.from("archie_task_states").upsert(row);
    if (res.error) {
      throw new Error(`task checkpoint write failed: ${String(res.error)}`);
    }
  }

  /** Hydrate the checkpoint for a task id. Returns null when the
   *  row is absent, unreadable, or already finished — a finished
   *  task is never resumed. */
  async load(taskId: string): Promise<TaskCheckpoint | null> {
    const res = await this.db
      .from("archie_task_states")
      .select(
        "task_id, task, completed_steps, next_index, counters, status, verdict",
      )
      .eq("task_id", taskId)
      .limit(1);
    if (res.error) {
      throw new Error(`task checkpoint read failed: ${String(res.error)}`);
    }
    const rows = (res.data ?? []) as unknown as Partial<TaskStateRow>[];
    const row = rows[0];
    if (!row || row.status !== "in_progress" || !row.task) return null;
    return {
      taskId: row.task_id ?? taskId,
      task: row.task,
      steps: (row.completed_steps ?? []) as TaskStepReport[],
      nextIndex: typeof row.next_index === "number" ? row.next_index : 0,
      executable: row.counters?.executable ?? 0,
      succeeded: row.counters?.succeeded ?? 0,
      confidenceSum: row.counters?.confidence_sum ?? 0,
      executedCount: row.counters?.executed_count ?? 0,
      notes: row.counters?.notes ?? [],
    };
  }

  /** Mark the task finished with its deterministic verdict.
   *  NOT_ACHIEVED is recorded as status 'failed' — honest
   *  state, never cosmetic. */
  async markFinished(taskId: string, verdict: TaskVerdict): Promise<void> {
    const res = await this.db
      .from("archie_task_states")
      .update({
        status: verdict === "NOT_ACHIEVED" ? "failed" : "completed",
        verdict,
        updated_date: new Date().toISOString(),
      })
      .eq("task_id", taskId);
    if (res.error) {
      throw new Error(`task finish write failed: ${String(res.error)}`);
    }
  }
}
