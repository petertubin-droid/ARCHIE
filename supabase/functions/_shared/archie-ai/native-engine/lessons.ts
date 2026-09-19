// =========================================================
// ARCHIE NATIVE ENGINE — LESSONS → BEHAVIOR (Phase 4.4)
// supabase/functions/_shared/archie-ai/native-engine/lessons.ts
//
// The owner's evolution memory (archie_evolution_memory, §15)
// records PROBLEM → PROPOSAL → DECISION → RESULT → LESSON.
// Until Phase 4.4 those rows were WRITE-ONLY: displayed in the
// admin UI, never read back into behavior. This module wires
// them into ARCHIE's planning, deterministically and honestly:
//
//   * RETRIEVAL is salient-token overlap — the same cheap,
//     real signal the web-research layer uses for cross-
//     checking. No LLM, no provider, no external call.
//   * A lesson is CONTEXT, never a rule: it annotates the
//     plan (risk notes, dated provenance) and is surfaced in
//     the response. It NEVER auto-blocks an operator and it
//     NEVER writes to the fact store — the owner decides.
//   * Lessons with recorded failure/rollback information
//     raise the plan's risk level: repeating a failed
//     approach is at least a medium risk to flag, not a
//     surprise.
//   * Provenance is explicit: every surfaced lesson carries
//     its recorded date and matched tokens.
// =========================================================

import { salientTokens } from "./webresearch.ts";
import type { Plan, PlanLesson } from "./types.ts";

/** A row of the owner's evolution memory (§15) — the REAL
 *  shape of archie_evolution_memory, mapped 1:1. */
export interface RecordedLesson {
  id: string;
  problem: string;
  proposedSolution: string;
  ownerDecision: string;
  implementationResult: string | null;
  testResult: string | null;
  productionResult: string | null;
  failureInformation: string | null;
  rollbackInformation: string | null;
  lessonsLearned: string | null;
  relatedCrNumber: string | null;
  affectedVersion: string | null;
  createdAt: string;
}

/** Two shared salient tokens minimum — one shared word is
 *  noise, two is a real topical signal (same floor the web
 *  research layer uses for candidate raise). */
export const LESSON_MIN_SHARED_TOKENS = 2;

/** At most this many lessons surface in one plan — the plan
 *  is a decision aid, not a memory dump. */
export const LESSON_PLAN_CONTEXT_LIMIT = 3;

/** The lesson text retrieval matches against: the problem
 *  statement is the primary signal, the recorded lesson the
 *  secondary one. Deterministic, no hidden fields. */
function lessonMatchText(lesson: RecordedLesson): string {
  return [
    lesson.problem,
    lesson.lessonsLearned ?? "",
    lesson.proposedSolution,
  ].join(" ");
}

/** Retrieve the owner-recorded lessons relevant to a planning
 *  query. Deterministic: salient-token overlap against the
 *  query, ranked by score then by recency, capped. Returns []
 *  when nothing clears the signal floor — absence is honest.
 *  Never throws; a lesson with empty text simply cannot
 *  clear the floor. */
export function retrieveRelevantLessons(
  lessons: RecordedLesson[],
  query: string,
  limit: number = LESSON_PLAN_CONTEXT_LIMIT,
): PlanLesson[] {
  const queryTokens = salientTokens(query);
  if (queryTokens.size === 0) return [];
  const scored = lessons
    .map((lesson) => {
      const lessonTokens = salientTokens(lessonMatchText(lesson));
      const matchedTokens = [...lessonTokens].filter((t) => queryTokens.has(t));
      return { lesson, matchedTokens };
    })
    .filter((s) => s.matchedTokens.length >= LESSON_MIN_SHARED_TOKENS)
    .map((s) => ({
      ...s,
      score: s.matchedTokens.length,
    }));
  scored.sort((a, b) =>
    a.score !== b.score
      ? b.score - a.score
      : // Recency tie-break, then stable id — fully
        // deterministic even for identical timestamps.
        a.lesson.createdAt < b.lesson.createdAt
        ? 1
        : a.lesson.createdAt > b.lesson.createdAt
          ? -1
          : a.lesson.id < b.lesson.id
            ? -1
            : 1,
  );
  return scored.slice(0, limit).map((s) => ({
    id: s.lesson.id,
    problem: s.lesson.problem,
    lesson: s.lesson.lessonsLearned ?? s.lesson.problem,
    recordedAt: s.lesson.createdAt,
    matchedTokens: s.matchedTokens,
    failedBefore:
      Boolean(s.lesson.failureInformation) ||
      Boolean(s.lesson.rollbackInformation),
  }));
}

/** Merge retrieved lessons into a plan's risk assessment. A
 *  recorded failure/rollback for a matching approach raises
 *  the risk level to at least "medium" — the plan still
 *  proceeds (the owner decides), but it is never presented as
 *  a surprise-free repeat of something that failed before. */
export function mergeLessonRisk(
  lessons: PlanLesson[],
  risk: Plan["risk"],
): Plan["risk"] {
  const notes = [...risk.notes];
  let level = risk.level;
  for (const lesson of lessons) {
    const date = lesson.recordedAt.slice(0, 10);
    if (lesson.failedBefore) {
      if (level === "low") level = "medium";
      notes.push(
        `past attempt on a matching problem failed or was rolled back (lesson recorded ${date}): ${lesson.lesson}`,
      );
    } else {
      notes.push(
        `owner-recorded lesson applies (recorded ${date}): ${lesson.lesson}`,
      );
    }
  }
  return { level, notes };
}
