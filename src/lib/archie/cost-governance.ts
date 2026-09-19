// =========================================================
// FRELUX PHASE 8 P5, INFRASTRUCTURE COST GOVERNANCE
//
// ARCHIE internal agents calling external paid providers
// (AI, search, cloud) create REAL provider costs. Those costs
// are FRELUX infrastructure costs, tracked on a dedicated
// internal ledger, and can NEVER consume FRELUX user,
// subscriber, API-customer credits or entitlements.
//
// CRITICAL RULE (server-enforced, not a frontend label):
//   INTERNAL_ARCHIE_OPERATION  →  frelux_infrastructure_costs
//   *CUSTOMER_OPERATION        →  customer metering/credits
// The two ledgers are disjoint tables with disjoint writers;
// the migration adds CHECK constraints and a trigger that
// structurally prevent internal ops from writing customer
// credit rows.
//
// Budget controls: Owner/Admin configures per-provider (and
// global) budgets, concurrency limits, rate limits and an
// emergency shutdown threshold. When a budget is exhausted,
// ARCHIE queues, reduces, consolidates or STOPS internal
// work according to the configured policy. ARCHIE never
// invents its own billing rules and never charges customers
// for internal agent activity.
// =========================================================

/** Explicit usage classification, server-side source of truth. */
export const OPERATION_CLASSES = [
  "INTERNAL_ARCHIE_OPERATION",
  "OWNER_OPERATION",
  "SUBSCRIBER_OPERATION",
  "PUBLIC_USER_OPERATION",
  "API_CUSTOMER_OPERATION",
] as const;
export type OperationClass = (typeof OPERATION_CLASSES)[number];

/** Only these count against customer entitlements. */
export const CUSTOMER_OPERATION_CLASSES: readonly OperationClass[] = [
  "SUBSCRIBER_OPERATION",
  "PUBLIC_USER_OPERATION",
  "API_CUSTOMER_OPERATION",
];

/** Internal operation classes that NEVER touch customer quotas. */
export const INTERNAL_OPERATION_CLASSES: readonly OperationClass[] = [
  "INTERNAL_ARCHIE_OPERATION",
];

/** The kinds of internal work that must stay off customer ledgers. */
export const INTERNAL_AGENT_WORK_TYPES: readonly string[] = [
  "source code analysis",
  "website work",
  "debugging",
  "testing",
  "security",
  "architecture",
  "infrastructure",
  "internal research",
  "internal learning",
  "owner-authorized development",
  "internal diagnostics",
  "internal maintenance",
  "crypto research (owner-only)",
  "market intelligence research",
  "web research",
];

/** Which ledgers an operation class may touch. Disjoint by design. */
const LEDGER_BY_CLASS: Record<OperationClass, "INFRASTRUCTURE" | "CUSTOMER"> = {
  INTERNAL_ARCHIE_OPERATION: "INFRASTRUCTURE",
  OWNER_OPERATION: "INFRASTRUCTURE",
  SUBSCRIBER_OPERATION: "CUSTOMER",
  PUBLIC_USER_OPERATION: "CUSTOMER",
  API_CUSTOMER_OPERATION: "CUSTOMER",
};

/**
 * Structural assertion: an operation classed as internal must
 * NEVER be routed to a customer credit/quota ledger. Used by
 * every internal-agent code path and asserted in tests.
 */
export function assertNotCustomerQuota(opClass: OperationClass): void {
  const ledger = LEDGER_BY_CLASS[opClass];
  if (ledger !== "INFRASTRUCTURE") {
    throw new Error(
      `Operation class ${opClass} maps to the CUSTOMER ledger; ` +
        `internal ARCHIE agent activity may never consume user, ` +
        `subscriber or API-customer credits or quotas.`,
    );
  }
}

/** True only for classes that count against entitlements. */
export function countsAgainstCustomerQuota(opClass: OperationClass): boolean {
  return LEDGER_BY_CLASS[opClass] === "CUSTOMER";
}

// ---------------------------------------------------------
// Provider cost estimation (rough, for pre-spawn decisions)
// ---------------------------------------------------------

/**
 * Rough per-operation external provider cost estimates in
 * cents USD. Used to estimate BEFORE expensive parallel
 * execution. Deliberately conservative (over-estimates).
 */
const PROVIDER_UNIT_COST_CENTS: Record<string, number> = {
  GEMINI_FLASH: 0.1,
  GEMINI_PRO: 2.5,
  TAVILY_SEARCH: 1,
  CLOUD_RUN: 2,
  WEB_CRAWL: 0.5,
};

export function estimateExternalCostCents(
  provider: keyof typeof PROVIDER_UNIT_COST_CENTS | string,
  units: number,
): number {
  const unit = PROVIDER_UNIT_COST_CENTS[provider] ?? 1;
  return Math.max(1, Math.round(unit * Math.max(0, units)));
}

// ---------------------------------------------------------
// Budget decision engine
// ---------------------------------------------------------

export type ExhaustionPolicy = "QUEUE" | "REDUCE" | "CONSOLIDATE" | "STOP";

export interface BudgetConfig {
  /** Provider name or "*" for the global budget. */
  provider: string;
  monthly_budget_cents: number;
  concurrency_limit: number;
  rate_limit_per_minute: number;
  /** Percent (0..100) of monthly spend that triggers emergency stop. */
  emergency_threshold_pct: number;
  exhaustion_policy: ExhaustionPolicy;
  active: boolean;
}

export interface BudgetSnapshot {
  month_to_date_spend_cents: number;
  active_agents: number;
  calls_last_minute: number;
  budgets: BudgetConfig[];
  emergency_stop: boolean;
}

export type BudgetDecision =
  "ALLOW" | "QUEUE" | "REDUCE" | "CONSOLIDATE" | "STOP" | "EMERGENCY_STOP";

export function findApplicableBudget(
  snapshot: BudgetSnapshot,
  provider: string,
): BudgetConfig | undefined {
  return (
    snapshot.budgets.find((b) => b.active && b.provider === provider) ??
    snapshot.budgets.find((b) => b.active && b.provider === "*")
  );
}

/**
 * The budget gate. ARCHIE asks BEFORE spawning or spending.
 * If no budget is configured, the safe default is QUEUE
 * (never unlimited silent spend).
 */
export function budgetDecision(
  snapshot: BudgetSnapshot,
  estimatedCostCents: number,
  provider = "*",
): BudgetDecision {
  if (snapshot.emergency_stop) {
    return "EMERGENCY_STOP";
  }
  const budget = findApplicableBudget(snapshot, provider);
  if (!budget || budget.monthly_budget_cents <= 0) {
    return "QUEUE";
  }
  if (
    budget.concurrency_limit > 0 &&
    snapshot.active_agents >= budget.concurrency_limit
  ) {
    return "REDUCE";
  }
  if (
    budget.rate_limit_per_minute > 0 &&
    snapshot.calls_last_minute >= budget.rate_limit_per_minute
  ) {
    return "QUEUE";
  }
  const pctSpent =
    (snapshot.month_to_date_spend_cents / budget.monthly_budget_cents) * 100;
  if (pctSpent >= budget.emergency_threshold_pct) {
    return "EMERGENCY_STOP";
  }
  if (
    snapshot.month_to_date_spend_cents + estimatedCostCents >
    budget.monthly_budget_cents
  ) {
    switch (budget.exhaustion_policy) {
      case "QUEUE":
        return "QUEUE";
      case "REDUCE":
        return "REDUCE";
      case "CONSOLIDATE":
        return "CONSOLIDATE";
      case "STOP":
        return "STOP";
    }
  }
  return "ALLOW";
}

/**
 * What ARCHIE does under each decision. ARCHIE may never
 * bypass the gate, and may never charge customers instead.
 */
export const DECISION_BEHAVIOR: Record<BudgetDecision, string> = {
  ALLOW: "Proceed; record the cost on the infrastructure ledger when incurred.",
  QUEUE: "Defer the work; retry when budget/capacity frees up.",
  REDUCE: "Reduce parallelism/fleet size to fit limits.",
  CONSOLIDATE:
    "Merge overlapping agents/tasks into fewer, cheaper units of work.",
  STOP: "Stop internal work under the configured policy; alert the Owner/Admin.",
  EMERGENCY_STOP:
    "Halt all internal provider spend immediately; alert the Owner/Admin.",
};

// ---------------------------------------------------------
// Ledger record shape (persisted server-side only)
// ---------------------------------------------------------

export interface InfrastructureCostRecord {
  id: string;
  operation_class: OperationClass; // never a customer class
  provider: string;
  operation: string;
  agent_id: string | null;
  cost_estimate_cents: number;
  cost_actual_cents: number;
  usage_meta: Record<string, unknown>;
  occurred_at: string;
}

/** Validate a record before it reaches the ledger. */
export function validateCostRecord(
  record: Omit<InfrastructureCostRecord, "id" | "occurred_at">,
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (countsAgainstCustomerQuota(record.operation_class)) {
    violations.push(
      `operation_class ${record.operation_class} is a customer class; the infrastructure ledger accepts internal classes only`,
    );
  }
  if (!record.provider.trim()) {
    violations.push("provider is mandatory");
  }
  if (!record.operation.trim()) {
    violations.push("operation is mandatory");
  }
  if (record.cost_actual_cents < 0 || record.cost_estimate_cents < 0) {
    violations.push("costs must be non-negative");
  }
  if (record.cost_estimate_cents === 0 && record.cost_actual_cents === 0) {
    violations.push("a cost record must estimate or report a real cost");
  }
  return { ok: violations.length === 0, violations };
}
