// =========================================================
// REASONING LOOP CONTROLLER (plan P5 Batch A, audit M1)
// A genuine reason → act → observe → continue loop instead
// of one-shot routing. The controller drives the substrate
// (the native engine) clause by clause with a BOUNDED budget:
//   - MAX_LOOP_STEPS clause passes per request
//   - MAX_TOOL_HOPS native tool executions per request
// When the budget runs out it says so honestly — "I stopped
// at the budget" — rather than silently dropping clauses.
// The kernel (cognitive/kernel.ts) records the real steps,
// durations and outcome into its REASON/EVALUATE phase trace.
// Deterministic throughout: no clocks in decisions, no
// external AI, no fabricated intermediate steps.
// =========================================================

import type { ArchieInferenceTurn } from "../runtime.ts";
import type { ArchieNativeEngine, ConverseResult } from "./engine.ts";
import {
  composeCompound,
  decomposeClauses,
  MAX_COMPOUND_CLAUSES,
  understand,
} from "./nlu.ts";
import { matchCodeRequest } from "./sandbox.ts";

/** Budget: hard step cap per request. Owner upgrade
 * 2026-09-16 (gap 2 — shallow agentic loop): 6 clause passes
 * could not chain modern multi-part requests; modern agents
 * chain dozens of steps. 24 keeps the budget HONEST (bounded,
 * reported, never silently truncated) while giving compound
 * requests room to actually complete. */
export const MAX_LOOP_STEPS = 24;
/** Budget: hard native-tool-execution cap per request. 2 was
 *  too tight for a chain of read→compute→convert hops; 8 lets
 *  a loop USE its tools without the budget becoming fiction. */
export const MAX_TOOL_HOPS = 8;

export interface LoopStep {
  index: number;
  kind: "reason" | "exclusion" | "budget-stop";
  clause: string;
  intent: string;
  summary: string;
  durationMs: number;
  confidence: number;
  citedFactIds: string[];
  toolsUsed: string[];
}

export interface ReasoningLoopReport {
  steps: LoopStep[];
  usedSteps: number;
  maxSteps: number;
  usedToolHops: number;
  maxToolHops: number;
  budgetExhausted: boolean;
  /** Human-readable per-step trace (deterministic). */
  trace: string;
}

export interface ReasoningLoopOutcome {
  result: ConverseResult;
  report: ReasoningLoopReport;
}

export async function runReasoningLoop(
  engine: ArchieNativeEngine,
  input: string,
  history?: ArchieInferenceTurn[],
  opts?: {
    maxSteps?: number;
    maxToolHops?: number;
    /** Caller-provided operating context (persona, injected
     *  knowledge base) — consulted by the substrate as a
     *  retrieval source, never persisted as knowledge. */
    systemInstruction?: string;
    /** Request scoping (audit fix C-1): the conversation id —
     *  threaded into every substrate pass so concurrent
     *  conversations never share working memory. */
    conversationId?: string;
    /** Gap A-1: owner-gated local generation authorization —
     *  threaded verbatim into every substrate pass. Unset for
     *  agent-worker tasks: agent work never generates. */
    ownerAuthorized?: boolean;
    /** SSE progress seam (2026-09-16): called with each loop
     *  step the moment it completes — live kernel events. */
    onStep?: (step: LoopStep) => void;
  },
): Promise<ReasoningLoopOutcome> {
  const systemInstruction = opts?.systemInstruction;
  const conversationId = opts?.conversationId;
  const ownerAuthorized = opts?.ownerAuthorized;
  const maxSteps = opts?.maxSteps ?? MAX_LOOP_STEPS;
  const maxToolHops = opts?.maxToolHops ?? MAX_TOOL_HOPS;
  const clauses = decomposeClauses(input);
  const steps: LoopStep[] = [];
  // Gap 3: every completed step notifies the live observer
  // (SSE progress) the moment it happens — after push, before
  // anything else runs.
  const pushStep = (step: LoopStep): void => {
    steps.push(step);
    opts?.onStep?.(step);
  };
  let usedSteps = 0;
  let usedToolHops = 0;
  let budgetExhausted = false;

  // Over-cap compound requests: the substrate refuses honestly
  // (same message the direct converse path produces).
  if (clauses.length > MAX_COMPOUND_CLAUSES) {
    const t0 = Date.now();
    const result = await engine.converse(input, history, systemInstruction, {
      conversationId,
      ownerAuthorized,
    });
    pushStep({
      index: 1,
      kind: "budget-stop",
      clause: input,
      intent: result.nlu.intent,
      summary: `${clauses.length} clauses exceed the compound cap (${MAX_COMPOUND_CLAUSES}) — refused honestly instead of half-remembering`,
      durationMs: Date.now() - t0,
      confidence: result.confidence,
      citedFactIds: [],
      toolsUsed: [],
    });
    return {
      result,
      report: {
        steps,
        usedSteps: 0,
        maxSteps,
        usedToolHops: 0,
        maxToolHops,
        budgetExhausted: true,
        trace: traceOf(steps),
      },
    };
  }

  // CODE-EXECUTION REQUESTS ARE NEVER CLAUSE-SPLIT (owner
  // upgrade 2026-09-16, gap 2): a program's semicolons are
  // STATEMENT SEPARATORS, not request separators. The loop
  // would otherwise feed "run this js: for (var i=0;…)" to
  // the substrate one fragment at a time. One program = one
  // full substrate pass = one sandbox run.
  if (matchCodeRequest(input) !== null) {
    const t0 = Date.now();
    const result = await engine.converse(input, history, systemInstruction, {
      conversationId,
      ownerAuthorized,
    });
    pushStep({
      index: 1,
      kind: "reason",
      clause: input,
      intent: result.nlu.intent,
      summary: `code-execution pass: ${result.toolResults?.length ?? 0} tool execution(s), one sandbox run, program kept whole`,
      durationMs: Date.now() - t0,
      confidence: result.confidence,
      citedFactIds: result.citedFactIds,
      toolsUsed: (result.toolResults ?? []).map((t) => t.tool),
    });
    return {
      result,
      report: {
        steps,
        usedSteps: 1,
        maxSteps,
        usedToolHops: result.toolResults?.length ?? 0,
        maxToolHops,
        budgetExhausted: false,
        trace: traceOf(steps),
      },
    };
  }

  // Single plain clause: one full substrate pass — teaching,
  // corrections, planning and native tools all intact.
  if (clauses.length === 1 && !clauses[0].negated) {
    const t0 = Date.now();
    const result = await engine.converse(input, history, systemInstruction, {
      conversationId,
      ownerAuthorized,
    });
    pushStep({
      index: 1,
      kind: "reason",
      clause: input,
      intent: result.nlu.intent,
      summary: `single pass: ${result.citedFactIds.length} fact(s) cited, ${result.toolResults?.length ?? 0} tool execution(s)`,
      durationMs: Date.now() - t0,
      confidence: result.confidence,
      citedFactIds: result.citedFactIds,
      toolsUsed: (result.toolResults ?? []).map((t) => t.tool),
    });
    return {
      result,
      report: {
        steps,
        usedSteps: 1,
        maxSteps,
        usedToolHops: result.toolResults?.length ?? 0,
        maxToolHops,
        budgetExhausted: (result.toolResults?.length ?? 0) > maxToolHops,
        trace: traceOf(steps),
      },
    };
  }

  // Compound or exclusion-bearing request: iterate the loop.
  const parts: string[] = [];
  const excluded: string[] = [];
  const cited = new Set<string>();
  const salientIds: string[] = [];
  let confSum = 0;
  let index = 0;
  for (const clause of clauses) {
    index += 1;
    if (clause.negated) {
      excluded.push(clause.text);
      pushStep({
        index,
        kind: "exclusion",
        clause: clause.text,
        intent: "exclusion",
        summary:
          "constraint respected — acknowledged, excluded, never answered",
        durationMs: 0,
        confidence: 0,
        citedFactIds: [],
        toolsUsed: [],
      });
      continue;
    }
    if (usedSteps >= maxSteps || usedToolHops >= maxToolHops) {
      budgetExhausted = true;
      pushStep({
        index,
        kind: "budget-stop",
        clause: clause.text,
        intent: understand(clause.text).intent,
        summary: `budget reached (${usedSteps}/${maxSteps} steps, ${usedToolHops}/${maxToolHops} tool hops) — stopped honestly instead of guessing`,
        durationMs: 0,
        confidence: 0,
        citedFactIds: [],
        toolsUsed: [],
      });
      continue;
    }
    const t0 = Date.now();
    const res = await engine.converse(clause.text, history, systemInstruction, {
      conversationId,
      ownerAuthorized,
    });
    const durationMs = Date.now() - t0;
    usedSteps += 1;
    const tools = res.toolResults ?? [];
    usedToolHops += tools.length;
    parts.push(res.responseText);
    confSum += res.confidence;
    for (const id of res.citedFactIds) cited.add(id);
    salientIds.push(...(res.salientFactIds ?? []));
    pushStep({
      index,
      kind: "reason",
      clause: clause.text,
      intent: res.nlu.intent,
      summary: `${res.nlu.intent}: ${res.citedFactIds.length} fact(s) cited, ${tools.length} tool execution(s), confidence ${res.confidence.toFixed(2)}`,
      durationMs,
      confidence: res.confidence,
      citedFactIds: res.citedFactIds,
      toolsUsed: tools.map((t) => t.tool),
    });
  }

  const text = composeCompound(parts, excluded);
  if (budgetExhausted) {
    // The honest budget report the plan demands.
    const reportLine = `\n[I stopped at my reasoning budget: ${usedSteps}/${maxSteps} step passes, ${usedToolHops}/${maxToolHops} tool executions. The remaining part(s) were not answered — resend them and I will take them fully.]`;
    const composed = text + reportLine;
    return {
      result: {
        nlu: understand(clauses[0].text),
        responseText: composed,
        confidence: parts.length > 0 ? confSum / parts.length : 0.4,
        citedFactIds: [...cited],
        salientFactIds: [...new Set(salientIds)],
        selfCheck: engine.verifyCitations([...cited]),
      },
      report: {
        steps,
        usedSteps,
        maxSteps,
        usedToolHops,
        maxToolHops,
        budgetExhausted,
        trace: traceOf(steps),
      },
    };
  }

  return {
    result: {
      nlu: understand(clauses[0].text),
      responseText: text,
      confidence: parts.length > 0 ? confSum / parts.length : 0.4,
      citedFactIds: [...cited],
      salientFactIds: [...new Set(salientIds)],
      selfCheck: engine.verifyCitations([...cited]),
    },
    report: {
      steps,
      usedSteps,
      maxSteps,
      usedToolHops,
      maxToolHops,
      budgetExhausted,
      trace: traceOf(steps),
    },
  };
}

function traceOf(steps: LoopStep[]): string {
  return steps
    .map(
      (s) =>
        `[${s.index}] ${s.kind}: "${s.clause.slice(0, 48)}" → ${s.summary} (${s.durationMs}ms)`,
    )
    .join("\n");
}
