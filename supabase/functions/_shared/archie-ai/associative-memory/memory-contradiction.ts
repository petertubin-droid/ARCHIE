// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — CONTRADICTION ENGINE
// supabase/functions/_shared/archie-ai/associative-memory/memory-contradiction.ts
//
// Detects, classifies, and manages conflicts across memories:
//   - Identifies whether a conflict is:
//       1. "update" (natural newer state)
//       2. "correction" (explicitly fixing an error)
//       3. "historical_difference" (was X before, now Y)
//       4. "genuine_contradiction" (irreconcilable conflict needing clarification)
//       5. "unreliable_source" (low-confidence claim contesting verified fact)
//
// NEVER silently chooses a side on genuine contradictions.
// Generates structured clarification prompts for the user.
// =========================================================

import type {
  MemoryConflictType,
  MemoryContradictionRecord,
  LongTermMemoryRecord,
  MemoryProvenanceState,
} from "./types.ts";

export class MemoryContradictionEngine {
  private contradictions = new Map<string, MemoryContradictionRecord>();

  /**
   * Analyzes an incoming statement or value against an existing memory record.
   */
  detectConflict(
    existing: LongTermMemoryRecord,
    incoming: {
      value: unknown;
      text: string;
      source?: string;
      provenance?: MemoryProvenanceState;
      isExplicitCorrection?: boolean;
    }
  ): { hasConflict: boolean; record?: MemoryContradictionRecord } {
    const existingStr = typeof existing.value === "string" ? existing.value : JSON.stringify(existing.value);
    const incomingStr = typeof incoming.value === "string" ? incoming.value : JSON.stringify(incoming.value);

    // If values are identical, no conflict
    if (existingStr.trim().toLowerCase() === incomingStr.trim().toLowerCase()) {
      return { hasConflict: false };
    }

    // Determine conflict classification
    let conflictType: MemoryConflictType = "genuine_contradiction";
    let resolutionState: "FLAGGED_NEEDS_CLARIFICATION" | "RESOLVED_SUPERSEDED" | "RESOLVED_HISTORICAL" = "FLAGGED_NEEDS_CLARIFICATION";
    let clarificationPrompt: string | undefined;

    // 1. Explicit correction
    if (incoming.isExplicitCorrection || /\b(?:actually|correction|instead of|replace|changed from)\b/i.test(incoming.text)) {
      conflictType = "correction";
      resolutionState = "RESOLVED_SUPERSEDED";
    }
    // 2. Historical difference (migrated / moved / upgraded)
    else if (/\b(?:migrated|moved to|switched to|upgraded to|no longer on|previously)\b/i.test(incoming.text)) {
      conflictType = "historical_difference";
      resolutionState = "RESOLVED_HISTORICAL";
    }
    // 3. Unreliable source contesting verified fact
    else if (
      (existing.provenance === "EXPERIMENTALLY_VERIFIED" || existing.provenance === "EXTERNALLY_VERIFIED") &&
      incoming.provenance === "INFERRED"
    ) {
      conflictType = "unreliable_source";
      resolutionState = "RESOLVED_SUPERSEDED"; // Verified fact holds precedence over inference
    }
    // 4. Newer user update on preferences or project context
    else if (existing.kind === "user_preference" || existing.kind === "project_context") {
      conflictType = "update";
      resolutionState = "RESOLVED_SUPERSEDED";
    }
    // 5. Genuine contradiction needing clarification
    else {
      conflictType = "genuine_contradiction";
      resolutionState = "FLAGGED_NEEDS_CLARIFICATION";
      clarificationPrompt = `Notice: Previously recorded value for "${existing.key}" was "${existingStr}", but current information indicates "${incomingStr}". Which is current?`;
    }

    const record: MemoryContradictionRecord = {
      id: `contra_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      memoryIdA: existing.id,
      statementA: existingStr,
      statementB: incomingStr,
      conflictType,
      detectedAt: Date.now(),
      resolutionState,
      clarificationPrompt,
    };

    if (conflictType === "genuine_contradiction") {
      this.contradictions.set(record.id, record);
    }

    return { hasConflict: true, record };
  }

  getContradiction(id: string): MemoryContradictionRecord | undefined {
    return this.contradictions.get(id);
  }

  getPendingClarifications(): MemoryContradictionRecord[] {
    return Array.from(this.contradictions.values()).filter(
      (c) => c.resolutionState === "FLAGGED_NEEDS_CLARIFICATION"
    );
  }

  resolveContradiction(id: string, resolution: "RESOLVED_SUPERSEDED" | "RESOLVED_HISTORICAL"): boolean {
    const record = this.contradictions.get(id);
    if (!record) return false;
    record.resolutionState = resolution;
    return true;
  }

  count(): number {
    return this.contradictions.size;
  }
}
