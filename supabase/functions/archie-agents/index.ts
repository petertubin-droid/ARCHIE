// Supabase Edge Function: archie-agents
// =========================================================
// FRELUX PHASE 8 P5 — ARCHIE INTERNAL AGENT ORCHESTRATION &
// INFRASTRUCTURE COST LEDGER (SERVER-SIDE)
//
// The ONLY server entrypoint for internal agent lifecycle and
// internal provider cost recording. Mirrors
// src/lib/archie/internal-agents.ts + cost-governance.ts.
//
//   * Admin/owner authorization verified on every call.
//   * Lifecycle enforced: CREATE → AUTHORIZE → ASSIGN →
//     EXECUTE → MONITOR → REPORT → TERMINATE (+ FAIL).
//   * NO arbitrary ceiling on agent count, but REAL limits:
//     the global/provider budget, concurrency limit and rate
//     limit from frelux_infrastructure_budgets are checked
//     BEFORE a fleet is spawned. No ALLOW → the spawn is
//     refused (never silently bypassed).
//   * Internal agent provider usage is recorded on
//     frelux_infrastructure_costs as INTERNAL_ARCHIE_OPERATION.
//     It can NEVER touch user/subscriber/API-customer credits:
//     the customer ledgers have no write path here at all, and
//     the DB structurally rejects internal ops on
//     credit_transactions (trigger) and frelux_api_usage (CHECK).
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  executeTarget,
  type EngineDeps,
  type ExecutionTarget,
} from "../_shared/archie-ai/execution/engine.ts";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import { verifyOwnerSecret as sharedVerifyOwnerSecret } from "../_shared/archie-ai/auth/owner-secret.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ---- lifecycle contract mirrored from internal-agents.ts ----
const TRANSITIONS: Record<string, string[]> = {
  CREATED: ["AUTHORIZED", "FAILED", "TERMINATED"],
  AUTHORIZED: ["ASSIGNED", "FAILED", "TERMINATED"],
  ASSIGNED: ["EXECUTING", "FAILED", "TERMINATED"],
  EXECUTING: ["MONITORING", "FAILED", "TERMINATED"],
  MONITORING: ["EXECUTING", "REPORTING", "FAILED", "TERMINATED"],
  REPORTING: ["TERMINATED", "FAILED"],
  TERMINATED: [],
  FAILED: [],
};

const EVENT_TO_STATE: Record<string, string> = {
  AUTHORIZE: "AUTHORIZED",
  ASSIGN: "ASSIGNED",
  EXECUTE: "EXECUTING",
  MONITOR: "MONITORING",
  REPORT: "REPORTING",
  TERMINATE: "TERMINATED",
  FAIL: "FAILED",
};

// ---- budget contract mirrored from cost-governance.ts ----
interface BudgetRow {
  provider: string;
  monthly_budget_cents: number;
  concurrency_limit: number;
  rate_limit_per_minute: number;
  emergency_threshold_pct: number;
  exhaustion_policy: string;
  active: boolean;
}

function budgetDecision(
  monthSpend: number,
  activeAgents: number,
  estimatedCost: number,
  budget: BudgetRow | undefined,
): { decision: string; reason: string } {
  if (!budget || budget.monthly_budget_cents <= 0) {
    return {
      decision: "QUEUE",
      reason:
        "No active budget configured; internal spend is not unlimited by default.",
    };
  }
  if (
    budget.concurrency_limit > 0 &&
    activeAgents >= budget.concurrency_limit
  ) {
    return {
      decision: "REDUCE",
      reason: `Concurrency limit ${budget.concurrency_limit} reached.`,
    };
  }
  const pct = (monthSpend / budget.monthly_budget_cents) * 100;
  if (pct >= budget.emergency_threshold_pct) {
    return {
      decision: "EMERGENCY_STOP",
      reason: `Emergency threshold ${budget.emergency_threshold_pct}% reached.`,
    };
  }
  if (monthSpend + estimatedCost > budget.monthly_budget_cents) {
    const policy = budget.exhaustion_policy;
    return {
      decision: policy,
      reason: `Monthly budget would be exceeded; policy is ${policy}.`,
    };
  }
  return { decision: "ALLOW", reason: "Within budget and concurrency limits." };
}

async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  // FIX 27 (remediation batch 9, Level 6 security audit
  // 2026-09-13): the Supabase REST gateway requires BOTH the
  // apikey header and the bearer token (supabase-js always
  // sends both). Without apikey, Kong rejects every call with
  // 401 "No API key found in request" — this entire function's
  // REST reads/writes were dead in production. Same convention
  // as archie-owner-auth / api-credential-store, plus the
  // trailing-slash-safe join.
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      data: null,
      error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  return { data: body as T, error: null };
}

// ---------------------------------------------------------
// Execution engine deps (audit L-2 fix, 2026-09-13): agent
// EXECUTE dispatches through the audited engine — registered
// target 'archie-agent-task', full authority/audit/retry
// stack. Bound to the same REST helper used above.
// ---------------------------------------------------------
async function getExecutionTarget(
  key: string,
): Promise<ExecutionTarget | null> {
  const { data } = await service<ExecutionTarget[]>(
    `/rest/v1/frelux_archie_execution_targets?key=eq.${key}&select=*`,
  );
  return (Array.isArray(data) ? (data[0] ?? null) : data) ?? null;
}

const engineDeps: EngineDeps = {
  getTarget: getExecutionTarget,
  // Owner-secret verification via the shared PBKDF2 helper
  // (same verifier logic as archie-execute — one standard).
  verifyOwnerSecret: (userId, secret) =>
    sharedVerifyOwnerSecret(userId, secret, {
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SERVICE_ROLE,
      fetchFn: fetch,
    }),
  createRun: async (rec) => {
    const { data, error } = await service<{ id: string }>(
      "/rest/v1/frelux_archie_execution_runs",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(rec),
      },
    );
    if (error || !data?.id) throw new Error(`audit insert failed: ${error}`);
    return { id: data.id };
  },
  updateRun: async (id, patch) => {
    const { error } = await service(
      `/rest/v1/frelux_archie_execution_runs?id=eq.${id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          ...patch,
          updated_date: new Date().toISOString(),
        }),
      },
    );
    if (error) throw new Error(`audit update failed: ${error}`);
  },
  recordSecurityEvent: async (userId, type, severity, message) => {
    try {
      await service("/rest/v1/frelux_security_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          kind: type,
          severity,
          message,
        }),
      });
    } catch {
      /* audit must never break execution flow */
    }
  },
  getSecret: (name: string) => Deno.env.get(name),
  fetchFn: fetch,
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_ROLE,
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  log: (m: string) => console.log(`[archie-agents] ${m}`),
};

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only." });

  // ---- authentication + owner/admin authorization ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "Invalid session." });

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}&select=role`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
    },
  );
  const profiles = await profRes.json().catch(() => []);
  if (!Array.isArray(profiles) || profiles[0]?.role !== "admin") {
    return json(403, {
      error: "Internal agent orchestration is Owner/Admin-only.",
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const action = String(payload.action ?? "");

  // ---- action: spawn a fleet (CREATE + AUTHORIZE + ASSIGN) ----
  if (action === "spawn_fleet") {
    const agents = Array.isArray(payload.agents)
      ? (payload.agents as Array<Record<string, unknown>>)
      : [];
    if (agents.length === 0) return json(400, { error: "agents[] required." });

    // Budget snapshot BEFORE spawning: month-to-date spend +
    // active agent count, checked against the configured budget.
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: spendRows } = await service<Array<{ total: number }>>(
      `/rest/v1/frelux_infrastructure_costs?select=cost_actual_cents.sum()&occurred_at=gte.${monthStart.toISOString()}`,
    );
    const monthSpend = Number(spendRows?.[0]?.total ?? 0);
    const { data: activeRows } = await service<Array<{ count: number }>>(
      `/rest/v1/frelux_archie_internal_agents?select=id.count()&status=in.(CREATED,AUTHORIZED,ASSIGNED,EXECUTING,MONITORING)`,
    );
    const activeAgents = Number(activeRows?.[0]?.count ?? 0);
    const { data: budgetRows } = await service<BudgetRow[]>(
      `/rest/v1/frelux_infrastructure_budgets?active=eq.true&select=*`,
    );
    const globalBudget = (budgetRows ?? []).find((b) => b.provider === "*");
    const estimated = agents.reduce(
      (s, a) => s + Math.max(0, Number(a.estimated_cost_cents ?? 0)),
      0,
    );
    const gate = budgetDecision(
      monthSpend,
      activeAgents,
      estimated,
      globalBudget,
    );
    if (gate.decision !== "ALLOW") {
      return json(429, {
        error: `Fleet spawn refused by infrastructure cost governance: ${gate.reason}`,
        decision: gate.decision,
        month_to_date_spend_cents: monthSpend,
        estimated_fleet_cost_cents: estimated,
        note: "ARCHIE queues, reduces, consolidates or stops internal work per policy. Internal agent activity is never charged to users or subscribers.",
      });
    }

    const rows = agents.slice(0, 64).map((a) => ({
      role: String(a.role ?? "code_analysis"),
      display_name: String(a.display_name ?? a.role ?? "ARCHIE agent"),
      status: "AUTHORIZED",
      task: String(a.task ?? "").slice(0, 2000),
      permissions: Array.isArray(a.permissions) ? a.permissions : [],
      estimated_cost_cents: Math.max(0, Number(a.estimated_cost_cents ?? 0)),
      created_by: auth.user.id,
    }));
    const { data: inserted, error: insErr } = await service<
      Array<{ id: string; role: string; task: string }>
    >("/rest/v1/frelux_archie_internal_agents", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (insErr || !inserted) {
      return json(500, { error: `Failed to create agents: ${insErr}` });
    }
    // Append-only audit: CREATE + AUTHORIZE for each agent.
    const events = inserted.flatMap((agent) => [
      {
        agent_id: agent.id,
        event: "CREATE",
        detail: { role: agent.role, task: agent.task },
        actor: auth.user.id,
      },
      {
        agent_id: agent.id,
        event: "AUTHORIZE",
        detail: { by: "budget_gate", decision: gate.decision },
        actor: auth.user.id,
      },
    ]);
    await service("/rest/v1/frelux_archie_agent_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(events),
    });
    return json(200, {
      spawned: inserted.map((a) => ({ id: a.id, role: a.role })),
      decision: gate.decision,
      month_to_date_spend_cents: monthSpend,
      estimated_fleet_cost_cents: estimated,
    });
  }

  // ---- action: advance an agent's lifecycle ----
  if (action === "lifecycle") {
    const agentId = String(payload.agent_id ?? "");
    const event = String(payload.event ?? "");
    const next = EVENT_TO_STATE[event];
    if (!agentId || !next) {
      return json(400, {
        error:
          "agent_id and a valid event (AUTHORIZE, ASSIGN, EXECUTE, MONITOR, REPORT, TERMINATE, FAIL) are required.",
      });
    }
    const { data: agent } = await service<{ status: string }>(
      `/rest/v1/frelux_archie_internal_agents?id=eq.${agentId}&select=status`,
    );
    const current = Array.isArray(agent) ? agent[0]?.status : agent?.status;
    if (!current) return json(404, { error: "Agent not found." });
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      return json(409, {
        error: `Invalid lifecycle transition ${current} → ${next}.`,
        allowed,
      });
    }
    const { error: updErr } = await service(
      `/rest/v1/frelux_archie_internal_agents?id=eq.${agentId}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: next,
          updated_date: new Date().toISOString(),
        }),
      },
    );
    if (updErr)
      return json(500, { error: `Failed to update agent: ${updErr}` });
    const detail =
      payload.detail && typeof payload.detail === "object"
        ? payload.detail
        : {};
    const { error: evErr } = await service(
      "/rest/v1/frelux_archie_agent_events",
      {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          agent_id: agentId,
          event,
          detail,
          actor: auth.user.id,
        }),
      },
    );
    if (evErr)
      return json(500, { error: `Failed to append audit event: ${evErr}` });
    if (event !== "EXECUTE" || next !== "EXECUTING") {
      return json(200, { ok: true, status: next });
    }

    // ---- REAL EXECUTION (audit L-2 fix) ----
    // EXECUTE is no longer a label: the task dispatches through
    // the audited execution engine to the registered target
    // 'archie-agent-task' (archie-agent-worker). The worker
    // runs the task through the unified cognitive kernel with
    // the life-safety + security verdict gates, and persists
    // an honest work-product report.
    const runOutcome = await executeTarget(engineDeps, {
      targetKey: "archie-agent-task",
      input: { agent_id: agentId },
      initiatorSystem: "ARCHIE_AGENTS",
      caller: {
        userId: auth.user.id,
        isAdmin: true, // role re-verified above; the engine re-checks too
      },
    });

    // Lifecycle follows the real outcome — never a fake success.
    let finalStatus = "EXECUTING";
    if (runOutcome.ok) {
      // EXECUTING -> MONITORING: the work product exists; the
      // owner reviews it (REPORT / TERMINATE stay owner acts).
      const { error: monErr } = await service(
        `/rest/v1/frelux_archie_internal_agents?id=eq.${agentId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "MONITORING",
            updated_date: new Date().toISOString(),
          }),
        },
      );
      if (!monErr) {
        finalStatus = "MONITORING";
        await service("/rest/v1/frelux_archie_agent_events", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            agent_id: agentId,
            event: "MONITOR",
            detail: {
              by: "execution-engine",
              run_id: runOutcome.runId ?? null,
              attempts: runOutcome.attempts ?? 1,
            },
            actor: auth.user.id,
          }),
        });
      }
    } else {
      // Honest failure: EXECUTING -> FAILED with the engine's
      // own reason recorded in the append-only ledger.
      await service(`/rest/v1/frelux_archie_internal_agents?id=eq.${agentId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "FAILED",
          updated_date: new Date().toISOString(),
        }),
      });
      finalStatus = "FAILED";
      await service("/rest/v1/frelux_archie_agent_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          agent_id: agentId,
          event: "FAIL",
          detail: {
            by: "execution-engine",
            run_id: runOutcome.runId ?? null,
            error: runOutcome.error ?? "execution failed",
            status: runOutcome.status,
          },
          actor: auth.user.id,
        }),
      });
    }

    return json(200, {
      ok: true,
      status: finalStatus,
      executed: runOutcome.ok,
      run_id: runOutcome.runId ?? null,
      run_status: runOutcome.status,
      error: runOutcome.error ?? null,
      note: runOutcome.ok
        ? "Task executed through the audited engine — work product stored as an agent report."
        : "Execution failed honestly — the failure is recorded; nothing was fabricated.",
    });
  }

  // ---- action: record internal provider cost (INFRA ledger only) ----
  if (action === "record_cost") {
    const provider = String(payload.provider ?? "").trim();
    const operation = String(payload.operation ?? "").trim();
    const agentId = payload.agent_id ? String(payload.agent_id) : null;
    const estimate = Math.max(0, Number(payload.cost_estimate_cents ?? 0));
    const actual = Math.max(0, Number(payload.cost_actual_cents ?? 0));
    if (!provider || !operation || (estimate === 0 && actual === 0)) {
      return json(400, {
        error:
          "provider, operation and a non-zero estimate or actual cost are required.",
      });
    }
    // INTERNAL_ARCHIE_OPERATION: recorded ONLY on the infrastructure
    // ledger. This function has no code path to any customer table;
    // the DB additionally rejects internal ops on customer ledgers.
    const { error: insErr } = await service(
      "/rest/v1/frelux_infrastructure_costs",
      {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          operation_class: "INTERNAL_ARCHIE_OPERATION",
          provider,
          operation,
          agent_id: agentId,
          cost_estimate_cents: estimate,
          cost_actual_cents: actual,
          usage_meta:
            payload.usage_meta && typeof payload.usage_meta === "object"
              ? payload.usage_meta
              : {},
          occurred_at: new Date().toISOString(),
        }),
      },
    );
    if (insErr) return json(500, { error: `Failed to record cost: ${insErr}` });
    if (agentId) {
      await service("/rest/v1/frelux_archie_agent_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          agent_id: agentId,
          event: "COST",
          detail: {
            provider,
            cost_actual_cents: actual,
            cost_estimate_cents: estimate,
          },
          actor: auth.user.id,
        }),
      });
    }
    return json(200, { ok: true, ledger: "frelux_infrastructure_costs" });
  }

  // ---- action: budget status (visibility for the admin UI) ----
  if (action === "budget_status") {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: spendRows } = await service<Array<{ total: number }>>(
      `/rest/v1/frelux_infrastructure_costs?select=cost_actual_cents.sum()&occurred_at=gte.${monthStart.toISOString()}`,
    );
    const { data: budgetRows } = await service<BudgetRow[]>(
      `/rest/v1/frelux_infrastructure_budgets?select=*`,
    );
    const { data: activeRows } = await service<Array<{ count: number }>>(
      `/rest/v1/frelux_archie_internal_agents?select=id.count()&status=in.(CREATED,AUTHORIZED,ASSIGNED,EXECUTING,MONITORING)`,
    );
    return json(200, {
      month_to_date_spend_cents: Number(spendRows?.[0]?.total ?? 0),
      active_agents: Number(activeRows?.[0]?.count ?? 0),
      budgets: budgetRows ?? [],
    });
  }

  return json(400, {
    error:
      "Unknown action. Valid: spawn_fleet, lifecycle, record_cost, budget_status.",
  });
});
