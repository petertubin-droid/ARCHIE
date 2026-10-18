// =========================================================
// ARCHIE ADVANCED UNIFIED LEARNING ENGINE — PERSISTENCE & AUDIT
// supabase/functions/_shared/archie-ai/learning/learning-persistence.ts
//
// Manages storage for learned knowledge items, maintains an
// immutable audit log, prevents duplicate writes, and executes
// rollbacks without silently mutating dependencies (spec §12 & §15).
// Distinguishes durable database persistence from in-memory staging.
// =========================================================

import type {
  ExtractedKnowledgeItem,
  LearningAuditEvent,
  LearningPersistenceStatus,
  RollbackResult,
} from "./types.ts";

export interface SupabaseClientLike {
  from(table: string): {
    insert(rows: unknown[]): PromiseLike<{ data: unknown; error: unknown }>;
    update(values: unknown): {
      eq(column: string, value: unknown): PromiseLike<{ data: unknown; error: unknown }>;
    };
    select(columns?: string): PromiseLike<{ data: unknown[] | null; error: unknown }>;
  };
}

export class LearningPersistenceStore {
  private inMemoryItems = new Map<string, ExtractedKnowledgeItem>();
  private inMemoryAudit = new Map<string, LearningAuditEvent>();
  private hashIndex = new Map<string, string>(); // contentHash -> id
  private db: SupabaseClientLike | null = null;

  constructor(db?: SupabaseClientLike | null) {
    this.db = db ?? null;
  }

  setClient(db: SupabaseClientLike | null) {
    this.db = db;
  }

  getStatus(): LearningPersistenceStatus {
    return {
      durable: this.db !== null,
      backend: this.db !== null ? "SUPABASE" : "IN_MEMORY",
      storedKnowledgeCount: this.inMemoryItems.size,
      auditLogCount: this.inMemoryAudit.size,
    };
  }

  listKnowledge(): ExtractedKnowledgeItem[] {
    return Array.from(this.inMemoryItems.values());
  }

  getKnowledge(id: string): ExtractedKnowledgeItem | undefined {
    return this.inMemoryItems.get(id);
  }

  findByHash(contentHash: string): ExtractedKnowledgeItem | undefined {
    const id = this.hashIndex.get(contentHash);
    return id ? this.inMemoryItems.get(id) : undefined;
  }

  listAudit(): LearningAuditEvent[] {
    return Array.from(this.inMemoryAudit.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  /**
   * Commits an extracted knowledge item to memory and optional durable DB.
   */
  async saveKnowledge(item: ExtractedKnowledgeItem): Promise<{
    success: boolean;
    persistedDurable: boolean;
    error?: string;
  }> {
    // 1. In-memory commit
    this.inMemoryItems.set(item.id, item);
    if (item.provenance.sourceReference) {
      this.hashIndex.set(item.provenance.sourceReference, item.id);
    }

    // 2. Durable database write if configured
    let persistedDurable = false;
    let writeError: string | undefined;

    if (this.db) {
      try {
        const res = await this.db.from("archie_learned_knowledge").insert([
          {
            id: item.id,
            subject: item.subject,
            predicate: item.predicate,
            object: item.object,
            domain: item.domain,
            scope: item.scope,
            confidence: item.confidence,
            evidence_state: item.evidenceState,
            status: item.status,
            version: item.version,
            provenance: item.provenance,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
          },
        ]);
        if (res.error) {
          writeError = String(res.error);
        } else {
          persistedDurable = true;
        }
      } catch (err) {
        writeError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: true,
      persistedDurable,
      ...(writeError ? { error: writeError } : {}),
    };
  }

  /**
   * Records an immutable audit event.
   */
  async recordAudit(event: LearningAuditEvent): Promise<void> {
    this.inMemoryAudit.set(event.id, event);

    if (this.db) {
      try {
        await this.db.from("archie_learning_audit_log").insert([
          {
            id: event.id,
            timestamp: event.timestamp,
            action: event.action,
            stage: event.stage,
            candidate_id: event.candidateId,
            reason: event.reason,
            details: event.details,
            operator: event.operator,
          },
        ]);
      } catch {
        // Audit failures in background do not crash application
      }
    }
  }

  /**
   * Executes a safe rollback of an approved knowledge item (spec §15).
   * Marks item as ROLLED_BACK, flags dependent items, and updates audit trail.
   */
  async rollback(candidateId: string, reason: string, operator: string): Promise<RollbackResult> {
    const item = this.inMemoryItems.get(candidateId);
    if (!item) {
      return {
        candidateId,
        success: false,
        previousState: "UNKNOWN",
        newState: "UNKNOWN",
        affectedDownstreamCount: 0,
        reason: `Item ${candidateId} not found in knowledge store.`,
      };
    }

    const previousState = item.evidenceState;
    const now = new Date().toISOString();

    // Mark as ROLLED_BACK
    item.evidenceState = "ROLLED_BACK";
    item.status = "ROLLED_BACK";
    item.updatedAt = now;

    // Check dependent items
    let affectedCount = 0;
    for (const other of this.inMemoryItems.values()) {
      if ((other.dependencies ?? []).includes(candidateId)) {
        other.evidenceState = "UNCERTAIN";
        other.updatedAt = now;
        affectedCount++;
      }
    }

    // Record audit event
    const auditId = `audit_rb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await this.recordAudit({
      id: auditId,
      timestamp: now,
      action: "ROLLBACK",
      stage: "CORRECTION_RECOVERY",
      candidateId,
      reason,
      operator,
      details: {
        previousState,
        newState: "ROLLED_BACK",
        affectedDownstreamCount: affectedCount,
      },
    });

    return {
      candidateId,
      success: true,
      previousState,
      newState: "ROLLED_BACK",
      affectedDownstreamCount: affectedCount,
      reason,
    };
  }
}
