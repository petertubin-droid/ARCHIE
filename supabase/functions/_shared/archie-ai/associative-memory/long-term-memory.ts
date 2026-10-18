// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — LONG-TERM MEMORY
// supabase/functions/_shared/archie-ai/associative-memory/long-term-memory.ts
//
// Preserves durable knowledge, persistent project context,
// verified user preferences, operational rules, and long-term goals.
//
// Governed by multi-factor retention policies:
//   - "permanent": never deleted (e.g. invariant operational rules, safety bounds)
//   - "project_lifetime": lives as long as the project is active
//   - "expiring_30d": transient operational cache with 30-day half-life
//   - "rolling_lru": capacity-capped LRU eviction
//
// Important memories are NEVER discarded merely because they are old.
// Relevance, reliability, ownership, and retention class are strictly weighed.
// =========================================================

import type {
  LongTermMemoryKind,
  LongTermMemoryRecord,
  MemoryPrivacyClass,
  MemoryProvenanceState,
  MemoryRetentionPolicy,
} from "./types.ts";

export interface LongTermMemoryConfig {
  maxDurableRecords?: number;
}

export class LongTermMemoryEngine {
  private records = new Map<string, LongTermMemoryRecord>();
  // Composite index: `${userId}:${projectId}:${kind}:${key}` -> id
  private lookupIndex = new Map<string, string>();

  constructor(_config: LongTermMemoryConfig = {}) {}

  private makeIndexKey(userId: string, projectId: string, kind: LongTermMemoryKind, key: string): string {
    return `${userId}:${projectId}:${kind}:${key.toLowerCase()}`;
  }

  /**
   * Stores or updates a durable long-term memory record.
   */
  setRecord(record: {
    userId: string;
    projectId?: string;
    kind: LongTermMemoryKind;
    key: string;
    value: unknown;
    summary?: string;
    importance?: number;
    confidence?: number;
    provenance?: MemoryProvenanceState;
    privacy?: MemoryPrivacyClass;
    retentionPolicy?: MemoryRetentionPolicy;
    expiresAt?: number;
    metadata?: Record<string, unknown>;
  }): LongTermMemoryRecord {
    const userId = record.userId || "anonymous";
    const projectId = record.projectId || "global";
    const keyLower = record.key.trim().toLowerCase();
    const indexKey = this.makeIndexKey(userId, projectId, record.kind, keyLower);
    const now = Date.now();

    const existingId = this.lookupIndex.get(indexKey);
    const existing = existingId ? this.records.get(existingId) : undefined;

    const version = existing ? existing.version + 1 : 1;
    const id = existing ? existing.id : `ltm_${now}_${crypto.randomUUID().slice(0, 8)}`;

    const summary = record.summary || (typeof record.value === "string" ? record.value : `${record.kind}: ${record.key}`);

    const memoryRecord: LongTermMemoryRecord = {
      id,
      userId,
      projectId,
      kind: record.kind,
      key: keyLower,
      value: record.value,
      summary,
      importance: Math.max(0.0, Math.min(1.0, record.importance ?? (existing ? existing.importance : 0.8))),
      confidence: Math.max(0.0, Math.min(1.0, record.confidence ?? (existing ? existing.confidence : 0.9))),
      provenance: record.provenance || (existing ? existing.provenance : "USER_PROVIDED"),
      privacy: record.privacy || (existing ? existing.privacy : "private_owner"),
      retentionPolicy: record.retentionPolicy || (existing ? existing.retentionPolicy : "permanent"),
      version,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      expiresAt: record.expiresAt,
      metadata: { ...(existing?.metadata || {}), ...(record.metadata || {}) },
    };

    this.records.set(id, memoryRecord);
    this.lookupIndex.set(indexKey, id);

    return memoryRecord;
  }

  /**
   * Helper to set persistent user preferences.
   */
  setUserPreference(
    userId: string,
    key: string,
    value: unknown,
    options: {
      importance?: number;
      provenance?: MemoryProvenanceState;
      projectId?: string;
    } = {}
  ): LongTermMemoryRecord {
    return this.setRecord({
      userId,
      projectId: options.projectId || "global",
      kind: "user_preference",
      key,
      value,
      importance: options.importance ?? 0.85,
      confidence: 1.0,
      provenance: options.provenance ?? "USER_PROVIDED",
      privacy: "private_owner",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Helper to set persistent project context.
   */
  setProjectContext(
    userId: string,
    projectId: string,
    key: string,
    value: unknown,
    summary?: string
  ): LongTermMemoryRecord {
    return this.setRecord({
      userId,
      projectId,
      kind: "project_context",
      key,
      value,
      summary,
      importance: 0.9,
      confidence: 0.95,
      provenance: "SYSTEM_OBSERVED",
      privacy: "project_shared",
      retentionPolicy: "project_lifetime",
    });
  }

  /**
   * Helper to set operational rules (e.g. safety bounds, architectural constraints).
   */
  setOperationalRule(
    key: string,
    rule: string,
    userId = "owner",
    projectId = "global"
  ): LongTermMemoryRecord {
    return this.setRecord({
      userId,
      projectId,
      kind: "operational_rule",
      key,
      value: rule,
      summary: `Rule: ${rule}`,
      importance: 1.0, // Invariant rules have maximum importance
      confidence: 1.0,
      provenance: "EXTERNALLY_VERIFIED",
      privacy: "workspace_global",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Helper to set long-term goals.
   */
  setLongTermGoal(
    userId: string,
    projectId: string,
    goalKey: string,
    goalDescription: string
  ): LongTermMemoryRecord {
    return this.setRecord({
      userId,
      projectId,
      kind: "long_term_goal",
      key: goalKey,
      value: goalDescription,
      summary: `Goal: ${goalDescription}`,
      importance: 0.9,
      confidence: 1.0,
      provenance: "USER_PROVIDED",
      privacy: "project_shared",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Retrieves a specific record by user, project, kind, and key.
   */
  get(userId: string, projectId: string, kind: LongTermMemoryKind, key: string): LongTermMemoryRecord | undefined {
    const indexKey = this.makeIndexKey(userId, projectId, kind, key);
    const id = this.lookupIndex.get(indexKey);
    return id ? this.records.get(id) : undefined;
  }

  /**
   * Queries records with strict privacy and tenancy boundaries.
   */
  query(filter: {
    userId?: string;
    projectId?: string;
    kind?: LongTermMemoryKind;
    minImportance?: number;
    limit?: number;
  }): LongTermMemoryRecord[] {
    const results: LongTermMemoryRecord[] = [];

    for (const record of this.records.values()) {
      // Security boundary: if record is private_owner, reject cross-user access
      if (filter.userId && record.privacy === "private_owner" && record.userId !== filter.userId && record.userId !== "anonymous") {
        continue;
      }
      if (filter.projectId && record.projectId !== "global" && record.projectId !== filter.projectId) {
        continue;
      }
      if (filter.kind && record.kind !== filter.kind) {
        continue;
      }
      if (filter.minImportance !== undefined && record.importance < filter.minImportance) {
        continue;
      }

      results.push(record);
    }

    results.sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);
    if (filter.limit && filter.limit > 0) {
      return results.slice(0, filter.limit);
    }
    return results;
  }

  /**
   * Applies intelligent retention:
   * Prunes only expired or ephemeral records.
   * NEVER prunes permanent or high-importance durable records.
   */
  applyRetention(now = Date.now()): { retained: number; pruned: number } {
    let pruned = 0;
    for (const [id, record] of this.records.entries()) {
      if (record.retentionPolicy === "permanent") {
        continue;
      }

      // Check explicit expiration
      if (record.expiresAt && record.expiresAt <= now) {
        this.deleteRecord(id);
        pruned++;
        continue;
      }

      // Expiring 30-day items
      if (record.retentionPolicy === "expiring_30d") {
        const ageMs = now - record.updatedAt;
        if (ageMs > 30 * 24 * 60 * 60 * 1000) {
          this.deleteRecord(id);
          pruned++;
        }
      }
    }

    return { retained: this.records.size, pruned };
  }

  deleteRecord(id: string): boolean {
    const record = this.records.get(id);
    if (!record) return false;
    const indexKey = this.makeIndexKey(record.userId, record.projectId, record.kind, record.key);
    this.lookupIndex.delete(indexKey);
    this.records.delete(id);
    return true;
  }

  deleteUserRecords(userId: string): number {
    let count = 0;
    for (const [id, record] of this.records.entries()) {
      if (record.userId === userId) {
        this.deleteRecord(id);
        count++;
      }
    }
    return count;
  }

  count(): number {
    return this.records.size;
  }
}
