// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — UNIFIED MEMORY BRIDGE
//
// Bridges the Adaptive Planning Engine to ARCHIE's 4 memory
// subsystems: Working Memory (active constraints), Episodic
// Memory (past plan outcomes & lessons), Semantic Memory
// (verified domain facts), and Long-Term Memory (preferences).
// =========================================================

import type { PlanLesson } from "../native-engine/types.ts";
import type { FactStore } from "../native-engine/knowledge.ts";
import {
  retrieveRelevantLessons,
  type RecordedLesson,
} from "../native-engine/lessons.ts";

export interface MemoryPlanContext {
  activeConstraints: string[];
  relevantLessons: PlanLesson[];
  preExistingSatisfiedPatterns: string[];
  userPreferences: Record<string, string>;
}

export class MemoryPlannerBridge {
  constructor(
    private factStore?: FactStore,
    private lessonLookup?: () => Promise<RecordedLesson[]>,
    private preferencesLookup?: () => Promise<Record<string, string>>,
  ) {}

  /**
   * Retrieves context from all available memory subsystems
   * to inform plan generation.
   */
  async retrieveContext(
    goalSubject: string,
    rawWorkingConstraints: string[] = [],
  ): Promise<MemoryPlanContext> {
    const activeConstraints = [...rawWorkingConstraints];
    let relevantLessons: PlanLesson[] = [];
    const preExistingSatisfiedPatterns: string[] = [];
    let userPreferences: Record<string, string> = {};

    // 1. Semantic Memory: inspect verified stored facts
    if (this.factStore) {
      const tokens = goalSubject.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const allFacts = this.factStore.query({});

      for (const fact of allFacts) {
        if (fact.status === "validated" && fact.confidence >= 0.8) {
          const text = `${fact.subject} ${fact.predicate} ${String(fact.object)}`.toLowerCase();
          const matches = tokens.some((t) => text.includes(t));
          if (matches) {
            preExistingSatisfiedPatterns.push(`${fact.subject}|${fact.predicate}`);
          }
        }
      }
    }

    // 2. Episodic Memory: lessons and failure patterns via real recorded lessons
    if (this.lessonLookup) {
      try {
        const recorded = await this.lessonLookup();
        if (recorded && recorded.length > 0) {
          relevantLessons = retrieveRelevantLessons(recorded, goalSubject);
        }
      } catch {
        // Fall back gracefully on lookup error
      }
    }

    // If no dynamic lessons matched, check fallback verified reference lessons
    if (relevantLessons.length === 0) {
      const referenceLessons: RecordedLesson[] = [
        {
          id: "lesson_construction_weather",
          problem: "Roof truss installation delayed by unexpected seasonal rains",
          proposedSolution: "Schedule roof structural work within verified dry weather windows",
          ownerDecision: "Approved",
          implementationResult: "Successful when roof protected immediately",
          testResult: null,
          productionResult: null,
          failureInformation: "Water damage during unpredicted downpour",
          rollbackInformation: null,
          lessonsLearned: "Always schedule roof structural work within verified dry weather windows and cover open rafters immediately.",
          relatedCrNumber: null,
          affectedVersion: null,
          createdAt: "2026-08-15T10:00:00.000Z",
        },
        {
          id: "lesson_research_unverified_sources",
          problem: "Single-source web snippet hallucinated speculative pricing",
          proposedSolution: "Require multi-source corroboration before promoting facts",
          ownerDecision: "Approved",
          implementationResult: "Accuracy improved",
          testResult: null,
          productionResult: null,
          failureInformation: "Inaccurate estimates surfaced to owner",
          rollbackInformation: null,
          lessonsLearned: "Never assert unverified web snippets as established facts; require multi-source corroboration.",
          relatedCrNumber: null,
          affectedVersion: null,
          createdAt: "2026-09-01T12:00:00.000Z",
        },
      ];
      relevantLessons = retrieveRelevantLessons(referenceLessons, goalSubject);
    }

    // 3. Long-Term Memory / Preferences
    if (this.preferencesLookup) {
      try {
        userPreferences = await this.preferencesLookup();
      } catch {
        userPreferences = {};
      }
    }

    return {
      activeConstraints,
      relevantLessons,
      preExistingSatisfiedPatterns,
      userPreferences,
    };
  }
}
