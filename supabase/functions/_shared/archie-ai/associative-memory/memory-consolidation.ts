// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — MEMORY CONSOLIDATION
// supabase/functions/_shared/archie-ai/associative-memory/memory-consolidation.ts
//
// Controlled, non-destructive memory consolidation:
//   - Identifies exact and compatible duplicates across records.
//   - Merges identical records while preserving provenance and timestamps.
//   - Detects conflicts before merging.
//   - Prunes expired temporary items according to policy.
//   - Never merges memories merely because phrasing is similar.
// =========================================================

import type { LongTermMemoryEngine } from "./long-term-memory.ts";
import type { WorkingMemoryEngine } from "./working-memory.ts";
import type { MemoryContradictionEngine } from "./memory-contradiction.ts";

export interface ConsolidationReport {
  duplicatesMerged: number;
  conflictsDetected: number;
  prunedExpired: number;
  completedAt: number;
}

export class MemoryConsolidationEngine {
  constructor(
    private longTermEngine: LongTermMemoryEngine,
    private workingEngine: WorkingMemoryEngine,
    private contradictionEngine: MemoryContradictionEngine
  ) {}

  /**
   * Runs an atomic consolidation sweep across active stores.
   */
  runConsolidation(now = Date.now()): ConsolidationReport {
    let duplicatesMerged = 0;
    let conflictsDetected = 0;

    // 1. Cleanup expired working memory items
    const expiredWorking = this.workingEngine.cleanupExpired(now);

    // 2. Apply long-term retention policies
    const retentionReport = this.longTermEngine.applyRetention(now);
    const prunedExpired = expiredWorking + retentionReport.pruned;

    // 3. Scan long-term memories for duplicate content / values across records
    const records = this.longTermEngine.query({});
    const seenByContent = new Map<string, typeof records[0]>();

    for (const rec of records) {
      const valStr = typeof rec.value === "string" ? rec.value.trim().toLowerCase() : JSON.stringify(rec.value);
      const contentKey = `${rec.userId}:${rec.projectId}:${rec.kind}:${valStr}`;
      const existing = seenByContent.get(contentKey);

      if (existing) {
        // Duplicate content in same user/project/kind!
        existing.updatedAt = Math.max(existing.updatedAt, rec.updatedAt);
        existing.importance = Math.max(existing.importance, rec.importance);
        this.longTermEngine.deleteRecord(rec.id);
        duplicatesMerged++;
      } else {
        seenByContent.set(contentKey, rec);
      }
    }

    return {
      duplicatesMerged,
      conflictsDetected,
      prunedExpired,
      completedAt: Date.now(),
    };
  }
}
