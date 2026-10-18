// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — LEARNING BRIDGE
// supabase/functions/_shared/archie-ai/associative-memory/memory-learning-bridge.ts
//
// Connects the Memory Engine to ARCHIE's Learning Pipeline.
//   - Identifies repeated outcome patterns from episodic events.
//   - Evaluates successful and unsuccessful error resolutions.
//   - Extracts candidate lessons for review.
//
// STRICT GOVERNANCE & OWNER AUTHORIZATION:
//   - Remembering does not make it true.
//   - Learning does not grant authorization.
//   - Never autonomously promotes unverified experience into authoritative knowledge.
//   - Deterministic math/safety capabilities are permanently protected.
// =========================================================

import type { EpisodicEventRecord } from "./types.ts";
import { MATH_CAPABILITIES } from "../../../../../src/lib/learning/types.ts";

export interface CandidateLessonProposal {
  id: string;
  sourceEventIds: string[];
  pattern: string;
  extractedLesson: string;
  domain: string;
  confidence: number;
  isProtectedCapability: boolean;
  status: "CANDIDATE_FOR_OWNER_REVIEW" | "REJECTED_PROTECTED_CAPABILITY";
  requiresOwnerApproval: boolean;
  proposedAt: number;
}

export class MemoryLearningBridge {
  /**
   * Evaluates a collection of episodic events to extract candidate learning proposals.
   * Gated: All proposals require Owner review before any promotion into production knowledge.
   */
  evaluateExperiences(events: EpisodicEventRecord[]): CandidateLessonProposal[] {
    const proposals: CandidateLessonProposal[] = [];
    const resolutionCounts = new Map<string, { count: number; events: EpisodicEventRecord[] }>();

    // 1. Group error resolutions and task completions
    for (const evt of events) {
      if (evt.eventType === "error_resolution" && evt.outcome) {
        const key = evt.description.toLowerCase().trim();
        const entry = resolutionCounts.get(key) || { count: 0, events: [] };
        entry.count += 1;
        entry.events.push(evt);
        resolutionCounts.set(key, entry);
      }
    }

    // 2. Identify patterns with recurrence >= 2
    for (const [pattern, entry] of resolutionCounts.entries()) {
      if (entry.count >= 2) {
        const lastEvt = entry.events[entry.events.length - 1];
        const isProtected = this.isProtectedCapability(pattern);

        proposals.push({
          id: `learn_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
          sourceEventIds: entry.events.map((e) => e.id),
          pattern,
          extractedLesson: lastEvt.outcome || `Pattern verified ${entry.count} times.`,
          domain: lastEvt.projectId || "general",
          confidence: Math.min(0.9, 0.6 + entry.count * 0.1),
          isProtectedCapability: isProtected,
          status: isProtected ? "REJECTED_PROTECTED_CAPABILITY" : "CANDIDATE_FOR_OWNER_REVIEW",
          requiresOwnerApproval: true, // Always requires Owner authorization
          proposedAt: Date.now(),
        });
      }
    }

    return proposals;
  }

  /**
   * Checks if pattern touches protected deterministic mathematical / estimation capabilities.
   */
  private isProtectedCapability(pattern: string): boolean {
    const lower = pattern.toLowerCase();
    for (const cap of MATH_CAPABILITIES) {
      const capLower = cap.toLowerCase();
      // Check exact word or stem
      const stem = capLower.endsWith("ing") ? capLower.slice(0, -3) : capLower;
      if (lower.includes(capLower) || lower.includes(stem)) {
        return true;
      }
    }
    // Also check explicit keywords
    if (/\b(?:calculation|quantities|formula|geometry|takeoff)\b/i.test(lower)) {
      return true;
    }
    return false;
  }
}
