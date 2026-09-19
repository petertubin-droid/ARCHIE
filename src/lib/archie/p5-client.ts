// =========================================================
// FRELUX PHASE 8 P5, ARCHIE OPS CLIENT
//
// Browser-facing calls for the Phase 8 P5 owner/admin console:
//   * archie-agents: internal agent lifecycle + budget gate +
//     infrastructure cost recording (server-authoritative).
//   * archie-crypto: owner-only crypto intelligence.
//
// All authorization is verified server-side (JWT + admin
// profile). The client sends intent; the server enforces
// governance, guardrails and ledger separation.
// =========================================================

import { supabase } from "@/lib/supabase";

export interface FleetSpawnRequest {
  role: string;
  display_name?: string;
  task: string;
  permissions?: string[];
  estimated_cost_cents?: number;
}

export async function invokeAgents<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("archie-agents", {
    body,
  });
  if (error) throw new Error(error.message);
  return data as T;
}

export async function invokeCrypto<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("archie-crypto", {
    body,
  });
  if (error) throw new Error(error.message);
  return data as T;
}

/** Spawn a fleet of internal agents (server checks budgets). */
export function spawnFleet(agents: FleetSpawnRequest[]) {
  return invokeAgents<{
    spawned: Array<{ id: string; role: string }>;
    decision: string;
    month_to_date_spend_cents: number;
    estimated_fleet_cost_cents: number;
  }>({ action: "spawn_fleet", agents });
}

/** Advance an agent lifecycle event (server validates). */
export function advanceAgent(
  agentId: string,
  event:
    | "AUTHORIZE"
    | "ASSIGN"
    | "EXECUTE"
    | "MONITOR"
    | "REPORT"
    | "TERMINATE"
    | "FAIL",
  detail?: Record<string, unknown>,
) {
  return invokeAgents<{ ok: boolean; status: string }>({
    action: "lifecycle",
    agent_id: agentId,
    event,
    detail: detail ?? {},
  });
}

/** Record internal provider cost on the infrastructure ledger. */
export function recordInfrastructureCost(input: {
  provider: string;
  operation: string;
  agent_id?: string | null;
  cost_estimate_cents?: number;
  cost_actual_cents?: number;
  usage_meta?: Record<string, unknown>;
}) {
  return invokeAgents<{ ok: boolean; ledger: string }>({
    action: "record_cost",
    ...input,
  });
}

/** Budget + spend + active-agent snapshot for the console. */
export function budgetStatus() {
  return invokeAgents<{
    month_to_date_spend_cents: number;
    active_agents: number;
    budgets: Array<{
      provider: string;
      monthly_budget_cents: number;
      concurrency_limit: number;
      rate_limit_per_minute: number;
      emergency_threshold_pct: number;
      exhaustion_policy: string;
      active: boolean;
    }>;
  }>({ action: "budget_status" });
}

/** Fetch live market observations (owner-only). */
export function fetchCryptoMarket(symbols: string[]) {
  return invokeCrypto<{
    classification: string;
    assets: Array<Record<string, unknown>>;
  }>({ action: "market", symbols });
}

/** Store a classified analysis record (guardrails enforced server-side). */
export function recordCryptoAnalysis(input: {
  asset_symbol: string;
  classification: string;
  statement: string;
  evidence?: string[];
  cited_sources?: string[];
  confidence?: number;
  requested_action?: string;
}) {
  return invokeCrypto<{
    ok: boolean;
    classification: string;
    disclaimer_appended: boolean;
  }>({ action: "record_analysis", ...input });
}

/** Portfolio concentration risk for owner-recorded holdings. */
export function portfolioRisk(
  holdings: Array<{ symbol: string; value: number }>,
) {
  return invokeCrypto<{
    classification: string;
    report: {
      total_value: number;
      hhi: number;
      concentration: string;
      largest_weight: number;
      weights: Array<{ symbol: string; weight: number }>;
    };
  }>({ action: "portfolio_risk", holdings });
}
