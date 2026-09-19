// =========================================================
// ARCHIE INFRASTRUCTURE ENGINE — PWA / STUDIO CLIENT
// src/lib/archie/infrastructure-client.ts
//
// Client for the archie-infra edge function. Owner-only
// surface for the Infrastructure Engine (engine inventory
// #26, anatomy "legs"):
//   - assessInfrastructure()   — live dependency probes +
//                               cost aggregation + budget
//                               evaluation + projection;
//                               appends a snapshot to the
//                               append-only ledger
//   - getInfrastructureSnapshots() — assessment history
//   - getInfrastructureCosts()     — internal cost ledger
//   - getInfrastructureBudgets()  — the owner's budget rules
//
// SECURITY NOTES:
//   * All actions require an owner (admin) session; the
//     server enforces authority.
//   * Probes are read-only — this client can never mutate
//     external systems.
//   * frelux_infrastructure_costs is the INTERNAL ledger —
//     disjoint from customer credits by schema + trigger
//     (cost-governance); this client can never touch
//     customer balances.
// =========================================================

import { supabase } from "@/lib/supabase";

export interface DependencyCheckView {
  name: string;
  ok: boolean;
  latency_ms: number | null;
  detail: string;
}

export interface ProviderSpendView {
  provider: string;
  actual_cents: number;
  estimate_cents: number;
  operations: number;
}

export interface BudgetStateView {
  provider: string;
  spend_cents: number;
  budget_cents: number | null;
  pct_used: number | null;
  status: "OK" | "WARNING" | "EMERGENCY" | "UNBUDGETED" | "INACTIVE_BUDGET";
  exhaustion_policy: string | null;
}

export interface CostSummaryView {
  month: string;
  total_actual_cents: number;
  total_estimate_cents: number;
  by_provider: ProviderSpendView[];
  projected_month_actual_cents: number;
  projection_basis: string;
}

export interface InfrastructureAssessmentView {
  ok: boolean;
  overall_status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  checks: DependencyCheckView[];
  cost_summary: CostSummaryView;
  budget_states: BudgetStateView[];
  emergency: boolean;
  assessed_at: string;
}

export interface InfrastructureSnapshotView {
  id: string;
  overall_status: string;
  checks: DependencyCheckView[];
  cost_summary: CostSummaryView;
  budget_states: BudgetStateView[];
  emergency: boolean;
  assessed_at: string;
  created_by?: string | null;
  created_date: string;
}

export interface InfrastructureCostRowView {
  id: string;
  operation_class: string;
  provider: string;
  operation: string;
  cost_estimate_cents: number;
  cost_actual_cents: number;
  usage_meta: Record<string, unknown>;
  occurred_at: string;
}

export interface InfrastructureBudgetRowView {
  id: string;
  provider: string;
  monthly_budget_cents: number;
  concurrency_limit: number;
  rate_limit_per_minute: number;
  emergency_threshold_pct: number;
  exhaustion_policy: string;
  active: boolean;
}

/** Run a live infrastructure assessment (owner session required). */
export async function assessInfrastructure(): Promise<
  InfrastructureAssessmentView | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-infra", {
    body: { action: "assess" },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Assessment failed." };
  return data as InfrastructureAssessmentView;
}

/** Assessment history — the append-only snapshot ledger. */
export async function getInfrastructureSnapshots(
  limit = 20,
): Promise<
  | { ok: true; snapshots: InfrastructureSnapshotView[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-infra", {
    body: { action: "snapshots", limit },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Snapshot read failed." };
  return { ok: true, snapshots: data.snapshots ?? [] };
}

/** Recent internal infrastructure cost rows (never customer credits). */
export async function getInfrastructureCosts(
  limit = 50,
): Promise<
  | { ok: true; costs: InfrastructureCostRowView[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-infra", {
    body: { action: "costs", limit },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Cost read failed." };
  return { ok: true, costs: data.costs ?? [] };
}

/** The owner's budget configuration (per-provider + global). */
export async function getInfrastructureBudgets(): Promise<
  | { ok: true; budgets: InfrastructureBudgetRowView[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke("archie-infra", {
    body: { action: "budgets" },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok)
    return { ok: false, error: data?.error ?? "Budget read failed." };
  return { ok: true, budgets: data.budgets ?? [] };
}
