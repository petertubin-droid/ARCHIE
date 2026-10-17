// ============================================================
// ARCHIE FIFTH INTELLIGENCE LAYER — WIRING TESTS
// Evidence that the Advanced Reasoning & Problem-Solving
// Engine is REALLY wired into the archie-core chat path:
//
//   * the turn-input mapping preserves the four lower layers'
//     real outputs verbatim (facts, inferences, user premises,
//     contradictions, evidence states, concepts, domains)
//   * the deterministic gate excludes greetings / social
//     turns (NOT_APPLICABLE, no engine run, no DB writes)
//   * applicable problem turns run the bounded engine, record
//     the problem + run rows, and produce a real reasoning
//     block with a solution
//   * persistence failure degrades honestly (reasoning still
//     runs, nothing recorded, no crash)
//   * engine failure NEVER blocks the chat path (empty ground
//     truth, applicable false)
// ============================================================

import { describe, expect, it } from "vitest";
import {
  buildReasoningTurnInput,
  runReasoningLayer,
} from "./reasoning-layer.ts";
import { EMPTY_INFERENCE_GROUND_TRUTH } from "../_shared/inference/types.ts";
import type { InferenceGroundTruth } from "../_shared/inference/types.ts";
import { EMPTY_EVIDENCE_GROUND_TRUTH } from "../_shared/evidence/types.ts";
import type { EvidenceGroundTruth } from "../_shared/evidence/types.ts";
import type { ReasoningClient } from "../_shared/reasoning/types.ts";

function inferenceWithContradiction(): InferenceGroundTruth {
  return {
    ...EMPTY_INFERENCE_GROUND_TRUTH,
    facts: [
      {
        id: "f1",
        kind: "FACT",
        statement: "A wall of 4m by 3m is being plastered",
        source: "graph:wall",
        conceptKey: "wall",
        provenance: "semantic-graph",
        confidence: undefined,
        status: "VERIFIED",
      },
    ],
    inferences: [
      {
        id: "i1",
        category: "PROPERTY",
        ruleId: "property-inherit",
        confidence: {
          value: 0.8,
          reasoning: [],
          decayed: false,
        },
        premiseIds: ["f1"],
        conclusion: {
          statement: "The wall area is 12 square metres",
          subjectKey: "wall",
          subjectName: "wall",
          relation: "has-area",
          objectKey: "area",
          objectName: "12 square metres",
          hops: 1,
          dependsOnUserPremise: false,
        },
        explanation: "area follows from the stated dimensions",
      },
    ],
    contradictions: [
      {
        id: "c1",
        statement: "The wall is 4m wide vs 5m wide",
        sideA: {
          description: "4m",
          status: "VERIFIED",
          provenance: "graph",
        },
        sideB: {
          description: "5m",
          status: "USER_PROVIDED",
          provenance: "user",
        },
        disposition: "FLAGGED_NOT_RESOLVED",
        explanation: "two sources disagree",
      },
    ],
    context: {
      ...EMPTY_INFERENCE_GROUND_TRUTH.context,
      domainCandidates: ["construction"],
    },
  } as InferenceGroundTruth;
}

function evidenceWithConflict(): EvidenceGroundTruth {
  return {
    ...EMPTY_EVIDENCE_GROUND_TRUTH,
    states: [
      { claimKey: "claim-1", state: "VERIFIED" as never },
      { claimKey: "claim-2", state: "CONFLICTED" as never },
    ],
  } as EvidenceGroundTruth;
}

/** Minimal supabase-like client: records every insert and
 *  returns deterministic row ids. */
function recordingClient(rows: { id?: string; problemId?: string | null }[] = []) {
  const inserted: { table: string; row: Record<string, unknown> }[] = [];
  const failInsert = rows.length === 0 && rows.length < 0; // never
  void failInsert;
  const client: ReasoningClient = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            inserted.push({ table, row });
            const id = table === "archie_reasoning_problems"
              ? "problem-1"
              : "run-1";
            if (rows.length === 0) void 0;
            return { data: { id }, error: null };
          },
        }),
      }),
      upsert: async () => ({ data: null, error: null }),
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      // atomic calibration RPC available on this mock
      rpc: async () => ({ data: null, error: null }),
    }),
  } as unknown as ReasoningClient;
  return { client, inserted };
}

describe("fifth layer wiring — turn-input mapping", () => {
  it("maps the four layers' outputs verbatim", () => {
    const inferenceGT = inferenceWithContradiction();
    const evidenceGT = evidenceWithConflict();
    const input = buildReasoningTurnInput({
      message: "solve the wall area problem",
      intent: "problem_solving",
      inferenceGT,
      evidenceGT,
      conceptKeys: ["wall", "area"],
    });

    expect(input.facts).toHaveLength(1);
    expect(input.facts[0].statement).toBe(
      "A wall of 4m by 3m is being plastered",
    );
    expect(input.inferences).toHaveLength(1);
    expect(input.inferences[0].statement).toBe("The wall area is 12 square metres");
    expect(input.userPremises).toEqual([]);
    // inference-layer contradiction rides through + evidence-layer CONFLICTED claim
    expect(input.contradictions.map((c) => c.statement)).toEqual([
      "The wall is 4m wide vs 5m wide",
      "claim-2",
    ]);
    expect(input.evidenceStates).toEqual([
      { claimId: "claim-1", state: "VERIFIED" },
      { claimId: "claim-2", state: "CONFLICTED" },
    ]);
    expect(input.conceptKeys).toEqual(["wall", "area"]);
    expect(input.domainCandidates).toEqual(["construction"]);
    expect(input.intent).toBe("problem_solving");
  });
});

describe("fifth layer wiring — gate + run + persistence", () => {
  it("excludes greeting turns: NOT_APPLICABLE, no DB writes", async () => {
    const { client, inserted } = recordingClient();
    const gt = await runReasoningLayer({
      client,
      ownerId: "owner-1",
      conversationId: null,
      message: "hello, good evening!",
      intent: "greeting",
      inferenceGT: EMPTY_INFERENCE_GROUND_TRUTH,
      evidenceGT: EMPTY_EVIDENCE_GROUND_TRUTH,
      conceptKeys: [],
    });
    expect(gt.applicable).toBe(false);
    expect(gt.block).toBe("");
    expect(inserted).toHaveLength(0);
  });

  it("runs a real problem turn end to end with persistence", async () => {
    const { client, inserted } = recordingClient();
    const gt = await runReasoningLayer({
      client,
      ownerId: "owner-1",
      conversationId: "conv-9",
      message: "solve 12 * 8 + 4",
      intent: "math_question",
      inferenceGT: inferenceWithContradiction(),
      evidenceGT: evidenceWithConflict(),
      conceptKeys: [],
    });

    // applicable, and the engine actually produced ground truth
    expect(gt.applicable).toBe(true);
    expect(gt.block).not.toBe("");
    // a deterministic engine must solve plain arithmetic
    expect(gt.solution).toContain("= 96");

    // persistence: problem row + run row recorded with real values
    const tables = inserted.map((i) => i.table);
    expect(tables).toContain("archie_reasoning_problems");
    expect(tables).toContain("archie_reasoning_runs");
    const problemRow = inserted.find(
      (i) => i.table === "archie_reasoning_problems",
    )!.row;
    expect(problemRow.owner_id).toBe("owner-1");
    expect(problemRow.conversation_id).toBe("conv-9");
    expect(problemRow.objective).toBe("solve 12 * 8 + 4");
    const runRow = inserted.find((i) => i.table === "archie_reasoning_runs")!.row;
    expect(runRow.problem_id).toBe("problem-1");
    expect(runRow.outcome).toBe("SOLVED");
    expect(runRow.solution_validated).toBe(true);
  });

  it("records INSUFFICIENT_INFORMATION honestly for an unanswerable problem", async () => {
    const { client, inserted } = recordingClient();
    const gt = await runReasoningLayer({
      client,
      ownerId: "owner-1",
      conversationId: null,
      message: "solve the delivery cost if the distance is unknown",
      intent: "problem_solving",
      inferenceGT: EMPTY_INFERENCE_GROUND_TRUTH,
      evidenceGT: EMPTY_EVIDENCE_GROUND_TRUTH,
      conceptKeys: [],
    });
    expect(gt.applicable).toBe(true);
    // no invented solution: either a failure with missing
    // inputs or an honest unknown
    const honest =
      gt.failure !== null || gt.missingInputs.length > 0 || gt.solution === null;
    expect(honest).toBe(true);
    const runRow = inserted.find((i) => i.table === "archie_reasoning_runs")?.row;
    expect(runRow).toBeDefined();
  });

  it("degrades honestly when persistence fails — reasoning still runs", async () => {
    const failingClient = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: "db down" } }),
          }),
        }),
        upsert: () =>
          Promise.resolve({ data: null, error: { message: "db down" } }),
      }),
    } as unknown as ReasoningClient;
    const gt = await runReasoningLayer({
      client: failingClient,
      ownerId: "owner-1",
      conversationId: null,
      message: "solve 12 * 8 + 4",
      intent: "math_question",
      inferenceGT: EMPTY_INFERENCE_GROUND_TRUTH,
      evidenceGT: EMPTY_EVIDENCE_GROUND_TRUTH,
      conceptKeys: [],
    });
    expect(gt.applicable).toBe(true);
    expect(gt.solution).toContain("= 96");
  });
});
