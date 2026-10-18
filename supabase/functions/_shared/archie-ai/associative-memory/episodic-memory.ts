// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — EPISODIC MEMORY
// supabase/functions/_shared/archie-ai/associative-memory/episodic-memory.ts
//
// Records, structures, and queries meaningful experiences:
//   - Conversational turns & segmented narrative episodes
//   - Completed tasks & verified action outcomes
//   - User decisions & project milestones
//   - Error incidents & verified resolutions
//   - Lessons learned without confusing unverified claims with facts
//
// Strict provenance attribution: distinguishes USER_PROVIDED,
// SYSTEM_OBSERVED, INFERRED, and EXPERIMENTALLY_VERIFIED states.
// =========================================================

import type {
  Episode,
  EpisodicEventRecord,
  EpisodicEventType,
  EpisodicTurnRecord,
  MemoryPrivacyClass,
  MemoryProvenanceState,
  MemoryRetentionPolicy,
} from "./types.ts";

export interface EpisodicMemoryConfig {
  maxEventsInMemory?: number; // Default 1000 in-memory events before LRU prune
}

export class EpisodicMemoryEngine {
  private events = new Map<string, EpisodicEventRecord>();
  private readonly maxEvents: number;

  constructor(config: EpisodicMemoryConfig = {}) {
    this.maxEvents = config.maxEventsInMemory ?? 1000;
  }

  /**
   * Records a structured episodic event.
   */
  recordEvent(event: Omit<EpisodicEventRecord, "id" | "timestamp"> & { timestamp?: number }): EpisodicEventRecord {
    const now = event.timestamp ?? Date.now();
    const id = `evt_${now}_${crypto.randomUUID().slice(0, 8)}`;

    const record: EpisodicEventRecord = {
      id,
      userId: event.userId || "anonymous",
      projectId: event.projectId || "global",
      conversationId: event.conversationId || "main",
      eventType: event.eventType,
      timestamp: now,
      source: event.source || "archie_native_runtime",
      participants: event.participants || ["archie"],
      description: event.description.trim(),
      associatedEntities: event.associatedEntities || [],
      outcome: event.outcome,
      lessonsLearned: event.lessonsLearned,
      confidence: Math.max(0.0, Math.min(1.0, event.confidence ?? 0.8)),
      verificationStatus: event.verificationStatus || "SYSTEM_OBSERVED",
      privacy: event.privacy || "private_owner",
      retentionPolicy: event.retentionPolicy || "permanent",
      metadata: event.metadata,
    };

    if (this.events.size >= this.maxEvents) {
      this.evictOldest(10);
    }

    this.events.set(id, record);
    return record;
  }

  /**
   * Helper to record completed tasks with verified outcomes.
   */
  recordTaskCompletion(
    userId: string,
    projectId: string,
    task: string,
    outcome: string,
    options: {
      lessonsLearned?: string[];
      entities?: string[];
      confidence?: number;
      verificationStatus?: MemoryProvenanceState;
      conversationId?: string;
    } = {}
  ): EpisodicEventRecord {
    return this.recordEvent({
      userId,
      projectId,
      conversationId: options.conversationId || "main",
      eventType: "task_completion",
      source: "archie_task_runner",
      participants: ["owner", "archie"],
      description: `Task completed: ${task}`,
      outcome,
      lessonsLearned: options.lessonsLearned,
      associatedEntities: options.entities || [],
      confidence: options.confidence ?? 0.95,
      verificationStatus: options.verificationStatus ?? "EXPERIMENTALLY_VERIFIED",
      privacy: "project_shared",
      retentionPolicy: "project_lifetime",
    });
  }

  /**
   * Helper to record user decisions.
   */
  recordUserDecision(
    userId: string,
    projectId: string,
    decision: string,
    context: string,
    options: {
      entities?: string[];
      conversationId?: string;
    } = {}
  ): EpisodicEventRecord {
    return this.recordEvent({
      userId,
      projectId,
      conversationId: options.conversationId || "main",
      eventType: "user_decision",
      source: "owner_directive",
      participants: ["owner"],
      description: decision,
      outcome: `Decision made in context: ${context}`,
      associatedEntities: options.entities || [],
      confidence: 1.0,
      verificationStatus: "USER_PROVIDED", // Explicit user statement
      privacy: "private_owner",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Helper to record project milestones.
   */
  recordMilestone(
    userId: string,
    projectId: string,
    milestone: string,
    options: {
      description?: string;
      entities?: string[];
      conversationId?: string;
    } = {}
  ): EpisodicEventRecord {
    return this.recordEvent({
      userId,
      projectId,
      conversationId: options.conversationId || "main",
      eventType: "project_milestone",
      source: "project_orchestrator",
      participants: ["owner", "archie"],
      description: `Milestone reached: ${milestone}`,
      outcome: options.description || milestone,
      associatedEntities: options.entities || [],
      confidence: 1.0,
      verificationStatus: "ACTUAL_OUTCOME",
      privacy: "project_shared",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Helper to record error resolutions for operational learning.
   */
  recordErrorResolution(
    userId: string,
    projectId: string,
    error: string,
    resolution: string,
    options: {
      entities?: string[];
      conversationId?: string;
    } = {}
  ): EpisodicEventRecord {
    return this.recordEvent({
      userId,
      projectId,
      conversationId: options.conversationId || "main",
      eventType: "error_resolution",
      source: "archie_error_recovery",
      participants: ["archie"],
      description: `Error resolved: ${error}`,
      outcome: resolution,
      lessonsLearned: [`Resolution pattern: ${resolution}`],
      associatedEntities: options.entities || [],
      confidence: 0.9,
      verificationStatus: "EXPERIMENTALLY_VERIFIED",
      privacy: "project_shared",
      retentionPolicy: "permanent",
    });
  }

  /**
   * Queries episodic events by strict criteria with tenant boundaries.
   */
  queryEvents(filter: {
    userId?: string;
    projectId?: string;
    eventType?: EpisodicEventType;
    entity?: string;
    verificationStatus?: MemoryProvenanceState;
    since?: number;
    until?: number;
    limit?: number;
  }): EpisodicEventRecord[] {
    const results: EpisodicEventRecord[] = [];
    const entityLower = filter.entity?.toLowerCase();

    for (const event of this.events.values()) {
      if (filter.userId && event.userId !== filter.userId && event.userId !== "anonymous") {
        continue;
      }
      if (filter.projectId && event.projectId !== filter.projectId && event.projectId !== "global") {
        continue;
      }
      if (filter.eventType && event.eventType !== filter.eventType) {
        continue;
      }
      if (filter.verificationStatus && event.verificationStatus !== filter.verificationStatus) {
        continue;
      }
      if (filter.since && event.timestamp < filter.since) {
        continue;
      }
      if (filter.until && event.timestamp > filter.until) {
        continue;
      }
      if (entityLower && !event.associatedEntities.some((e) => e.toLowerCase() === entityLower)) {
        continue;
      }

      results.push(event);
    }

    // Sort descending by recency
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (filter.limit && filter.limit > 0) {
      return results.slice(0, filter.limit);
    }
    return results;
  }

  /**
   * Distinguishes exact provenance nature:
   *   - "USER_SAID"
   *   - "ARCHIE_INFERRED"
   *   - "SYSTEM_OBSERVED"
   *   - "INDEPENDENTLY_VERIFIED"
   */
  distinguishProvenance(event: EpisodicEventRecord): "USER_SAID" | "ARCHIE_INFERRED" | "SYSTEM_OBSERVED" | "INDEPENDENTLY_VERIFIED" {
    switch (event.verificationStatus) {
      case "USER_PROVIDED":
        return "USER_SAID";
      case "INFERRED":
        return "ARCHIE_INFERRED";
      case "EXPERIMENTALLY_VERIFIED":
      case "EXTERNALLY_VERIFIED":
      case "ACTUAL_OUTCOME":
        return "INDEPENDENTLY_VERIFIED";
      case "SYSTEM_OBSERVED":
      default:
        return "SYSTEM_OBSERVED";
    }
  }

  getEvent(id: string): EpisodicEventRecord | undefined {
    return this.events.get(id);
  }

  count(): number {
    return this.events.size;
  }

  private evictOldest(count: number): void {
    const sorted = Array.from(this.events.values())
      .filter((e) => e.retentionPolicy !== "permanent")
      .sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      this.events.delete(sorted[i].id);
    }
  }
}
