// Supabase Edge Function: archie-agent-worker
// =========================================================
// ARCHIE INTERNAL AGENT WORKER (audit L-2 fix, 2026-09-13)
//
// The missing execution layer behind the internal-agents
// lifecycle. This function is a REGISTERED execution target
// ('archie-agent-task'), invoked ONLY by the audited execution
// engine (service-role bearer). It:
//
//   1. Refuses anything but the engine's service-role call.
//   2. Loads the agent row and its task.
//   3. Runs the task text through the life-safety gate and
//      the security verdict gate — agent work is gated
//      exactly like an owner chat turn. No gate bypass
//      exists for agent tasks.
//   4. Executes the task through the SAME unified cognitive
//      kernel that powers owner chat — one ARCHIE
//      intelligence, no sub-agent minds, no external AI.
//   5. Persists an honest work product: summary, kernel
//      trace, gate verdicts — as an append-only agent
//      report + lifecycle event. Nothing is fabricated;
//      a failed or degraded cycle is reported as such.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { readBoundedJsonRequest } from "../_shared/http/bounded-json.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const service = createClient(SUPABASE_URL, SERVICE_ROLE);

// Same durable wiring as the chat front door: knowledge
// facts, learning outcomes, world model + traces persist.
import { configureNativeEnginePersistence } from "../_shared/archie-ai/native-engine/engine.ts";
configureNativeEnginePersistence(
  service as unknown as import("../_shared/archie-ai/native-engine/persistence.ts").SupabaseLike,
);
import {
  configureCognitiveEnginePersistence,
  getCognitiveEngine,
} from "../_shared/archie-ai/cognitive/kernel.ts";
configureCognitiveEnginePersistence(
  service as unknown as import("../_shared/archie-ai/native-engine/persistence.ts").SupabaseLike,
);

import { classifyLifeSafety } from "../_shared/archie-ai/security/life-safety.ts";
import { classifySecurityMessage } from "../_shared/archie-ai/security/verdict.ts";
import { TaskCompletionEngine } from "../_shared/archie-ai/cognitive/task-completion.ts";
import { SupabaseTaskStateStore } from "../_shared/archie-ai/cognitive/task-state.ts";
import { decomposeClauses } from "../_shared/archie-ai/native-engine/nlu.ts";
import { persistAgentReport } from "./persist-report.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function persistStoppedRun(input: {
  runId: string;
  agentId: string;
  actorId: string;
  summary: string;
  detail: Record<string, unknown>;
  gates: Record<string, unknown>;
}): Promise<string> {
  return persistAgentReport(service, {
    ...input,
    engine: "archie-unified-cognitive/gate-stop",
    event: "FAIL",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ENTRY: engine-only. The registered-target invocation
  // carries the service-role bearer; nothing else may call
  // this worker directly (owner requests go through
  // archie-agents -> execution engine instead).
  const auth = (req.headers.get("Authorization") ?? "").trim();
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return json(401, {
      error:
        "archie-agent-worker is an internal execution target — invocable only by the audited execution engine.",
    });
  }

  const parsedBody = await readBoundedJsonRequest(req, 8 * 1024);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") return json(413, { error: "Request body exceeds the 8 KiB limit." });
    if (parsedBody.reason === "timeout") return json(408, { error: "Request body read timed out." });
    return json(400, { error: "Body must be readable JSON." });
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return json(400, { error: "Body must be a JSON object." });
  }
  const body = parsedBody.value as { agent_id?: string; run_id?: string; task_id?: string };
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const agentId = String(body.agent_id ?? "");
  if (!uuidPattern.test(agentId)) return json(400, { error: "agent_id must be a valid UUID." });
  if (body.run_id !== undefined && !uuidPattern.test(body.run_id)) return json(400, { error: "run_id must be a valid UUID." });
  if (body.task_id !== undefined && !uuidPattern.test(body.task_id)) return json(400, { error: "task_id must be a valid UUID." });
  const runId = req.headers.get("X-Archie-Execution-Run-Id") ?? "";
  if (!uuidPattern.test(runId)) return json(400, { error: "A valid execution run ID is required." });

  const { data: agent } = await service
    .from("frelux_archie_internal_agents")
    .select("id, role, display_name, task, status, created_by")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return json(404, { error: "Agent not found." });

  // Retries use the same immutable execution run ID. Return the already
  // committed report instead of repeating task execution after a lost reply.
  const { data: existingReport, error: existingReportError } = await service
    .from("frelux_archie_agent_reports")
    .select("id, summary, detail, gates, engine")
    .eq("run_id", runId)
    .maybeSingle();
  if (existingReportError) {
    return json(500, { ok: false, error: "Could not verify whether this execution run already has a report." });
  }
  if (existingReport) {
    const detail = existingReport.detail as Record<string, unknown> | null;
    const executed = detail?.executed === true;
    try {
      // A repeated delivery may arrive after the report commit but before
      // the engine receives its response. Reconcile the event idempotently
      // without rerunning work.
      const reportId = await persistAgentReport(service, {
        runId,
        agentId: agent.id,
        actorId: agent.created_by,
        summary: String(existingReport.summary ?? ""),
        detail: detail ?? {},
        gates: (existingReport.gates as Record<string, unknown> | null) ?? {},
        engine: String(existingReport.engine ?? "archie-unified-cognitive"),
        event: executed ? "REPORT" : "FAIL",
      });
      return json(200, {
        ok: executed,
        executed,
        report_id: reportId,
        idempotent_replay: true,
        note: "This execution run was already persisted; its terminal lifecycle event is present or has now been reconciled.",
      });
    } catch {
      return json(500, { ok: false, executed, report_id: existingReport.id, error: "The existing report’s terminal lifecycle event could not be verified or reconciled." });
    }
  }

  const task = String(agent.task ?? "").trim();
  if (!task) {
    try {
      const reportId = await persistStoppedRun({
        runId,
        agentId: agent.id,
        actorId: agent.created_by,
        summary: "Agent has no task text — nothing to execute honestly.",
        detail: { role: agent.role, display_name: agent.display_name, executed: false, stop_reason: "TASK_EMPTY" },
        gates: {
          life_safety: { passed: false, checked: false },
          security_verdict: { passed: false, checked: false },
        },
      });
      return json(200, {
        ok: false,
        executed: false,
        report_id: reportId,
        note: "Agent has no task text — nothing to execute honestly.",
      });
    } catch {
      return json(500, {
        ok: false,
        executed: false,
        error: "The empty task was not executed, and its report and lifecycle event could not be persisted atomically.",
      });
    }
  }

  // ---- GATE 1: life-safety (identical to chat entry) ----
  const lifeSafety = classifyLifeSafety(task);
  if (lifeSafety.blocked) {
    let reportId: string;
    try {
      reportId = await persistStoppedRun({
        runId,
        agentId: agent.id,
        actorId: agent.created_by,
        summary: `Task stopped by the life-safety gate: ${lifeSafety.reason}`,
        detail: { role: agent.role, display_name: agent.display_name, executed: false, stop_reason: "TASK_GATE_STOP", gate: "LIFE_SAFETY", reason: lifeSafety.reason, hazard: lifeSafety.hazard ?? null },
        gates: {
          life_safety: { passed: false, checked: true, reason: lifeSafety.reason },
          security_verdict: { passed: false, checked: false },
        },
      });
    } catch {
      return json(500, {
        ok: false,
        executed: false,
        gate: "LIFE_SAFETY",
        reason: lifeSafety.reason,
        error: "The task remains blocked, but its report and lifecycle event could not be persisted atomically.",
      });
    }
    try {
      await service.from("frelux_security_events").insert({
        user_id: agent.created_by,
        kind: "LIFE_SAFETY_GATE_STOP",
        severity: "critical",
        message: `[agent-worker] ${lifeSafety.reason}`,
      });
    } catch {
      /* authoritative agent report and event are already committed */
    }
    return json(200, {
      ok: false,
      executed: false,
      report_id: reportId,
      gate: "LIFE_SAFETY",
      reason: lifeSafety.reason,
      note: "Task stopped by the life-safety gate before execution. Agent work can never bypass it.",
    });
  }

  // ---- GATE 2: security verdict (identical to chat entry) ----
  const verdict = classifySecurityMessage(task, {
    hasValidAuthorization: false,
    inScopeIdentifiers: [],
  });
  if (!verdict.allowed) {
    try {
      const reportId = await persistStoppedRun({
        runId,
        agentId: agent.id,
        actorId: agent.created_by,
        summary: `Task stopped by the security verdict gate: ${verdict.reason}`,
        detail: { role: agent.role, display_name: agent.display_name, executed: false, stop_reason: "TASK_GATE_STOP", gate: "SECURITY_VERDICT", reason: verdict.reason },
        gates: {
          life_safety: { passed: true, checked: true },
          security_verdict: { passed: false, checked: true, reason: verdict.reason },
        },
      });
      return json(200, {
        ok: false,
        executed: false,
        report_id: reportId,
        gate: "SECURITY_VERDICT",
        reason: verdict.reason,
        note: "Task stopped by the security verdict gate before execution. Agent work can never bypass it.",
      });
    } catch {
      return json(500, {
        ok: false,
        executed: false,
        gate: "SECURITY_VERDICT",
        reason: verdict.reason,
        error: "The task remains blocked, but its report and lifecycle event could not be persisted atomically.",
      });
    }
  }

  // ---- EXECUTE: one unified cognitive kernel, two honest modes ----
  // Compound tasks (the sentence itself decomposes into more
  // than one executable clause) run through the SUPERVISED TASK
  // COMPLETION ENGINE: one full cognitive cycle per clause with
  // per-step verification, a bounded retry, and a deterministic
  // completion verdict. Simple tasks remain a single cycle —
  // identical to owner chat. Both modes share the same kernel,
  // the same gates, and the same honest refusal path.
  let cycleOk = true;
  let summary = "";
  let trace: Array<{ phase: string; status: string; organs: string[] }> = [];
  let engine = "archie-unified-cognitive";
  let executionError: string | null = null;
  let taskCompletion: {
    verdict: string;
    achievedRatio: number;
    confidence: number;
    steps: Array<Record<string, unknown>>;
  } | null = null;
  try {
    const kernel = getCognitiveEngine();
    const executableClauses = decomposeClauses(task).filter((c) => !c.negated);
    if (executableClauses.length > 1) {
      // Supervised multi-step completion (super model layer).
      const engine2 = new TaskCompletionEngine(kernel, (clause) =>
        classifySecurityMessage(clause, {
          hasValidAuthorization: false,
          inScopeIdentifiers: [],
        }),
      );
      // D-2 durable task-step state: every step of a compound
      // agent task is checkpointed to archie_task_states; an
      // interrupted task resumes from the first unrecorded
      // clause instead of restarting from zero. task_id on the
      // engine's call IS the resume instruction.
      const taskState = new SupabaseTaskStateStore(
        service as unknown as import("../_shared/archie-ai/native-engine/persistence.ts").SupabaseLike,
      );
      const taskId = String(body.task_id ?? crypto.randomUUID());
      const completion = await engine2.executeTask(task, {
        conversationId: `agent-${agent.id}`,
        taskId,
        stateStore: taskState,
        resume: Boolean(body.task_id),
      });
      taskCompletion = {
        verdict: completion.verdict,
        achievedRatio: completion.achievedRatio,
        confidence: completion.confidence,
        steps: completion.steps.map((step) => ({
          index: step.index,
          clause: step.clause,
          status: step.status,
          attempts: step.attempts,
          verification: step.verificationVerdict,
          confidence: step.confidence,
          summary: step.summary.slice(0, 500),
        })),
      };
      summary = completion.responseText;
      cycleOk = completion.verdict !== "NOT_ACHIEVED";
      engine = "archie-unified-cognitive/supervised-task-completion";
    } else {
      const cycle = await kernel.cycle(
        task,
        [], // no conversation history — a task, not a thread
        undefined,
        { conversationId: `agent-${agent.id}` }, // isolated context
      );
      summary = String(cycle.responseText ?? "");
      trace = cycle.trace.phases.map(
        (p: { phase: string; status: string; organs?: string[] }) => ({
          phase: p.phase,
          status: p.status,
          organs: p.organs ?? [],
        }),
      );
    }
  } catch (err) {
    // Honest degradation: never fabricate a work product.
    cycleOk = false;
    executionError = err instanceof Error ? err.message : String(err);
    engine = "cycle-failed";
    summary = "";
    trace = [];
  }

  // ---- ATOMICALLY PERSIST report + terminal lifecycle event ----
  let reportId: string;
  try {
    reportId = await persistAgentReport(service, {
      runId,
      agentId: agent.id,
      actorId: agent.created_by,
      summary: cycleOk ? summary : "[execution failed — no fabricated summary]",
      detail: {
        role: agent.role,
        display_name: agent.display_name,
        trace,
        executed: cycleOk,
        task_completion: taskCompletion,
        execution_error: executionError,
      },
      gates: {
        life_safety: { passed: true, checked: true },
        security_verdict: { passed: true, checked: true },
      },
      engine,
      event: cycleOk ? "REPORT" : "FAIL",
    });
  } catch {
    return json(500, {
      ok: false,
      executed: cycleOk,
      error: "Execution finished but its report and lifecycle event could not be persisted atomically.",
    });
  }

  return json(200, {
    ok: cycleOk,
    executed: cycleOk,
    report_id: reportId,
    engine,
    note: cycleOk
      ? "Task executed by the unified ARCHIE kernel. Report stored with full trace."
      : "Task execution failed honestly — the report records the failure; nothing was fabricated.",
  });
});
