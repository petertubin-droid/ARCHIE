// ============================================================
// ARCHIE FIFTH INTELLIGENCE LAYER — LIVE WIRING (archie-core)
//
// The Advanced Reasoning & Problem-Solving Engine
// (supabase/functions/_shared/reasoning/) was shipped
// 2026-09-19 as modules + migration but never wired into the
// live chat path. This module is the glue archie-core calls
// AFTER the four lower layers (lexicon → semantic graph →
// inference → evidence) have produced their ground truth for
// the turn:
//
//   1. buildReasoningTurnInput maps the four layers' REAL
//      outputs into the engine's ReasoningTurnInput — no
//      re-retrieval, no invented premises.
//   2. runReasoningLayer applies the deterministic gate
//      (reasoningApplicable — greetings/social turns stay
//      OUT), then runs reasoningGroundTruth with bounded
//      budgets.
//   3. Persistence: each applicable problem is recorded in
//      archie_reasoning_problems and its run in
//      archie_reasoning_runs (migration 20260920140000 —
//      replay-safe on a fresh database). Persistence failure
//      degrades honestly — reasoning still runs.
//   4. Failure NEVER blocks the chat path: the caller gets an
//      empty ground truth and continues (same contract as the
//      four lower layers).
//
// No external AI, no sub-agents, no invented values.
// ============================================================

import {
  reasoningApplicable,
  reasoningGroundTruth,
} from "../_shared/reasoning/engine.ts";
import {
  confidenceStatement,
  createCalibrationStore,
  propagateCausal,
  type CausalEdge,
} from "../_shared/archie-ai/cognitive/uncertainty.ts";
import { classifyProblem } from "../_shared/reasoning/classify.ts";
import { createReasoningPersistence } from "../_shared/reasoning/persistence.ts";
import type {
  ReasoningClient,
  ReasoningGroundTruth,
  ReasoningTurnInput,
} from "../_shared/reasoning/types.ts";
import { emptyReasoningGroundTruth } from "../_shared/reasoning/types.ts";
import type { InferenceGroundTruth } from "../_shared/inference/types.ts";
import type { EvidenceGroundTruth } from "../_shared/evidence/types.ts";

/** Causal confidence annotations over this turn's real
 *  inferences (uncertainty engine, gap A-2). Deterministic. */
function buildCausalBlock(input: import("../_shared/reasoning/types.ts").ReasoningTurnInput): string[] {
  if (input.inferences.length === 0 || input.facts.length === 0) return [];
  const factIds = new Set(input.facts.map((f) => f.id));
  const edges: CausalEdge[] = [];
  for (const inf of input.inferences) {
    const premise = inf.premiseIds.find((p) => factIds.has(p)) ?? inf.premiseIds[0];
    if (!premise) continue;
    edges.push({
      from: premise,
      to: inf.id,
      strength: 0.9, // a derived inference supports its own conclusion
      because: inf.statement.slice(0, 160),
    });
  }
  const start = input.facts[0].id;
  const results = propagateCausal(edges, start, 6);
  const lines: string[] = [];
  for (const r of results.slice(0, 4)) {
    lines.push(
      `[causal] ${r.explanation} — propagated confidence ${r.confidence.toFixed(3)}`,
    );
  }
  return lines;
}

/** Map the four lower layers' real outputs into the engine's
 *  turn input. Pure, deterministic, no I/O. */
export function buildReasoningTurnInput(args: {
  message: string;
  intent: string;
  inferenceGT: InferenceGroundTruth;
  evidenceGT: EvidenceGroundTruth;
  conceptKeys: string[];
}): ReasoningTurnInput {
  const { inferenceGT, evidenceGT } = args;
  return {
    message: args.message,
    intent: args.intent,
    facts: inferenceGT.facts.map((f) => ({
      id: f.id,
      statement: f.statement,
      source: f.source,
      conceptKey: f.conceptKey,
    })),
    inferences: inferenceGT.inferences.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      statement: i.conclusion.statement,
      premiseIds: i.premiseIds,
    })),
    userPremises: inferenceGT.context.userPremises.map((p) => ({
      id: p.id,
      statement: p.statement,
    })),
    // Inference-layer contradictions ride through VERBATIM
    // (both sides' provenance is preserved in the inference
    // engine's own audit record), plus evidence-layer
    // CONFLICTED claims — the engine must surface them,
    // never silently pick a side.
    contradictions: [
      ...inferenceGT.contradictions.map((c) => ({
        statement: c.statement,
      })),
      ...evidenceGT.states
        .filter((s) => s.state === "CONFLICTED")
        .map((s) => ({ statement: s.claimKey })),
    ],
    evidenceStates: evidenceGT.states.map((s) => ({
      claimId: s.claimKey,
      state: s.state as string,
    })),
    conceptKeys: args.conceptKeys,
    domainCandidates: inferenceGT.context.domainCandidates,
  };
}

/** Run the fifth layer for one turn. Deterministic gate first
 *  (non-problem turns return an honest NOT_APPLICABLE ground
 *  truth without touching the engine), then the bounded
 *  reasoning run. Any failure degrades to an empty ground
 *  truth — the chat path is NEVER blocked. */
export async function runReasoningLayer(args: {
  client: ReasoningClient;
  ownerId: string;
  conversationId: string | null;
  message: string;
  intent: string;
  inferenceGT: InferenceGroundTruth;
  evidenceGT: EvidenceGroundTruth;
  conceptKeys: string[];
}): Promise<ReasoningGroundTruth> {
  const input = buildReasoningTurnInput({
    message: args.message,
    intent: args.intent,
    inferenceGT: args.inferenceGT,
    evidenceGT: args.evidenceGT,
    conceptKeys: args.conceptKeys,
  });

  if (!reasoningApplicable(input)) {
    const gt = emptyReasoningGroundTruth();
    gt.applicable = false;
    return gt;
  }

  try {
    const persistence = createReasoningPersistence(args.client);
    const classification = classifyProblem(args.message);
    const domain = input.domainCandidates[0] ?? "general";
    const calibrationKey = `reasoning:${classification.primary}`;
    const calibration = createCalibrationStore(args.client);

    // BETA-BAYES CALIBRATION (uncertainty engine): quote the
    // calibrated confidence for this problem category with its
    // REAL outcome basis — never a bare number.
    const calibrationNote =
      confidenceStatement(0.5, await calibration.read(calibrationKey));

    // CAUSAL PROPAGATION (uncertainty engine): over this
    // turn's REAL inference chain — premise fact → derived
    // conclusion, edge strength = the inference's own
    // confidence, because = the conclusion statement. The
    // strongest-path product + causal explanation ride into
    // the reasoning block.
    const causalBlock = buildCausalBlock(input);

    // Record the problem BEFORE the run so every run row is
    // anchored. Persistence failure → problemId null → the
    // run is simply not recorded (honest degradation).
    const problemId = await persistence.recordProblem({
      ownerId: args.ownerId,
      conversationId: args.conversationId,
      category: classification.primary,
      objective: args.message.slice(0, 500),
      status: "PENDING",
      domain,
    });

    const gt = await reasoningGroundTruth(
      {
        frelux: null, // no FRELUX calculator adapter on this surface — the engine degrades honestly without it
        persist: async (record) => {
          if (problemId) {
            await persistence.recordRun({ problemId, record });
          }
        },
      },
      input,
    );

    // Record the REAL outcome for future calibration (atomic,
    // best-effort — a failed write degrades to the prior).
    await calibration.record(calibrationKey, !gt.failure && gt.solution !== null);

    // Uncertainty engine annotations ride with the reasoning
    // block — calibrated confidence + causal explanations.
    const annotations = [
      `[calibrated] ${calibrationKey} ${calibrationNote.statement}`,
      ...causalBlock,
    ].join("\n");
    gt.block = gt.block
      ? `${gt.block}\n${annotations}`
      : annotations;
    return gt;
  } catch (err) {
    console.warn("[archie-core] reasoning layer failed:", err);
    return emptyReasoningGroundTruth();
  }
}
