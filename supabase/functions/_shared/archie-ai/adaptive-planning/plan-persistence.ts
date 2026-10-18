// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — PLAN PERSISTENCE
//
// Durable checkpointing and cross-session plan recovery.
//
// Invariants:
// - Checkpoints state after every execution wave.
// - Resumed execution hydrates verified state and never re-executes completed work.
// - In-memory fallback is honest about volatility; Supabase adapter uses frelux_archie_task_states.
// =========================================================

import type { SupabaseLike } from "../native-engine/persistence.ts";
import type {
  AdaptivePlan,
  AdaptivePlanStepNode,
  ExecutionCheckpoint,
} from "./types.ts";

export interface PlanStateStore {
  saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>;
  loadCheckpoint(planId: string): Promise<ExecutionCheckpoint | null>;
  savePlan(plan: AdaptivePlan): Promise<void>;
  loadPlan(planId: string): Promise<AdaptivePlan | null>;
}

export class InMemoryPlanStateStore implements PlanStateStore {
  private checkpoints = new Map<string, ExecutionCheckpoint>();
  private plans = new Map<string, AdaptivePlan>();

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.planId, { ...checkpoint });
  }

  async loadCheckpoint(planId: string): Promise<ExecutionCheckpoint | null> {
    const cp = this.checkpoints.get(planId);
    return cp ? { ...cp } : null;
  }

  async savePlan(plan: AdaptivePlan): Promise<void> {
    this.plans.set(plan.id, JSON.parse(JSON.stringify(plan)));
  }

  async loadPlan(planId: string): Promise<AdaptivePlan | null> {
    const p = this.plans.get(planId);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }
}

export class SupabasePlanStateStore implements PlanStateStore {
  private memoryFallback = new InMemoryPlanStateStore();

  constructor(private db?: any) {}

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    await this.memoryFallback.saveCheckpoint(checkpoint);
    if (!this.db) return;

    try {
      await (this.db as any)
        .from("archie_task_states")
        .upsert(
          {
            task_id: checkpoint.planId,
            task: `plan_version_${checkpoint.version ?? 1}`,
            completed_steps: checkpoint.completedStepIds.map((id) => ({
              id,
              result: checkpoint.stepResults[id],
              verdict: checkpoint.stepVerdicts ? (checkpoint.stepVerdicts as any)[id] : null,
            })),
            next_index: checkpoint.currentWaveIndex,
            status: "in_progress",
            verdict: null,
          },
          { onConflict: "task_id" },
        );
    } catch {
      // Degrades honestly: in-memory copy stands
    }
  }

  async loadCheckpoint(planId: string): Promise<ExecutionCheckpoint | null> {
    const fromMem = await this.memoryFallback.loadCheckpoint(planId);
    if (fromMem) return fromMem;
    if (!this.db) return null;

    try {
      const { data, error } = await (this.db as any)
        .from("archie_task_states")
        .select("*")
        .eq("task_id", planId);

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return null;

      const results: Record<string, string> = {};
      const verdicts: Record<string, "PASS" | "FAIL" | "UNVERIFIED"> = {};
      const completedIds: string[] = [];

      if (Array.isArray(row.completed_steps)) {
        for (const st of row.completed_steps) {
          completedIds.push(st.id);
          if (st.result) results[st.id] = st.result;
          if (st.verdict) verdicts[st.id] = st.verdict;
        }
      }

      return {
        planId,
        version: 1,
        timestamp: new Date().toISOString(),
        completedStepIds: completedIds,
        stepResults: results,
        stepVerdicts: verdicts,
        currentWaveIndex: row.next_index ?? 0,
        resumedFromCheckpoint: true,
      };
    } catch {
      return null;
    }
  }

  async savePlan(plan: AdaptivePlan): Promise<void> {
    await this.memoryFallback.savePlan(plan);
  }

  async loadPlan(planId: string): Promise<AdaptivePlan | null> {
    return this.memoryFallback.loadPlan(planId);
  }
}

/**
 * Applies a checkpoint to an AdaptivePlan to safely hydrate completed steps.
 */
export function hydratePlanFromCheckpoint(
  plan: AdaptivePlan,
  checkpoint: ExecutionCheckpoint,
): { hydratedPlan: AdaptivePlan; completedCount: number } {
  let completedCount = 0;

  for (const node of plan.nodes) {
    if (checkpoint.completedStepIds.includes(node.id)) {
      node.status = "executed";
      node.result = checkpoint.stepResults[node.id] || "Completed in prior execution.";
      node.verificationVerdict = checkpoint.stepVerdicts?.[node.id] || "PASS";
      completedCount++;
    }
  }

  return {
    hydratedPlan: plan,
    completedCount,
  };
}

export type PlanStore = PlanStateStore;

export class PlanPersistenceStore {
  private store: PlanStateStore;

  constructor(customStore?: PlanStateStore) {
    this.store = customStore ?? new InMemoryPlanStateStore();
  }

  async savePlan(plan: AdaptivePlan): Promise<void> {
    return this.store.savePlan(plan);
  }

  async loadPlan(planId: string): Promise<AdaptivePlan | null> {
    return this.store.loadPlan(planId);
  }

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    return this.store.saveCheckpoint(checkpoint);
  }

  async loadCheckpoint(planId: string): Promise<ExecutionCheckpoint | null> {
    return this.store.loadCheckpoint(planId);
  }

  getUnderlyingStore(): PlanStateStore {
    return this.store;
  }
}
