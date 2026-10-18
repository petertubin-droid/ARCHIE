// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — SESSION CONTINUITY
// supabase/functions/_shared/archie-ai/associative-memory/session-continuity.ts
//
// Solves seamless cross-session continuity:
//   - Enables "Continue where we stopped" across devices and sessions.
//   - Recovers:
//       1. Relevant project & conversation context
//       2. Latest meaningful state & last completed milestone
//       3. Unresolved tasks & pending work
//       4. Active constraints & user decisions
//       5. Distinguishes completed work from proposed work
//   - Triggers targeted clarification when multiple projects are plausible.
// =========================================================

import type {
  SessionContinuityState,
  EpisodicEventRecord,
  LongTermMemoryRecord,
} from "./types.ts";
import type { EpisodicMemoryEngine } from "./episodic-memory.ts";
import type { LongTermMemoryEngine } from "./long-term-memory.ts";

export class SessionContinuityEngine {
  constructor(
    private episodicEngine: EpisodicMemoryEngine,
    private longTermEngine: LongTermMemoryEngine
  ) {}

  /**
   * Recovers full continuity state for a user.
   * If targetProjectId is omitted, identifies the most recently active project.
   */
  recoverContinuity(
    userId: string,
    targetProjectId?: string,
    options: { candidateProjects?: string[] } = {}
  ): SessionContinuityState {
    const candidateProjects = options.candidateProjects || [];

    // 1. If project not specified and multiple candidate projects exist, flag for clarification
    if (!targetProjectId && candidateProjects.length > 1) {
      return {
        userId,
        projectId: candidateProjects[0],
        conversationId: "unknown",
        unresolvedTasks: [],
        activeConstraints: [],
        lastCompletedWork: [],
        proposedWork: [],
        continuitySummary: `Multiple active projects found: ${candidateProjects.join(", ")}. Which project should we continue?`,
        needsClarification: true,
        candidateProjects,
        recoveredAt: Date.now(),
      };
    }

    const projectId = targetProjectId || (candidateProjects.length === 1 ? candidateProjects[0] : "global");

    // 2. Query episodic events for this project
    const events = this.episodicEngine.queryEvents({
      userId,
      projectId,
      limit: 50,
    });

    let lastMilestone: string | undefined;
    const lastCompletedWork: string[] = [];
    const proposedWork: string[] = [];
    const unresolvedTasks: string[] = [];
    let conversationId = "main";

    for (const evt of events) {
      if (evt.conversationId && conversationId === "main") {
        conversationId = evt.conversationId;
      }

      if (evt.eventType === "project_milestone" && !lastMilestone) {
        lastMilestone = evt.description;
      }

      if (evt.eventType === "task_completion") {
        if (lastCompletedWork.length < 5) {
          lastCompletedWork.push(evt.description + (evt.outcome ? ` -> ${evt.outcome}` : ""));
        }
      }

      // If an event has unresolved pending work
      if (evt.metadata?.proposedWork && Array.isArray(evt.metadata.proposedWork)) {
        for (const item of evt.metadata.proposedWork) {
          if (typeof item === "string" && !unresolvedTasks.includes(item)) {
            unresolvedTasks.push(item);
          }
        }
      }
    }

    // 3. Query active constraints and long-term context
    const longTermRecords = this.longTermEngine.query({
      userId,
      projectId,
      limit: 20,
    });

    const activeConstraints: string[] = [];
    for (const rec of longTermRecords) {
      if (rec.kind === "operational_rule") {
        activeConstraints.push(rec.summary);
      } else if (rec.kind === "long_term_goal") {
        if (!unresolvedTasks.includes(rec.summary)) {
          proposedWork.push(rec.summary);
        }
      }
    }

    // 4. Construct a concise continuity narrative
    const parts: string[] = [];
    if (projectId !== "global") {
      parts.push(`Continuing project "${projectId}".`);
    }
    if (lastMilestone) {
      parts.push(`Last milestone: ${lastMilestone}.`);
    }
    if (lastCompletedWork.length > 0) {
      parts.push(`Recently completed: ${lastCompletedWork[0]}.`);
    }
    if (unresolvedTasks.length > 0) {
      parts.push(`Pending tasks: ${unresolvedTasks.slice(0, 3).join("; ")}.`);
    }

    const continuitySummary = parts.join(" ") || "Resuming session. No previous pending milestones recorded.";

    return {
      userId,
      projectId,
      conversationId,
      lastMilestone,
      unresolvedTasks,
      activeConstraints,
      lastCompletedWork,
      proposedWork,
      continuitySummary,
      needsClarification: false,
      recoveredAt: Date.now(),
    };
  }
}
