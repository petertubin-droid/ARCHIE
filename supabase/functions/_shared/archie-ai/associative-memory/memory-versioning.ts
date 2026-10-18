// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — MEMORY VERSIONING
// supabase/functions/_shared/archie-ai/associative-memory/memory-versioning.ts
//
// Tracks the evolution and history of memories over time:
//   - Distinguishes HISTORICAL EVOLUTION (e.g. project migrated from Netlify to Vercel)
//     from CORRECTION (fixing an erroneous fact).
//   - Preserves previous values so historical context is never erased.
//   - Tracks who updated it, why it changed, and exact timestamps.
// =========================================================

import type { MemoryVersionRecord } from "./types.ts";

export class MemoryVersioningEngine {
  private versionsByMemoryId = new Map<string, MemoryVersionRecord[]>();

  /**
   * Records a version update for a memory item.
   */
  recordUpdate(
    memoryId: string,
    previousValue: unknown,
    newValue: unknown,
    changeReason: string,
    updatedBy = "owner",
    isHistoricalChange = true
  ): MemoryVersionRecord {
    const list = this.versionsByMemoryId.get(memoryId) || [];
    const nextVersion = list.length + 1;
    const now = Date.now();

    const record: MemoryVersionRecord = {
      id: `ver_${memoryId}_v${nextVersion}`,
      memoryId,
      version: nextVersion,
      previousValue,
      newValue,
      changeReason: changeReason.trim(),
      updatedBy,
      updatedAt: now,
      isHistoricalChange,
    };

    list.push(record);
    this.versionsByMemoryId.set(memoryId, list);
    return record;
  }

  /**
   * Retrieves full version history for a given memory.
   */
  getHistory(memoryId: string): MemoryVersionRecord[] {
    return this.versionsByMemoryId.get(memoryId) || [];
  }

  /**
   * Retrieves historical evolution events (e.g. platform migrations, architecture changes)
   * while filtering out simple typo/spelling corrections.
   */
  getHistoricalEvents(memoryId: string): MemoryVersionRecord[] {
    const list = this.versionsByMemoryId.get(memoryId) || [];
    return list.filter((v) => v.isHistoricalChange);
  }

  count(): number {
    let total = 0;
    for (const list of this.versionsByMemoryId.values()) {
      total += list.length;
    }
    return total;
  }
}
