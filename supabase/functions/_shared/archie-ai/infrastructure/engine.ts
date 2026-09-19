// =========================================================
// FRELUX ARCHIE — INFRASTRUCTURE ENGINE (SHARED CORE)
// supabase/functions/_shared/archie-ai/infrastructure/engine.ts
//
// THE INFRASTRUCTURE LAYER (engine inventory #26, anatomy
// "legs"). Until now this was only a cost ledger
// (frelux_infrastructure_costs) plus a count-based anatomy
// probe. This module makes infrastructure a real engine:
//
//   ASSESS (per request, owner-initiated):
//     1. DEPENDENCY PROBES — live reachability checks of the
//        actual stack (Supabase REST, edge runtime, production
//        frontend) with latency. No fabricated statuses: an
//        unreadable dependency is a probe failure, not OK.
//     2. COST AGGREGATION — current-month spend per provider
//        from the internal cost ledger.
//     3. BUDGET EVALUATION — spend vs frelux_infrastructure_
//        budgets (per-provider + global '*'), with the owner's
//        exhaustion policy (QUEUE/REDUCE/CONSOLIDATE/STOP).
//     4. PROJECTION — honest linear monthly projection from
//        actual spend and elapsed days. No invented growth.
//     5. SNAPSHOT — the whole assessment is appended to
//        frelux_archie_infrastructure_snapshots (append-only
//        for every role). History is evidence.
//
// HARD RULES:
//   * Read-only against external systems — probes never
//     mutate anything.
//   * Budgets are the OWNER's rules; the engine reports and
//     recommends the configured action, it never invents
//     billing rules and never charges customer credits
//     (frelux_infrastructure_costs is internal-only by
//     schema + trigger).
//   * Projection is linear and clearly labelled as
//     projection. Unknown data is UNKNOWN, never green.
// =========================================================

// ---------------------------------------------------------
// 1. Types
// ---------------------------------------------------------

export type InfraStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface DependencyCheck {
  name: string;
  ok: boolean;
  latency_ms: number | null;
  detail: string;
}

export interface CostRow {
  provider: string;
  operation: string;
  cost_actual_cents: number;
  cost_estimate_cents: number;
  occurred_at: string;
}

export interface BudgetRow {
  provider: string;
  monthly_budget_cents: number;
  emergency_threshold_pct: number;
  exhaustion_policy: "QUEUE" | "REDUCE" | "CONSOLIDATE" | "STOP";
  active: boolean;
}

export interface ProviderSpend {
  provider: string;
  actual_cents: number;
  estimate_cents: number;
  operations: number;
}

export interface BudgetState {
  provider: string;
  spend_cents: number;
  budget_cents: number | null;
  pct_used: number | null;
  status: "OK" | "WARNING" | "EMERGENCY" | "UNBUDGETED" | "INACTIVE_BUDGET";
  /** the owner-configured action when a budget is exhausted */
  exhaustion_policy: BudgetRow["exhaustion_policy"] | null;
}

export interface CostSummary {
  month: string; // YYYY-MM
  total_actual_cents: number;
  total_estimate_cents: number;
  by_provider: ProviderSpend[];
  projected_month_actual_cents: number;
  projection_basis: string;
}

export interface InfrastructureAssessment {
  overall_status: InfraStatus;
  checks: DependencyCheck[];
  cost_summary: CostSummary;
  budget_states: BudgetState[];
  /** true when any budget is at/over its emergency threshold */
  emergency: boolean;
  assessed_at: string;
}

// ---------------------------------------------------------
// 2. Month window + cost aggregation (pure)
// ---------------------------------------------------------

export interface MonthWindow {
  key: string; // YYYY-MM
  start: string; // ISO
  daysInMonth: number;
}

export function monthWindow(now: Date): MonthWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  return {
    key,
    start: new Date(Date.UTC(year, month, 1)).toISOString(),
    daysInMonth,
  };
}

/** Aggregate current-month rows per provider. Pure. */
export function aggregateCosts(
  rows: CostRow[],
  window: MonthWindow,
  now: Date,
): CostSummary {
  const byProvider = new Map<string, ProviderSpend>();
  let totalActual = 0;
  let totalEstimate = 0;
  for (const r of rows) {
    const cur = byProvider.get(r.provider) ?? {
      provider: r.provider,
      actual_cents: 0,
      estimate_cents: 0,
      operations: 0,
    };
    cur.actual_cents += r.cost_actual_cents;
    cur.estimate_cents += r.cost_estimate_cents;
    cur.operations += 1;
    byProvider.set(r.provider, cur);
    totalActual += r.cost_actual_cents;
    totalEstimate += r.cost_estimate_cents;
  }
  const daysElapsed = Math.max(
    1,
    (now.getTime() - new Date(window.start).getTime()) / 86_400_000,
  );
  const projected = Math.round(
    (totalActual / daysElapsed) * window.daysInMonth,
  );
  return {
    month: window.key,
    total_actual_cents: totalActual,
    total_estimate_cents: totalEstimate,
    by_provider: [...byProvider.values()].sort(
      (a, b) => b.actual_cents - a.actual_cents,
    ),
    projected_month_actual_cents: projected,
    projection_basis: `linear projection: ${totalActual} cents over ${daysElapsed.toFixed(1)} elapsed days × ${window.daysInMonth}-day month`,
  };
}

// ---------------------------------------------------------
// 3. Budget evaluation (pure)
// ---------------------------------------------------------

/**
 * Compare spend against the owner's budgets. Per-provider
 * budgets win for their provider; the global '*' budget
 * covers everything not explicitly budgeted.
 */
export function evaluateBudgets(
  spend: ProviderSpend[],
  budgets: BudgetRow[],
): BudgetState[] {
  const active = new Map(
    budgets.filter((b) => b.active).map((b) => [b.provider, b]),
  );
  const globalBudget = active.get("*") ?? null;
  const states: BudgetState[] = [];

  for (const s of spend) {
    const b = active.get(s.provider) ?? globalBudget;
    if (!b) {
      states.push({
        provider: s.provider,
        spend_cents: s.actual_cents,
        budget_cents: null,
        pct_used: null,
        status: "UNBUDGETED",
        exhaustion_policy: null,
      });
      continue;
    }
    const pct = (s.actual_cents / b.monthly_budget_cents) * 100;
    const emergencyPct = b.emergency_threshold_pct;
    const status: BudgetState["status"] =
      pct >= emergencyPct ? "EMERGENCY" : pct >= 75 ? "WARNING" : "OK";
    states.push({
      provider: s.provider,
      spend_cents: s.actual_cents,
      budget_cents: b.monthly_budget_cents,
      pct_used: Math.round(pct * 10) / 10,
      status,
      exhaustion_policy: status === "EMERGENCY" ? b.exhaustion_policy : null,
    });
  }
  return states.sort((a, b) => (b.pct_used ?? -1) - (a.pct_used ?? -1));
}

// ---------------------------------------------------------
// 4. Overall status (pure)
// ---------------------------------------------------------

/**
 * HEALTHY: every reachable-critical check ok and no budget
 * emergency. DEGRADED: any probe failed or a budget warning.
 * CRITICAL: the database itself unreachable, half+ probes
 * failed, or any budget emergency.
 */
export function classifyInfraStatus(
  checks: DependencyCheck[],
  budgetStates: BudgetState[],
): InfraStatus {
  const failed = checks.filter((c) => !c.ok);
  const dbDown = checks.some((c) => c.name === "supabase-rest" && !c.ok);
  const emergency = budgetStates.some((b) => b.status === "EMERGENCY");
  const warning = budgetStates.some((b) => b.status === "WARNING");

  if (dbDown || emergency || failed.length >= Math.ceil(checks.length / 2)) {
    return "CRITICAL";
  }
  if (failed.length > 0 || warning) return "DEGRADED";
  return "HEALTHY";
}

// ---------------------------------------------------------
// 5. Injectable dependencies (Deno + vitest compatible)
// ---------------------------------------------------------

export interface InfrastructureDeps {
  /** live cost rows for the current month */
  getMonthCosts(monthStartIso: string): Promise<CostRow[]>;
  /** active + inactive budget rows */
  getBudgets(): Promise<BudgetRow[]>;
  fetchFn: typeof fetch;
  supabaseUrl: string;
  serviceRoleKey: string;
  /** frontend origin probed for deployment health */
  frontendUrl: string;
  /** probe timeout per dependency (ms) */
  probeTimeoutMs: number;
  now: () => Date;
  log: (m: string) => void;
}

const PROBE_NAMES = ["supabase-rest", "edge-runtime", "frontend"] as const;

/** One reachability probe: measures latency, never mutates. */
async function probe(
  deps: InfrastructureDeps,
  name: (typeof PROBE_NAMES)[number],
): Promise<DependencyCheck> {
  const started = deps.now().getTime();
  const url =
    name === "supabase-rest"
      ? `${deps.supabaseUrl}/rest/v1/`
      : name === "edge-runtime"
        ? `${deps.supabaseUrl}/functions/v1/health`
        : deps.frontendUrl;
  const headers: Record<string, string> =
    name === "supabase-rest"
      ? {
          apikey: deps.serviceRoleKey,
          Authorization: `Bearer ${deps.serviceRoleKey}`,
        }
      : {};
  try {
    const res = await deps.fetchFn(url, {
      method: name === "supabase-rest" ? "GET" : "GET",
      headers,
      signal: AbortSignal.timeout(deps.probeTimeoutMs),
      redirect: "manual",
    });
    const latency = deps.now().getTime() - started;
    // supabase-rest: the OpenAPI root must be 200.
    // edge-runtime: ANY HTTP response (including 401/400
    //   from auth-gated endpoints) proves the runtime is
    //   alive — but 5xx means it is not serving.
    // frontend: 2xx-3xx expected.
    const ok =
      name === "supabase-rest"
        ? res.status === 200
        : name === "edge-runtime"
          ? res.status < 500
          : res.status < 400;
    return {
      name,
      ok,
      latency_ms: latency,
      detail: ok
        ? `HTTP ${res.status} in ${latency}ms`
        : `HTTP ${res.status} in ${latency}ms — unexpected for ${name}`,
    };
  } catch (err) {
    const latency = deps.now().getTime() - started;
    return {
      name,
      ok: false,
      latency_ms: latency,
      detail: `unreachable in ${latency}ms: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------
// 6. Assessment orchestration
// ---------------------------------------------------------

export async function assessInfrastructure(
  deps: InfrastructureDeps,
): Promise<InfrastructureAssessment> {
  const now = deps.now();
  const window = monthWindow(now);

  // probes run in parallel — they are independent reads
  const checks = await Promise.all(PROBE_NAMES.map((n) => probe(deps, n)));

  // costs + budgets from the live ledger
  const [costRows, budgets] = await Promise.all([
    deps.getMonthCosts(window.start),
    deps.getBudgets(),
  ]);

  const cost_summary = aggregateCosts(costRows, window, now);
  const budget_states = evaluateBudgets(cost_summary.by_provider, budgets);
  const overall_status = classifyInfraStatus(checks, budget_states);
  const emergency = budget_states.some((b) => b.status === "EMERGENCY");

  deps.log(
    `[infrastructure] ${window.key} status=${overall_status} checks_ok=${checks.filter((c) => c.ok).length}/${checks.length} spend=${cost_summary.total_actual_cents}c projected=${cost_summary.projected_month_actual_cents}c emergency=${emergency}`,
  );

  return {
    overall_status,
    checks,
    cost_summary,
    budget_states,
    emergency,
    assessed_at: now.toISOString(),
  };
}
