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

async function appendEvent(
  agentId: string,
  event: string,
  detail: Record<string, unknown>,
) {
  try {
    await service.from("frelux_archie_agent_events").insert({
      agent_id: agentId,
      event,
      detail,
      actor: "archie-agent-worker",
    });
  } catch {
    /* audit events never break the worker */
  }
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

  let body: { agent_id?: string; run_id?: string; task_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const agentId = String(body.agent_id ?? "");
  if (!agentId) return json(400, { error: "agent_id is required." });

  const { data: agent } = await service
    .from("frelux_archie_internal_agents")
    .select("id, role, display_name, task, status, created_by")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return json(404, { error: "Agent not found." });

  const task = String(agent.task ?? "").trim();
  if (!task) {
    await appendEvent(agent.id, "TASK_EMPTY", {
      note: "Agent has no task text — nothing to execute honestly.",
    });
    return json(200, {
      ok: true,
      executed: false,
      note: "Agent has no task text — nothing to execute honestly.",
    });
  }

  // ---- GATE 1: life-safety (identical to chat entry) ----
  const lifeSafety = classifyLifeSafety(task);
  if (lifeSafety.blocked) {
    await appendEvent(agent.id, "TASK_GATE_STOP", {
      gate: "LIFE_SAFETY",
      reason: lifeSafety.reason,
      hazard: lifeSafety.hazard ?? null,
    });
    try {
      await service.from("frelux_security_events").insert({
        user_id: agent.created_by,
        kind: "LIFE_SAFETY_GATE_STOP",
        severity: "critical",
        message: `[agent-worker] ${lifeSafety.reason}`,
      });
    } catch {
      /* stop stands regardless */
    }
    return json(200, {
      ok: true,
      executed: false,
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
    await appendEvent(agent.id, "TASK_GATE_STOP", {
      gate: "SECURITY_VERDICT",
      reason: verdict.reason,
    });
    return json(200, {
      ok: true,
      executed: false,
      gate: "SECURITY_VERDICT",
      reason: verdict.reason,
      note: "Task stopped by the security verdict gate before execution. Agent work can never bypass it.",
    });
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
      await appendEvent(agent.id, "TASK_STEPS_EXECUTED", {
        verdict: completion.verdict,
        succeeded: completion.steps.filter((s) => s.status === "succeeded")
          .length,
        total: completion.steps.length,
      });
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
    engine = "cycle-failed";
    summary = "";
    trace = [];
    await appendEvent(agent.id, "TASK_CYCLE_ERROR", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ---- PERSIST the work product ----
  const { data: report, error: repErr } = await service
    .from("frelux_archie_agent_reports")
    .insert({
      agent_id: agent.id,
      run_id: body.run_id ?? null,
      summary: cycleOk ? summary : "[execution failed — no fabricated summary]",
      detail: {
        role: agent.role,
        display_name: agent.display_name,
        trace,
        executed: cycleOk,
        task_completion: taskCompletion,
      },
      gates: {
        life_safety: { passed: true, checked: true },
        security_verdict: { passed: true, checked: true },
      },
      engine,
    })
    .select("id")
    .single();

  await appendEvent(agent.id, cycleOk ? "TASK_EXECUTED" : "TASK_FAILED", {
    report_id: report?.id ?? null,
    engine,
  });

  if (repErr || !report) {
    return json(500, {
      ok: false,
      error: "Execution finished but the report could not be persisted.",
    });
  }

  return json(200, {
    ok: true,
    executed: cycleOk,
    report_id: report.id,
    engine,
    note: cycleOk
      ? "Task executed by the unified ARCHIE kernel. Report stored with full trace."
      : "Task execution failed honestly — the report records the failure; nothing was fabricated.",
  });
});
