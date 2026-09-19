// =========================================================
// LESSONS → BEHAVIOR (Phase 4.4) TESTS
//
// The owner's evolution memory (archie_evolution_memory, §15)
// was write-only until 4.4 — rows displayed in the admin UI,
// never read back. These tests pin the REAL wiring:
//
//   1. retrieval is deterministic salient-token overlap with
//      a real signal floor (no one-word noise matches);
//   2. ranking is score-then-recency with a stable tie-break;
//   3. failed/rolled-back lessons raise plan risk honestly;
//   4. the engine surfaces lessons in planning responses and
//      on the returned plan, with dated provenance;
//   5. THE MEMORY-INTEGRITY INVARIANT: a lesson is CONTEXT —
//      it NEVER creates a fact (casual planning conversations
//      still leave the knowledge store untouched);
//   6. absence is honest: no provider → no lessons → no
//      fabricated lesson note.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  mergeLessonRisk,
  retrieveRelevantLessons,
  type RecordedLesson,
} from "@studio-shared/archie-ai/native-engine/lessons.ts";
import { ArchieNativeEngine } from "@studio-shared/archie-ai/native-engine/engine.ts";

const lesson = (over: Partial<RecordedLesson>): RecordedLesson => ({
  id: "l1",
  problem: "concrete slab casting on unstable soil",
  proposedSolution: "cast directly after rainfall without soil testing",
  ownerDecision: "approved",
  implementationResult: null,
  testResult: null,
  productionResult: null,
  failureInformation: null,
  rollbackInformation: null,
  lessonsLearned: "always test soil moisture before casting a concrete slab",
  relatedCrNumber: null,
  affectedVersion: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  ...over,
});

const turns = (text: string) => [{ role: "owner" as const, parts: [{ text }] }];

/** converse() is the public seam that carries the full
 *  ConverseResult (including .plan); generate() maps to the
 *  runtime parts-shape. Planning tests read the plan through
 *  the public converse seam. */
interface PlanReply {
  reply: string;
  plan: { relevantLessons?: { id: string; recordedAt: string }[] } | null;
}

async function planReply(
  engine: ArchieNativeEngine,
  text: string,
): Promise<PlanReply> {
  const result = await engine.converse(text, turns(text), "");
  return {
    reply: result.responseText,
    plan: (result as unknown as { plan?: PlanReply["plan"] }).plan ?? null,
  };
}

// ---------------------------------------------------------
// Pure retrieval
// ---------------------------------------------------------
describe("lesson retrieval", () => {
  const target = lesson({});

  it("matches a topically relevant lesson with its shared tokens", () => {
    const hits = retrieveRelevantLessons(
      [target],
      "help me organize casting a concrete slab project",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe("l1");
    expect(hits[0].matchedTokens).toContain("concrete");
    expect(hits[0].matchedTokens).toContain("slab");
    expect(hits[0].failedBefore).toBe(false);
  });

  it("does not match on a single shared word (noise floor)", () => {
    const hits = retrieveRelevantLessons(
      [target],
      "tell me about concrete prices today",
    );
    expect(hits).toEqual([]);
  });

  it("flags failed/rolled-back lessons", () => {
    const failed = lesson({
      id: "l2",
      failureInformation: "slab cracked, redone",
      rollbackInformation: null,
    });
    const hits = retrieveRelevantLessons(
      [failed],
      "plan casting the concrete slab",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].failedBefore).toBe(true);
  });

  it("ranks by score then recency, deterministically", () => {
    const a = lesson({
      id: "a",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const b = lesson({
      id: "b",
      problem: "concrete slab casting soil testing workflow",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const first = retrieveRelevantLessons(
      [a, b],
      "plan concrete slab casting",
      1,
    );
    expect(first[0].id).toBe("b"); // more overlap wins
    const again = retrieveRelevantLessons(
      [a, b],
      "plan concrete slab casting",
      1,
    );
    expect(again[0].id).toBe(first[0].id); // deterministic
  });

  it("falls back to the problem text when no lesson text was recorded", () => {
    const bare = lesson({ lessonsLearned: null });
    const hits = retrieveRelevantLessons(
      [bare],
      "concrete slab on unstable soil project",
    );
    expect(hits.length).toBe(1);
    expect(hits[0].lesson).toBe(bare.problem);
  });
});

// ---------------------------------------------------------
// Risk merge
// ---------------------------------------------------------
describe("lesson risk merge", () => {
  it("raises a low-risk plan to medium when a past attempt failed", () => {
    const risk = mergeLessonRisk(
      [
        {
          id: "l1",
          problem: "p",
          lesson: "test soil first",
          recordedAt: "2026-08-01T10:00:00.000Z",
          matchedTokens: ["concrete"],
          failedBefore: true,
        },
      ],
      { level: "low", notes: ["primary plan uses stored capabilities only"] },
    );
    expect(risk.level).toBe("medium");
    expect(risk.notes.join(" ")).toContain("2026-08-01");
    expect(risk.notes.join(" ")).toContain("rolled back");
  });

  it("annotates without raising risk for non-failure lessons", () => {
    const risk = mergeLessonRisk(
      [
        {
          id: "l1",
          problem: "p",
          lesson: "prefer morning casting",
          recordedAt: "2026-08-01T10:00:00.000Z",
          matchedTokens: ["concrete"],
          failedBefore: false,
        },
      ],
      { level: "low", notes: [] },
    );
    expect(risk.level).toBe("low");
    expect(risk.notes.join(" ")).toContain("prefer morning casting");
  });
});

// ---------------------------------------------------------
// Engine integration (behavior actually wired)
// ---------------------------------------------------------
describe("engine: lessons reach planning behavior", () => {
  it("surfaces a relevant owner lesson in the plan and the reply", async () => {
    const engine = new ArchieNativeEngine({
      lessonLookup: async () => [lesson({})],
    });
    const { reply, plan } = await planReply(
      engine,
      "help me organize casting a concrete slab project",
    );
    expect(plan).not.toBeNull();
    expect(plan!.relevantLessons).toBeDefined();
    expect(plan!.relevantLessons!.length).toBe(1);
    expect(plan!.relevantLessons![0].id).toBe("l1");
    expect(reply).toContain("evolution memory");
    expect(reply).toContain("2026-08-01");
    expect(reply).toContain("always test soil moisture");
  });

  it("raises the stated risk when the matching lesson recorded a failure", async () => {
    const engine = new ArchieNativeEngine({
      lessonLookup: async () => [
        lesson({ failureInformation: "slab cracked", id: "f1" }),
      ],
    });
    const { reply } = await planReply(
      engine,
      "help me organize casting a concrete slab project",
    );
    expect(reply).toContain("failed or was rolled back");
    expect(reply).toContain("Risk level raised accordingly");
  });

  it("creates NO facts from lessons (memory-integrity invariant)", async () => {
    // Planning itself asserts real session facts (owner present,
    // calculator constants) — that is legitimate. The invariant
    // under test is that LESSONS add nothing on top: the same
    // planning request must produce the IDENTICAL fact-count
    // delta with and without a lesson provider returning a
    // topically relevant lesson.
    const req = "help me organize casting a concrete slab project";
    const delta = async (withLesson: boolean) => {
      const engine = new ArchieNativeEngine(
        withLesson ? { lessonLookup: async () => [lesson({})] } : {},
      );
      const store = (engine as unknown as { facts: { count: () => number } })
        .facts;
      const before = store.count();
      await planReply(engine, req);
      return store.count() - before;
    };
    const without = await delta(false);
    const withLessons = await delta(true);
    expect(withLessons).toBe(without);
    expect(without).toBeGreaterThan(0); // control: planning ran
  });

  it("reports no lessons when none are relevant or none exist (honest absence)", async () => {
    const engine = new ArchieNativeEngine({
      lessonLookup: async () => [
        lesson({
          id: "x",
          problem: "painting interior walls",
          lessonsLearned: "prime before painting",
        }),
      ],
    });
    const { reply } = await planReply(
      engine,
      "help me organize casting a concrete slab project",
    );
    expect(reply).not.toContain("prime before painting");
    expect(reply).not.toContain("evolution memory");
  });

  it("plans normally with no lesson provider wired", async () => {
    const engine = new ArchieNativeEngine();
    const { reply, plan } = await planReply(
      engine,
      "help me organize casting a concrete slab project",
    );
    expect(reply).toContain("Plan for your request");
    expect(plan!.relevantLessons).toEqual([]);
  });
});
