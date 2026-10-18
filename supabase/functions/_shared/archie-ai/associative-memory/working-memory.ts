// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — WORKING MEMORY
// supabase/functions/_shared/archie-ai/associative-memory/working-memory.ts
//
// Fast, bounded, prioritized working memory for active cognitive processing:
//   - Active user instructions (priority 1.0, protected against eviction)
//   - Current task state & sub-task progression
//   - Active constraints & invariant requirements
//   - Pending questions & clarifications
//   - Intermediate task results & working calculations
//   - Current decision context
//
// Strict contamination protection: isolates task contexts and
// prevents unrelated conversational noise from corrupting active tasks.
// =========================================================

import type {
  WorkingMemoryItem,
  WorkingMemoryKind,
  WorkingMemorySnapshot,
} from "./types.ts";

export interface WorkingMemoryConfig {
  maxCapacity?: number; // Default bounded capacity: 50 items
  defaultItemTtlMs?: number; // Default TTL: 2 hours
}

export class WorkingMemoryEngine {
  private items = new Map<string, WorkingMemoryItem>();
  private readonly maxCapacity: number;
  private readonly defaultItemTtlMs: number;
  private activeTaskContextId: string = "default";
  private currentTaskDescription?: string;

  constructor(config: WorkingMemoryConfig = {}) {
    this.maxCapacity = Math.max(10, Math.min(config.maxCapacity ?? 50, 500));
    this.defaultItemTtlMs = config.defaultItemTtlMs ?? 1000 * 60 * 60 * 2;
  }

  /**
   * Sets the active task and optional task context scope.
   * Resets non-persistent transient intermediate results if switched.
   */
  setTask(task: string, taskContextId?: string): void {
    if (taskContextId && taskContextId !== this.activeTaskContextId) {
      this.activeTaskContextId = taskContextId;
    }
    this.currentTaskDescription = task.trim();
    this.addItem({
      kind: "active_task",
      content: this.currentTaskDescription,
      priority: 1.0, // High priority: active task state is protected
      taskContextId: this.activeTaskContextId,
    });
  }

  getCurrentTask(): string | undefined {
    return this.currentTaskDescription;
  }

  getTaskContextId(): string {
    return this.activeTaskContextId;
  }

  /**
   * Adds an explicit invariant constraint to working memory.
   * Priority defaults to 0.95 to protect against eviction.
   */
  addConstraint(constraint: string, priority = 0.95, metadata?: Record<string, unknown>): WorkingMemoryItem {
    return this.addItem({
      kind: "constraint",
      content: constraint.trim(),
      priority: Math.max(0.5, Math.min(1.0, priority)),
      taskContextId: this.activeTaskContextId,
      metadata,
    });
  }

  /**
   * Adds a user instruction to active working memory.
   * Maximum priority (1.0) ensures instructions are retained while task is active.
   */
  addInstruction(instruction: string, metadata?: Record<string, unknown>): WorkingMemoryItem {
    return this.addItem({
      kind: "instruction",
      content: instruction.trim(),
      priority: 1.0,
      taskContextId: this.activeTaskContextId,
      metadata,
    });
  }

  /**
   * Records a pending clarification or question.
   */
  addPendingQuestion(question: string): WorkingMemoryItem {
    return this.addItem({
      kind: "pending_question",
      content: question.trim(),
      priority: 0.8,
      taskContextId: this.activeTaskContextId,
    });
  }

  /**
   * Removes resolved pending questions.
   */
  resolvePendingQuestion(questionFragment: string): boolean {
    const frag = questionFragment.toLowerCase();
    for (const [id, item] of this.items.entries()) {
      if (item.kind === "pending_question" && item.content.toLowerCase().includes(frag)) {
        this.items.delete(id);
        return true;
      }
    }
    return false;
  }

  /**
   * Records an intermediate calculation or sub-task output.
   */
  addIntermediateResult(task: string, result: unknown): WorkingMemoryItem {
    return this.addItem({
      kind: "intermediate_result",
      content: typeof result === "string" ? result : JSON.stringify(result),
      priority: 0.6,
      taskContextId: this.activeTaskContextId,
      metadata: { task, rawResult: result },
    });
  }

  /**
   * Records a decision made during the reasoning or planning phase.
   */
  recordDecision(decision: string, context?: string): WorkingMemoryItem {
    return this.addItem({
      kind: "decision_context",
      content: decision.trim(),
      priority: 0.85,
      taskContextId: this.activeTaskContextId,
      metadata: context ? { context } : undefined,
    });
  }

  /**
   * General item insertion with capacity enforcement and priority eviction.
   */
  addItem(item: {
    kind: WorkingMemoryKind;
    content: string;
    priority?: number;
    taskContextId?: string;
    expiresAt?: number;
    metadata?: Record<string, unknown>;
  }): WorkingMemoryItem {
    const now = Date.now();
    const id = `wm_${now}_${crypto.randomUUID().slice(0, 8)}`;
    const taskContext = item.taskContextId || this.activeTaskContextId;
    const expiresAt = item.expiresAt ?? now + this.defaultItemTtlMs;
    const priority = Math.max(0.0, Math.min(1.0, item.priority ?? 0.5));

    // First purge expired items
    this.cleanupExpired(now);

    // If capacity reached, evict lowest priority non-protected item
    if (this.items.size >= this.maxCapacity) {
      this.evictLowestPriority(1);
    }

    const record: WorkingMemoryItem = {
      id,
      kind: item.kind,
      content: item.content,
      priority,
      taskContextId: taskContext,
      createdAt: now,
      expiresAt,
      metadata: item.metadata,
    };

    this.items.set(id, record);
    return record;
  }

  getItem(id: string): WorkingMemoryItem | undefined {
    return this.items.get(id);
  }

  /**
   * Produces a clean snapshot of active working memory.
   * If a taskContextId is passed, filters strictly to that context (contamination guard).
   */
  getSnapshot(taskContextId?: string): WorkingMemorySnapshot {
    const targetContext = taskContextId || this.activeTaskContextId;
    const activeConstraints: string[] = [];
    const pendingQuestions: string[] = [];
    const instructions: string[] = [];
    const intermediateResults: Array<{ task: string; result: unknown }> = [];
    const decisionContext: string[] = [];

    let currentTask = this.currentTaskDescription;

    for (const item of this.items.values()) {
      // Contamination protection: ignore items from different task contexts
      if (item.taskContextId && item.taskContextId !== targetContext && targetContext !== "all") {
        continue;
      }

      switch (item.kind) {
        case "constraint":
          activeConstraints.push(item.content);
          break;
        case "pending_question":
          pendingQuestions.push(item.content);
          break;
        case "instruction":
          instructions.push(item.content);
          break;
        case "intermediate_result":
          intermediateResults.push({
            task: (item.metadata?.task as string) || "computation",
            result: item.metadata?.rawResult ?? item.content,
          });
          break;
        case "decision_context":
          decisionContext.push(item.content);
          break;
        case "active_task":
          if (!currentTask) currentTask = item.content;
          break;
      }
    }

    return {
      taskContextId: targetContext,
      currentTask,
      activeConstraints,
      pendingQuestions,
      instructions,
      intermediateResults,
      decisionContext,
      itemCount: this.items.size,
      capacity: this.maxCapacity,
    };
  }

  /**
   * Evicts the n lowest-priority items, protecting priority 1.0 items.
   */
  evictLowestPriority(count = 1): number {
    let evicted = 0;
    const candidates = Array.from(this.items.values())
      .filter((i) => i.priority < 1.0) // Protect active instructions / vital tasks
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    for (let i = 0; i < Math.min(count, candidates.length); i++) {
      this.items.delete(candidates[i].id);
      evicted++;
    }
    return evicted;
  }

  /**
   * Purges items whose TTL has elapsed.
   */
  cleanupExpired(now = Date.now()): number {
    let cleaned = 0;
    for (const [id, item] of this.items.entries()) {
      if (item.expiresAt && item.expiresAt <= now) {
        this.items.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Clears working memory. If taskContextId is provided, clears only that context.
   */
  clear(taskContextId?: string): void {
    if (!taskContextId) {
      this.items.clear();
      this.currentTaskDescription = undefined;
      return;
    }
    for (const [id, item] of this.items.entries()) {
      if (item.taskContextId === taskContextId) {
        this.items.delete(id);
      }
    }
    if (taskContextId === this.activeTaskContextId) {
      this.currentTaskDescription = undefined;
    }
  }

  size(): number {
    return this.items.size;
  }
}
